// 두 게임을 오가는 게임(games/echopact)을 위해 더한 틀의 일반 칸 가운데, 게임 없이 이 시험용 내용(영웅 들판) 위에서 볼 수 있는 것:
//   정의의 언어마다의 이름·소개(CharDef.text), 변신 보정에 키운 만큼(mods의 둘째 인자), 자동 사냥의 안전장치(셈과 서버),
//   칸을 적지 않은 게임은 예전과 같은가(편성은 어디서나 따라다니고, 변신의 소유는 따로, 능력치 대체 없음, 안전장치 없음).
import { charText, morphCard, morphMods, morphStats, morphUsesStats, SQUAD_RULES, validateCharDef } from '../../shared/defs';
import { POTIONS, safetyStep, tidySafety, type AwaySafety } from '../../shared/auto';
import { Game } from '../../server/game/game';
import { check } from '../harness';

const good = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  v: 1, id: 'mossknight', name: '이끼 기사', bio: '숲을 지키는 느긋한 기사.',
  look: { parts: { body: 'stout', hat: 'helm' }, colors: { cloth: 0x4c7a3a } },
  role: 'guard', rarity: 0, stats: { atk: 9, hp: 200 }, skills: ['shieldbash'], ...over,
});
const codes = (r: ReturnType<typeof validateCharDef>): string[] => (r.ok ? [] : r.issues.map((x) => `${x.code}@${x.path}`));

// ---------- 정의의 언어마다의 이름·소개 ----------
{
  const r = validateCharDef(good({ text: { en: { name: 'Moss Knight', bio: 'A calm knight of the woods.' }, ja: { name: 'Moss' } } }));
  check(r.ok && charText(r.def, 'en').name === 'Moss Knight' && charText(r.def, 'en').bio === 'A calm knight of the woods.' && charText(r.def, 'ja').bio === r.def.bio && charText(r.def, 'ko').name === '이끼 기사' && charText(r.def, 'en-us').name === 'Moss Knight',
    '언어마다의 이름·소개(text)가 통과하고, 그 언어의 글이 없으면 정의의 글 (en-us는 en을)');
  check(validateCharDef(good()).ok && !('text' in (validateCharDef(good()) as { def: object }).def), 'text를 적지 않은 정의는 예전과 같은 모양이다');
  const bad = validateCharDef(good({ text: { EN: { name: 'x' }, en: { name: 'a'.repeat(40) }, fr: { name: 'ok', extra: 1 }, de: 'no' } }));
  check(codes(bad).join() === 'extra@text.EN,length@text.en.name,extra@text.fr.extra,type@text.de', `언어 코드·길이·모르는 칸·모양을 같은 규칙으로 거른다 (${codes(bad).join(', ')})`);
  const many = Object.fromEntries(['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh', 'ii'].map((k) => [k, { name: 'x' }]));
  check(codes(validateCharDef(good({ text: many }))).join() === 'length@text', '언어는 여덟까지');
}

// ---------- 칸을 적지 않은 게임은 예전과 같다 ----------
{
  check(SQUAD_RULES.where === undefined && !morphUsesStats(), '이 시험용 내용은 편성의 자리·능력치 대체를 적지 않았다 (기본)');
  const g = new Game({ modules: ['economy', 'growth', 'classes', 'combat', 'items', 'gear', 'mail', 'daily', 'away', 'roster', 'squad', 'stages', 'chars', 'morph'] });
  check(g.away.safety === null && !g.personal.some((x) => x.name === 'autosafe') && !g.personal.some((x) => x.name === 'mode'), '안전장치와 모드는 켜지 않으면 개인 상태가 없다 (줄 위가 예전과 같다)');
  const r = validateCharDef(good());
  if (r.ok) {
    const m0 = morphMods(r.def), m1 = morphMods(r.def, { lv: 10, stars: 3 });
    check(JSON.stringify(m0) === JSON.stringify(m1) && morphStats(morphCard(r.def, undefined, { lv: 1 })) === null, '보정이 키운 만큼을 쓰지 않는 게임은 같은 값이고, 능력치 대체를 적지 않으면 그 셈이 없다');
  }
}

// ---------- 안전장치의 셈 ----------
{
  const base: AwaySafety = { potionAt: 0.45, retreatAt: 0.25, stopNoPotion: true, stopOnDeath: true };
  const s = tidySafety({ potionAt: 2, retreatAt: 0.9 }, base);
  check(s.potionAt === 0.95 && s.retreatAt === 0.95 && tidySafety({ potionAt: 0.3, retreatAt: 0.5 }, base).retreatAt === 0.3 && tidySafety({ potionAt: Number.NaN as number }, base).potionAt === 0.45,
    '안전장치의 값을 다듬는다 (비율은 0~0.95, 물러남은 물약보다 낮게, 깨진 값은 기본)');
  const pot = POTIONS[0];
  const has = pot ? { [pot]: 2 } : {};
  check(!pot || (safetyStep(0.4, has, base, true)?.do === 'potion' && safetyStep(0.4, has, base, false) === null && safetyStep(0.2, has, base, false)?.do === 'retreat' && safetyStep(0.4, {}, base, true)?.do === 'stop' && safetyStep(0.6, {}, base, true) === null),
    '판단: 마실 때면 물약, 마실 수 없는데 물러날 비율 아래면 물러남, 물약이 없으면 멈춤, 체력이 넉넉하면 할 것 없음');
}
