// 가방: 캐릭터의 아이템(재료, 물약)과 낱개 장비를 넣고 빼는 한 통로. 재화의 지갑(wallet.ts)과 짝이다.
// 아이템의 칸(p.items)과 장비 목록(p.gear)을 직접 고치는 곳은 이 파일과 저장을 읽는 곳(players.ts의 spawn, gear.ts의 저장 읽기)뿐이고,
// 다른 곳에 생기면 engine/test/bag.test.ts가 실패한다.
//
//   g.bag.putItem(p, id, n, why)     아이템을 넣는다. 그 아이템의 한도까지만 들어가고, 실제로 받은 수를 돌려준다
//   g.bag.takeItem(p, id, n, why)    아이템을 뺀다. 모자라면 false를 돌려주고 아무것도 바꾸지 않는다
//   g.bag.count(p, id), room(p, id)  가진 수와, 한도까지 남은 자리
//   g.bag.giveGear(p, it, why)       장비 한 점을 넣는다 (uid를 새로 붙인다). 가방이 가득 찼으면 넣지 않고 false: 부른 쪽이 물건을 맡아야 한다
//   g.bag.removeGear(p, uid, why)    장비 한 점을 뺀다. 뺀 장비를 돌려준다 (없으면 undefined)
//   g.bag.lost(p, it, why)           가방이 가득 차 버려진 장비를 적는다 (생겼다가 사라진 것으로)
//   g.bag.slots(p), full(p)          그 캐릭터의 가방 칸 수와, 가득 찼는가
//
// 왜 한 통로인가 (docs/economy.md 6절): 한도(아이템별 한도, 캐릭터별 가방 칸 수)를 한 곳이 적용하고, 원인(why)을 아는 쪽이 장부에 직접 알린다.
// 가방 넓히기(캐릭터별 칸 수)와 분해(장비를 빼고 가루를 넣음)가 여기에 얹힌다.
//
// 원인의 이름은 지갑과 같은 체계다 (wallet.ts의 WHY, mailWhy, players.huntWhy): 한 명령이 바꾼 골드와 장비·재료가 장부의 같은 줄에 놓인다.
// 이름을 비워 두면('') 장부에 알리지 않는다: 그 변화는 다음 경계에서 차이로 드러나 other·tick이나 g.ledger.note가 붙인 이름으로 적힌다 (시험의 준비, 운영 도구).
import { ECON_LOST_FULL, GEAR, RARITIES, isItemId, itemCap, type Gear, type ItemId } from '../../../shared/defs';
import type { Ent } from '../entity';

/** 장부에 적는 이름: 장비는 등급별로, 아이템은 아이템별로 센다 */
export const gearCur = (rar: number): string => `gear:${RARITIES[rar]?.id ?? rar}`;
export const itemCur = (id: string): string => `item:${id}`;

/** 넣고 뺄 수로 쓸 수 있는 값인가: 1 이상의 정수 (NaN, 소수, 음수, 수가 아닌 값을 거른다) */
const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1;

export class Bag {
  /** 가방을 지난 변화를 듣는 곳: cur은 gearCur·itemCur의 이름, 바뀐 수는 넣었으면 +, 뺐으면 −. 장부가 등록한다 */
  readonly seen: ((p: Ent, cur: string, d: number, why: string) => void)[] = [];

  private tell(p: Ent, cur: string, d: number, why: string): void {
    for (let i = 0; i < this.seen.length; i++) this.seen[i](p, cur, d, why);
  }

  // ---------- 아이템 (재료, 물약) ----------
  /** 가진 수 */
  count(p: Ent, id: string): number { const n = p.items[id]; return n > 0 ? n : 0; }
  /** 한도까지 남은 자리 */
  room(p: Ent, id: ItemId): number { return Math.max(0, itemCap(id) - this.count(p, id)); }

  /** 넣는다. 한도까지만 들어가고, 실제로 받은 수를 돌려준다 (넘는 몫을 어떻게 할지는 부른 쪽이 정한다: 버리거나 우편에 남긴다) */
  putItem(p: Ent, id: ItemId, n: number, why: string): number {
    if (!whole(n) || !isItemId(id)) return 0;
    const got = Math.min(n, this.room(p, id));
    if (got <= 0) return 0;
    p.items[id] = this.count(p, id) + got;
    p.dirty = true; p.unsaved = true;
    this.tell(p, itemCur(id), got, why);
    return got;
  }

  /** 뺀다. 가진 것이 모자라거나 수가 깨져 있으면 false를 돌려주고 아무것도 바꾸지 않는다 */
  takeItem(p: Ent, id: ItemId, n: number, why: string): boolean {
    if (!whole(n) || !(this.count(p, id) >= n)) return false;
    p.items[id] -= n;
    p.dirty = true; p.unsaved = true;
    this.tell(p, itemCur(id), -n, why);
    return true;
  }

  // ---------- 장비 (낱개) ----------
  /** 그 캐릭터의 가방 칸 수 (낀 것 포함) */
  slots(_p: Ent): number { return GEAR.bagMax; }
  /** 가방이 가득 찼는가 */
  full(p: Ent): boolean { return p.gear.length >= this.slots(p); }

  /**
   * 장비 한 점을 가방에 넣는다. 번호(uid)는 그 캐릭터 안에서 새로 붙는다.
   * 가득 찼으면 넣지 않고 false를 돌려준다. force: 가득 차도 넣는다 (값을 치르고 사거나 만든 것이 사라지지 않게)
   */
  giveGear(p: Ent, it: Gear, why: string, force = false): boolean {
    if (!force && this.full(p)) return false;
    it.uid = ++p.gearSeq;
    p.gear.push(it);
    p.metaDirty = true; p.unsaved = true;
    this.tell(p, gearCur(it.rar), 1, why);
    return true;
  }

  /** 장비 한 점을 가방에서 뺀다. 끼고 있었으면 그 칸도 비운다 (겉모습을 맞추는 일은 장비 시스템이 한다). 뺀 장비를 돌려준다 */
  removeGear(p: Ent, uid: number, why: string): Gear | undefined {
    const i = p.gear.findIndex((x) => x.uid === uid);
    if (i < 0) return undefined;
    const it = p.gear[i];
    p.gear.splice(i, 1);
    if (p.worn[it.slot] === uid) delete p.worn[it.slot];
    p.metaDirty = true; p.unsaved = true;
    this.tell(p, gearCur(it.rar), -1, why);
    return it;
  }

  /** 가방이 가득 차 넣지 못하고 버려진 장비: 그 원인으로 생겼다가 '가방 가득'으로 사라진 것으로 알린다 */
  lost(p: Ent, it: Gear, why: string): void {
    const cur = gearCur(it.rar);
    this.tell(p, cur, 1, why);
    this.tell(p, cur, -1, ECON_LOST_FULL);
  }
}
