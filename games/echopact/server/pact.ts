// 두 장르를 잇는 다리 (이 게임의 규칙). 틀은 고치지 않고 틀의 접점만 쓴다:
//   1. 메아리 = 캐릭터 정의: 서버가 켜질 때 손으로 쓴 정의(./echoes.ts)를 g.chars.add로 검증해 더한다. chars 모듈이 roster를 함께 고른 게임이라
//      정의를 영웅의 표에 더하므로(addHeroDef) 뽑기 판·편성·단계·저장이 내용의 영웅처럼 읽는다.
//   2. 한 소유: 수집형 쪽의 소유(roster: 뽑기·보상이 g.roster.grant로 준다)가 원본이고, 들판의 변신 소유(morph)는 그것을 따라 맞춘다.
//      새 메아리를 얻으면(사건 heroChanged) 곧바로 변신도 갖고, 접속할 때마다 둘을 견주어 맞춘다(예전 저장, 정의를 고친 뒤).
//   3. 키운 만큼 센 변신: 그 메아리를 수집형 쪽에서 키운 별·레벨이 들판의 변신에 작은 덤(주는 피해)을 더한다 (틀의 MORPH_RULES.mods는 정의만 본다).
//   4. 임무: 뽑기·단계·변신을 일일·주간 임무로 센다. 뽑기에는 틀의 사건이 없어 g.gacha.draw를 감싸 센다 (틀의 빈 곳: docs/proof-echopact.md).
import { heroDef, isHeroId, rarityDef, BANNER_TABLE } from '@engine/shared/defs';
import type { Ent, Game } from '@engine/server';
import { PACT_GROWTH, PACT_KINDS, STARTER, STARTER_ECHO } from '../shared/content/pact';
import { ECHO_DEFS } from './echoes';

/** 처음 온 사람인가: 메아리도 뽑기 기록도 없다 */
const fresh = (p: Ent): boolean => Object.keys(p.heroes).length === 0 && p.pulls.length === 0;

/** 그 사람이 변신한 메아리를 수집형 쪽에서 키운 만큼의 덤 (주는 피해에 더하는 비율. 변신하지 않았거나 가지지 않았으면 0) */
export function pactBonus(g: Game, p: Ent): number {
  const id = p.morph.on, h = id ? g.roster.owned(p, id) : undefined;
  if (!h || !isHeroId(id)) return 0;
  const start = rarityDef(heroDef(id).rarity).stars;
  return Math.min(PACT_GROWTH.cap, Math.max(0, h.stars - start) * PACT_GROWTH.perStar + Math.max(0, h.lv - 1) * PACT_GROWTH.perLv);
}

/** 수집형의 소유(roster)에 변신의 소유(morph)를 맞춘다: 가진 메아리는 모두 변신으로도, 가지지 않은 메아리의 변신은 거둔다 (정의가 있는 것만 본다) */
export function syncPact(g: Game, p: Ent): void {
  for (const id of Object.keys(p.heroes)) if (g.chars.has(id) && !g.morph.owns(p, id)) g.morph.grant(p, id);
  for (const id of [...p.morph.own]) if (g.chars.has(id) && !Object.hasOwn(p.heroes, id)) g.morph.take(p, id);
}

export function installPact(g: Game): void {
  // 1. 정의를 더한다: 모든 시스템이 만들어진 뒤(ready), 사람이 들어오기 전. 같은 id는 바꾼다(고친 정의가 다음 시작에 반영된다)
  g.ready.push(() => {
    for (const raw of ECHO_DEFS) {
      const r = g.chars.add(raw, { replace: true });
      if (!r.ok) console.warn(`[echopact] 메아리 정의가 거절됐다: ${r.issues.map((x) => `${x.code}@${x.path}`).join(', ')}`);
    }
    // 뽑기 판의 id가 모두 정의로 들어왔는가 (빠지면 그 칸은 판에서 조용히 빠진다: 공개 확률표도 함께 바뀌므로 켜질 때 알린다)
    for (const [id, b] of Object.entries(BANNER_TABLE)) {
      const missing = b.pool.filter((s) => !isHeroId(s.hero)).map((s) => s.hero);
      if (missing.length) console.warn(`[echopact] 배너 ${id}의 판에 정의가 없는 메아리: ${missing.join(', ')}`);
    }
  });

  // 2. 한 소유: 새 메아리를 얻으면 변신도 (뽑기, 처음 메아리, 나중의 보상·거래가 모두 g.roster.grant를 지난다)
  g.on('heroChanged', (p, id) => { if (g.chars.has(id) && Object.hasOwn(p.heroes, id) && !g.morph.owns(p, id)) g.morph.grant(p, id); });
  g.on('playerJoined', (p) => {
    if (fresh(p)) {
      if (STARTER.gold) g.wallet.add(p, 'gold', STARTER.gold, 'start');
      for (const [id, n] of Object.entries(STARTER.items ?? {})) g.bag.putItem(p, id as Parameters<typeof g.bag.putItem>[1], n, 'start');
      g.roster.grant(p, STARTER_ECHO);
    }
    syncPact(g, p);
  });

  // 3. 키운 만큼 센 변신 (변신하지 않은 사람에게는 1)
  g.mods.provide('damage', (p) => (p && p.kind === 'p' && p.morph.on ? 1 + pactBonus(g, p) : 1));

  // 4. 임무: 단계를 깸, 변신함, 뽑음
  g.ready.push(() => {
    const daily = g.daily, gacha = g.gacha;
    g.on('stageCleared', (p) => daily.add(p, PACT_KINDS.stage, 1));
    g.on('morphed', (p, _id, why) => { if (why === 'on') daily.add(p, PACT_KINDS.morph, 1); });
    const draw = gacha.draw.bind(gacha);
    gacha.draw = (p, id, n) => {
      const got = draw(p, id, n);
      if (got?.length) daily.add(p, PACT_KINDS.pull, got.length);
      return got;
    };
  });
}
