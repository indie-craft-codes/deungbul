// 안개 균열의 시험과 측정이 함께 쓰는 것: 수치를 맞출 때 기준으로 삼은 세 가지 캐릭터와, 사람 대신 판을 돌리는 손.
// 캐릭터는 저장을 거치지 않고 게임 안에서 바로 만든다 (레벨, 능력치, 장비, 기술 단계를 직접 적는다).
// 손은 화면의 자동 사냥(engine/client/auto.ts)과 같은 판단(engine/shared/auto.ts)으로 사람이 누르는 것과 같은 명령만 낸다.
import { GEAR_SLOTS, POTION_MAX, classOf, type ClassId } from '../shared/defs';
import { AUTO, pickPotion, pickSkill } from '@engine/shared/auto';
import { dist, type Ent } from '@engine/server/game/entity';
import type { Game } from '@engine/server/game/game';

/** 기준 캐릭터: 레벨 8 보급형 장비, 레벨 15 희귀 장비, 레벨 25 영웅 +10 장비 */
export type Tier = 'supply8' | 'rare15' | 'epic25';
export const TIERS: readonly Tier[] = ['supply8', 'rare15', 'epic25'];

const SPEC: Record<Tier, { lv: number; pow: number; vit: number; luck: number; skill: number; gear: null | { lv: number; rar: number; plus: number }; potion: number; tonic: number }> = {
  // 갓 들어올 수 있게 된 캐릭터: 상점의 철검과 가죽 갑옷, 물약 몇 개
  supply8: { lv: 8, pow: 11, vit: 10, luck: 0, skill: 1, gear: null, potion: 5, tonic: 0 },
  // 잿빛 숲과 던전을 돌며 모은 희귀 장비 한 벌(+3), 기술 2단계
  rare15: { lv: 15, pow: 22, vit: 20, luck: 0, skill: 2, gear: { lv: 4, rar: 2, plus: 3 }, potion: 10, tonic: 3 },
  // 오래 키운 캐릭터: 영웅 장비 한 벌을 끝까지 강화하고 기술도 끝까지 올렸다
  epic25: { lv: 25, pow: 40, vit: 32, luck: 0, skill: 5, gear: { lv: 6, rar: 3, plus: 10 }, potion: POTION_MAX, tonic: 5 },
};

/** 기준 캐릭터를 만들어 월드에 넣는다 (접속한 사람처럼: 봇이 아니다) */
export function hero(g: Game, name: string, cls: ClassId, tier: Tier): Ent {
  const s = SPEC[tier], p = g.players.spawn(name, false);
  g.classes.apply(p, cls);
  p.lv = s.lv;
  p.stats = { pow: s.pow, vit: s.vit, luck: s.luck };
  for (const id of classOf(cls).skills) p.skillLv[id] = s.skill;
  if (s.gear) {
    for (const slot of GEAR_SLOTS) {
      const it = g.gear.roll(s.gear.lv, s.gear.rar, slot);
      it.plus = s.gear.plus;
      p.gear.push({ ...it, uid: ++p.gearSeq });
      g.gear.equip(p, p.gearSeq);
    }
  } else { g.gear.acquire(p, 'sword2'); g.gear.acquire(p, 'armor1'); }
  p.items = { potion: s.potion, ...(s.tonic ? { tonic: s.tonic } : {}) };
  g.players.refresh(p);
  p.hp = p.maxHp;
  return p;
}

/**
 * 사람 대신 한 번 판단한다 (0.3초마다 부른다): 체력이 낮으면 물약, 대상이 없으면 가장 가까운 적, 쓸 수 있는 기술.
 * 화면의 자동 사냥과 같은 기준이다. 걷기(달아나기)는 하지 않는다: 자동 사냥만 켜 둔 사람의 판이다
 */
export function autoThink(g: Game, p: Ent): void {
  const ratio = p.hp / p.maxHp;
  const potion = p.itemCd <= 0 ? pickPotion(ratio, p.items) : null;
  if (potion) g.command(p, { t: 'use', id: potion });
  let target = g.ents.get(p.targetId);
  if (!target || target.dead) {
    target = undefined;
    let nd = AUTO.seek;
    for (const m of g.ents.values()) {
      if (m.kind !== 'm' || m.dead || m.layer !== p.layer) continue;
      const d = dist(p, m);
      if (d < nd) { nd = d; target = m; }
    }
    if (target) g.command(p, { t: 'attack', id: target.id });
  }
  const n = pickSkill(p.cls, ratio, target ? dist(p, target) : Infinity, (i) => p.cds[i] <= 0);
  if (n >= 0) g.command(p, { t: 'skill', n });
}
