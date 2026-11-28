// 전투 화면 키트 (묶음 C의 7: docs/screens.md 2.4·9.2의 7·9.5의 (다)): 수집형의 단계 전투를 보는 동안의 화면.
//   위 띠: 일시정지(‖) · 단계와 물결 · 남은 시간 · 자동 진행(토글) · 배속(×1/×2, 열리는 조건은 STAGE_RULES.speed.unlock)
//   아래 초상 칸: 편성의 카드마다 그림·이름·체력 막대·기술 준비(둥근 막: 다 차면 빛난다)
//   일시정지 창: [계속] [홈] [포기(두 번 누름)]. 전투 중 뒤로 가기(폰 브라우저의 뒤로 포함) = 일시정지 창 (화면 쌓기의 onBack)
// 서버의 짝: systems/stages.ts의 배속·일시정지 (명령 stage speed·pause, 개인 상태 stage의 speed·speedMax·paused). 규칙이 없는 게임은 그 단추가 없다.
// 게임은 useBattleScreen으로 켜고(보일 때·초상 그림·홈), 전투를 볼 때 openBattle(id)로 화면 쌓기에 넣는다. 켜지 않으면 아무것도 붙지 않는다.
// 유닛 그림(scene/sprites.ts의 useSprites)으로 싸우는 동안은 카메라도 여기서 정한다 (battleAim): 사람 키가 battlePx쯤 되게 당기고,
//   싸움의 가운데가 위 띠와 아래 카드 줄 사이(그 사이의 55%)에 오게. 그림 유닛이 하나도 없으면 예전처럼 나를 비춘다.
import { CAMERA, STAGE_RULE_VIEW, heroRole, isSkillId, skillDef } from '../../shared/defs';
import { setKitAim, type CameraAim } from '../camera';
import { spriteBattlePx } from '../scene/sprites';
import { onSlow } from '../bus';
import { artPick, hasArt } from '../art';
import { view } from '../app';
import { onCast } from '../entities';
import { L, onLangChange, t } from '../i18n';
import { heroName } from '../i18n/ko';
import { send } from '../net';
import { S } from '../state';
import { mySquad } from './collect';
import { stageBar } from './collectcalc';
import { feed } from './notify';
import { closeScreen, dropScreen, openScreen, screenOpen } from './screens';
import { myStage } from './stagebar';
import { tintRarity } from './rarity';
import { frameArt } from './artdom';
import { addUnlock } from './reward';
import { heroDef } from '../../shared/defs';
import { uiIcon } from './uiicons';
import { powerSaveButton } from './powersave';

export interface BattleOpts {
  /** 전투 화면을 보일 때인가 (게임의 화면 상태: 탑의 '전투 보기') */
  shown: () => boolean;
  /** 초상 칸의 그림 (영웅 id → 그림 주소). 없으면 이름의 첫 글자 */
  pic?: (heroId: string) => string | undefined;
  /** 일시정지 창의 [홈]과 [포기] 뒤에 갈 곳 */
  home: () => void;
}

let opts: BattleOpts | null = null;
/** 영웅 엔티티 id → 마지막으로 기술을 쓴 때 (performance.now) */
const castAt = new Map<number, number>();
const SPEED = STAGE_RULE_VIEW.speed, PAUSE = !!STAGE_RULE_VIEW.pause;
const mk = (tag: string, cls: string, text?: string): HTMLElement => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const fighting = (): boolean => { const r = myStage()?.run; return !!r && r.state !== 'lobby'; };
let ui: { top: HTMLElement; stage: HTMLElement; wave: HTMLElement; time: HTMLElement; auto: HTMLButtonElement; speed: HTMLButtonElement; pause: HTMLButtonElement; squad: HTMLElement; sheet: HTMLElement; quit: HTMLButtonElement } | null = null;

/** 전투를 본다: 화면 쌓기에 장면 보기로 넣는다 (뒤로 가기 = 일시정지 창, 일시정지가 없는 게임은 예전처럼 한 칸 뒤로) */
export function openBattle(id: string): void {
  openScreen(id, { kind: 'view', onBack: () => { if (PAUSE && fighting() && !screenOpen('btlPause')) { openPause(); return true; } return false; } });
}
/** 일시정지 창을 연다 (서버의 시간도 멈춘다) */
export function openPause(): void {
  if (!ui || !PAUSE) return;
  send({ t: 'stage', a: 'pause', on: true });
  disarm();
  const run = myStage()?.run;
  ui.sheet.querySelector('h3')!.textContent = `${t('btlPaused')}${run ? ` · ${run.id}` : ''}`;
  ui.sheet.hidden = false;
  openScreen('btlPause', { kind: 'sheet', el: ui.sheet, close: () => resume(false) });
}
/** 계속: 창을 닫고 시간을 다시 흐르게 한다 */
function resume(drop = true): void {
  if (!ui) return;
  ui.sheet.hidden = true;
  if (drop) dropScreen('btlPause');
  send({ t: 'stage', a: 'pause', on: false });
}
const disarm = (): void => { if (!ui) return; ui.quit.classList.remove('armed'); ui.quit.textContent = t('btlQuit'); };

function draw(): void {
  if (!ui || !opts) return;
  const st = myStage(), run = st?.run, on = opts.shown() && !!S.me && fighting();
  // 전투 배경 그림 (art2): 'bg:battle-<장 번호>'(세로·가로) → 'bg:battle'. 있으면 3D 바닥 대신 화면 뒤 그림, 없거나 전투를 보지 않으면 예전 장면
  const ch = (run?.id ?? st?.cur ?? '').split('-')[0], land = typeof matchMedia !== 'undefined' && matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
  view.setBackdrop(opts.shown() && S.me ? (ch && artPick('bg', `battle-${ch}`, land)) || artPick('bg', 'battle', land) || null : null);
  document.body.classList.toggle('battleOn', on);
  ui.top.hidden = !on; ui.squad.hidden = !on;
  if (!on) { if (!ui.sheet.hidden && !fighting()) closeScreen('btlPause'); return; }
  const loc = L(), b = stageBar(st);
  ui.stage.textContent = run?.id ?? '';
  ui.wave.textContent = !b ? '' : b.boss ? t('stageBoss') : loc.fmt.stageWave(b.wave, b.waves);
  ui.time.textContent = run && (run.state === 'fight' || run.state === 'gap') ? loc.fmt.stageLeft(run.left) : '';
  ui.time.classList.toggle('low', !!run && run.state === 'fight' && run.left <= 10);
  ui.auto.setAttribute('aria-pressed', String(!!st?.auto));
  // 배속: 잠겼으면 자물쇠와 까닭 (누르면 까닭을 알린다)
  const max = st?.speedMax ?? 1, x = st?.speed ?? 1;
  ui.speed.hidden = !SPEED || SPEED.max <= 1;
  const locked = max <= 1;
  ui.speed.textContent = locked ? loc.fmt.btlSpeed(SPEED?.max ?? 2) : loc.fmt.btlSpeed(x);
  if (locked) ui.speed.append(uiIcon('lock', 'sm'));
  ui.speed.classList.toggle('locked', locked);
  ui.speed.classList.toggle('on', !locked && x > 1);
  ui.speed.title = locked && SPEED?.unlock ? loc.fmt.btlSpeedLocked(SPEED.unlock) : '';
  ui.pause.hidden = !PAUSE;
  drawSquad();
}

/** 초상 칸: 편성의 영웅 엔티티마다 그림·이름·체력·기술 준비 */
function drawSquad(): void {
  if (!ui || !opts) return;
  const order = mySquad().ids;
  const heroes = [...S.others.values()].filter((r) => r.kind === 'hero' && !r.gone && order.includes(r.type)).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  const key = heroes.map((r) => r.id).join(',') + L().code;
  if (ui.squad.dataset.key !== key) {
    ui.squad.dataset.key = key;
    ui.squad.textContent = '';
    // 그림이 있는 게임은 카드를 한 줄에 (style.css의 .btlSquad.art)
    ui.squad.classList.toggle('art', hasArt());
    if (hasArt()) ui.squad.style.setProperty('--n', String(Math.max(1, heroes.length)));
    for (const r of heroes) {
      const c = mk('div', 'btlMate'); c.dataset.id = String(r.id);
      const d = heroDef(r.type);
      if (d) tintRarity(c, d.rarity);
      const img = opts.pic?.(r.type), face = mk('div', 'btlFace');
      if (img) { const i = document.createElement('img'); i.src = img; i.alt = ''; face.append(i); } else face.textContent = [...heroName(r.type)][0] ?? '';
      const ring = mk('i', 'btlSkill');
      face.append(ring);
      const hp = mk('i', 'btlHp'), fill = mk('span', '');
      hp.append(fill);
      c.append(face, mk('b', '', heroName(r.type)), hp);
      if (d) frameArt(c, d.rarity); // 등급 테두리 그림 'frame:<등급 id>' (없으면 css 테두리)
      ui.squad.append(c);
    }
  }
  const now = performance.now(), speed = Math.max(1, myStage()?.speed ?? 1);
  for (const r of heroes) {
    const c = ui.squad.querySelector<HTMLElement>(`[data-id="${r.id}"]`);
    if (!c) continue;
    const ratio = r.maxHp > 0 ? Math.max(0, Math.min(1, r.hp / r.maxHp)) : 0;
    (c.querySelector('.btlHp span') as HTMLElement).style.transform = `scaleX(${ratio})`;
    c.classList.toggle('down', r.hp <= 0 || !!r.dying);
    // 기술 준비: 역할의 기술의 쿨다운으로 (쓴 적이 없으면 준비됨). 배속이면 그만큼 빨리 찬다
    const sk = heroRole(r.type).skill, cd = sk && isSkillId(sk) ? skillDef(sk).cd : 0, at = castAt.get(r.id);
    const k = !cd || at === undefined ? 1 : Math.min(1, ((now - at) / 1000) * speed / cd);
    const ring = c.querySelector('.btlSkill') as HTMLElement;
    ring.style.setProperty('--k', String(k));
    ring.classList.toggle('ready', k >= 1);
    ring.hidden = !cd;
    if (cd && sk) ring.title = L().skills[sk as keyof ReturnType<typeof L>['skills']]?.name ?? sk;
  }
}

// ---------- 전투의 카메라 (유닛 그림일 때) ----------
/** 부드럽게 따라가는 값: 싸움의 가운데(x, z), 카메라 거리(d), 마지막 시각 */
let cam: { x: number; z: number; d: number; t: number } | null = null;
/** 위 띠의 아래·카드 줄의 위 (css px, 0.25초마다 잰다) */
let band = { top: 0, bottom: 0, at: -1e9 };
let fit = { k: 1, at: -1e9 };
const NEAR = 7;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
function battleAim(now: number): CameraAim | null {
  const px0 = spriteBattlePx();
  if (!ui || ui.top.hidden || px0 <= 0) { cam = null; return null; }
  // 살아 있는 영웅·적 (이 층에는 내 단계의 것만 온다). 그림 판이 하나도 없으면 손대지 않는다
  // 영웅을 먼저 담고, 적은 영웅들의 가운데에서 NEAR m 안의 것만 (새 물결이 먼 둘레에서 나올 때 영웅이 화면 가장자리로 밀려나지 않게)
  let n = 0, sprites = 0, href = 0, top1 = 0, x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, hx = 0, hz = 0, hn = 0;
  const live = [...S.others.values()].filter((r) => (r.kind === 'hero' || r.kind === 'm') && !r.gone && r.dying <= 0);
  for (const r of live) {
    const sp = r.model.sprite;
    if (sp) { sprites++; if (r.kind === 'hero' && (!href || sp.h < href)) href = sp.h; }
    if (r.kind === 'hero') { hx += r.x; hz += r.z; hn++; }
  }
  if (!sprites) { cam = null; return null; }
  if (hn) { hx /= hn; hz /= hn; }
  for (const r of live) {
    if (hn && r.kind === 'm' && Math.hypot(r.x - hx, r.z - hz) > NEAR) continue;
    n++; top1 = Math.max(top1, r.model.sprite?.h ?? r.h); x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x); z0 = Math.min(z0, r.z); z1 = Math.max(z1, r.z);
  }
  if (!href) for (const r of S.others.values()) if (r.model.sprite && !r.gone && (!href || r.model.sprite.h < href)) href = r.model.sprite.h;
  const W = view.width, H = view.height;
  // 빈 곳: 위 띠의 아래부터 카드 줄의 위까지 (가려진 것이 없으면 화면 전체)
  if (now - band.at > 250) {
    const tb = ui.top.getBoundingClientRect(), sb = ui.squad.hidden ? null : ui.squad.getBoundingClientRect();
    band = { top: tb.height ? tb.bottom : 0, bottom: sb?.height ? sb.top : H, at: now };
  }
  const top = clamp(band.top, 0, H * 0.5), bottom = clamp(band.bottom, top + 80, H), room = bottom - top;
  // 사람 키(px): 게임의 값 × 화면 높이(844 기준, 0.7~1.35배), 빈 곳의 34%를 넘지 않게. 그 키가 되는 카메라 거리
  // 가장 큰 유닛(우두머리)도 빈 곳의 80% 안에 들게 (폰 가로처럼 낮은 화면)
  const px = Math.min(px0 * clamp(H / 844, 0.7, 1.35), room * 0.34, (room * 0.8 * href) / Math.max(href, top1));
  const tan = Math.tan((view.camera.fov * Math.PI) / 360), D = (H * href) / (2 * tan * px);
  // 흩어져 있으면(새 물결이 둘레에서 나올 때) 1.3배까지 물러나 다 보이게
  if (n && now - fit.at > 200) fit = { k: clamp(view.fitZoom(x0 - 1, z0 - 1, x1 + 1, z1 + 1, D, 0.1), 1, 1.3), at: now };
  const cx = n ? (x0 + x1) / 2 : 0, cz = n ? (z0 + z1) / 2 : 0, d = D * fit.k;
  const dt = cam ? Math.min(0.25, (now - cam.t) / 1000) : 1, a = 1 - Math.exp(-dt * 3);
  cam = cam ? { x: cam.x + (cx - cam.x) * a, z: cam.z + (cz - cam.z) * a, d: cam.d + (d - cam.d) * a, t: now } : { x: cx, z: cz, d, t: now };
  // 싸움의 가운데(가장 큰 유닛 키의 45% 높이)가 빈 곳의 가로 가운데, 세로 55%에 그려지게
  const at = view.aimFor(cam.x, Math.max(href, top1) * 0.45, cam.z, cam.d, W / 2, top + room * 0.55);
  return { x: at.x, z: at.z, zoom: cam.d / CAMERA.dist };
}

/** 전투 화면을 켠다 (게임이 한 번) */
export function useBattleScreen(o: BattleOpts): void {
  opts = o;
  // 배속이 잠겨 있는 동안 '언제 열리는지', 열리면 새 기능 알림 (hud/reward.ts)
  const unlockAt = SPEED?.unlock;
  if (unlockAt) addUnlock({ id: 'speed', name: () => t('unlockSpeed'), open: () => (myStage()?.speedMax ?? 1) > 1, hint: () => L().fmt.btlSpeedLocked(unlockAt) });
  const top = mk('div', 'btlTop'); top.id = 'btlTop'; top.hidden = true;
  const pause = mk('button', 'btlIcon btn-secondary') as HTMLButtonElement; pause.type = 'button'; pause.id = 'btlPauseBtn'; pause.textContent = '‖';
  const info = mk('div', 'btlInfo'), stage = mk('b', ''), wave = mk('span', '');
  info.append(stage, wave);
  const time = mk('span', 'btlTime');
  const auto = mk('button', 'btlChip toggle btn-secondary') as HTMLButtonElement; auto.type = 'button'; auto.id = 'btlAuto';
  const speed = mk('button', 'btlChip btn-secondary') as HTMLButtonElement; speed.type = 'button'; speed.id = 'btlSpeed';
  // 절전 (묶음 E: 단계를 자동으로 돌리는 동안만 보인다. 폰을 내려놓고 돌릴 때: hud/powersave.ts)
  const save = powerSaveButton('btlChip btn-secondary btlSave');
  save.id = 'btlSave';
  top.append(pause, info, time, auto, speed, save);
  const squad = mk('div', 'btlSquad'); squad.id = 'btlSquad'; squad.hidden = true;
  const sheet = mk('div', 'panel stsheet btlPause'); sheet.id = 'btlPause'; sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
  const head = mk('div', 'sthead'); head.append(mk('h3', ''));
  const note = mk('p', 'note btlNote');
  const go = mk('button', 'stgo btn-primary') as HTMLButtonElement; go.type = 'button'; go.id = 'btlResume';
  const home = mk('button', 'btn-secondary') as HTMLButtonElement; home.type = 'button'; home.id = 'btlHome';
  const quit = mk('button', 'btn-danger') as HTMLButtonElement; quit.type = 'button'; quit.id = 'btlQuit';
  const row1 = mk('div', 'stbtns'), row2 = mk('div', 'stbtns');
  row1.append(go); row2.append(home, quit);
  sheet.append(head, note, row1, row2);
  document.body.append(top, squad, sheet);
  ui = { top, stage, wave, time, auto, speed, pause, squad, sheet, quit };
  const label = () => { auto.textContent = t('btlAuto'); go.textContent = t('btlResume'); home.textContent = t('btlHome'); note.textContent = t('btlPauseNote'); pause.setAttribute('aria-label', t('btlPaused')); pause.title = t('btlPaused'); disarm(); };
  label();
  pause.addEventListener('click', openPause);
  auto.addEventListener('click', () => send({ t: 'stage', a: 'auto', on: !(myStage()?.auto ?? true) }));
  speed.addEventListener('click', () => {
    const st = myStage(), max = st?.speedMax ?? 1;
    if (max <= 1) { if (SPEED?.unlock) feed(L().fmt.btlSpeedLocked(SPEED.unlock)); return; }
    send({ t: 'stage', a: 'speed', x: ((st?.speed ?? 1) % max) + 1 });
  });
  go.addEventListener('click', () => resume());
  home.addEventListener('click', () => { resume(); o.home(); });
  // 포기: 두 번 누름 (되돌릴 수 없다: 이 판의 진행을 버리고 단계 선택으로)
  quit.addEventListener('click', () => {
    if (!quit.classList.contains('armed')) { quit.classList.add('armed'); quit.textContent = t('btlQuitArm'); return; }
    resume(); send({ t: 'stage', a: 'leave' }); o.home();
  });
  onCast((id) => castAt.set(id, performance.now()));
  setKitAim(battleAim);
  onSlow(draw);
  onLangChange(() => { label(); if (ui) ui.squad.dataset.key = ''; draw(); });
}
