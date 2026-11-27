// 자동 사냥: 가까운 몬스터를 골라 공격하고, 기술과 물약을 알아서 쓴다.
// 직접 이동하거나 멈추면 꺼진다. 서버에는 사람이 누른 것과 같은 명령만 보낸다.
import { AUTO, AWAY, pickPotion, pickSkill, pickTarget, prefsSafety, restSpot, roamOf, safetyStep, shouldRest, tidyPrefs, type AutoPrefs, type AwaySafety } from '../shared/auto';
import { dungeonDef, isDungeonId, isMonsterId, monsterDef } from '../shared/defs';
import { attack, autoWalk, monstersNear, moveTo, usePotion, useSkill } from './actions';
import { $ } from './app';
import { bindKey, onMsg } from './bus';
import { feed, notifySys } from './hud/notify';
import { L, t } from './i18n';
import { send } from './net';
import { rules } from './rules';
import { S } from './state';

const btn = $('autoBtn');
let shown = false;
/** 물약이 없어 쉬는 중 (체력이 찰 때까지 새 대상을 잡지 않는다) */
let resting = false;
/**
 * 자동 사냥을 켠 자리(닻): 여기서 AWAY.roam보다 먼 몬스터는 쫓지 않고, 둘레에 몬스터가 없으면 이리로 돌아온다 (자리 비움 사냥과 같은 규칙).
 * 없으면 몬스터를 따라 다른 구역까지 떠내려갔다 (검토 7: 고원에서 30분 뒤 첫 구역의 슬라임을 잡고 있었다)
 */
let anchor: { x: number; z: number } | null = null;
const setAnchor = (): void => { anchor = S.me ? { x: S.me.x, z: S.me.z } : null; };
/** 이때(ms)가 지나면 그 자리를 새 닻으로 (자리를 옮긴 뒤: 서버가 옮긴 자리가 화면에 온 뒤에 잡는다) */
let reanchorAt = 0;
/** 자동 사냥이 지금 움직여도 되는가 (모드 modes의 단계 모드처럼 들판이 아닌 곳에서는 멈춰 있는다: 켜짐은 그대로 들판의 몸이 쓴다) */
let gate: () => boolean = () => true;
/** 자동 사냥이 움직여도 되는 때를 정한다 (틀의 모드 화면이 부른다). 켜고 끄는 것과 서버에 알리는 것은 그대로다 */
export function setAutoGate(fn: () => boolean): void { gate = fn; }
/** 자리를 옮겼다 (모드를 바꿔 들판의 다른 자리에서 이어 간다): 닻을 비우고, 조금 뒤 그 자리를 새 닻으로 잡는다. 노리던 것도 놓는다 */
export function resetAutoAnchor(delayMs = 700): void { anchor = null; reanchorAt = performance.now() + delayMs; resting = false; }
/** 서버가 자동 사냥을 껐다 (안전장치로 멈춤, 오늘의 시간을 다 씀): 화면의 켜짐도 끈다 (다시 알리지 않는다) */
export function autoOffByServer(): void {
  if (!S.auto) return;
  S.auto = false; shown = false; resting = false;
  btn.classList.toggle('on', false); btn.setAttribute('aria-pressed', 'false');
}
/** 자동 사냥이 스스로 고를 수 있는 몬스터인가: 필드 보스는 사람이 직접 고른 때만 (자동 사냥이 보스를 혼자 되풀이해 잡던 것, 검토 7). 닻에서의 거리는 설정의 범위 */
const pickable = (r: { x: number; z: number; type: string }): boolean => {
  if (isMonsterId(r.type) && monsterDef(r.type).boss) return false;
  return !anchor || isDungeonId(S.dungeon.id) || Math.hypot(r.x - anchor.x, r.z - anchor.z) <= roamOf(prefs);
};

// ---------- 자동 사냥 설정 (묶음 E: 서버가 저장하고 명령·메시지 autoPrefs로 오간다. 창은 hud/autoset.ts) ----------
let prefs: AutoPrefs = tidyPrefs(null);
let base: AutoPrefs = tidyPrefs(null);
/** 게임이 켠 안전장치 (보이지 않을 때의 자동 사냥: 서버의 g.away.safety). 없으면 null */
let safety: AwaySafety | null = null;
/** 서버가 퀘스트 대상을 고를 수 있다고 알렸다 */
let goalOk = false;
const prefFns: (() => void)[] = [];
/** 지금 설정·게임의 기본값·안전장치·퀘스트 대상을 고를 수 있는가 */
export const autoPrefs = (): Readonly<AutoPrefs> => prefs;
export const autoPrefsBase = (): Readonly<AutoPrefs> => base;
export const autoSafety = (): Readonly<AwaySafety> | null => safety;
export const autoGoalOk = (): boolean => goalOk && !!goalFn;
/** 설정이 바뀌면 (서버의 답, 내가 바꿈) */
export function onAutoPrefs(fn: () => void): void { prefFns.push(fn); }
const changed = (): void => { for (const fn of prefFns) fn(); };
/** 설정을 바꾼다 (준 칸만). 화면에 바로 걸고 서버에 보낸다: 서버가 다듬은 값으로 답한다 */
export function setAutoPrefs(patch: Partial<AutoPrefs>): void {
  prefs = tidyPrefs({ ...prefs, ...patch }, base);
  send({ t: 'autoPrefs', p: patch });
  changed();
}
/** 기본값으로 */
export function resetAutoPrefs(): void { prefs = { ...base, skip: [...base.skip] }; send({ t: 'autoPrefs', reset: true }); changed(); }
/** 안전장치를 바꾼다 (게임이 켰을 때만: 명령 autoSafe) */
export function setAutoSafety(patch: Partial<AwaySafety>): void {
  if (!safety) return;
  safety = { ...safety, ...patch };
  if (safety.retreatAt > safety.potionAt) safety.retreatAt = safety.potionAt;
  send({ t: 'autoSafe', potion: safety.potionAt, retreat: safety.retreatAt, noPotion: safety.stopNoPotion, death: safety.stopOnDeath });
  changed();
}
/** 지금 퀘스트가 잡으라는 몬스터와 그 자리 (게임의 퀘스트가 정한다: 대상 우선순위 'goal') */
export interface AutoGoal { monsters: readonly string[]; at?: { x: number; z: number } }
let goalFn: (() => AutoGoal | null) | null = null;
/** 게임의 퀘스트를 자동 사냥에 잇는다. 설정에서 '퀘스트 대상 우선'을 고르면 그 몬스터를 먼저 잡고, 둘레에 없으면 그 자리로 걸어가 거기서 사냥한다 */
export function setAutoGoal(fn: (() => AutoGoal | null) | null): void { goalFn = fn; changed(); }
/** 설정을 바꾸지 않은 사람인가 (대상 고르기가 예전과 같다: 가장 가까운 것) */
const plain = (): boolean => prefs.target === 'near' && prefs.skip.length === 0;

export function toggleAuto(): void {
  if (!S.me) return;
  S.auto = !S.auto;
  resting = false;
  setAnchor();
  // 창을 닫아도 이어지는 것은 직업을 고르고 조금 키운 캐릭터만이다 (서버의 조건과 같은 수: AWAY.minLv)
  const stays = S.me.cls !== '' && S.me.lv >= AWAY.minLv;
  feed(S.auto ? (stays ? t('autoOn') : L().fmt.autoOnEarly(AWAY.minLv)) : t('autoOff'));
  tick();
}

function tick(): void {
  if (shown !== S.auto) {
    shown = S.auto; btn.classList.toggle('on', shown); btn.setAttribute('aria-pressed', String(shown));
    send({ t: 'auto', on: shown }); // 켠 채 접속이 끊기면 서버가 이어서 사냥한다
  }
  const me = S.me;
  if (me && me.hp <= 0) resting = false; // 쓰러졌다: 일어나면 체력이 차 있으니 조용히 그친다 ('체력이 찼습니다'가 '쓰러졌습니다'보다 먼저 보였다)
  if (!S.auto || !me || !me.cls || me.hp <= 0 || !gate()) return;
  const now = performance.now();
  if (!anchor && reanchorAt && now >= reanchorAt) { reanchorAt = 0; setAnchor(); }
  const ratio = me.hp / me.maxHp;

  if (now >= S.itemCdEnd && pickPotion(ratio, me.items, prefs.potionAt)) usePotion();
  // 멈춤 조건 (안전장치가 없는 게임: 설정의 체력 %·물약 없음). 안전장치가 있는 게임은 보이지 않을 때만 서버가 본다 (예전과 같다)
  const stopIf = safety ? null : prefsSafety(prefs);
  const halt = stopIf ? safetyStep(ratio, me.items, stopIf, now >= S.itemCdEnd) : null;
  if (halt && halt.do !== 'potion') {
    if (halt.do === 'retreat') { const home = rules.home(); moveTo(home.x, home.z); notifySys('autoRetreat', [Math.round(ratio * 100)]); }
    else { S.auto = false; notifySys('autoNoPotion'); }
    resting = false;
    tick();
    return;
  }
  const rest = shouldRest(ratio, me.items, resting);
  if (rest !== resting) { resting = rest; feed(t(rest ? 'autoRest' : 'autoResume')); }

  // 쉬는 중: 둘레(10m)에 몬스터가 있으면 싸우지 않고 물러난다. 쫓아오면 계속 물러나고(몬스터는 집에서 멀어지면 돌아간다), 막혔을 때만 싸운다
  const spot = resting ? restSpot(me, monstersNear(AUTO.restClear)) : null;
  if (spot && spot !== 'cornered') {
    if (!me.moving || Math.hypot(me.tx - spot.x, me.tz - spot.z) > 6) autoWalk(spot.x, spot.z);
    return;
  }
  // 대상이 없거나 죽었으면 가장 가까운 몬스터로 바꾼다. 쉬는 중(막혔을 때)에는 붙은 것만 상대한다
  let target = S.others.get(me.attackId);
  if (resting && target && Math.hypot(target.x - me.x, target.z - me.z) > AUTO.restGuard) target = undefined;
  if (!target || target.kind !== 'm' || target.dying || target.gone) {
    const near = monstersNear(resting ? AUTO.restGuard : AUTO.seek).filter((r) => resting || pickable(r));
    // 설정의 우선순위·제외 (바꾸지 않았으면 가장 가까운 것: 예전과 같다)
    const goal = !resting && prefs.target === 'goal' ? goalFn?.() ?? null : null;
    target = resting || plain() ? near[0] : pickTarget(near, (r) => ({ d: Math.hypot(r.x - me.x, r.z - me.z), type: r.type, weak: r.maxHp }), prefs, goal?.monsters ?? [], Infinity);
    // 퀘스트 대상 우선: 둘레에 퀘스트 몬스터가 없고 퀘스트의 자리를 알면 그리로 걸어가 그 자리를 닻으로 (상용의 '퀘스트 자동 진행')
    const far = goal && goal.at && goal.monsters.length && !isDungeonId(S.dungeon.id) && !(target && goal.monsters.includes(target.type)) ? goal.at : null;
    if (far && Math.hypot(far.x - me.x, far.z - me.z) > 8) {
      target = undefined;
      if (!me.moving || Math.hypot(me.tx - far.x, me.tz - far.z) > 3) autoWalk(far.x, far.z);
      anchor = { x: far.x, z: far.z };
    } else if (target) attack(target.id);
    // 둘레에 몬스터가 없고 켠 자리에서 멀어졌으면 그리로 돌아간다 (쓰러져 등탑에서 일어났을 때 등)
    else if (!resting && anchor && !isDungeonId(S.dungeon.id) && !me.moving && Math.hypot(anchor.x - me.x, anchor.z - me.z) > 4) autoWalk(anchor.x, anchor.z);
    // 던전 안에서 보이는 적이 없으면 우두머리가 있는 곳으로 걸어간다 (졸개를 다 잡고 멈춰 서 있지 않게)
    else if (!resting && isDungeonId(S.dungeon.id) && !S.dungeon.cleared && !me.moving) {
      const boss = dungeonDef(S.dungeon.id).boss;
      if (Math.hypot(boss.x - me.x, boss.z - me.z) > 6) autoWalk(boss.x, boss.z);
    }
  }
  const dist = target ? Math.hypot(target.x - me.x, target.z - me.z) : Infinity;

  if (!prefs.skills) return; // 설정: 기술을 저절로 쓰지 않는다
  const n = pickSkill(me.cls, ratio, dist, (i) => now >= S.cdEnd[i]);
  if (n >= 0) useSkill(n);
}

/** 접속했을 때: 자리를 비운 동안 서버가 사냥하던 캐릭터를 이어받았으면 자동 사냥을 켠 채로 시작한다. */
export function syncAuto(kept: boolean): void {
  if (kept || rules.autoAtStart()) S.auto = true; // 게임이 '켜고 시작'을 고르면 처음부터 사냥한다 (직업을 고르면 바로 돈다)
  setAnchor();
  shown = S.auto; btn.classList.toggle('on', shown); btn.setAttribute('aria-pressed', String(shown));
  send({ t: 'auto', on: shown });
}

export function initAuto(): void {
  bindKey('r', toggleAuto);
  btn.addEventListener('click', () => { toggleAuto(); btn.blur(); });
  setInterval(tick, 300);
  onMsg('welcome', (m) => { syncAuto(m.auto === true); send({ t: 'autoPrefs' }); });
  // 서버의 답: 저장된 설정, 게임의 기본값, 안전장치, 퀘스트 대상을 고를 수 있는가
  onMsg('autoPrefs', (m) => { prefs = tidyPrefs(m.s, m.base); base = tidyPrefs(m.base); safety = m.safety ? { ...m.safety } : null; goalOk = m.goal; changed(); });
  // 서버가 자동 사냥을 멈췄다 (설정의 '가방이 가득 차면 멈춤'은 보고 있을 때도 서버가 본다)
  onMsg('sys', (m) => { if (m.k === 'autoBagFull') autoOffByServer(); });
}
