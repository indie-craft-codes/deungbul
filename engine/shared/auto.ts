// 자동 사냥의 판단. 클라이언트(engine/client/auto.ts)와 서버의 자리 비움 사냥(engine/server/game/systems/away.ts)이
// 같은 기준으로 움직이도록 여기에 한 번만 적는다. 무엇을 누를지만 정하고, 실제 명령은 부른 쪽이 낸다.
import { ITEMS, SKILL_SLOTS, classOf, skillDef, type ItemDef, type ItemId, itemDef } from './defs';

export const AUTO = {
  /** 이 거리 안의 몬스터를 찾는다 */
  seek: 40,
  /** 체력이 이 비율 아래면 회복 기술을 쓴다 */
  healAt: 0.55,
  /** 강화 기술은 대상이 이 거리(m) 안에 있을 때 쓴다 (싸움이 붙었을 때) */
  buffAt: 8,
  /** 이 비율 아래면 물약을 마신다 */
  potionAt: 0.35,
  /** 마실 물약이 없는데 체력이 이 비율 아래면 쉬어 간다: 잡던 몬스터만 마저 잡고 새 대상은 잡지 않는다 */
  restAt: 0.35,
  /** 쉬다가 체력이 이 비율까지 차면 다시 사냥한다 (싸우지 않으면 체력이 저절로 찬다) */
  restUntil: 0.9,
  /** 쉬는 중에도 이 거리 안에 붙은 몬스터와는 싸운다 (맞고만 있지 않게) */
  restGuard: 3,
  /** 쉬는 동안 이 거리 안에 몬스터가 있으면 그 반대쪽으로 restStep만큼 물러난다 (적 사이에서 맞으며 쉬지 않게) */
  restClear: 10,
  restStep: 12,
};

/** 자리 비움 사냥(켠 채 접속이 끊기면 서버가 이어서 사냥)의 조건. 서버와 화면의 안내가 같은 수를 쓴다 */
export const AWAY = {
  /** 이 레벨부터 캐릭터가 남는다 (직업도 골라야 한다) */
  minLv: 3,
  /** 서버 전체에서 남을 수 있는 수, 한 주소에서 남길 수 있는 수 */
  max: 60,
  maxPerIp: 3,
  /**
   * 자리를 비운 채 사냥을 이어 가는 시간의 하루 한도(초). 다 쓰면 저장하고 월드에서 나가고, 그날은 끊겨도 캐릭터가 남지 않는다.
   * 한 번 비울 때마다가 아니라 하루(자정 기준, 일일 임무와 같은 날짜)에 쓴 시간을 모아서 센다 (engine/server/game/systems/away.ts)
   */
  // 24시간: 하루가 24시간이라 다 쓸 수 없다 → 사실상 무제한 (2026-11-25 사용자 결정. 한도의 로직은 그대로 두어 언제든 줄일 수 있다)
  maxS: 24 * 3600,
  /** 자리를 비운 곳에서 이보다 먼 몬스터는 쫓지 않는다 */
  roam: 60,
};

/**
 * 지금 쓸 기술의 칸 번호 (없으면 -1). 한 번에 하나씩, 쓸 수 있는 것부터 고른다.
 * ratio: 내 체력 비율, dist: 대상까지의 거리(대상이 없으면 Infinity), ready: 그 칸의 쿨다운이 끝났는가
 */
export function pickSkill(cls: string, ratio: number, dist: number, ready: (n: number) => boolean): number {
  const skills = classOf(cls).skills;
  for (let n = 0; n < SKILL_SLOTS; n++) {
    if (!ready(n)) continue;
    const def = skillDef(skills[n]);
    const fx = def.effect;
    const ok = fx.kind === 'heal' ? ratio < AUTO.healAt
      // 강화는 싸움이 붙었을 때 (대상이 가까이 있다)
      : fx.kind === 'buff' ? dist <= AUTO.buffAt
      // 돌진은 대상이 조금 떨어져 있을 때 (붙어 있으면 아껴 둔다)
      : fx.kind === 'dash' ? dist > 3 && dist <= (def.range ?? fx.dist + 1.2)
      : def.range !== undefined ? dist <= def.range
      : dist <= (def.radius ?? 0) * 0.8; // 내 주변을 치는 기술은 적이 붙었을 때
    if (ok) return n;
  }
  return -1;
}

const healOf = (id: ItemId): number => (ITEMS[id] as ItemDef).heal ?? 0;
/** 물약들, 진한 것(회복량이 큰 것)부터. 아이템 id를 적지 않고 정의에서 고른다: 물약을 더하거나 이름을 바꿔도 여기는 그대로다 */
export const POTIONS: readonly ItemId[] = (Object.keys(ITEMS) as ItemId[]).filter((id) => itemDef(id).kind === 'potion').sort((a, b) => healOf(b) - healOf(a));

/** 마실 물약 (진한 것부터). 마실 때가 아니거나 가진 것이 없으면 null */
export function pickPotion(ratio: number, items: Record<string, number>): ItemId | null {
  if (ratio >= AUTO.potionAt) return null;
  return POTIONS.find((id) => (items[id] ?? 0) > 0) ?? null;
}

/**
 * 쉬어 갈까: 마실 물약이 없고 체력이 restAt 아래면 쉬기 시작하고, restUntil까지 차면 그친다 (resting: 지금 쉬는 중인가).
 * 물약이 떨어진 채 자동 사냥이 계속 싸우다 쓰러지던 것(플레이어 재검토). 물약이 없는 게임도 같은 규칙으로 쉰다
 */
export function shouldRest(ratio: number, items: Record<string, number>, resting: boolean): boolean {
  if (resting) return ratio < AUTO.restUntil;
  return ratio < AUTO.restAt && !POTIONS.some((id) => (items[id] ?? 0) > 0);
}

/** 쉴 자리: 둘레(restClear 안)의 몬스터들에게서 멀어지는 쪽으로 restStep만큼. 둘레에 없으면 null */
export function restSpot(me: { x: number; z: number }, foes: readonly { x: number; z: number }[]): { x: number; z: number } | null {
  let dx = 0, dz = 0;
  for (const f of foes) {
    const d = Math.hypot(f.x - me.x, f.z - me.z);
    if (d < AUTO.restClear && d > 0.01) { dx += (me.x - f.x) / d; dz += (me.z - f.z) / d; }
  }
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return null;
  return { x: me.x + (dx / len) * AUTO.restStep, z: me.z + (dz / len) * AUTO.restStep };
}

/** 손으로 마실 때 살펴보는 순서: 가장 진한 물약의 회복량만큼 다쳤으면 진한 것부터, 아니면 약한 것부터 (조금 다쳤을 때 진한 물약을 버리지 않게) */
export function potionOrder(hurt: number): readonly ItemId[] {
  return POTIONS.length && hurt >= healOf(POTIONS[0]) ? POTIONS : [...POTIONS].reverse();
}
