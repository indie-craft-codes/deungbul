// 캐릭터 정의와 그 검증기 (engine/shared/defs/chardef.ts), 겉모습의 글자 (look.ts), 정의를 두는 chars 모듈과 영웅의 다리 (systems/chars.ts).
// 검증기는 바깥(AI)의 결과를 믿지 않는다는 전제다: 아래의 퍼징이 무작위·악의적인 정의 수천 개를 넣어 예외 없이 거절·통과하는지, 예산을 넘는 것은 언제나 거절되는지 본다.
// 예산은 이 시험용 내용의 영웅에서 셈한다 (CHAR_RULES를 적지 않았다): 일반 146(공격 11, 체력 220), 희귀 130(15, 170), 전설 240(24, 320).
import { addCharFilter, budgetFromHeroes, CHAR_ERRS, charBudgets, charWeight, clearCharFilters, decodeLook, encodeLook, heroDef, heroIds, heroRole, isHeroId, lookParts, LOOK_SLOTS, seededRng, validateCharDef, type CharDef, type Look } from '../../shared/defs';
import { MODULES } from '../../shared/defs';
import type { ModuleId } from '../../shared/modules';
import { Game } from '../../server/game/game';
import { check } from '../harness';

const good = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  v: 1, id: 'mossknight', name: '이끼 기사', bio: '숲을 지키는 느긋한 기사. 이끼 낀 방패를 아낀다.',
  look: { parts: { body: 'stout', head: 'round', hair: 'short', hat: 'helm', face: 'beard', back: 'shield' }, colors: { skin: 0xe0b890, cloth: 0x4c7a3a, hair: 0x5a3a20, accent: 0xc8a040 }, pattern: 'belt', size: 1.05, width: 1.1 },
  role: 'guard', rarity: 0, stats: { atk: 9, hp: 200 }, skills: ['shieldbash'], ...over,
});
const codes = (r: ReturnType<typeof validateCharDef>): string[] => (r.ok ? [] : r.issues.map((x) => x.code));

// ---------- 예산: 내용의 영웅에서 ----------
{
  const b = budgetFromHeroes();
  check(b.length === 3 && b[0].total === 146 && b[0].cap?.atk === 11 && b[0].cap?.hp === 220 && b[1].total === 130 && b[2].total === 240 && b[2].cap?.hp === 320,
    `예산을 내용의 영웅에서 셈한다: 등급마다 (공격×4 + 체력×0.5)의 가장 큰 값과 칸마다의 가장 큰 값 (${b.map((x) => x.total).join(', ')})`);
  check(charBudgets() === charBudgets() && charBudgets()[0].total === 146, 'CHAR_RULES.budget을 적지 않은 게임은 그 셈을 쓴다 (한 번 셈해 간직)');
}

// ---------- 통과하는 정의 ----------
{
  const r = validateCharDef(good());
  check(r.ok && r.def.name === '이끼 기사' && r.def.look.parts.hat === 'helm' && r.def.look.size === 1.05 && r.def.skills[0] === 'shieldbash' && charWeight(r.def.stats) === 136,
    `손으로 쓴 정의가 통과하고 다듬어진다 (무게 합 ${r.ok ? charWeight(r.def.stats) : '-'} ≤ 146)`);
  const j = validateCharDef(JSON.stringify(good()));
  check(j.ok && JSON.stringify(j.def) === JSON.stringify(r.ok ? r.def : null), 'JSON 글자로 받아도 같다');
  const min = validateCharDef({ v: 1, id: 'plainone', name: 'A', look: {}, rarity: 0, stats: { atk: 1, hp: 1 }, role: 'guard' });
  check(min.ok && min.def.bio === '' && min.def.skills.length === 0, '선택 칸(소개, 기술)을 뺀 짧은 정의도 된다');
  const nfd = validateCharDef(good({ name: '이끼 기사'.normalize('NFD') }));
  check(nfd.ok && nfd.def.name === '이끼 기사', '풀어 쓴 한글(NFD)은 모아 쓴 글(NFC)로 다듬는다');
}

// ---------- 거절의 까닭: 기계가 읽는 코드와 자리 ----------
{
  const cases: [string, unknown, string][] = [
    ['문자열이 아닌 JSON', '{"v":1', 'shape'],
    ['배열', [1, 2], 'shape'],
    ['null', null, 'shape'],
    ['너무 긴 글자', 'x'.repeat(5000), 'shape'],
    ['모르는 칸', good({ power: 9999 }), 'extra'],
    ['__proto__ 칸', JSON.parse('{"__proto__":{"admin":true},"v":1}'), 'extra'],
    ['빠진 칸', (() => { const x = good(); delete x.stats; return x; })(), 'missing'],
    ['버전', good({ v: 2 }), 'version'],
    ['id 모양', good({ id: 'Bad Id' }), 'id'],
    ['내용의 영웅과 같은 id', good({ id: 'ironwall' }), 'idTaken'],
    ['이름이 비었다', good({ name: '' }), 'length'],
    ['이름이 길다', good({ name: '가'.repeat(17) }), 'length'],
    ['제어 문자', good({ name: '이끼\u0007기사' }), 'control'],
    ['폭 없는 빈칸', good({ name: '이끼​기사' }), 'control'],
    ['방향 바꾸기', good({ bio: 'abc‮def' }), 'control'],
    ['줄 바꿈', good({ bio: '첫 줄\n둘째 줄' }), 'control'],
    ['쓸 수 없는 글자(이모지)', good({ name: '기사🔥' }), 'charset'],
    ['쓸 수 없는 글자(한자)', good({ name: '騎士' }), 'charset'],
    ['앞뒤 빈칸', good({ name: ' 기사' }), 'space'],
    ['겹친 빈칸', good({ name: '이끼  기사' }), 'space'],
    ['없는 역할', good({ role: 'necromancer' }), 'role'],
    ['없는 등급', good({ rarity: 3 }), 'rarity'],
    ['소수 등급', good({ rarity: 0.5 }), 'rarity'],
    ['모르는 능력치', good({ stats: { atk: 5, hp: 100, luck: 99 } }), 'stat'],
    ['빠진 능력치', good({ stats: { atk: 5 } }), 'missing'],
    ['소수 능력치', good({ stats: { atk: 5.5, hp: 100 } }), 'type'],
    ['무한대', good({ stats: { atk: Infinity, hp: 100 } }), 'type'],
    ['0 능력치', good({ stats: { atk: 0, hp: 100 } }), 'statMin'],
    ['칸의 상한', good({ stats: { atk: 12, hp: 50 } }), 'statCap'],
    ['예산', good({ stats: { atk: 11, hp: 220 } }), 'budget'],
    ['없는 기술', good({ skills: ['meteor'] }), 'skill'],
    ['기술이 둘', good({ skills: ['shieldbash', 'volley'] }), 'skillCount'],
    ['기술이 배열이 아니다', good({ skills: 'shieldbash' }), 'type'],
    ['없는 부품', good({ look: { parts: { hat: 'tophat' }, colors: {} } }), 'part'],
    ['모르는 칸(겉모습)', good({ look: { parts: { tail: 'fox' }, colors: {} } }), 'extra'],
    ['색이 범위 밖', good({ look: { parts: {}, colors: { cloth: 0x1000000 } } }), 'color'],
    ['음수 색', good({ look: { parts: {}, colors: { cloth: -1 } } }), 'color'],
    ['없는 무늬', good({ look: { parts: {}, colors: {}, pattern: 'plaid' } }), 'pattern'],
    ['큰 키', good({ look: { parts: {}, colors: {}, size: 3 } }), 'size'],
    ['NaN 너비', good({ look: { parts: {}, colors: {}, width: NaN } }), 'size'],
  ];
  const wrong = cases.filter(([, raw, code]) => !codes(validateCharDef(raw)).includes(code)).map(([n, raw]) => `${n} → ${codes(validateCharDef(raw)).join('/') || '통과'}`);
  check(wrong.length === 0, `거절마다 까닭의 코드가 맞다 (${cases.length}가지${wrong.length ? `: 틀림 ${wrong.join('; ')}` : ''})`);
  const taken = validateCharDef(good(), (id) => id === 'mossknight');
  check(codes(taken).join() === 'idTaken', '이미 쓰는 id(저장소에 있는 것)는 거절한다');
  const many = validateCharDef(Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`k${i}`, i])));
  check(!many.ok && many.issues.length <= 32, `까닭은 32개까지만 돌려준다 (${many.ok ? 0 : many.issues.length})`);
  check(new Set(CHAR_ERRS).size === CHAR_ERRS.length && CHAR_ERRS.length === 26, `거절 코드는 ${CHAR_ERRS.length}가지이고 겹치지 않는다`);
}

// ---------- 금칙어 고리 ----------
{
  check(codes(validateCharDef(good({ name: '나쁜말' }))).length === 0, '금칙어가 없으면 통과');
  addCharFilter((text) => text.replace(/\s/g, '').includes('나쁜말'));
  check(codes(validateCharDef(good({ name: '나쁜 말' }))).includes('banned') && codes(validateCharDef(good({ bio: '이건 나쁜말이다' }))).includes('banned'), '게임이 꽂은 거르개가 이름과 소개에서 걸러 낸다 (띄어쓰기를 바꿔도)');
  addCharFilter(() => { throw new Error('고장'); });
  check(codes(validateCharDef(good({ name: '멀쩡한 이름' }))).includes('banned'), '거르개가 예외를 던지면 걸린 것으로 본다 (통과시키지 않는다)');
  clearCharFilters();
  check(validateCharDef(good()).ok, '거르개를 지우면 다시 통과');
}

// ---------- 겉모습의 글자 ----------
{
  const r = validateCharDef(good());
  const l = r.ok ? r.def.look : ({ parts: {}, colors: {} } as Look);
  const code = encodeLook(l), back = decodeLook(code);
  check(code.length < 120 && code.startsWith('1;') && JSON.stringify(back) === JSON.stringify(l), `겉모습을 짧은 글자로 적고 다시 읽으면 같다 ('${code}', ${code.length}자)`);
  check(encodeLook({ parts: { body: 'plain', hat: 'none' }, colors: {} }) === '1', '기본값은 적지 않는다: 아무것도 고르지 않은 겉모습은 "1"');
  const bad = ['', '2;b=stout', '1;b=stout;b=slim', '1;q=1', '1;C=xyz', '1;b=Stout', '1;z=-5', '1;' + 'r=bob;'.repeat(40), 7, null, '1;C=1234567'];
  check(bad.every((x) => decodeLook(x) === null), `모양이 틀린 글자는 읽지 않는다 (${bad.length}가지)`);
  check(decodeLook('1;z=999')?.size === 1.15 && decodeLook('1;w=1')?.width === 0.85, '배율은 범위로 자른다');
  check(LOOK_SLOTS.every((s) => lookParts(s).length >= 4), `틀의 기본 부품: 칸마다 넷 이상 (${LOOK_SLOTS.map((s) => `${s} ${lookParts(s).length}`).join(', ')})`);
}

// ---------- 퍼징: 무작위·악의적인 정의 수천 개 ----------
{
  const rnd = seededRng(20261127);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
  const weird: unknown[] = [undefined, null, NaN, -0, Infinity, -Infinity, 1e308, -1, 0, 1.5, '', ' ', '\u0000', '\ud800', 'a'.repeat(300), [], {}, [[]], { toString: 1 }, true, '__proto__', 'constructor', 0x7fffffff, 2 ** 53, '1;b=stout', Object.create(null)];
  const words = ['이끼', 'moss', '기사', 'Knight', '🔥', '騎', '‮', '​', '\t', '  ', 'é', 'Ж', '<script>', '"', "'", '~', '·'];
  const text = () => Array.from({ length: Math.floor(rnd() * 6) }, () => pick(words)).join(rnd() < 0.5 ? ' ' : '');
  const val = (depth: number): unknown => {
    const k = rnd();
    if (k < 0.3 || depth > 2) return pick(weird);
    if (k < 0.5) return text();
    if (k < 0.65) return Math.round((rnd() - 0.3) * 600);
    if (k < 0.8) return Array.from({ length: Math.floor(rnd() * 4) }, () => val(depth + 1));
    return Object.fromEntries(Array.from({ length: Math.floor(rnd() * 4) }, () => [pick(['atk', 'hp', 'parts', 'colors', 'hat', 'size', 'x', '__proto__']), val(depth + 1)]));
  };
  /** 좋은 정의에서 한 곳·몇 곳을 비튼 것 (예산 근처의 수를 자주 넣는다) */
  const mutate = (): unknown => {
    const d = good({ id: `fz${Math.floor(rnd() * 1e6)}`, rarity: Math.floor(rnd() * 3) }) as Record<string, any>;
    const caps = budgetFromHeroes()[d.rarity as number];
    d.stats = { atk: Math.floor(rnd() * (caps.cap!.atk + 3)), hp: Math.floor(rnd() * (caps.cap!.hp + 30)) };
    for (let n = Math.floor(rnd() * 3); n > 0; n--) {
      const at = pick(['name', 'bio', 'role', 'skills', 'look', 'v', 'id', 'look.parts', 'look.colors', 'look.size', 'stats', 'extra']);
      // 앞의 비틀기가 겉모습을 객체가 아닌 것으로 바꿨으면 그 안은 비틀지 않는다 (만드는 쪽의 사정)
      if (at.startsWith('look.') && (typeof d.look !== 'object' || d.look === null || typeof d.look.parts !== 'object' || d.look.parts === null || typeof d.look.colors !== 'object' || d.look.colors === null)) continue;
      if (at === 'look.parts') d.look.parts[pick([...LOOK_SLOTS, 'wing'])] = rnd() < 0.5 ? pick(lookParts(pick(LOOK_SLOTS))) : val(1);
      else if (at === 'look.colors') d.look.colors[pick(['skin', 'cloth', 'hair', 'accent', 'eye'])] = rnd() < 0.5 ? Math.floor(rnd() * 0x1200000) - 0x10000 : val(1);
      else if (at === 'look.size') d.look.size = rnd() < 0.5 ? 0.7 + rnd() * 0.6 : val(1);
      else if (at === 'extra') d[pick(['power', 'admin', 'stats2'])] = val(0);
      else if (at === 'name' || at === 'bio') d[at] = rnd() < 0.6 ? text() : val(0);
      else d[at] = val(0);
    }
    return d;
  };
  let ok = 0, rejected = 0, threw = 0, overBudget = 0, leaked = 0, badPass = 0, json = 0;
  const N = 6000, B = budgetFromHeroes();
  for (let i = 0; i < N; i++) {
    const raw = i % 5 === 0 ? val(0) : mutate();
    let r: ReturnType<typeof validateCharDef>;
    try { r = validateCharDef(i % 7 === 0 ? (() => { try { return JSON.stringify(raw); } catch { return '{'; } })() : raw); if (i % 7 === 0) json++; }
    catch { threw++; continue; }
    if (!r.ok) {
      rejected++;
      if (!r.issues.length || r.issues.some((x) => !(CHAR_ERRS as readonly string[]).includes(x.code))) badPass++;
      continue;
    }
    ok++;
    const d = r.def, b = B[d.rarity];
    // 통과한 것은 언제나 규칙 안: 예산, 칸의 상한, 아는 부품, 범위 안의 배율
    if (charWeight(d.stats) > b.total + 1e-9 || d.stats.atk > b.cap!.atk! || d.stats.hp > b.cap!.hp!) leaked++;
    if (LOOK_SLOTS.some((s) => d.look.parts[s] !== undefined && !lookParts(s).includes(d.look.parts[s]!)) || (d.look.size ?? 1) > 1.15 || (d.look.size ?? 1) < 0.85) badPass++;
    // 같은 정의의 능력치를 예산 밖으로 밀면 언제나 거절된다
    const over = { ...d, stats: { atk: b.cap!.atk!, hp: Math.ceil((b.total - b.cap!.atk! * 4) / 0.5) + 1 } };
    if (validateCharDef(over).ok) overBudget++;
  }
  check(threw === 0 && badPass === 0, `퍼징 ${N}개 (JSON 글자 ${json}개): 예외 없이 끝나고 거절은 모두 아는 코드다 (통과 ${ok}, 거절 ${rejected})`);
  check(ok > 300 && rejected > 3000, `퍼징이 통과와 거절 양쪽을 고루 만든다 (통과 ${ok}, 거절 ${rejected})`);
  check(leaked === 0 && overBudget === 0, `통과한 정의는 모두 등급의 예산·칸의 상한 안이고, 예산을 넘긴 것은 언제나 거절된다 (새어 나감 ${leaked}, 예산 초과 통과 ${overBudget})`);
}

// ---------- chars 모듈: 정의를 두고, 영웅의 표에 더하고, 저장한다 ----------
const MODS: readonly ModuleId[] = [...MODULES, 'chars'];
{
  const g = new Game({ plugins: [], modules: MODS });
  const r = g.chars.add(good({ id: 'mossknight' }));
  check(r.ok && g.chars.has('mossknight') && isHeroId('mossknight') && heroDef('mossknight').label === '이끼 기사' && heroDef('mossknight').atk === 9 && heroDef('mossknight').look?.parts.hat === 'helm',
    '정의를 더하면 영웅의 표에도 들어간다 (이름은 글 그대로, 공격·체력은 능력치, 겉모습)');
  check(heroIds().at(-1) === 'mossknight' && heroIds().length === 7 && heroRole('mossknight').skill === 'shieldbash' && heroRole('mossknight').hand === 'sword', '영웅 id 목록 끝에 붙고, 역할은 내용의 것에 정의의 기술을 얹는다');
  const bad = g.chars.add(good({ id: 'cheater', stats: { atk: 11, hp: 220 } }));
  check(!bad.ok && bad.issues[0].code === 'budget' && !g.chars.has('cheater') && !isHeroId('cheater'), '거절된 정의는 아무것도 바꾸지 않는다');
  check(!g.chars.add(good({ id: 'mossknight' })).ok && g.chars.add(good({ id: 'mossknight', name: '이끼 기사 둘' }), { replace: true }).ok && heroDef('mossknight').label === '이끼 기사 둘', '같은 id는 replace를 줄 때만 바뀐다');
  // 영웅으로 쓴다: 얻고, 레벨을 올리고, 편성하고, 저장한다
  const p = g.players.spawn('주인', false, null, 'cd-1');
  g.wallet.add(p, 'gold', 5000, '');
  const got = g.roster.grant(p, 'mossknight');
  g.roster.levelUp(p, 'mossknight');
  g.squad.set(p, ['mossknight']);
  const ally = [...g.ents.values()].find((e) => e.kind === 'hero' && e.type === 'mossknight');
  check(!!got && !got.dup && p.heroes.mossknight.lv === 2 && p.squad[0] === 'mossknight' && !!ally && g.roster.power(p, 'mossknight') > 0,
    `정의에서 온 영웅을 얻고 키우고 편성하면 함께 싸우는 영웅으로 선다 (전투력 ${g.roster.power(p, 'mossknight')})`);
  const save = g.players.export(p), world = g.exportWorld();
  check(Array.isArray(world.chars) && (world.chars as CharDef[])[0].id === 'mossknight' && JSON.stringify(save.ext?.roster).includes('mossknight'), '월드 저장의 chars 칸에 정의가, 캐릭터 저장에 그 영웅이 적힌다');
  // 다시 켠 서버: 월드를 먼저 읽고 사람을 읽는다
  g.chars.remove('mossknight');
  check(!isHeroId('mossknight'), '정의를 빼면(회수) 영웅의 표에서도 빠진다');
  const h = new Game({ plugins: [], modules: MODS });
  h.importWorld(structuredClone(world));
  const q = h.players.spawn('주인', false, structuredClone(save), 'cd-1');
  check(isHeroId('mossknight') && q.heroes.mossknight?.lv === 2 && q.squad[0] === 'mossknight', '다시 켠 서버가 월드의 정의를 읽어 영웅과 편성이 이어진다');
  // 지금의 규칙으로 거절되는 저장된 정의는 쓰지 않고 간직했다가 다시 적는다
  const odd = { ...good({ id: 'oldrule', stats: { atk: 99, hp: 99 } }) };
  const k = new Game({ plugins: [], modules: MODS });
  const warn = console.warn; console.warn = () => {};
  k.importWorld({ chars: [odd, ...(world.chars as unknown[])] });
  console.warn = warn;
  check(!k.chars.has('oldrule') && k.chars.has('mossknight') && JSON.stringify((k.exportWorld().chars as unknown[]).at(-1)) === JSON.stringify(odd), '지금의 규칙으로 거절되는 저장된 정의는 쓰지 않되 지우지도 않는다 (다시 적는다)');
  // 저장소를 바꿔 끼운다 (나중의 계정 공용 저장소)
  const shared: unknown[] = [good({ id: 'sharedone', name: '공용' })];
  const log: string[] = [];
  k.chars.useStore({ all: () => shared, put: (d) => log.push(`put ${d.id}`), remove: (id) => log.push(`rm ${id}`) });
  k.chars.add(good({ id: 'fresh' }));
  k.chars.remove('fresh');
  check(k.chars.has('sharedone') && !k.chars.has('mossknight') && !isHeroId('mossknight') && log.join() === 'put fresh,rm fresh' && k.exportWorld().chars === undefined,
    '저장소를 바꿔 끼우면 그것의 정의를 읽고, 더하고 빼는 것을 그리로 적으며, 월드 저장에는 적지 않는다');
  k.chars.remove('sharedone');
}
{
  // chars를 고르지 않은 게임: 칸도 명령도 없다
  const g = new Game({ plugins: [] });
  check(!g.has('chars') && !g.worldSaves.some((w) => w.name === 'chars') && !g.personal.some((x) => x.name === 'chars'), 'chars를 고르지 않은 게임에는 저장 칸·개인 상태가 없다');
}
