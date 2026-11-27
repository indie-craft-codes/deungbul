// 소리: 효과음과 배경음. 효과음은 키마다 게임이 등록한 파일(engine/client/assets.ts의 registerSound)을 틀고, 등록하지 않은 키는 브라우저의 소리 합성(Web Audio)으로 만든다.
// 틀의 효과음 키: hit(때림), crit(치명타), hurt(맞음), kill(처치), skill(기술), fanfare(좋은 소식), pickup(얻음), bad(나쁜 소식).
// 배경음은 게임이 등록하고(registerMusic) 고르는 함수(setMusicPicker)를 주면 0.25초마다 물어 바뀔 때 천천히 넘긴다 (반복, 페이드).
// 브라우저는 사용자가 화면을 한 번 누르기 전에는 소리를 내지 못한다: 첫 입력 전에는 소리 장치를 만들지도 틀지도 않는다.
// 음량은 효과음·배경음 따로 (메뉴의 '음량'. 소리 파일이 있는 게임이나 enableVolume을 부른 게임만 단추가 보인다), 소리 켜고 끄기(soundBtn)와 함께 이 기기에 저장한다.
import { $ } from './app';
import { hasAudioFiles, hasMusic, laterList, musicFile, preloadList, readMix, soundFile, soundSource, writeMix, type LoadState, type Mix } from './assets';
import { onMsg, onSlow } from './bus';
import { onLangChange, t, type UiKey } from './i18n';
import type { MsgKey } from '../shared/messages';
import { onAd, platform } from './platform';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** 효과음(파일과 합성음)과 배경음이 저마다 지나는 음량 */
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let noise: AudioBuffer | null = null;
let on = true;
/** 사용자가 화면을 한 번이라도 눌렀다 (그 전에는 틀지 않는다) */
let unlocked = false;
let mix: Mix = readMix(null);
/** 같은 소리가 한꺼번에 겹쳐 시끄러워지지 않게, 종류마다 마지막으로 낸 시각을 적어 둔다 */
const last: Record<string, number> = {};

// ---------- 소리 파일 ----------
/** 파일마다 받은 바이트, 형편, 풀어 둔 소리 */
const bytes = new Map<string, ArrayBuffer>();
const status = new Map<string, LoadState>();
const buffers = new Map<string, AudioBuffer>();
const stateOf = (url: string): LoadState | undefined => status.get(url);
const warn = (url: string, why: string) => console.warn(`[에셋] 소리 파일을 읽지 못해 합성음을 씁니다: ${url} (${why})`);

/**
 * 효과음 파일을 받아 둔다 (미리 불러오기가 접속 화면에서 부른다). 소리 장치가 이미 있으면 곧바로 풀고, 없으면 첫 입력에서 푼다.
 * 받지 못하면 false (경고 한 줄. 그 키는 합성음으로 돌아간다)
 */
export async function fetchSound(url: string): Promise<boolean> {
  if (status.has(url)) return status.get(url) !== 'failed';
  status.set(url, 'loading');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bytes.set(url, await res.arrayBuffer());
  } catch (err) {
    status.set(url, 'failed');
    warn(url, err instanceof Error ? err.message : String(err));
    return false;
  }
  if (ctx) await decode(url);
  return true;
}
async function decode(url: string): Promise<void> {
  const raw = bytes.get(url);
  if (!ctx || !raw || buffers.has(url)) return;
  bytes.delete(url);
  try {
    buffers.set(url, await ctx.decodeAudioData(raw));
    status.set(url, 'ready');
  } catch (err) {
    status.set(url, 'failed');
    warn(url, err instanceof Error ? err.message : String(err));
  }
}
/** 등록한 키의 파일을 튼다. 다 풀린 파일이 없으면 false */
function playFile(key: string): boolean {
  const f = soundFile(key), buf = f && buffers.get(f.url);
  if (!ctx || !sfxBus || !f || !buf) return false;
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buf;
  g.gain.value = f.vol;
  s.connect(g).connect(sfxBus);
  s.start();
  return true;
}

/** 소리를 잠시 멈춘 까닭: 탭·앱을 숨김(hidden), 광고 중(ad). 하나라도 있으면 소리 장치를 멈추고 새 소리를 내지 않는다 */
const held = new Set<'hidden' | 'ad'>();
function hold(why: 'hidden' | 'ad', v: boolean): void {
  if (v) held.add(why); else held.delete(why);
  if (!ctx) return;
  if (held.size) void ctx.suspend().catch(() => {});
  else if (on && unlocked) ready();
}

function ready(): boolean {
  if (!on || !unlocked || held.size) return false;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus.connect(master);
    musicBus.connect(master);
    applyMix();
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // 받아 둔 파일을 푼다. 아직 받지 않은 것(미리 불러오기가 없던 때)은 받는다
    for (const url of [...preloadList().sounds, ...laterList().sounds]) void (status.has(url) ? decode(url) : fetchSound(url));
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
  if (!ctx || !sfxBus) return;
  const t0 = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(sfxBus);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

/** 잡음 한 번: 타격의 '탁' 소리 */
function thud(dur: number, vol: number, freq: number): void {
  if (!ctx || !sfxBus || !noise) return;
  const t0 = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise;
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(f).connect(g).connect(sfxBus);
  s.start(t0); s.stop(t0 + dur + 0.02);
}

/** 틀의 합성음: 키 → 소리. 게임이 같은 키에 파일을 등록하면 그 파일이 이것 대신 울린다 */
const SYNTH: Record<string, () => void> = {
  hit: () => thud(0.09, 0.4, 900),
  crit: () => { thud(0.16, 0.7, 1400); tone(880, 1500, 0.12, 0.18, 'square'); },
  hurt: () => { thud(0.14, 0.5, 300); tone(180, 90, 0.16, 0.25, 'sawtooth'); },
  kill: () => tone(520, 130, 0.22, 0.22, 'triangle'),
  skill: () => tone(300, 900, 0.14, 0.14, 'sine'),
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 0.2, 'triangle', i * 0.09)),
  pickup: () => { tone(880, 1320, 0.1, 0.16, 'sine'); tone(1320, 1760, 0.12, 0.13, 'sine', 0.08); },
  bad: () => { tone(300, 150, 0.35, 0.22, 'sawtooth'); tone(200, 100, 0.45, 0.18, 'sawtooth', 0.12); },
};
/** 같은 소리를 다시 내기까지의 간격(ms). 치명타는 때림과 간격을 같이 쓴다 */
const GAP: Record<string, number> = { hit: 60, hurt: 120, kill: 80, skill: 100, fanfare: 400, pickup: 150, bad: 400 };

/**
 * 효과음 하나를 낸다: 등록한 파일이 다 읽혔으면 그것을, 아니면 틀의 합성음을 (합성음이 없는 게임의 키는 파일이 있어야 들린다).
 * 게임은 자기 키(예: 'chop')를 registerSound로 등록하고 이것으로 낸다
 */
export function playSound(key: string): void {
  const gapKey = key === 'crit' ? 'hit' : key;
  if (!ready() || !due(gapKey, GAP[gapKey] ?? 80)) return;
  const how = soundSource(key, stateOf, key in SYNTH);
  if (how === 'file' && playFile(key)) return;
  if (how !== 'none') SYNTH[key]?.();
}

export const sfx = {
  /** 내가 때렸다 */
  hit(crit: boolean): void { playSound(crit ? 'crit' : 'hit'); },
  /** 내가 맞았다 */
  hurt(): void { playSound('hurt'); },
  /** 내가 노리던 적이 쓰러졌다 */
  kill(): void { playSound('kill'); },
  /** 기술을 썼다 */
  skill(): void { playSound('skill'); },
  /** 좋은 소식: 음 셋이 올라간다 (레벨 업, 퀘스트 완료, 던전 완료) */
  fanfare(): void { playSound('fanfare'); },
  /** 무언가를 얻었다 (장비, 우편) */
  pickup(): void { playSound('pickup'); },
  /** 나쁜 소식 (쓰러짐, 실패, 습격) */
  bad(): void { playSound('bad'); },
};

/** 서버 안내문마다 어울리는 소리. 여기 적힌 것은 틀의 안내문이고, 게임이 더한 안내문의 소리는 게임의 모듈이 addMsgSounds로 등록한다 */
const BY_MSG: Partial<Record<MsgKey, () => void>> = {
  levelUp: sfx.fanfare, dungeonClear: sfx.fanfare, bossDown: sfx.fanfare, enhanceOk: sfx.fanfare,
  gearDrop: sfx.pickup, mailNew: sfx.pickup, loot: sfx.pickup, bought: sfx.pickup, crafted: sfx.pickup, mailGot: sfx.pickup,
  died: sfx.bad, dungeonFail: sfx.bad, enhanceFail: sfx.bad, enhanceDown: sfx.bad, enhanceSaved: sfx.bad,
};
/** 안내문에 소리를 붙인다 (게임이 자기 안내문의 소리를 등록한다) */
export function addMsgSounds(more: Partial<Record<MsgKey, () => void>>, keep = false): void {
  // keep: 이미 소리가 있는 안내문은 그대로 둔다 (틀의 모듈이 기본 소리를 줄 때: 게임이 먼저 정한 것이 이긴다)
  for (const [k, fn] of Object.entries(more) as [MsgKey, () => void][]) if (!keep || !(k in BY_MSG)) BY_MSG[k] = fn;
}

// ---------- 배경음 ----------
/** 배경음을 넘기는 시간(초): 앞의 것이 줄어들고 새것이 커진다 */
const FADE_S = 1.5;
interface Track { id: string; el: HTMLAudioElement; gain: GainNode; vol: number; timer: number }
const tracks = new Map<string, Track>();
/** 지금 트는 배경음 id ('' = 없음) */
let playing = '';
let picker: (() => string) | null = null;
/**
 * 배경음을 고르는 함수를 준다: 0.25초마다 불러 돌려준 id(registerMusic의 것, ''면 조용히)가 바뀌면 천천히 넘긴다.
 * 구역별(내 자리), 상황별(던전 안, 싸우는 중) 어느 것이든 게임이 정한다. 예: () => inDungeon() ? 'cave' : 'field'
 */
export function setMusicPicker(fn: () => string): void { picker = fn; }

function fade(tr: Track, to: number): void {
  if (!ctx) return;
  const g = tr.gain.gain, t0 = ctx.currentTime;
  g.cancelScheduledValues(t0);
  g.setValueAtTime(g.value, t0);
  g.linearRampToValueAtTime(to, t0 + FADE_S);
  clearTimeout(tr.timer);
  // 다 줄어든 것은 멈춘다 (받기와 풀기를 그친다)
  if (to === 0) tr.timer = window.setTimeout(() => { if (playing !== tr.id) tr.el.pause(); }, FADE_S * 1000 + 100);
}
function music(id: string): void {
  if (!ctx || !musicBus || id === playing) return;
  const old = tracks.get(playing);
  if (old) fade(old, 0);
  playing = id;
  const f = id ? musicFile(id) : undefined;
  if (!f) return;
  let tr = tracks.get(id);
  if (!tr) {
    // 배경음은 길어서 통째로 풀지 않고 흘려 받는다 (audio 요소 → 소리 장치)
    const el = new Audio(f.url);
    el.loop = true;
    el.preload = 'auto';
    el.addEventListener('error', () => console.warn(`[에셋] 배경음을 읽지 못했습니다: ${f.url}`), { once: true });
    const gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(el).connect(gain).connect(musicBus);
    tr = { id, el, gain, vol: f.vol, timer: 0 };
    tracks.set(id, tr);
  }
  void tr.el.play().catch(() => { /* 첫 입력 전이거나 파일이 없다: 다음에 고를 때 다시 */ });
  fade(tr, tr.vol);
}
/** 0.25초마다: 소리가 꺼졌거나 첫 입력 전이면 조용히, 아니면 게임이 고른 배경음 */
function pickMusic(): void {
  if (!picker || !ctx) return;
  const want = on && unlocked && !held.size ? picker() : '';
  if (want !== playing) music(want);
}

// ---------- 음량 ----------
const MIX_KEY = 'soundMix';
function applyMix(): void {
  if (sfxBus) sfxBus.gain.value = mix.sfx;
  if (musicBus) musicBus.gain.value = mix.music;
}
let volumeUi = false;
/** 소리 파일을 등록하지 않은 게임도 메뉴에 음량 단추를 보인다 (합성음의 음량) */
export function enableVolume(): void { volumeUi = true; }

/** 메뉴 머리의 '음량' 단추와 그 아래 효과음·배경음 막대. 소리 켜고 끄기 단추의 바로 앞에 붙인다 */
function mountMix(): void {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'plain';
  btn.id = 'mixBtn';
  btn.setAttribute('aria-expanded', 'false');
  $('soundBtn').before(btn);
  const row = document.createElement('div');
  row.id = 'mix';
  row.hidden = true;
  const slider = (id: string, label: UiKey, value: number): string =>
    `<label id="${id}Row"><span data-i18n="${label}">${t(label)}</span><input type="range" id="${id}" min="0" max="100" step="5" value="${Math.round(value * 100)}"></label>`;
  row.innerHTML = slider('mixSfx', 'volSfx', mix.sfx) + slider('mixMusic', 'volMusic', mix.music);
  $('menuHead').after(row);
  $('mixMusicRow').hidden = !hasMusic();
  btn.setAttribute('data-i18n', 'volume');
  btn.textContent = t('volume');
  btn.addEventListener('click', () => { row.hidden = !row.hidden; btn.setAttribute('aria-expanded', String(!row.hidden)); btn.blur(); });
  const bind = (id: string, set: (v: number) => void) => {
    const input = $<HTMLInputElement>(id);
    input.addEventListener('input', () => { set(Number(input.value) / 100); applyMix(); });
    input.addEventListener('change', () => { platform().storage.set(MIX_KEY, writeMix(mix)); });
  };
  bind('mixSfx', (v) => { mix.sfx = v; });
  bind('mixMusic', (v) => { mix.music = v; });
  // 효과음 막대를 놓으면 한 번 울려 크기를 들려준다
  $('mixSfx').addEventListener('change', () => sfx.pickup());
}

function label(): void {
  const b = $('soundBtn');
  b.textContent = t(on ? 'soundOn' : 'soundOff');
  b.setAttribute('aria-pressed', String(on));
}

// ---------- 설정 창이 쓰는 것 (hud/settings.ts) ----------
const listeners: (() => void)[] = [];
/** 소리가 켜져 있는가 */
export const soundOn = (): boolean => on;
/** 소리를 켜고 끈다 (메뉴 머리의 단추와 설정 창이 같은 값을 쓴다). 이 기기에 저장한다 */
export function setSoundOn(v: boolean): void {
  if (on === v) return;
  on = v;
  platform().storage.set('sound', on ? 'on' : 'off');
  label();
  if (on) sfx.pickup();
  pickMusic(); // 끄면 배경음도 바로 줄어든다
  for (const fn of listeners) fn();
}
/** 지금의 음량 (효과음·배경음, 0~1) */
export const soundMix = (): Readonly<Mix> => mix;
/** 음량을 바꾼다. save면 이 기기에 저장한다 (막대를 놓을 때) */
export function setSoundMix(m: Partial<Mix>, save = true): void {
  mix = readMix(writeMix({ ...mix, ...m }));
  applyMix();
  for (const id of ['mixSfx', 'mixMusic'] as const) { const el = $<HTMLInputElement>(id) as HTMLInputElement | null; if (el) el.value = String(Math.round((id === 'mixSfx' ? mix.sfx : mix.music) * 100)); }
  if (save) platform().storage.set(MIX_KEY, writeMix(mix));
}
/** 소리 켜짐·음량이 바뀌면 부른다 (설정 창이 다시 그린다) */
export function onSoundChange(fn: () => void): void { listeners.push(fn); }

export function initSound(): void {
  on = platform().storage.get('sound') !== 'off'; // 저장소를 못 쓰면 켠 채로 둔다
  mix = readMix(platform().storage.get(MIX_KEY)); // 없거나 못 읽으면 기본 음량
  label();
  if (volumeUi || hasAudioFiles()) mountMix();
  $('soundBtn').addEventListener('click', (e) => {
    setSoundOn(!on);
    (e.currentTarget as HTMLElement).blur();
  });
  // 탭·앱을 숨기면 소리를 멈추고 돌아오면 다시 (숨긴 동안 밀린 소리를 한꺼번에 내지 않는다). 광고 중에도 멈춘다
  platform().lifecycle.on('hide', () => hold('hidden', true));
  platform().lifecycle.on('show', () => hold('hidden', false));
  onAd((v) => hold('ad', v));
  platform().audio.onInterrupt((v) => hold('ad', v));
  // 입력에서 소리 장치를 깨운다 (자동 재생 정책: 그 전에는 만들지도 틀지도 않는다). 언제가 깨워도 되는 때인지는 플랫폼이 안다 (웹: 입력마다)
  platform().audio.onUnlock(() => { unlocked = true; ready(); pickMusic(); });
  onMsg('sys', (m) => BY_MSG[m.k]?.());
  onMsg('cd', () => sfx.skill());
  onSlow(pickMusic);
  onLangChange(label);
}
