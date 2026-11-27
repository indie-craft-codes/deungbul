// 리플레이 재생기 (묶음 8: RoomDef.replay. 판 모듈의 화면 hud/rooms.ts가 연다): 결과 창·전적 창의 [다시 보기] → 명령 replay → 이 창.
// 재생·멈춤·처음으로·한 칸씩(←·→)·배속(1×·2×·4×)·막대로 옮기기. 프레임은 서버가 판이 바뀔 때마다 적은 판의 모양(숨은 정보까지: 끝난 뒤에만 온다)이고,
// 그리는 것은 게임이 정한다 (setReplayLook의 draw). 주지 않으면 틀의 기본: 자리의 이름과 프레임의 값을 한 줄씩.
import type { ReplayView } from '../../shared/defs/compete';
import { $ } from '../app';
import { onMsg } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { send } from '../net';
import { mountPanel } from './shell';

/** 게임이 리플레이의 한 프레임을 그린다: 판의 모양(v), 자리의 이름, 그릴 곳 (비우고 다시 그린다). 입력은 그 프레임까지 들어온 수 */
export interface ReplayLook { draw(v: unknown, names: string[], box: HTMLElement, at: { i: number; n: number; inputs: ReplayView['inputs'] }): void }
let look: ReplayLook | null = null;
/** 게임의 리플레이 그리기 (판의 이름마다 다르면 v에 판의 이름을 실어 가른다) */
export function setReplayLook(l: ReplayLook): void { look = l; }

const SPEEDS = [1, 2, 4] as const;
let rp: ReplayView | null = null;
let i = 0, playing = false, speed: (typeof SPEEDS)[number] = 1, timer = 0;

/** 리플레이를 연다 (서버에 달라고 한다: 답이 오면 창이 뜬다) */
export function openReplay(id: number): void { send({ t: 'replay', id }); }

let inited = false;
export function initReplay(): void {
  if (inited) return;
  inited = true;
  mountPanel('hud', `
    <div class="panel" id="replay" role="dialog" aria-modal="true" hidden>
      <div class="row"><span class="ttitle" id="replayTitle"></span><button type="button" class="plain" id="replayClose"></button></div>
      <div class="note" id="replaySub"></div>
      <div id="replayBox" aria-live="off"></div>
      <input type="range" id="replaySeek" min="0" max="0" value="0" step="1">
      <div class="row"><span class="num" id="replayAt"></span><span class="note" id="replayEnd"></span></div>
      <div class="btns" id="replayBtns">
        <button type="button" class="plain" id="replayFirst"></button><button type="button" class="plain" id="replayPrev"></button>
        <button type="button" class="go" id="replayPlay"></button>
        <button type="button" class="plain" id="replayNext"></button>
        <span class="rpick" id="replaySpeeds"></span>
      </div>
    </div>`);
  const box = $('replay'), seek = $<HTMLInputElement>('replaySeek'), play = $<HTMLButtonElement>('replayPlay');
  const label = () => {
    $('replayClose').textContent = t('roomClose');
    $('replayFirst').textContent = '⏮'; $('replayFirst').setAttribute('aria-label', t('replayFirst')); $('replayFirst').title = t('replayFirst');
    $('replayPrev').textContent = '◀'; $('replayPrev').setAttribute('aria-label', t('replayPrev')); $('replayPrev').title = t('replayPrev');
    $('replayNext').textContent = '▶'; $('replayNext').setAttribute('aria-label', t('replayNext')); $('replayNext').title = t('replayNext');
    seek.setAttribute('aria-label', t('replaySeek'));
    $('replaySpeeds').innerHTML = SPEEDS.map((s) => `<button type="button" class="${s === speed ? 'go' : 'plain'}" data-speed="${s}" aria-pressed="${s === speed}" aria-label="${t('replaySpeed')} ${s}×">${s}×</button>`).join('');
    draw();
  };
  const stop = () => { playing = false; window.clearTimeout(timer); };
  const step = () => {
    if (!rp || !playing) return;
    if (i >= rp.frames.length - 1) { stop(); draw(); return; }
    const gap = Math.min(1500, Math.max(250, rp.frames[i + 1].t - rp.frames[i].t)) / speed;
    timer = window.setTimeout(() => { i++; draw(); step(); }, gap);
  };
  const go = (k: number) => { if (!rp) return; i = Math.max(0, Math.min(rp.frames.length - 1, k)); draw(); };
  const close = () => { stop(); box.hidden = true; rp = null; document.body.classList.remove('replay-on'); };
  $('replayClose').addEventListener('click', close);
  $('replayFirst').addEventListener('click', () => { stop(); go(0); });
  $('replayPrev').addEventListener('click', () => { stop(); go(i - 1); });
  $('replayNext').addEventListener('click', () => { stop(); go(i + 1); });
  play.addEventListener('click', () => { if (!rp) return; if (playing) { stop(); draw(); return; } if (i >= rp.frames.length - 1) i = 0; playing = true; draw(); step(); });
  seek.addEventListener('input', () => { stop(); go(Number(seek.value)); });
  $('replaySpeeds').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-speed]');
    if (!b) return;
    speed = Number(b.dataset.speed) as (typeof SPEEDS)[number];
    label();
    if (playing) { window.clearTimeout(timer); step(); }
    ($('replaySpeeds').querySelector<HTMLElement>(`[data-speed="${speed}"]`))?.focus();
  });
  // 키보드: 창이 열려 있을 때 Space 재생·멈춤, ←·→ 한 칸
  box.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === ' ') { e.preventDefault(); play.click(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); stop(); go(i - 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); stop(); go(i + 1); }
  });
  onMsg('replay', (m) => { stop(); rp = m.s; i = 0; speed = 1; box.hidden = false; document.body.classList.add('replay-on'); label(); });
  onLangChange(label);
  label();

  function draw(): void {
    if (!rp) return;
    const loc = L(), n = rp.frames.length, f = rp.frames[Math.min(i, n - 1)];
    $('replayTitle').textContent = t('replayTitle');
    $('replaySub').textContent = loc.fmt.replaySub(rp.names.filter(Boolean).join(' · '), rp.at);
    seek.max = String(Math.max(0, n - 1)); seek.value = String(i);
    seek.setAttribute('aria-valuetext', loc.fmt.replayAt(i + 1, n));
    $('replayAt').textContent = loc.fmt.replayAt(i + 1, n);
    play.textContent = playing ? '⏸' : '▶'; play.setAttribute('aria-label', t(playing ? 'replayPause' : 'replayPlay')); play.title = t(playing ? 'replayPause' : 'replayPlay');
    const last = i >= n - 1;
    $('replayEnd').textContent = last ? loc.fmt.replayResult(rp.win >= 0 ? rp.names[rp.win] ?? '' : '', rp.why) : '';
    const area = $('replayBox');
    area.replaceChildren();
    const ins = rp.inputs.filter((x) => x.t <= (f?.t ?? 0));
    if (look) { look.draw(f?.v, rp.names, area, { i, n, inputs: ins }); return; }
    // 틀의 기본: 자리 이름과 값
    const pre = document.createElement('pre');
    pre.className = 'replayRaw';
    pre.textContent = `${rp.names.map((x, k) => `${k + 1}. ${x}`).join('\n')}\n\n${JSON.stringify(f?.v ?? null)}`;
    area.append(pre);
  }
}
