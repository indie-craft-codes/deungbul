// 단계의 화면 (stages 모듈): 가운데 위의 단계 막대('1-3', 장의 이름, 물결마다의 칸과 우두머리 칸, 남은 적과 시간, 자동 진행 단추, 도전·나가기)와
// 메뉴의 '단계' 탭(장마다 단계의 목록: 깸·지금·잠김, 권장 전투력, 가기). 서버의 짝은 engine/server/game/systems/stages.ts.
// 메뉴에서 들어가는 던전(DungeonDef.fromMenu)이 있으면 탭 끝에 그 던전의 줄('들어가기', 열쇠, 소탕)을 붙인다 (서버 명령 dungeonGo).
// 소탕(STAGE_RULES.sweep)이 있으면 단계 탭의 깬 단계마다 '소탕 ×1'·'소탕 ×n' 단추를, 소탕할 수 있는 열쇠 던전(DungeonDef.sweep)이 있으면 탭 끝에 던전 소탕의 줄을 붙인다.
// 오프라인 진행(STAGE_RULES.offline)으로 단계가 나아갔으면 가운데 알림('자리를 비운 동안 1-4 → 2-3까지 진행')을 띄운다 (방치 보상 우편의 제목에도 적힌다).
// 셈(막대의 칸, 단계의 줄, 소탕 단추)은 hud/collectcalc.ts. 게임이 더 할 수 있는 것: 내 단계 읽기(myStage).
import { DUNGEON_IDS, STAGES, STAGE_RULE_VIEW, dungeonDef, dungeonSweepable, menuDungeons, runKey, type StageMe } from '../../shared/defs';
import { $ } from '../app';
import { onMsg, onSlow } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { chapterName } from '../i18n/ko';
import { hasModule } from '../mods';
import { send } from '../net';
import { S } from '../state';
import { mySquad } from './collect';
import { dungeonGoView, keyView, stageBar, stageRows, stageSegments, sweepView } from './collectcalc';
import { myKeys } from './dungeon';
import { dungeonLabel } from '../i18n/names';
import { initSweep, sweepButtons, sweepHave } from './sweep';
import { addMenuTab, closeMenu } from './menu';
import { button, el, redraw, row } from './menu/parts';
import { addNotices } from './notify';
import { mountPanel } from './shell';

let stage: StageMe | null = null;
/** 내 단계 (서버의 개인 상태 'stage'. 아직 받지 않았으면 null) */
export const myStage = (): StageMe | null => stage;

const power = (): number => (hasModule('squad') ? mySquad().power : 0);

/** 메뉴에서 바로 들어가는 던전 (DungeonDef.fromMenu, 던전 모듈을 고른 게임만) */
const goDungeons = (): string[] => (hasModule('dungeon') ? menuDungeons() : []);
/** 소탕할 수 있는 열쇠 던전 (던전 모듈을 고른 게임만). 메뉴에서 들어가는 던전은 그 줄에 소탕 단추가 함께 있어 빠진다 */
const sweepDungeons = (): string[] => (hasModule('dungeon') ? DUNGEON_IDS.filter((id) => dungeonSweepable(id) && !dungeonDef(id).fromMenu) : []);
/** 소탕할 수 있는 열쇠 던전 모두 (소탕의 결과 창을 붙일지) */
const anySweepDungeon = (): boolean => hasModule('dungeon') && DUNGEON_IDS.some((id) => dungeonSweepable(id));

function drawStages(list: HTMLElement): void {
  const loc = L(), rows = stageRows(stage);
  list.append(el('note', loc.fmt.stageBest(stage?.best ?? '')));
  // 소탕: 값과 가진 것 (단계마다 같은 값)
  const rule = STAGE_RULE_VIEW.sweep, view = sweepView(rule, sweepHave(rule?.cost));
  if (view) list.append(el('note', `${t('sweepHead')}: ${t('sweepInfo')} ${loc.fmt.sweepCost(view.what, view.need, view.have)}`));
  let ch = -1;
  for (const r of rows) {
    if (r.ch !== ch) { ch = r.ch; list.append(el('baghead', `${ch + 1}. ${chapterName(ch)}`)); }
    const mark = r.now ? t('stageNow') : r.cleared ? t('stageCleared') : r.open ? '' : t('stageLockedMark');
    const name = `${r.id}${r.boss ? ` · ${t('stageBoss')}` : ''}${mark ? ` · ${mark}` : ''}`;
    const btns = [button(t('stageGo'), () => send({ t: 'stage', a: 'go', id: r.id }), !r.open, t('whyStageLocked'))];
    if (view && r.sweep) btns.push(...sweepButtons(view, (n) => send({ t: 'stage', a: 'sweep', id: r.id, n })));
    list.append(row(name, loc.fmt.stageRec(r.rec, power()), btns, 'srow' + (r.now ? ' now' : '') + (r.open ? '' : ' locked')));
  }
  drawDungeonGo(list);
  drawDungeonSweeps(list);
}

/** 메뉴에서 들어가는 던전의 줄 (DungeonDef.fromMenu): 이름, 열쇠(또는 오늘 남은 횟수), 레벨, '들어가기'와 소탕 단추. 들어가면 메뉴를 닫는다 */
function drawDungeonGo(list: HTMLElement): void {
  const ids = goDungeons();
  if (!ids.length || !S.me) return;
  const loc = L(), keys = myKeys(), me = S.me;
  list.append(el('baghead', t('dungeonGoHead')), el('note', t('dungeonGoInfo')));
  for (const id of ids) {
    const def = dungeonDef(id), v = dungeonGoView(def, id, keys, S.meta.daily.prog[runKey(id)] ?? 0, me.lv, !!S.dungeon.id);
    const note = [v.key ? loc.fmt.dungeonKeys(v.n, v.cap) : loc.fmt.dungeonRuns(v.n, v.cap), ...(v.why === 'lv' ? [loc.fmt.dungeonNeedLv(def.minLv)] : []), dungeonLabel(loc, id).info].filter(Boolean).join(' · ');
    const btns = [button(t('dungeonGoBtn'), () => { send({ t: 'dungeonGo', id }); closeMenu(); }, !v.can, v.why === 'lv' ? loc.fmt.unlockLv(def.minLv) : v.why === 'none' ? loc.fmt.dungeonKeys(v.n, v.cap) : '')];
    if (dungeonSweepable(id)) {
      const k = keyView(def, id, keys)!, won = !!keys?.[id]?.won, view = sweepView(def.sweep, sweepHave(def.sweep?.cost), k.n)!;
      btns.push(...sweepButtons(view, (n) => send({ t: 'dungeonSweep', id, n }), !won || v.why === 'lv'));
    }
    list.append(row(dungeonLabel(loc, id).name, note, btns, 'srow dgo' + (v.can ? '' : ' locked')));
  }
}

/** 던전 소탕의 줄: 소탕할 수 있는 열쇠 던전마다 이름, 열쇠, 값, 단추 (끝낸 적이 없으면 잠김) */
function drawDungeonSweeps(list: HTMLElement): void {
  const ids = sweepDungeons();
  if (!ids.length) return;
  const loc = L(), keys = myKeys();
  list.append(el('baghead', t('sweepDungeons')));
  for (const id of ids) {
    const def = dungeonDef(id), k = keyView(def, id, keys)!, won = !!keys?.[id]?.won, view = sweepView(def.sweep, sweepHave(def.sweep?.cost), k.n)!;
    const note = `${loc.fmt.dungeonKeys(k.n, k.cap)} · ${loc.fmt.sweepKeyCost()}${view.need ? ` · ${loc.fmt.sweepCost(view.what, view.need, view.have)}` : ''}${won ? '' : ` · ${t('stageLockedMark')}`}`;
    list.append(row(dungeonLabel(loc, id).name, note, sweepButtons(view, (n) => send({ t: 'dungeonSweep', id, n }), !won), 'srow' + (won ? '' : ' locked')));
  }
}

function render(): void {
  const ui = { bar: $('stageBar') };
  const b = stageBar(stage);
  ui.bar.hidden = !S.me || !b || !!S.dungeon.id; // 던전 안에서는 단계 막대를 숨긴다 (던전 창이 그 자리의 일을 보인다)
  if (!b || !stage) return;
  const loc = L();
  $('stageId').textContent = b.id;
  $('stageName').textContent = chapterName(b.ch);
  const segs = stageSegments(b), box = $('stageSegs');
  if (box.childElementCount !== segs.length) { box.textContent = ''; for (let i = 0; i < segs.length; i++) box.append(document.createElement('i')); }
  segs.forEach((s, i) => {
    const cell = box.children[i] as HTMLElement;
    cell.className = s.boss ? 'boss' : '';
    if (!cell.firstElementChild) cell.append(document.createElement('b'));
    (cell.firstElementChild as HTMLElement).style.transform = `scaleX(${s.fill})`;
  });
  const run = stage.run;
  $('stageTime').textContent = run && (run.state === 'fight' || run.state === 'gap') ? loc.fmt.stageLeft(run.left) : '';
  $('stageWave').textContent = b.state === 'out' ? loc.fmt.stageRec(STAGES.find((s) => s.id === b.id)?.def.rec ?? 0, power()) : b.boss ? t('stageBoss') : loc.fmt.stageWave(b.wave, b.waves);
  $('stageFoes').textContent = run && run.state === 'fight' ? loc.fmt.stageFoes(run.foes, run.total) : run?.state === 'gap' ? t('stageWaveClear') : '';
  const big = $('stageBig');
  big.textContent = run?.state === 'clear' ? `${t('stageClearBig')} ${loc.fmt.stageNext(run.left)}` : run?.state === 'fail' ? `${t('stageFailBig')} · ${loc.fmt.stageRetry(run.left)}` : '';
  big.className = 'sbig' + (run?.state === 'fail' ? ' bad' : '');
  const auto = $('stageAuto');
  auto.textContent = t('stageAuto');
  auto.classList.toggle('on', stage.auto);
  auto.setAttribute('aria-pressed', String(stage.auto));
  const go = $('stageGoBtn') as HTMLButtonElement;
  const fighting = !!run && run.state !== 'lobby';
  // 모드(modes)의 단계 모드에서는 '나가기'가 대기실(단계 선택)로 간다
  go.textContent = fighting ? (document.body.dataset.modeKind === 'stage' ? t('modeToLobby') : t('stageLeave')) : t('stageStart');
}

export function initStages(): void {
  mountPanel('topmid', `
    <div class="panel" id="stageBar" hidden>
      <div class="shead"><span class="sid" id="stageId"></span><span class="sname" id="stageName"></span><span class="stime" id="stageTime"></span></div>
      <div id="stageSegs"></div>
      <div class="sinfo"><span id="stageWave"></span><span id="stageFoes"></span></div>
      <div class="sbig" id="stageBig" role="status"></div>
      <div class="sbtns"><button type="button" class="plain" id="stageAuto" aria-pressed="true"></button><button type="button" class="plain" id="stageGoBtn"></button></div>
    </div>`);
  $('stageAuto').addEventListener('click', (e) => { send({ t: 'stage', a: 'auto', on: !(stage?.auto ?? true) }); (e.currentTarget as HTMLElement).blur(); });
  $('stageGoBtn').addEventListener('click', (e) => { send({ t: 'stage', a: stage?.run && stage.run.state !== 'lobby' ? 'leave' : 'start' }); (e.currentTarget as HTMLElement).blur(); });
  // 소탕이 있으면 탭은 가진 소탕권·재화·열쇠가 바뀔 때도 다시 그린다
  const sweeps = !!STAGE_RULE_VIEW.sweep || anySweepDungeon();
  // 메뉴에서 들어가는 던전이 있으면 열쇠·레벨·던전 안인가가 바뀔 때도 다시 그린다
  const gos = goDungeons().length > 0;
  addMenuTab({ id: 'stages', label: () => t('tabStages'), draw: drawStages, sig: () => [...(sweeps ? [stage?.cur, stage?.best, stage?.run?.id, power(), S.me?.gold, S.me?.sparks, S.me?.items, myKeys()] : [stage?.cur, stage?.best, stage?.run?.id, power()]), ...(gos ? [myKeys(), S.me?.lv, S.dungeon.id] : [])], mod: 'stages' });
  onMsg('me', (m) => { if (m.k === 'stage') { stage = m.s as StageMe; render(); redraw(true); } });
  addNotices({ banner: { stageFail: 'bad', stageLast: 'good', stageAway: 'good' }, feed: ['stageClear', 'stageLocked'] });
  if (gos) addNotices({ feed: ['dungeonNoKeys', 'dungeonNoRuns', 'dungeonLevel'] });
  if (sweeps) initSweep();
  onSlow(render);
  onLangChange(render);
}
