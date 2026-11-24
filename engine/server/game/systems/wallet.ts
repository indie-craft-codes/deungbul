// 지갑: 캐릭터의 재화(골드, 불씨, 경험치)를 더하고 빼는 한 통로.
// 재화를 바꾸는 코드는 모두 여기를 지난다 (틀의 시스템과 게임의 규칙 시스템 모두). 캐릭터의 재화 칸(p.gold, p.sparks, p.exp)을 직접 고치는 곳은
// 이 파일과 저장을 읽는 곳(players.ts의 spawn), 레벨 업(players.ts의 levelUp)뿐이고, 다른 곳에 생기면 engine/test/wallet.test.ts가 실패한다.
//
//   g.wallet.add(p, 'gold', n, why)    더한다. 실제로 더한 양을 돌려준다 (배율과 상한이 적용된 값)
//   g.wallet.take(p, 'gold', n, why)   뺀다. 모자라면 false를 돌려주고 아무것도 바꾸지 않는다
//   g.wallet.can(p, 'gold', n)         그만큼 낼 수 있는가
//   g.wallet.amount(p, 'gold', n, why) 지금 더하면 실제로 더해질 양 (바꾸지 않는다. 받기 전에 안내문에 넣을 값을 알아야 할 때)
//
// 왜 한 통로인가 (docs/economy.md 4-6의 (2)):
//   - 원인(why)을 아는 쪽이 장부에 직접 알린다: 장부(ledger.ts)가 경계의 앞뒤 차이로 짐작하던 것보다 정확하다
//   - 수급 배율을 끼울 자리가 생긴다: 하루 몫(밝은 등불)이나 모드별 보상 배율은 scale에 함수를 등록한다. 더하는 쪽에만 걸리고, 빼는 쪽(값을 치르는 것)에는 걸리지 않는다
//   - 깨진 값(NaN, 음수, 소수, 상한을 넘는 수)이 캐릭터에 들어가지 않는다
//
// 원인의 이름은 장부의 이름과 같은 체계다: 명령은 'cmd:명령[:하위 동작]', 우편은 'mail:종류', 사냥은 ECON_HUNT(hunt, huntAway, huntDungeon),
// 그 밖의 보상은 게임이 정한 이름(이 게임: quest, raid, tier). 운영에 쌓인 자료와 이어지도록 한 번 쓴 이름은 바꾸지 않는다.
// 이름을 비워 두면('') 장부가 그때의 경계로 가려 적는다: 명령과 사건 밖(시험의 준비, 운영 도구)에서 준 것은 other로 남거나 g.ledger.note가 붙인 이름으로 적힌다.
//
// 재화의 표(이름, 거래 가능 여부, 상한)는 게임의 내용에 있다 (CURRENCIES). 틀이 아는 칸은 엔티티의 gold, sparks, exp 셋이고, 표에 없는 재화는 한도 없이 다룬다.
// 장비(낱개)와 아이템(재료, 물약)은 짝이 되는 통로인 가방(bag.ts)을 지난다. 원인의 이름은 아래 WHY를 함께 쓴다.
import { CURRENCIES, type CurrencyDef } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

/** 지갑이 다루는 재화: 엔티티의 칸 이름과 같다 */
export type Cur = 'gold' | 'sparks' | 'exp';
/**
 * 수급 배율: 그 사람이 그 재화를 그 원인으로 n만큼 받을 때 곱할 값 (1이면 그대로, 0이면 주지 않는다).
 * 값을 돌려주기만 해야 한다: 받기 전에 양을 미리 묻는 데도 불리므로(amount), 여기서 하루 몫을 깎거나 하면 두 번 깎인다. 몫을 쓰는 일은 사건(monsterKilled 등)에서 한다
 */
export type Scale = (p: Ent, cur: Cur, n: number, why: string) => number;

/**
 * 틀의 시스템이 지갑과 가방(bag.ts)에 넘기는 원인의 이름. 장부가 명령에 붙이는 이름(cmd:명령[:하위 동작])과 같게 맞춘다:
 * 한 명령이 바꾼 골드(지갑이 알림)와 장비·재료(가방이 알림)가 같은 줄에 놓인다
 */
export const WHY = {
  buy: 'cmd:buy', craft: 'cmd:craft', sell: 'cmd:sell', enhance: 'cmd:enhance', statReset: 'cmd:statReset', skillUp: 'cmd:skillUp',
  guildCreate: 'cmd:guild:create', guildGive: 'cmd:guild:give', marketBuy: 'cmd:market:buy',
  use: 'cmd:use', marketPost: 'cmd:market:post', marketCancel: 'cmd:market:cancel',
  salvage: 'cmd:salvage', bagUp: 'cmd:bagUp',
  /** 주운 장비를 그 자리에서 분해한 것 (명령이 아니라 처치 사건 안에서 일어난다) */
  autoSalvage: 'autoSalvage',
} as const;
/** 원인 이름에 넣어도 되는 낱말: 영문자, 숫자, 밑줄만 (장부의 줄을 가르는 글자가 섞이지 않게) */
const WORD = /^[A-Za-z0-9_]{1,24}$/;
/** 우편으로 받은 것의 원인 이름. 우편의 종류는 저장에서 읽은 값이라 걸러서 쓴다 */
export const mailWhy = (kind: string): string => `mail:${WORD.test(kind) ? kind : 'unknown'}`;

export class Wallet {
  /** 수급 배율들. 등록한 함수들의 값을 모두 곱한다. 비어 있으면 배율 1이다 */
  readonly scale: Scale[] = [];
  /** 지갑을 지난 변화를 듣는 곳: 바뀐 양은 더했으면 +, 뺐으면 −. 장부가 등록한다 */
  readonly seen: ((p: Ent, cur: Cur, d: number, why: string) => void)[] = [];
  /** 재화별 상한 (표에 없으면 한도 없음) */
  private max: Record<Cur, number>;

  constructor(private g: Game) {
    const defs: Readonly<Record<string, CurrencyDef>> = CURRENCIES;
    const max = (cur: Cur): number => { const m = defs[cur]?.max; return typeof m === 'number' && m > 0 ? m : Infinity; };
    this.max = { gold: max('gold'), sparks: max('sparks'), exp: max('exp') };
  }

  /**
   * 지금 더하면 실제로 더해질 양: 배율을 곱해 내림하고, 상한까지 남은 자리로 자른다. 아무것도 바꾸지 않는다.
   * 깨진 값(NaN, 무한대, 0 이하, 수가 아닌 값)은 0이다. 소수는 내린다
   */
  amount(p: Ent, cur: Cur, n: number, why: string): number {
    if (typeof n !== 'number' || !(n > 0) || n === Infinity) return 0;
    let k = 1;
    for (let i = 0; i < this.scale.length; i++) {
      const v = this.scale[i](p, cur, n, why);
      if (v >= 0 && v !== Infinity) k *= v; // 깨진 배율(NaN, 음수)은 없는 것으로 친다
    }
    // 1e-9: 0.29 × 100이 28.999…가 되는 것 같은 부동소수 오차로 하나 덜 주지 않게
    const got = Math.min(Math.floor(n * k + 1e-9), this.max[cur] - p[cur]);
    return got > 0 ? got : 0;
  }

  /** 더한다. 실제로 더한 양을 돌려준다 (배율과 상한이 적용된 값). 경험치는 더한 뒤에 레벨 업을 확인한다 */
  add(p: Ent, cur: Cur, n: number, why: string): number {
    const got = this.amount(p, cur, n, why);
    if (got === 0) return 0;
    p[cur] += got; p.dirty = true; p.unsaved = true;
    for (let i = 0; i < this.seen.length; i++) this.seen[i](p, cur, got, why);
    if (cur === 'exp') this.g.players.levelUp(p);
    return got;
  }

  /** 치를 값으로 쓸 수 있는 수로 맞춘다: 소수는 올린다 (값이 깎이지 않게). 깨진 값(NaN, 무한대, 음수)은 NaN: 어떤 잔액으로도 치를 수 없다 */
  private static cost(n: number): number { return typeof n === 'number' && n >= 0 && n !== Infinity ? Math.ceil(n) : NaN; }

  /** 그만큼 낼 수 있는가. 배율은 걸리지 않는다 */
  can(p: Ent, cur: Cur, n: number): boolean { return p[cur] >= Wallet.cost(n); }

  /** 뺀다. 잔액이 모자라거나 값이 깨져 있으면 false를 돌려주고 아무것도 바꾸지 않는다. 배율은 걸리지 않는다 */
  take(p: Ent, cur: Cur, n: number, why: string): boolean {
    const cost = Wallet.cost(n);
    if (!(p[cur] >= cost)) return false;
    if (cost === 0) return true;
    p[cur] -= cost; p.dirty = true; p.unsaved = true;
    for (let i = 0; i < this.seen.length; i++) this.seen[i](p, cur, -cost, why);
    return true;
  }
}
