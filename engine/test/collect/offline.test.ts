// 오프라인 단계 진행 (STAGE_RULES.offline: engine/server/game/systems/stages.ts의 offline, idle.ts의 토막, shared/defs/collect.ts의 offlinePlan·idleSegments).
// 정해진 시계(Game의 now)로 '비운 시간 × 편성의 전투력 × 권장 전투력 × 상한'의 표를 돌린다:
//   전투력이 권장 이상/미만, 시간의 상한(maxH), 단계 수의 상한(maxStages), 마지막 단계, 자동 진행을 끈 사람, 시계가 거꾸로 간 것(음수), 아주 큰 틈.
// 돌아오면 가장 멀리 깬 단계와 지금 단계가 옮겨지고, 처음 깬 보상이 바로 오고(원인 stageAway), 방치 보상은 깬 단계로 토막 내어 셈한다. 같은 입력이면 같은 결과.
// 내용에서 offline을 빼면(기본) 예전과 같다: 진행도 없고 방치 우편의 값도 같다.
import { IDLE, STAGES, STAGE_RULE_VIEW, heroPower, idleSegments, offlinePlan, type OfflineRules, type Reward } from '../../shared/defs';
import type { Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { check } from '../harness';

const MIN = 60000, H = 60 * MIN;
const T = Date.UTC(2026, 10, 25, 12, 0, 0);
const rules = STAGE_RULE_VIEW.offline!;
const base: OfflineRules = { ...rules };
const WEAK = { ironwall: [1, 1, 0], swiftarrow: [1, 1, 0] }; // 146 + 109 = 255: 1-1(권장 250)만 넘는다
const STRONG = { stormblade: [40, 6, 0], starseer: [40, 6, 0] };

/** 저장에서 읽어 접속시킨다: 비운 ms(gap), 영웅(편성은 그 영웅들), 단계 */
function join(gap: number, heroes: Record<string, number[]>, best: string, auto = true, seen?: number) {
  const g = new Game({ now: () => T, plugins: [] });
  // 깬 것으로 친 단계도 사건 stageCleared를 내므로 영웅 장비(herogear)가 떨어질 수 있다: 같은 입력이면 같은 결과가 되게 난수를 정한다
  if (g.has('herogear')) g.herogear.rng = () => 0.5;
  const save = { name: '오프', v: 1, seen: seen ?? T - gap, ext: { roster: heroes, squad: Object.keys(heroes), stages: { cur: STAGES[(STAGES.findIndex((s) => s.id === best) + 1)]?.id ?? best ?? '1-1', best, auto } } };
  const p = g.players.spawn('오프', false, structuredClone(save) as never, 'off-1');
  return { g, p, mail: p.mail.find((m) => m.k === 'idle'), away: g.notices.find((n) => n.id === p.id && n.k === 'stageAway') };
}
const power = (h: Record<string, number[]>) => Object.entries(h).reduce((s, [id, [lv, st]]) => s + heroPower(id, lv, st), 0);

// ---------- 표: 전투력, 비운 시간, 상한 ----------
{
  check(power(WEAK) === 255 && STAGES[0].def.rec === 250 && STAGES[1].def.rec > 255, `약한 편성의 전투력 ${power(WEAK)}: 1-1(권장 ${STAGES[0].def.rec})만, 1-2(권장 ${STAGES[1].def.rec})는 못 넘는다`);
  check(power(STRONG) > Math.max(...STAGES.map((s) => s.def.rec)), `강한 편성의 전투력 ${power(STRONG)}: 모든 단계의 권장 이상`);
  const cases: { what: string; gap: number; heroes: Record<string, number[]>; best: string; auto?: boolean; seen?: number; set?: Partial<OfflineRules>; best2: string; cur2: string; n: number }[] = [
    { what: '전투력이 1-1만 넘으면 1-1까지 (1시간)', gap: H, heroes: WEAK, best: '', best2: '1-1', cur2: '1-2', n: 1 },
    { what: '전투력이 권장 미만이면 나아가지 않는다', gap: 5 * H, heroes: { swiftarrow: [1, 1, 0] }, best: '', best2: '', cur2: '1-1', n: 0 },
    { what: '강하면 10분에 한 단계: 1시간에 여섯', gap: H, heroes: STRONG, best: '', best2: '2-1', cur2: '2-2', n: 6 },
    { what: '비운 시간이 한 단계(10분)보다 짧으면 나아가지 않는다', gap: 9 * MIN + 59000, heroes: STRONG, best: '', best2: '', cur2: '1-1', n: 0 },
    { what: '가장 멀리 깬 단계의 다음부터', gap: 30 * MIN, heroes: STRONG, best: '1-4', best2: '2-2', cur2: '2-3', n: 3 },
    { what: '마지막 단계까지 깼으면 더 없다 (지금 단계는 마지막)', gap: 5 * H, heroes: STRONG, best: '2-3', best2: '2-5', cur2: '2-5', n: 2 },
    { what: '단계 수의 상한 (maxStages 3)', gap: 5 * H, heroes: STRONG, best: '', set: { maxStages: 3 }, best2: '1-3', cur2: '1-4', n: 3 },
    { what: '시간의 상한 (maxH 1, 단계마다 20분: 1000시간을 비워도 셋)', gap: 1000 * H, heroes: STRONG, best: '', set: { maxH: 1, perStageS: 1200 }, best2: '1-3', cur2: '1-4', n: 3 },
    { what: '권장 × need(2)를 넘어야 한다', gap: H, heroes: { stormblade: [1, 3, 0] }, best: '', set: { need: 2 }, best2: '', cur2: '1-1', n: 0 },
    { what: '자동 진행을 끈 사람(실패했거나 파밍 중)은 나아가지 않는다', gap: 5 * H, heroes: STRONG, best: '1-2', auto: false, best2: '1-2', cur2: '1-3', n: 0 },
    { what: '시계가 거꾸로 갔으면(마지막 접속이 미래) 나아가지 않는다', gap: -3 * H, heroes: STRONG, best: '', best2: '', cur2: '1-1', n: 0 },
    { what: '아주 큰 틈(1970년의 저장)은 maxH(12시간)로 잘린다: 열 단계 모두', gap: 0, seen: 0, heroes: STRONG, best: '', best2: '2-5', cur2: '2-5', n: 10 },
    { what: '아주 큰 틈과 단계 수의 상한 (maxStages 4)', gap: 0, seen: -8.64e15, heroes: STRONG, best: '', set: { maxStages: 4 }, best2: '1-4', cur2: '1-5', n: 4 },
  ];
  for (const c of cases) {
    Object.assign(rules, base, c.set ?? {});
    const { p, away } = join(c.gap, c.heroes, c.best, c.auto ?? true, c.seen);
    const ok = p.stage.best === c.best2 && p.stage.cur === c.cur2 && (c.n ? Number(away?.a[2]) === c.n : !away);
    check(ok, `${c.what}: 가장 멀리 ${p.stage.best || '없음'}, 지금 ${p.stage.cur}, 깬 수 ${away?.a[2] ?? 0}`);
  }
  Object.assign(rules, base);
  for (const k of Object.keys(rules) as (keyof OfflineRules)[]) if (!(k in base)) delete rules[k];
}

// ---------- 셈 자체 (offlinePlan): 깨진 시간, 무한대 ----------
{
  const plan = (ms: number) => offlinePlan(-1, 1e9, ms, base).passed.length;
  check(plan(NaN) === 0 && plan(-1) === 0 && plan(0) === 0 && plan(Infinity) === 10 && plan(Number.MAX_VALUE) === 10, 'NaN·음수·0이면 0단계, 무한대와 아주 큰 수는 상한으로');
  check(offlinePlan(-1, NaN, H, base).passed.length === 0 && offlinePlan(-1, 1e9, H, undefined).passed.length === 0, '전투력이 깨졌거나 규칙이 없으면 0단계');
  const a = offlinePlan(-1, 1e9, H, base);
  check(a.at.join() === [1, 2, 3, 4, 5, 6].map((k) => k * 600000).join(), `단계마다 깬 때: 10분, 20분 … (${a.at.map((x) => x / MIN).join(', ')}분)`);
  check(JSON.stringify(idleSegments(60, 0, a.at)) === JSON.stringify([[10, 0], [10, 1], [10, 2], [10, 3], [10, 4], [10, 5]]), '방치 보상의 토막: 10분마다 깬 단계의 수가 하나씩');
  check(JSON.stringify(idleSegments(75, 2, [])) === '[[75,2]]' && JSON.stringify(idleSegments(25, 0, [600000, 1200000, 1800000])) === '[[10,0],[10,1],[5,2]]', '진행이 없으면 한 토막(예전과 같다), 방치의 분이 진행보다 짧으면 거기서 끊는다');
}

// ---------- 돌아오면: 보상과 방치 우편 ----------
{
  const r = join(H, STRONG, '');
  const first = STAGES.slice(0, 6).reduce((s, x) => s + (x.def.first?.sparks ?? 0) + (x.def.reward.sparks ?? 0), 0);
  const fromLedger = r.g.ledger.rows().filter((x) => x.why === 'stageAway' && x.cur === 'sparks').reduce((s, x) => s + x.amount, 0);
  check(fromLedger === first && r.p.sparks === first, `깬 것으로 친 여섯 단계의 처음 깬 보상과 보통 보상이 바로 온다 (보석 ${r.p.sparks}, 장부의 원인 stageAway)`);
  check(r.away?.a.join() === '1-1,2-2,6', `안내문 stageAway: 처음 단계, 지금 단계, 깬 수 (${r.away?.a.join()})`);
  const want: Reward = {};
  for (const [m, stage] of idleSegments(60, 0, offlinePlan(-1, power(STRONG), H, base).at)) {
    const x = IDLE.reward(m, r.p.lv, { stage }); // 레벨은 우편을 셈할 때의 것 (깬 단계의 경험치로 오른 뒤)
    for (const k of ['gold', 'exp', 'sparks'] as const) if (x[k]) want[k] = (want[k] ?? 0) + x[k]!;
  }
  const one = IDLE.reward(60, r.p.lv, { stage: 0 });
  check(!!r.mail && r.mail.a.join() === '60,1-1,2-2' && r.mail.r.gold === want.gold && r.mail.r.exp === want.exp && r.mail.r.sparks === want.sparks && (want.gold ?? 0) > (one.gold ?? 0),
    `방치 우편: 제목 값 [60분, 1-1, 2-2], 보상은 깬 단계로 토막 낸 합 (골드 ${r.mail?.r.gold}, 토막 없이 ${one.gold})`);
  const cleared: string[] = [];
  const g2 = new Game({ now: () => T, plugins: [(g) => { g.on('stageCleared', (_p, id, firstTime) => { if (firstTime) cleared.push(id); }); }] });
  g2.players.spawn('오프', false, { name: '오프', v: 1, seen: T - H, ext: { roster: STRONG, squad: Object.keys(STRONG), stages: { cur: '1-1', best: '', auto: true } } } as never, 'off-2');
  check(cleared.join() === '1-1,1-2,1-3,1-4,1-5,2-1', `깬 것으로 친 단계마다 사건 stageCleared(처음) (${cleared.join()})`);
  // 같은 입력이면 같은 결과
  const again = join(H, STRONG, '');
  check(JSON.stringify(again.g.players.export(again.p)) === JSON.stringify(r.g.players.export(r.p)) && JSON.stringify(again.mail) === JSON.stringify(r.mail), '같은 시계와 저장이면 진행과 보상이 같다 (정해진 셈)');
  // 접속하면 진행한 지금 단계로 들어간다 (enterOnJoin)
  check(r.g.stages.inStage(r.p) && (r.g.personal.find((x) => x.name === 'stage')!.state(r.p) as { run: { id: string } }).run.id === '2-2', '진행한 뒤 지금 단계(2-2)로 들어간다');
}

// ---------- 끈 게임(기본)은 예전과 같다 ----------
{
  const was = STAGE_RULE_VIEW.offline;
  (STAGE_RULE_VIEW as { offline?: OfflineRules }).offline = undefined;
  const r = join(H, STRONG, '');
  check(r.p.stage.best === '' && !r.away && !!r.mail && r.mail.a.join() === '60' && r.mail.r.gold === IDLE.reward(60, 1, { stage: 0 }).gold, 'offline이 없으면 나아가지 않고, 방치 우편은 예전 그대로 ([60분], 깬 단계 0의 셈)');
  (STAGE_RULE_VIEW as { offline?: OfflineRules }).offline = was;
}

// ---------- 방치 모듈 없이도 (접속할 때 따로) ----------
{
  const g = new Game({ now: () => T, plugins: [], modules: ['economy', 'growth', 'classes', 'combat', 'items', 'roster', 'squad', 'stages'] });
  const p: Ent = g.players.spawn('방치 없음', false, { name: '방치 없음', v: 1, seen: T - H, ext: { roster: STRONG, squad: Object.keys(STRONG), stages: { cur: '1-1', best: '', auto: true } } } as never, 'off-3');
  check(p.stage.best === '2-1' && p.stage.cur === '2-2', `idle 모듈이 없는 게임도 오프라인 진행은 한다 (${p.stage.best} → 지금 ${p.stage.cur})`);
}
