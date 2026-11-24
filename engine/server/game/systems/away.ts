// 자리 비움 자동 사냥: 자동 사냥을 켠 채 접속이 끊기면(창을 닫음, 폰 화면이 꺼짐) 캐릭터가 월드에 남아 계속 사냥한다.
// 다시 접속하면 그 캐릭터를 그대로 이어받는다. 판단은 클라이언트의 자동 사냥(engine/client/auto.ts)과 같고,
// 사람이 누른 것과 같은 명령(g.command)만 내므로 전투 규칙은 그대로다.
import { AUTO, AWAY, pickPotion, pickSkill } from '../../../shared/auto';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';

const ROAM = AWAY.roam; // 자리를 비운 곳에서 이보다 먼 몬스터는 쫓지 않는다
const THINK_S = 0.3;
/**
 * 자리를 비운 채 사냥을 이어 가는 시간의 하루 한도(초). 다 쓰면 저장하고 월드에서 나가고, 그날은 끊겨도 캐릭터가 남지 않는다.
 * 한 번 비울 때마다가 아니라 하루(자정 기준, 일일 임무와 같은 날짜)에 쓴 시간을 모아서 센다:
 * 한 번마다 세면 잠깐 다시 접속하는 것만으로 처음부터 다시 세어 끝없이 이어진다. 쓴 시간은 캐릭터와 함께 저장한다(Ent.away).
 */
export const AWAY_MAX_S = AWAY.maxS; // 값은 engine/shared/auto.ts에 있다 (화면과 도감이 같은 수를 쓴다)

/** lost, salv, dust: 그동안 가방이 가득 차 버려진 장비, 자동 분해한 장비, 그것으로 얻은 가루 */
interface Stay { x: number; z: number; at: number; sparks: number; gold: number; lv: number; lost: number; salv: number; dust: number }

export class Away {
  private stays = new Map<number, Stay>();

  constructor(private g: Game) {
    // 클라이언트가 자동 사냥을 켜고 끌 때마다 알려 준다
    g.commands.set('auto', (p, m) => { p.auto = m.on === true; });
    g.on('playerLeft', (id) => { this.stays.delete(id); });
    g.saves.push({
      name: 'away',
      save: (p) => ({ day: p.away.day, used: Math.round(p.away.used) }),
      load: (p, raw) => {
        if (typeof raw !== 'object' || raw === null) return;
        const d = raw as { day?: unknown; used?: unknown };
        if (typeof d.day !== 'string' || typeof d.used !== 'number' || !Number.isFinite(d.used)) return;
        p.away = { day: d.day.slice(0, 10), used: Math.max(0, Math.min(AWAY_MAX_S, d.used)) };
      },
    });
  }

  /** 오늘 더 쓸 수 있는 자리 비움 사냥 시간(초). 날이 바뀌었으면 쓴 시간을 비운다 */
  left(p: Ent): number {
    const today = this.g.daily.dayOf(this.g.now());
    if (p.away.day !== today) p.away = { day: today, used: 0 };
    return Math.max(0, AWAY_MAX_S - p.away.used);
  }

  /** 접속이 끊겼다: 여기서부터 서버가 대신 사냥한다. 오늘 한도를 다 썼으면 남지 않는다. */
  start(p: Ent): void {
    // 자동 사냥을 끄면 통신 계층이 다음 전송 때 저장하고 내보낸다 (시간이 다 됐을 때와 같은 길)
    if (this.left(p) <= 0) { p.auto = false; return; }
    this.stays.set(p.id, { x: p.x, z: p.z, at: this.g.now(), sparks: p.sparks, gold: p.gold, lv: p.lv, lost: 0, salv: 0, dust: 0 });
    p.wait = 0;
  }

  /** 지금 서버가 대신 사냥하고 있는 캐릭터인가 (지표가 접속 중의 사냥과 가려 적는 데 쓴다) */
  active(p: Ent): boolean { return this.stays.has(p.id); }

  /** 자리를 비운 동안의 장비를 센다: 버려진 것(lost), 자동 분해한 것(salv), 얻은 가루(dust). 사냥 중이 아니면 아무것도 하지 않는다 */
  tally(p: Ent, what: 'lost' | 'salv' | 'dust', n: number): void {
    const s = this.stays.get(p.id);
    if (s) s[what] += n;
  }

  /** 주인이 돌아왔다: 그동안 얻은 것을 알려 주고 손을 뗀다. */
  stop(p: Ent): void {
    const s = this.stays.get(p.id);
    if (!s) return;
    this.stays.delete(p.id);
    const minutes = Math.max(1, Math.round((this.g.now() - s.at) / 60000));
    this.g.notify(p, 'awayBack', minutes, Math.max(0, p.sparks - s.sparks), Math.max(0, p.gold - s.gold), p.lv - s.lv);
    // 버려지거나 자동으로 분해된 장비가 있었으면 이어서 알린다 (조용히 사라지면 몰라서 손해 본다)
    if (s.lost || s.salv) this.g.notify(p, 'awayGear', s.lost, s.salv, s.dust);
  }

  think(p: Ent, dt: number): void {
    const s = this.stays.get(p.id);
    if (!s) return;
    const g = this.g;
    if (this.left(p) <= 0) { p.auto = false; p.unsaved = true; return; } // 통신 계층이 저장하고 내보낸다
    // 쓴 시간이 분 단위로 넘어갈 때마다 저장할 것으로 표시한다 (서버가 갑자기 꺼져도 쓴 시간이 크게 되돌아가지 않게)
    if (Math.floor((p.away.used + dt) / 60) !== Math.floor(p.away.used / 60)) p.unsaved = true;
    p.away.used += dt;
    p.wait -= dt;
    if (p.wait > 0) return;
    p.wait = THINK_S;
    const ratio = p.hp / p.maxHp;

    const potion = p.itemCd <= 0 ? pickPotion(ratio, p.items) : null;
    if (potion) g.command(p, { t: 'use', id: potion });

    // 대상이 없거나 죽었으면 가장 가까운 몬스터로 바꾼다
    let target = g.ents.get(p.targetId);
    if (!target || target.dead) {
      target = undefined;
      let nd = AUTO.seek;
      for (const m of g.ents.values()) {
        if (m.kind !== 'm' || m.dead || m.homing || m.layer !== p.layer || dist(s, m) > ROAM) continue;
        const d = dist(p, m);
        if (d < nd) { nd = d; target = m; }
      }
      if (target) g.command(p, { t: 'attack', id: target.id });
      // 쓰러져 등탑에서 일어났거나 멀리 끌려갔으면 자리를 비운 곳으로 돌아간다
      else if (!p.moving && dist(p, s) > 4) g.movement.goTo(p, s.x, s.z);
    }
    const d = target ? dist(p, target) : Infinity;

    const n = pickSkill(p.cls, ratio, d, (i) => p.cds[i] <= 0);
    if (n >= 0) g.command(p, { t: 'skill', n });
  }
}
