// 설정 창의 셈: 저장한 값 읽기·쓰기, 그래픽 품질의 단계. 화면 요소를 읽지 않는다 (node의 시험이 그대로 읽는다: engine/test/fx/web.test.ts).
// 값은 이 기기에 둔다 (플랫폼 저장소의 'settings' 칸). 서버 저장은 계정이 생긴 뒤의 일이다 (docs/genre-features.md 5.2).
// 소리 켜고 끄기·음량은 예전부터 따로 된 칸('sound', 'soundMix')에 있어 그대로 둔다 (sound.ts).

/** 그래픽: 해의 그림자, 그리기 배율(DPR)의 상한, 그리는 거리(m) */
export interface Gfx { shadows: boolean; pixelRatio: number; far: number }
export type Quality = 'high' | 'mid' | 'low';
/** 품질 단계. high가 이 설정이 생기기 전의 그림과 같다 (그림자, 배율 2까지, 320m) */
export const QUALITY: Readonly<Record<Quality, Gfx>> = {
  high: { shadows: true, pixelRatio: 2, far: 320 },
  mid: { shadows: true, pixelRatio: 1.5, far: 200 },
  low: { shadows: false, pixelRatio: 1, far: 130 },
};
export const QUALITIES: readonly Quality[] = ['high', 'mid', 'low'];
/** 고를 수 있는 값들 */
export const PIXEL_STEPS: readonly number[] = [1, 1.5, 2];
export const FAR_STEPS: readonly number[] = [130, 200, 320];
/** UI 크기 (창·단추·글자를 함께 키운다): 작게·보통·크게·아주 크게. 큰 화면에 맞춤(fit)의 배율에 곱한다 */
export const UI_STEPS: readonly number[] = [0.9, 1, 1.15, 1.3];
/** 글자 크기: 글자 크기 단계 일곱(tokens.css의 --fs-*)에 곱한다. 창의 너비는 그대로 (U4) */
export const TEXT_STEPS: readonly number[] = [0.9, 1, 1.15, 1.3];

/** 큰 화면에 맞춤의 기준: 창·글자는 이 크기(CSS px)에서 1배로 지었다. 더 큰 화면은 짧은 쪽의 비율만큼 키운다 (U4) */
export const FIT_BASE = { w: 1600, h: 900, max: 2.5 } as const;
/**
 * 큰 화면에 맞춤의 배율: 1600×900 이하는 1, 1920×1080은 1.2, 2560×1440은 1.6, 3840×2160은 2.4, 3440×1440(울트라와이드)은 1.6.
 * 폰(구역 배치를 쓰는 화면: hud/layout.ts의 layOf가 'pc'가 아닌 것)은 언제나 1. 0.05 단위로 내린다 (글자가 흐려지지 않게 잦은 값을 피한다)
 */
export function fitScale(w: number, h: number, pc = true): number {
  if (!pc || !(w > 0) || !(h > 0)) return 1;
  const k = Math.min(w / FIT_BASE.w, h / FIT_BASE.h);
  return Math.max(1, Math.min(FIT_BASE.max, Math.floor(k * 20 + 1e-6) / 20));
}
/**
 * HUD의 상자 (배율을 건 좌표): 화면이 16:9보다 많이 넓으면(울트라와이드, 2:1 넘게) HUD를 가운데 16:9 폭으로 모은다 — 창과 단추가 양 끝에 흩어지지 않게.
 * 3D 화면은 그대로 꽉 찬다. 폰(pc가 아님)은 손대지 않는다 (노치·안전 영역은 구역 배치가 맡는다)
 */
export function hudBox(w: number, h: number, scale: number, pc = true): { w: number; x: number } {
  const W = w / scale, H = h / scale;
  if (!pc || W / H <= 2) return { w: W, x: 0 };
  const hw = Math.round(H * 16 / 9);
  return { w: hw, x: Math.round((W - hw) / 2) };
}

export interface Settings {
  gfx: Gfx;
  /** 흔들림 끄기. null이면 기기의 '동작 줄이기' 설정을 따른다 */
  calm: boolean | null;
  /** 움직임 줄이기 (보상 연출·돌림·떠오르는 숫자). null이면 기기의 '동작 줄이기'를 따른다 (engine/client/motion.ts) */
  motion?: boolean | null;
  /** UI 크기(창·단추·글자)의 배율: UI_STEPS */
  ui: number;
  /** 큰 화면에 맞춤 (자동, 처음은 켬): 켜면 fitScale을 ui에 곱한다 (U4) */
  fit?: boolean;
  /** 글자 크기: TEXT_STEPS (U4) */
  text?: number;
  /** 고대비 (U4): 바탕을 불투명하게, 글자·선을 밝게 (tokens.css의 :root[data-contrast="1"]) */
  contrast?: boolean;
  /** 키 재설정: 기능(처음 키) → 고른 키 (engine/client/bus.ts의 setKeyMap) */
  keys: Record<string, string>;
  /** 게임이 더한 칸(addSetting)의 값: id → 값 */
  extra: Record<string, unknown>;
}

/** 처음 값: 이 설정이 생기기 전과 같다. cap은 플랫폼의 배율 상한 (웹 2) */
export const defaultSettings = (cap = 2): Settings => ({ gfx: { ...QUALITY.high, pixelRatio: cap }, calm: null, ui: 1, keys: {}, extra: {} });

const near = (v: unknown, steps: readonly number[], d: number): number => (typeof v === 'number' && Number.isFinite(v) ? steps.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), steps[0]) : d);

/** 저장한 글을 읽는다. 없거나 깨졌거나 모르는 값은 처음 값으로 (한 칸이 깨져도 나머지는 산다) */
export function readSettings(raw: string | null, cap = 2): Settings {
  const d = defaultSettings(cap);
  if (!raw) return d;
  let o: Partial<Record<keyof Settings, unknown>>;
  try { o = JSON.parse(raw) as typeof o; } catch { return d; }
  if (typeof o !== 'object' || o === null) return d;
  const g = (typeof o.gfx === 'object' && o.gfx !== null ? o.gfx : {}) as Partial<Record<keyof Gfx, unknown>>;
  const keys: Record<string, string> = {};
  if (typeof o.keys === 'object' && o.keys !== null) for (const [a, k] of Object.entries(o.keys)) if (typeof k === 'string' && /^.{1,12}$/.test(a) && /^.{1,12}$/.test(k)) keys[a.toLowerCase()] = k.toLowerCase();
  return {
    gfx: { shadows: typeof g.shadows === 'boolean' ? g.shadows : d.gfx.shadows, pixelRatio: Math.min(cap, near(g.pixelRatio, PIXEL_STEPS, d.gfx.pixelRatio)), far: near(g.far, FAR_STEPS, d.gfx.far) },
    calm: typeof o.calm === 'boolean' ? o.calm : null,
    ...(typeof (o as { motion?: unknown }).motion === 'boolean' ? { motion: (o as { motion: boolean }).motion } : {}),
    ui: near(o.ui, UI_STEPS, 1),
    ...(typeof o.fit === 'boolean' ? { fit: o.fit } : {}),
    ...(typeof o.text === 'number' ? { text: near(o.text, TEXT_STEPS, 1) } : {}),
    ...(typeof o.contrast === 'boolean' ? { contrast: o.contrast } : {}),
    keys,
    extra: typeof o.extra === 'object' && o.extra !== null ? { ...(o.extra as Record<string, unknown>) } : {},
  };
}
export const writeSettings = (s: Settings): string => JSON.stringify(s);

/** 그 그래픽이 어느 단계인가 (단계와 다르게 고쳤으면 'custom'). cap: 플랫폼의 배율 상한 (high의 배율은 상한까지) */
export function qualityOf(g: Gfx, cap = 2): Quality | 'custom' {
  for (const q of QUALITIES) {
    const want = QUALITY[q], pr = Math.min(cap, want.pixelRatio);
    if (g.shadows === want.shadows && g.pixelRatio === pr && g.far === want.far) return q;
  }
  return 'custom';
}
/** 그 단계의 그래픽 (배율은 상한까지) */
export const gfxOf = (q: Quality, cap = 2): Gfx => ({ ...QUALITY[q], pixelRatio: Math.min(cap, QUALITY[q].pixelRatio) });

/** 키 하나의 이름 (설정 창에 보인다): 글자는 대문자, ' '는 Space */
export const keyLabel = (k: string): string => (k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));
/** 다시 고를 수 없는 키: 이동(W·A·S·D·방향키), 대화(Enter), 닫기(Esc) */
export const RESERVED_KEYS: readonly string[] = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'enter', 'escape'];
