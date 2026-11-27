// 메아리 계약의 규칙 (서버 없이, 가상 시계): 메아리 정의가 규칙을 지나는가, 공개 확률표와 천장, 그리고 두 장르의 다리 —
// 뽑은 메아리가 같은 소유로 (1) 편성 동료로 단계에서 싸우고 (2) 들판에서 변신으로 쓰이며, 저장을 지나도 둘 다 이어지는가.
import { BANNERS, CHAPTERS, DAILIES, MODULES, MORPH_RULES } from '../shared/content';
import { PACT_GROWTH, STARTER, STARTER_ECHO, WELL } from '../shared/content/pact';
import { installEchopact } from '../server/echopact';
import { pactBonus } from '../server/pact';
import { ECHO_DEFS } from '../server/echoes';
import { type Ent, Game } from '@engine/server';
import { charWeight, encodeLook, heroDef, isHeroId, lookParts, pityOdds, poolOdds, rarityOdds, seededRng, validateCharDef } from '@engine/shared/defs';
import { check } from '@engine/testing';

// ---------- 메아리 정의와 뽑기의 표 ----------
{
  const all = ECHO_DEFS.map((raw) => validateCharDef(raw));
  check(all.every((r) => r.ok), `손으로 쓴 메아리 정의 열이 이 게임의 규칙(CHAR_RULES)을 지난다 (${all.map((r) => (r.ok ? `${r.def.id}:${r.def.rarity}:${charWeight(r.def.stats)}` : r.issues.map((x) => `${x.code}@${x.path}`).join('/'))).join(', ')})`);
  const defs = all.flatMap((r) => (r.ok ? [r.def] : []));
  const byR = [0, 1, 2].map((r) => defs.filter((d) => d.rarity === r).length);
  check(defs.length === 10 && byR.join() === '4,4,2' && new Set(defs.map((d) => d.role)).size === 4, `열 개: 일반 넷·희귀 넷·전설 둘, 역할 넷 (${byR.join('/')})`);
  const looks = new Set(defs.map((d) => encodeLook(d.look)));
  const parts = new Set(defs.flatMap((d) => Object.values(d.look.parts)));
  check(looks.size === 10 && parts.size >= 25 && lookParts('hat').includes('halo') && defs.some((d) => d.look.parts.hat === 'halo'), `겉모습이 모두 다르고(${looks.size}) 부품이 ${parts.size}가지, 이 게임이 더한 모자 'halo'를 쓰는 메아리가 있다`);
  const cheat = validateCharDef({ ...(ECHO_DEFS[0] as object), id: 'cheater', stats: { atk: 22, hp: 260 } });
  check(!cheat.ok && cheat.issues.some((x) => x.code === 'budget'), '일반 등급의 예산(170)을 넘긴 정의는 거절된다 (AI가 만든 정의가 들어올 자리)');
  const skill = validateCharDef({ ...(ECHO_DEFS[0] as object), id: 'wrongskill', skills: ['cleave'] });
  check(!skill.ok && skill.issues[0].code === 'skill', '계약자의 기술(cleave)은 메아리가 고를 수 없다 (CHAR_RULES.skills)');
  check(!MODULES.includes('herogear') && ['roster', 'gacha', 'squad', 'stages', 'chars', 'morph', 'combat', 'party', 'chat', 'friends'].every((m) => MODULES.includes(m as never)), '모듈: 들판(전투·파티·대화 채널·친구 …) + 수집형 넷 + 캐릭터 정의·변신');
}

let clock = Date.UTC(2026, 10, 30, 3, 0, 0);
const g = new Game({ plugins: [installEchopact], now: () => clock });
const run = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) { g.tick(0.05); clock += 50; } };
const said = (p: Ent, k: string) => g.notices.filter((n) => n.id === p.id && n.k === k);

{
  // 정의가 들어온 뒤의 판: 확률은 무게로만, 공개 확률표와 같은 셈 (poolOdds)
  const b = BANNERS.well, odds = poolOdds(b.pool), byR = rarityOdds(odds);
  check(b.pool.every((s) => isHeroId(s.hero)) && odds.length === 10 && Math.abs(odds.reduce((s, o) => s + o.p, 0) - 1) < 1e-12, '서버가 켜지면 판의 메아리 열이 모두 영웅의 표에 들어 있고, 확률의 합이 1이다');
  check(Math.abs(byR[0] - 0.76) < 1e-12 && Math.abs(byR[1] - 0.2) < 1e-12 && Math.abs(byR[2] - 0.04) < 1e-12, `등급의 확률: 일반 76%, 희귀 20%, 전설 4% (${byR.map((x) => (x * 100).toFixed(1)).join(' / ')})`);
  check(pityOdds(b).length === 2 && pityOdds(b).every((o) => o.rarity === 2 && Math.abs(o.p - 0.5) < 1e-12), '천장(40번째)의 확률표: 전설 둘이 반씩');
}

// ---------- 처음 온 사람: 처음 메아리 하나가 편성에도, 변신에도 ----------
const p = g.players.spawn('계약자', false, null, 'ep-1');
g.fire('playerJoined', p);
g.command(p, { t: 'class', id: 'warden' });
check(Object.keys(p.heroes).join() === STARTER_ECHO && p.squad.join() === STARTER_ECHO && p.morph.own.join() === STARTER_ECHO && p.gold === STARTER.gold && p.sparks === 0,
  `처음 메아리(${STARTER_ECHO})가 영웅(roster)·편성(squad)·변신(morph)에 함께 들고, 골드 ${STARTER.gold}, 울림 조각 0`);
g.notices = [];
g.command(p, { t: 'gacha', id: 'well', n: 1 });
check(said(p, 'costShort').length === 1 && p.pulls.length === 0, '울림 조각이 없으면 뽑지 못하고 아무것도 바뀌지 않는다');

// ---------- 뽑기 → 소유가 두 쪽에 ----------
g.gacha.rng = seededRng(11);
g.wallet.add(p, 'sparks', 900, 'test');
g.command(p, { t: 'gacha', id: 'well', n: 10 });
const owned = Object.keys(p.heroes);
check(p.pulls.length === 10 && p.sparks === 0 && p.pulls.some((x) => x.r >= 1), `10번 뽑기: 900을 치르고 열 번, 희귀 이상이 하나는 있다 (${p.pulls.map((x) => x.h).join(', ')})`);
check(owned.length > 1 && owned.every((id) => p.morph.own.includes(id)) && p.morph.own.length === owned.length, `새로 얻은 메아리(${owned.length}) 모두가 곧바로 변신으로도 생긴다 (한 소유)`);
check(g.notices.some((n) => n.id === p.id && n.k === 'charNew') && p.daily.got.includes('pull1'), '새 메아리는 변신을 얻었다는 안내(charNew)와 함께, 일일 임무 \'뽑기\'가 센다');

// 천장: 전설이 나오지 않는 난수로 40번째는 전설
{
  const q = g.players.spawn('천장', false, null, 'ep-2');
  g.fire('playerJoined', q);
  g.gacha.rng = () => 0; // 판의 첫 칸(일반)만 나오는 난수
  g.wallet.add(q, 'sparks', 3900, 'test');
  for (let i = 0; i < 3; i++) g.gacha.draw(q, 'well', 10);
  const before = q.pulls.length, legendsBefore = q.pulls.filter((x) => x.r === 2).length;
  for (let i = 0; i < 10; i++) g.gacha.draw(q, 'well', 1);
  // 기록은 새 것이 앞: 39번째까지 전설이 없고 40번째(앞에서 0번)가 천장의 전설
  check(before === 30 && legendsBefore === 0 && q.pulls[0].r === 2 && q.pulls[0].pity && q.pulls.slice(1).every((x) => x.r < 2) && q.pity.well === 0,
    `천장: 39번 동안 전설이 없으면 40번째는 전설(${q.pulls[0].h}), 셈이 0으로 (${q.pulls.length}번)`);
  check(q.morph.own.includes(q.pulls[0].h), '천장으로 얻은 전설도 변신으로 생긴다');
  g.gacha.rng = seededRng(11);
}

// ---------- 같은 메아리가 편성 동료로 단계에서 싸운다 ----------
const pick = owned.filter((id) => id !== STARTER_ECHO).sort((a, b) => heroDef(b).rarity - heroDef(a).rarity)[0];
{
  g.command(p, { t: 'squad', ids: [pick, STARTER_ECHO] });
  check(p.squad.join() === `${pick},${STARTER_ECHO}`, `뽑은 메아리(${pick})를 편성에 넣는다`);
  g.command(p, { t: 'stage', a: 'start' });
  run(0.2); // 편성의 영웅은 다음 틱에 주인의 층으로 따라 옮긴다
  const mates = g.squad.heroes(p);
  const mine = mates.find((e) => e.type === pick);
  check(g.stages.inStage(p) && !!mine && mine.layer === p.layer && p.layer !== 0, `단계는 그 사람의 층에서 벌어지고, 편성한 메아리(${pick})가 영웅으로 함께 든다`);
  // 그 메아리가 실제로 때렸는가: 전투 모듈의 피해 함수를 지켜본다 (시험만)
  let dealt = 0;
  const damage = g.combat.damage.bind(g.combat);
  g.combat.damage = (src, dst, amount, crit) => { if (src === mine) dealt += amount; damage(src, dst, amount, crit); };
  for (let i = 0; i < 20 * 90 && p.stage.best === ''; i++) { g.tick(0.05); clock += 50; }
  g.combat.damage = damage;
  check(dealt > 0, `편성한 메아리(${pick})가 단계의 몬스터를 때렸다 (피해 ${Math.round(dealt)})`);
  check(p.stage.best === '1-1' && p.sparks >= CHAPTERS[0].stages[0].first!.sparks!, `단계 1-1을 깬다 (처음 깬 보상 울림 조각 ${CHAPTERS[0].stages[0].first!.sparks})`);
  check((p.daily.prog.stage5 ?? 0) >= 1, '일일 임무 \'단계 깨기\'가 센다');
  g.command(p, { t: 'stage', a: 'leave' });
  check(!g.stages.inStage(p) && p.layer === 0, '단계에서 나와 들판으로');
}

// ---------- 같은 메아리로 들판에서 변신 ----------
{
  p.x = WELL.x; p.z = WELL.z + 4; p.lastHurt = -999;
  run(31); // 단계에서의 싸움이 끝나고 (맞은 지 4초)
  const base = g.mods.product('damage', p);
  g.command(p, { t: 'morph', a: 'on', id: pick });
  const def = g.chars.get(pick)!;
  check(p.morph.on === pick && p.look === encodeLook(def.look), `들판에서 그 메아리(${pick})로 변신하면 겉모습이 그 정의의 부품이 된다 (남에게 가는 글자 '${p.look}')`);
  const r = MORPH_RULES.mods!(def)!, dmg = Math.min(MORPH_RULES.cap!.damage!, r.damage!);
  check(Math.abs(g.mods.product('damage', p) / base - (1 + dmg) * (1 + pactBonus(g, p))) < 1e-9 && pactBonus(g, p) === 0, `변신의 보정: 주는 피해 +${(dmg * 100).toFixed(1)}% (키우지 않은 메아리는 이 게임의 덤 0)`);
  // 수집형 쪽에서 키우면 변신이 조금 세진다 (별 하나 → +1.2%)
  const h = p.heroes[pick];
  g.wallet.add(p, 'gold', 100000, 'test');
  for (let i = 0; i < 9; i++) g.roster.levelUp(p, pick);
  h.shards = 1000; g.roster.starUp(p, pick);
  const want = Math.min(PACT_GROWTH.cap, PACT_GROWTH.perStar + 9 * PACT_GROWTH.perLv);
  check(Math.abs(pactBonus(g, p) - want) < 1e-9 && h.lv === 10, `수집형 쪽에서 키운 만큼(레벨 10, 별 +1) 변신의 덤이 커진다: 주는 피해 +${(want * 100).toFixed(1)}%`);
  check(p.daily.got.includes('morph1'), '일일 임무 \'변신\'이 센다');
}

// ---------- 저장을 지나도: 소유·편성·변신 ----------
{
  const save = structuredClone(g.players.export(p));
  const h = new Game({ plugins: [installEchopact], now: () => clock });
  const q = h.players.spawn('계약자', false, save, 'ep-1');
  h.fire('playerJoined', q);
  check(JSON.stringify(q.heroes) === JSON.stringify(p.heroes) && q.squad.join() === p.squad.join() && q.morph.own.join() === p.morph.own.join(),
    '다시 읽은 캐릭터의 메아리(레벨·별), 편성, 변신의 소유가 같다');
  check(q.morph.on === pick && q.look === p.look && q.pulls.length === p.pulls.length, '변신 중이던 것도 이어진다 (남은 시간 안에서)');
  // 예전 저장(변신의 소유가 빠진 것)도 접속할 때 소유에 맞춘다
  const old = structuredClone(save) as typeof save & { ext: Record<string, unknown> };
  delete old.ext.morph;
  const r = h.players.spawn('옛 저장', false, old, 'ep-3');
  h.fire('playerJoined', r);
  check(r.morph.own.length === Object.keys(r.heroes).length && Object.keys(r.heroes).every((id) => r.morph.own.includes(id)) && Object.keys(r.heroes).length === Object.keys(p.heroes).length,
    '변신의 소유가 없는 저장도 접속할 때 가진 메아리에 맞춘다 (처음 메아리를 또 받지 않는다)');
}

// ---------- 임무의 꼴 ----------
check(Object.values(DAILIES).filter((d) => 'period' in d && d.period === 'week').length === 2 && ['kill', 'stage', 'pull', 'morph'].every((k) => Object.values(DAILIES).some((d) => d.kind === k)),
  '일일 임무가 들판(사냥)·수집형(단계·뽑기)·다리(변신)를 고루 세고, 주간 임무가 둘 있다');
