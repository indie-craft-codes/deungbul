// 효과음: 파일 없이 브라우저의 소리 합성(Web Audio)으로 만든다. 타격, 치명타, 피격, 처치, 레벨 업, 줍기, 알림.
// 브라우저는 사용자가 화면을 한 번 누르기 전에는 소리를 내지 못하므로, 첫 입력에서 소리를 켠다.
import { $ } from './app';
import { onMsg } from './bus';
import { onLangChange, t } from './i18n';
import type { MsgKey } from '../shared/messages';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let on = true;
/** 같은 소리가 한꺼번에 겹쳐 시끄러워지지 않게, 종류마다 마지막으로 낸 시각을 적어 둔다 */
const last: Record<string, number> = {};

function ready(): boolean {
  if (!on) return false;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx.state === 'running';
}

/** 너무 잦으면 건너뛴다 */
function due(kind: string, gapMs: number): boolean {
  const now = performance.now();
  if (now - (last[kind] ?? -1e9) < gapMs) return false;
  last[kind] = now;
  return true;
}

/** 음 하나: 주파수가 from에서 to로 미끄러지며 사라진다 */
function tone(from: number, to: number, dur: number, vol: number, type: OscillatorType = 'triangle', delay = 0): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

/** 잡음 한 번: 타격의 '탁' 소리 */
function thud(dur: number, vol: number, freq: number): void {
  if (!ctx || !master || !noise) return;
  const t0 = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise;
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t0); s.stop(t0 + dur + 0.02);
}

export const sfx = {
  /** 내가 때렸다 */
  hit(crit: boolean): void {
    if (!ready() || !due('hit', 60)) return;
    thud(crit ? 0.16 : 0.09, crit ? 0.7 : 0.4, crit ? 1400 : 900);
    if (crit) tone(880, 1500, 0.12, 0.18, 'square');
  },
  /** 내가 맞았다 */
  hurt(): void {
    if (!ready() || !due('hurt', 120)) return;
    thud(0.14, 0.5, 300);
    tone(180, 90, 0.16, 0.25, 'sawtooth');
  },
  /** 내가 노리던 적이 쓰러졌다 */
  kill(): void {
    if (!ready() || !due('kill', 80)) return;
    tone(520, 130, 0.22, 0.22, 'triangle');
  },
  /** 기술을 썼다 */
  skill(): void {
    if (!ready() || !due('skill', 100)) return;
    tone(300, 900, 0.14, 0.14, 'sine');
  },
  /** 좋은 소식: 음 셋이 올라간다 (레벨 업, 퀘스트 완료, 던전 완료) */
  fanfare(): void {
    if (!ready() || !due('fanfare', 400)) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 0.2, 'triangle', i * 0.09));
  },
  /** 무언가를 얻었다 (장비, 우편) */
  pickup(): void {
    if (!ready() || !due('pickup', 150)) return;
    tone(880, 1320, 0.1, 0.16, 'sine');
    tone(1320, 1760, 0.12, 0.13, 'sine', 0.08);
  },
  /** 나쁜 소식 (쓰러짐, 실패, 습격) */
  bad(): void {
    if (!ready() || !due('bad', 400)) return;
    tone(300, 150, 0.35, 0.22, 'sawtooth');
    tone(200, 100, 0.45, 0.18, 'sawtooth', 0.12);
  },
};

/** 서버 안내문마다 어울리는 소리. 여기 적힌 것은 틀의 안내문이고, 게임이 더한 안내문의 소리는 게임의 모듈이 addMsgSounds로 등록한다 */
const BY_MSG: Partial<Record<MsgKey, () => void>> = {
  levelUp: sfx.fanfare, dungeonClear: sfx.fanfare, bossDown: sfx.fanfare, enhanceOk: sfx.fanfare,
  gearDrop: sfx.pickup, mailNew: sfx.pickup, loot: sfx.pickup, bought: sfx.pickup, crafted: sfx.pickup, mailGot: sfx.pickup,
  died: sfx.bad, dungeonFail: sfx.bad, enhanceFail: sfx.bad, enhanceDown: sfx.bad, enhanceSaved: sfx.bad,
};
/** 안내문에 소리를 붙인다 (게임이 자기 안내문의 소리를 등록한다) */
export function addMsgSounds(more: Partial<Record<MsgKey, () => void>>): void { Object.assign(BY_MSG, more); }

function label(): void {
  const b = $('soundBtn');
  b.textContent = t(on ? 'soundOn' : 'soundOff');
  b.setAttribute('aria-pressed', String(on));
}

export function initSound(): void {
  try { on = localStorage.getItem('sound') !== 'off'; } catch { /* 저장소를 못 쓰면 켠 채로 둔다 */ }
  label();
  $('soundBtn').addEventListener('click', (e) => {
    on = !on;
    try { localStorage.setItem('sound', on ? 'on' : 'off'); } catch { /* 다음에 다시 물어도 된다 */ }
    label();
    if (on) sfx.pickup();
    (e.currentTarget as HTMLElement).blur();
  });
  // 첫 입력에서 소리 장치를 깨운다
  const wake = () => { ready(); };
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake);
  onMsg('sys', (m) => BY_MSG[m.k]?.());
  onMsg('cd', () => sfx.skill());
  onLangChange(label);
}
