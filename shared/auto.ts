// 자동 사냥의 판단. 클라이언트(client/src/auto.ts)와 서버의 자리 비움 사냥(server/game/systems/away.ts)이
// 같은 기준으로 움직이도록 여기에 한 번만 적는다. 무엇을 누를지만 정하고, 실제 명령은 부른 쪽이 낸다.
import { SKILL_SLOTS, classOf, skillDef } from './defs';

export const AUTO = {
  /** 이 거리 안의 몬스터를 찾는다 */
  seek: 40,
  /** 체력이 이 비율 아래면 회복 기술을 쓴다 */
  healAt: 0.55,
  /** 이 비율 아래면 물약을 마신다 */
  potionAt: 0.35,
};

/** 자리 비움 사냥(켠 채 접속이 끊기면 서버가 이어서 사냥)의 조건. 서버와 화면의 안내가 같은 수를 쓴다 */
export const AWAY = {
  /** 이 레벨부터 캐릭터가 남는다 (직업도 골라야 한다) */
  minLv: 3,
  /** 서버 전체에서 남을 수 있는 수, 한 주소에서 남길 수 있는 수 */
  max: 60,
  maxPerIp: 3,
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
    const ok = def.effect.kind === 'heal' ? ratio < AUTO.healAt
      : def.range !== undefined ? dist <= def.range
      : dist <= (def.radius ?? 0) * 0.8; // 내 주변을 치는 기술은 적이 붙었을 때
    if (ok) return n;
  }
  return -1;
}

/** 마실 물약 (진한 것부터). 마실 때가 아니거나 가진 것이 없으면 null */
export function pickPotion(ratio: number, items: Record<string, number>): 'tonic' | 'potion' | null {
  if (ratio >= AUTO.potionAt) return null;
  return (items.tonic ?? 0) > 0 ? 'tonic' : (items.potion ?? 0) > 0 ? 'potion' : null;
}
