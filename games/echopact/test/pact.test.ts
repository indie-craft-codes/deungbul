// 메아리 계약의 규칙 (서버 없이, 가상 시계): 메아리 정의가 규칙을 지나는가, 공개 확률표와 천장, 그리고 두 게임 —
// 계약의 탑(A: 단계·뽑기·편성)과 울림골(B: 들판)을 '게임 바꾸기'로 오가며, 뽑은 메아리가 같은 소유로 (1) 탑의 편성 동료 (2) 들판의 변신이 되고,
// 카드의 능력치가 곧 변신의 능력치이며, 보고 있지 않은 쪽(들판의 자동 사냥, 탑의 자동 진행)이 이어 가고, 저장과 예전 저장을 지나도 이어지는가.
import { BANNERS, CHAPTERS, DAILIES, MODE_RULES, MODULES, SQUAD_RULES } from '../shared/content';
import { MODE, SAFETY, STARTER, STARTER_ECHO, cardToMorph } from '../shared/content/pact';
import { installEchopact } from '../server/echopact';
import { ECHO_DEFS } from '../server/echoes';
import { type Ent, Game } from '@engine/server';
import { charText, charWeight, classBaseAtk, encodeLook, heroDef, isHeroId, lookParts, morphCard, morphStats, pityOdds, poolOdds, rarityOdds, seededRng, validateCharDef } from '@engine/shared/defs';
import { check } from '@engine/testing';

// ---------- 메아리 정의와 뽑기의 표 ----------
{
  const all = ECHO_DEFS.map((raw) => validateCharDef(raw));
  check(all.every((r) => r.ok), `손으로 쓴 메아리 정의 열이 이 게임의 규칙(CHAR_RULES)을 지난다 (${all.map((r) => (r.ok ? `${r.def.id}:${r.def.rarity}:${charWeight(r.def.stats)}` : r.issues.map((x) => `${x.code}@${x.path}`).join('/'))).join(', ')})`);
  const defs = all.flatMap((r) => (r.ok ? [r.def] : []));
  const byR = [0, 1, 2].map((r) => defs.filter((d) => d.rarity === r).length);
  check(defs.length === 10 && byR.join() === '4,4,2' && new Set(defs.map((d) => d.role)).size === 4, `열 개: 일반 넷·희귀 넷·전설 둘, 역할 넷 (${byR.join('/')})`);
  check(defs.every((d) => !!d.text?.en?.name && charText(d, 'en').name !== d.name && charText(d, 'ko').name === d.name && charText(d, 'en').bio === d.text!.en!.bio),
    '정의마다 영어 이름·소개(CharDef.text.en)가 있고, 언어에 따라 그 글이 나온다 (한국어는 정의의 글)');
  const looks = new Set(defs.map((d) => encodeLook(d.look)));
  const parts = new Set(defs.flatMap((d) => Object.values(d.look.parts)));
  check(looks.size === 10 && parts.size >= 25 && lookParts('hat').includes('halo') && defs.some((d) => d.look.parts.hat === 'halo'), `겉모습이 모두 다르고(${looks.size}) 부품이 ${parts.size}가지, 이 게임이 더한 모자 'halo'를 쓰는 메아리가 있다`);
  const cheat = validateCharDef({ ...(ECHO_DEFS[0] as object), id: 'cheater', stats: { atk: 22, hp: 260 } });
  check(!cheat.ok && cheat.issues.some((x) => x.code === 'budget'), '일반 등급의 예산(170)을 넘긴 정의는 거절된다 (AI가 만든 정의가 들어올 자리)');
  const skill = validateCharDef({ ...(ECHO_DEFS[0] as object), id: 'wrongskill', skills: ['cleave'] });
  check(!skill.ok && skill.issues[0].code === 'skill', '계약자의 기술(cleave)은 메아리가 고를 수 없다 (CHAR_RULES.skills)');
  const badText = validateCharDef({ ...(ECHO_DEFS[0] as object), id: 'badtext', text: { en: { name: '운영자 admin' } } });
  check(!badText.ok && badText.issues.some((x) => x.code === 'banned' && x.path === 'text.en.name'), '언어마다의 이름도 같은 검증(금칙어)을 지난다 (자리 text.en.name)');
  check(!MODULES.includes('herogear') && ['roster', 'gacha', 'squad', 'stages', 'chars', 'morph', 'modes', 'combat', 'away', 'party', 'chat', 'friends'].every((m) => MODULES.includes(m as never)), '모듈: 들판(전투·자동 사냥·파티·대화 …) + 수집형 넷 + 캐릭터 정의·변신 + 게임 안의 모드');
  check(MODE_RULES.list.map((m) => `${m.id}:${m.kind}`).join() === 'tower:stage,vale:field' && MODE_RULES.start === MODE.tower && SQUAD_RULES.where === 'stage', '두 게임: 계약의 탑(단계)·울림골(들판), 처음은 탑, 편성은 탑에서만');
}

let clock = Date.UTC(2026, 10, 30, 3, 0, 0);
const g = new Game({ plugins: [installEchopact], now: () => clock });
const run = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) { g.tick(0.05); clock += 50; } };
const said = (p: Ent, k: string) => g.notices.filter((n) => n.id === p.id && n.k === k);
const heroesIn = (p: Ent) => [...g.ents.values()].filter((e) => e.kind === 'hero' && e.data.owner === p.id);

{
  // 정의가 들어온 뒤의 판: 확률은 무게로만, 공개 확률표와 같은 셈 (poolOdds)
  const b = BANNERS.well, odds = poolOdds(b.pool), byR = rarityOdds(odds);
  check(b.pool.every((s) => isHeroId(s.hero)) && odds.length === 10 && Math.abs(odds.reduce((s, o) => s + o.p, 0) - 1) < 1e-12, '서버가 켜지면 판의 메아리 열이 모두 영웅의 표에 들어 있고, 확률의 합이 1이다');
  check(Math.abs(byR[0] - 0.76) < 1e-12 && Math.abs(byR[1] - 0.2) < 1e-12 && Math.abs(byR[2] - 0.04) < 1e-12, `등급의 확률: 일반 76%, 희귀 20%, 전설 4% (${byR.map((x) => (x * 100).toFixed(1)).join(' / ')})`);
  check(pityOdds(b).length === 2 && pityOdds(b).every((o) => o.rarity === 2 && Math.abs(o.p - 0.5) < 1e-12), '천장(40번째)의 확률표: 전설 둘이 반씩');
}

// ---------- 처음 온 사람: 탑의 대기실에서, 처음 메아리가 편성·변신 목록에 ----------
const p = g.players.spawn('계약자', false, null, 'ep-1');
g.fire('playerJoined', p);
g.command(p, { t: 'class', id: 'warden' });
run(0.3);
check(g.modes.of(p) === MODE.tower && g.stages.inLobby(p) && p.layer !== 0, `처음 온 사람은 계약의 탑(A)에서 시작한다: 그 사람만의 층(${p.layer})의 대기실(단계 선택)`);
check(Object.keys(p.heroes).join() === STARTER_ECHO && p.squad.join() === STARTER_ECHO && g.morph.owned(p).join() === STARTER_ECHO && p.morph.own.length === 0 && p.gold === STARTER.gold && p.sparks === 0,
  `처음 메아리(${STARTER_ECHO})가 영웅·편성에 들고, 변신 목록은 영웅에서 읽힌다(따로 저장하지 않는다: fromRoster), 골드 ${STARTER.gold}`);
check(heroesIn(p).length === 1 && heroesIn(p)[0].layer === p.layer, '탑의 대기실에는 편성의 메아리가 곁에 선다');
g.notices = [];
g.command(p, { t: 'gacha', id: 'well', n: 1 });
check(said(p, 'costShort').length === 1 && p.pulls.length === 0, '울림 조각이 없으면 뽑지 못하고 아무것도 바뀌지 않는다');

// ---------- 탑: 단계를 골라 깬다 ----------
{
  g.command(p, { t: 'stage', a: 'go', id: '1-1' });
  run(0.2);
  check(!!g.stages.runOf(p) && g.stages.runOf(p)!.state === 'fight' && g.stages.inStage(p), '대기실에서 1-1을 고르면 그 층에서 싸움이 시작된다');
  for (let i = 0; i < 20 * 90 && p.stage.best === ''; i++) { g.tick(0.05); clock += 50; }
  check(p.stage.best === '1-1' && p.sparks >= CHAPTERS[0].stages[0].first!.sparks!, `단계 1-1을 깬다 (처음 깬 보상 울림 조각 ${CHAPTERS[0].stages[0].first!.sparks})`);
  g.command(p, { t: 'stage', a: 'leave' });
  run(0.2);
  check(g.stages.inLobby(p) && g.modes.of(p) === MODE.tower, '탑의 \'나가기\'는 단계 선택(대기실)으로 간다 (들판으로 나가지 않는다)');
}

// ---------- 뽑기 → 소유가 두 쪽에 ----------
g.gacha.rng = seededRng(11);
g.wallet.add(p, 'sparks', 900 - p.sparks, 'test');
g.command(p, { t: 'gacha', id: 'well', n: 10 });
const owned = Object.keys(p.heroes);
check(p.pulls.length === 10 && p.sparks === 0 && p.pulls.some((x) => x.r >= 1), `10번 뽑기: 900을 치르고 열 번, 희귀 이상이 하나는 있다 (${p.pulls.map((x) => x.h).join(', ')})`);
check(owned.length > 1 && g.morph.owned(p).join() === owned.join() && p.morph.own.length === 0, `새로 얻은 메아리(${owned.length}) 모두가 곧바로 변신 목록에 (가진 영웅 ∩ 정의, 맞추는 코드 없이)`);
check(p.daily.got.includes('pull1'), '일일 임무 \'뽑기\'가 센다');
const pick = owned.filter((id) => id !== STARTER_ECHO).sort((a, b) => heroDef(b).rarity - heroDef(a).rarity)[0];

// 천장: 전설이 나오지 않는 난수로 40번째는 전설
{
  const q = g.players.spawn('천장', false, null, 'ep-2');
  g.fire('playerJoined', q);
  g.gacha.rng = () => 0;
  g.wallet.add(q, 'sparks', 3900, 'test');
  for (let i = 0; i < 3; i++) g.gacha.draw(q, 'well', 10);
  const before = q.pulls.length, legendsBefore = q.pulls.filter((x) => x.r === 2).length;
  for (let i = 0; i < 10; i++) g.gacha.draw(q, 'well', 1);
  check(before === 30 && legendsBefore === 0 && q.pulls[0].r === 2 && q.pulls[0].pity && q.pulls.slice(1).every((x) => x.r < 2) && q.pity.well === 0,
    `천장: 39번 동안 전설이 없으면 40번째는 전설(${q.pulls[0].h}), 셈이 0으로 (${q.pulls.length}번)`);
  check(g.morph.owns(q, q.pulls[0].h), '천장으로 얻은 전설도 변신 목록에');
  g.players.leave(q.id);
  g.gacha.rng = seededRng(11);
}

// ---------- 게임 바꾸기: 탑 → 울림골. 들판에는 동료가 없고, 변신은 카드의 능력치로 ----------
{
  g.command(p, { t: 'squad', ids: [pick, STARTER_ECHO] });
  run(0.2);
  check(heroesIn(p).length === 2 && heroesIn(p).every((e) => e.layer === p.layer), `탑에서 편성을 바꾸면(${pick}, ${STARTER_ECHO}) 곁의 메아리가 바뀐다`);
  run(1.2);
  g.command(p, { t: 'mode', id: MODE.vale });
  run(0.3);
  check(g.modes.of(p) === MODE.vale && p.layer === 0 && !g.stages.runOf(p) && heroesIn(p).length === 0 && g.squad.heroes(p).length === 0, '울림골(B)로 바꾸면 들판의 층에 서고, 편성의 메아리는 따라오지 않는다 (where: stage)');
  p.lastHurt = -999;
  const baseHp = p.maxHp, baseMul = g.mods.product('damage', p);
  g.command(p, { t: 'morph', a: 'on', id: pick });
  const def = g.chars.get(pick)!, card = morphCard(def, p.heroes[pick], { lv: p.lv }), want = morphStats(card)!, conv = cardToMorph(card);
  check(p.morph.on === pick && p.look === encodeLook(def.look), `들판에서 그 메아리(${pick})로 변신하면 겉모습이 그 정의의 부품이 된다`);
  check(want.hp === Math.round(conv.hp) && want.atk === Math.round(conv.atk) && p.maxHp === want.hp && Math.abs(g.mods.product('damage', p) / baseMul - want.atk / classBaseAtk(p.cls)) < 1e-9,
    `변신한 동안 기본 체력 ${baseHp} → 카드의 체력 ${want.hp}, 기본 공격 ${classBaseAtk(p.cls)} → 카드의 공격 ${want.atk} (카드 공격 ${card.atk}·체력 ${card.hp})`);
  // 탑에서 키우면 들판의 변신이 바로 세진다
  g.wallet.add(p, 'gold', 100000, 'test');
  for (let i = 0; i < 9; i++) g.roster.levelUp(p, pick);
  const card2 = morphCard(def, p.heroes[pick], { lv: p.lv }), want2 = morphStats(card2)!;
  check(p.heroes[pick].lv === 10 && want2.atk > want.atk && p.maxHp === want2.hp && Math.abs(g.mods.product('damage', p) / baseMul - want2.atk / classBaseAtk(p.cls)) < 1e-9,
    `그 메아리를 레벨 10으로 키우면 카드(공격 ${card2.atk})와 변신(체력 ${want2.hp}, 공격 ${want2.atk})이 함께 오른다`);
  check(p.daily.got.includes('morph1'), '일일 임무 \'변신\'이 센다');
  g.command(p, { t: 'morph', a: 'off' });
  check(p.maxHp === baseHp + 0 || p.maxHp === baseHp, `풀면 기본 체력으로 (${p.maxHp})`);
}

// ---------- 울림골에서 자동 사냥을 켠 채 탑으로: 들판의 몸이 남아 사냥한다 ----------
{
  g.players.grant(p, 400, 0); // 레벨 3 이상 (자리 비움 사냥의 조건)
  p.x = 20; p.z = 14; p.tx = p.x; p.tz = p.z; p.lastHurt = -999;
  run(11);
  g.command(p, { t: 'morph', a: 'on', id: pick });
  g.command(p, { t: 'auto', on: true });
  const sparks0 = p.sparks, kills0 = p.daily.prog.kill30 ?? 0;
  g.command(p, { t: 'mode', id: MODE.tower });
  run(0.2);
  const stand = g.modes.standOf(p);
  check(!!stand && stand.layer === 0 && stand.name === p.name && g.modes.of(p) === MODE.tower && g.stages.inLobby(p), '자동 사냥을 켠 채 탑으로 가면 들판에 그 사람의 몸(대역)이 남고, 그 사람은 탑의 대기실에 선다');
  check(stand!.maxHp === p.maxHp && stand!.look === p.look, '대역은 그 사람의 최대 체력(변신의 카드 능력치)과 겉모습(변신)을 따른다');
  // 탑에서 단계를 하는 동안 들판의 대역이 사냥한다
  g.command(p, { t: 'stage', a: 'go', id: '1-2' });
  run(60);
  const side = (g.personal.find((x) => x.name === 'modeSide')!.state(p)) as { field: { kills: number; got: { sparks: number } } | null };
  check((p.daily.prog.kill30 ?? 0) > kills0 && p.sparks > sparks0 && (side.field?.kills ?? 0) > 0 && (side.field?.got.sparks ?? 0) > 0,
    `탑에 있는 동안 들판의 대역이 잡은 것이 그 사람의 것이 된다 (잡은 수 ${side.field?.kills}, 울림 조각 +${side.field?.got.sparks}, 일일 사냥 ${p.daily.prog.kill30})`);
  check(p.stage.best >= '1-2', `동시에 탑의 단계도 나아간다 (가장 멀리 ${p.stage.best})`);
  // 안전장치: 체력이 낮으면 물약 → 더 낮으면 물러나 멈춘다
  const tonics = p.items.tonic ?? 0;
  stand!.hp = Math.round(stand!.maxHp * (SAFETY.potionAt - 0.05)); p.itemCd = 0;
  run(0.4);
  check((p.items.tonic ?? 0) === tonics - 1 && stand!.hp > stand!.maxHp * (SAFETY.potionAt - 0.05), `대역의 체력이 ${SAFETY.potionAt * 100}% 아래면 그 사람의 물약을 마신다 (샘물 약 ${tonics} → ${p.items.tonic ?? 0})`);
  g.notices = [];
  p.items.tonic = 0;
  stand!.hp = Math.round(stand!.maxHp * (SAFETY.retreatAt - 0.05)); p.itemCd = 0;
  run(0.4);
  check(!p.auto && said(p, 'autoRetreat').length === 1 && (g.personal.find((x) => x.name === 'modeSide')!.state(p) as { field: { state: string } }).field.state === 'retreat',
    `물약 없이 ${SAFETY.retreatAt * 100}% 아래면 자동 사냥을 멈추고 물러난다 (안내문 autoRetreat: 화면이 탑에서 '바로 가기'를 띄운다)`);
  // 돌아오면 대역의 자리·체력을 이어받는다
  run(2);
  const at = { x: stand!.x, z: stand!.z };
  g.command(p, { t: 'mode', id: MODE.vale });
  run(0.2);
  check(!g.modes.standOf(p) && !g.ents.has(stand!.id) && p.layer === 0 && Math.hypot(p.x - at.x, p.z - at.z) < 2, '울림골로 돌아오면 대역이 거둬지고 그 사람이 그 자리에서 이어 간다');
  check(!!g.stages.runOf(p)?.bg, '탑의 싸움은 뒤에서 이어 간다 (싸우는 중에 바꿨다)');
}

// ---------- 탑에서 자동 진행을 켠 채 울림골로: 단계가 뒤에서 이어 가고, 지면 멈춘다 ----------
{
  // 쉬운 단계(1-1)에서 다시: 들판에서 뒤에서 잇던 것을 멈추고, 탑에서 자동 진행을 켜고 싸우는 중에 울림골로
  if (g.stages.runOf(p)) g.command(p, { t: 'stage', a: 'leave' });
  check(!g.stages.runOf(p), '들판에서 뒤에서 잇는 탑을 멈출 수 있다 (작은 표시의 탑 멈추기)');
  run(1.2);
  g.command(p, { t: 'mode', id: MODE.tower }); run(0.2);
  g.command(p, { t: 'stage', a: 'auto', on: true });
  g.command(p, { t: 'stage', a: 'go', id: '1-1' }); run(1.2);
  g.command(p, { t: 'mode', id: MODE.vale }); run(0.2);
  const st = g.stages.runOf(p)!;
  check(!!st && st.bg && st.layer !== p.layer && heroesIn(p).length === 2 && heroesIn(p).every((e) => e.layer === st.layer), '뒤에서 잇는 단계는 그 층에 편성의 메아리만 남아 싸운다 (사람은 들판에)');
  const best0 = p.stage.best, sparks0 = p.sparks;
  let cleared = 0, got = 0;
  for (let k = 0; k < 120 && g.stages.runOf(p); k++) {
    run(1);
    const side = g.personal.find((x) => x.name === 'modeSide')!.state(p) as { stage: { cleared: number; got: { sparks: number } } | null };
    if (side.stage) { cleared = Math.max(cleared, side.stage.cleared); got = Math.max(got, side.stage.got.sparks); }
  }
  check(cleared >= 1 && got > 0 && p.sparks > sparks0, `들판에 있는 동안 탑이 메아리만으로 싸워 자동 진행으로 나아가고 보상이 쌓인다 (${best0} → ${p.stage.best}, 깬 수 ${cleared}, 울림 조각 +${got})`);
  // 아주 센 단계로 보내면 메아리만으로는 지고, 지면 멈춘다 (자동 진행이 꺼진다)
  g.notices = [];
  if (!g.stages.runOf(p)) { g.command(p, { t: 'mode', id: MODE.tower }); run(1.2); g.command(p, { t: 'stage', a: 'go', id: p.stage.best }); run(0.5); g.command(p, { t: 'mode', id: MODE.vale }); run(0.2); }
  for (const e of heroesIn(p)) e.hp = 1;
  for (let i = 0; i < 20 * 200 && g.stages.runOf(p); i++) { g.tick(0.05); clock += 50; for (const e of heroesIn(p)) if (e.hp > 1) e.hp = 1; }
  check(!g.stages.runOf(p) && !p.stage.auto && said(p, 'stageBgStop').length === 1, '뒤에서 잇던 단계에서 지면 자동 진행이 꺼지고 멈춘다 (안내문 stageBgStop: 들판 화면에 \'바로 가기\')');
}

// ---------- 저장을 지나도: 모드·소유·편성·변신 ----------
{
  g.command(p, { t: 'morph', a: 'on', id: pick });
  run(11);
  g.command(p, { t: 'morph', a: 'on', id: pick });
  const save = structuredClone(g.players.export(p));
  const h = new Game({ plugins: [installEchopact], now: () => clock });
  const q = h.players.spawn('계약자', false, save, 'ep-1');
  h.fire('playerJoined', q);
  check(JSON.stringify(q.heroes) === JSON.stringify(p.heroes) && q.squad.join() === p.squad.join() && h.morph.owned(q).join() === g.morph.owned(p).join() && h.modes.of(q) === MODE.vale,
    '다시 읽은 캐릭터의 메아리(레벨·별)·편성·변신 목록·모드(울림골)가 같다');
  check(q.morph.on === p.morph.on && q.look === p.look && q.maxHp === p.maxHp, `변신 중이던 것과 그 능력치(체력 ${q.maxHp})도 이어진다`);
}

// ---------- 예전 저장 (모드가 없던 때: ext.morph.own을 따로 저장하던 모양) ----------
{
  const h = new Game({ plugins: [installEchopact], now: () => clock });
  const old = {
    name: '옛 계약자', v: 1, lv: 6, exp: 0, gold: 500, cls: 'warden',
    ext: {
      roster: { brindle: [3, 1, 0], aurelle: [1, 3, 0] },
      squad: ['aurelle', 'brindle'],
      morph: { own: ['brindle', 'aurelle', 'wren'], on: 'aurelle', left: 120 },
      stages: { cur: '1-3', best: '1-2', auto: true },
    },
  };
  const q = h.players.spawn('옛 계약자', false, old as never, 'ep-old');
  h.fire('playerJoined', q);
  check(h.modes.of(q) === MODE.vale && q.layer === 0, '예전 저장의 사람은 들판(울림골)에서 이어 간다 (저장 이전 gv 1)');
  check(['brindle', 'aurelle', 'wren'].every((id) => h.morph.owns(q, id)) && q.heroes.brindle.lv === 3 && q.heroes.wren?.lv === 1, '예전의 변신 소유가 모두 남는다 (변신으로만 가졌던 메아리는 영웅으로 더해진다)');
  check(q.morph.on === 'aurelle' && q.look === encodeLook(h.chars.get('aurelle')!.look) && q.stage.best === '1-2', '예전에 변신 중이던 것과 단계의 진행도 이어진다');
  check(h.squad.heroes(q).length === 0, '예전 저장에서도 들판에는 동료가 따라오지 않는다');
}

// ---------- 임무의 꼴 ----------
check(Object.values(DAILIES).filter((d) => 'period' in d && d.period === 'week').length === 2 && ['kill', 'stage', 'pull', 'morph'].every((k) => Object.values(DAILIES).some((d) => d.kind === k)),
  '일일 임무가 들판(사냥)·탑(단계·뽑기)·변신을 고루 세고, 주간 임무가 둘 있다');
