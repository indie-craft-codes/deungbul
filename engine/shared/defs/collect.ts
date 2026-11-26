// 수집형·방치형 RPG의 모양 (선택 모듈 roster, gacha, squad, stages): 동료(영웅)의 표, 뽑기의 배너, 편성, 단계(장과 단계).
// 표와 수치는 게임의 내용에 있다 (@game/shared/content의 HEROES, HERO_RARITIES, HERO_ROLES, HERO_RULES, BANNERS, GACHA_RULES, SQUAD_RULES, CHAPTERS, STAGE_RULES).
// 서버(engine/server/game/systems/roster.ts, gacha.ts, squad.ts, stages.ts)와 화면(engine/client/hud/collect*.ts)이 함께 읽는다:
// 영웅의 능력치·전투력, 뽑기의 확률(공개하는 확률표와 서버가 뽑는 확률이 이 한 곳의 셈이다), 단계의 목록은 여기의 함수로만 구한다.
// 줄 위에서 영웅은 HEROES의 id로, 등급은 HERO_RARITIES의 번호(0부터, 클수록 귀하다)로, 단계는 '장-단계'의 id('1-3')로 오간다.
import { BANNERS, CHAPTERS, HERO_RARITIES, HERO_ROLES, HERO_RULES, HEROES } from '../content';
import type { Reward } from './growth';

/** 뽑기와 영웅 레벨 업에 치르는 재화: 지갑이 다루는 것 가운데 사고팔 수 없는 경험치를 뺀 둘 (현금은 없다: 틀에 결제가 없다) */
export type Coin = 'gold' | 'sparks';

/** 영웅의 등급 하나 (HERO_RARITIES의 차례가 번호: 0이 가장 흔하다) */
export interface HeroRarityDef {
  /** 저장과 줄에 쓰지 않는 이름 (화면의 css 이름). 등급은 번호로 오간다 */
  id: string;
  /** 이름의 문장 키 (게임의 언어 파일 ui에 그 키로 적는다) */
  name: string;
  /** 색 (카드의 테두리, 발밑 고리) 0xRRGGBB */
  color: number;
  /** 처음 얻었을 때의 별 */
  stars: number;
  /** 이미 가진 영웅을 또 뽑았을 때 받는 조각 */
  shards: number;
}

/** 영웅의 역할 (직업 같은 것): 싸우는 법과 겉모습 */
export interface HeroRoleDef {
  /** 이름의 문장 키 (게임의 언어 파일 ui) */
  name: string;
  /** 손에 드는 것 (화면의 손 모양 id: 틀에는 sword, bow, staff) */
  hand: string;
  /** 멀리서 쏘면 날아가는 것의 모양 (틀에는 arrow, bolt). 없으면 붙어서 친다 */
  shot?: string;
  /** 기본 공격 사거리(m)와 간격(초), 걷는 빠르기(m/초) */
  range: number; atkCd: number; speed: number;
  /** 쿨다운마다 쓰는 기술 (SKILL_DEFS의 id: 전투 모듈의 기술 효과를 그대로 쓴다). 없으면 기본 공격만 */
  skill?: string;
  /** 옷 색 0xRRGGBB (역할마다 다르게 보이게) */
  cloth: number;
}

/** 영웅 하나 */
export interface HeroDef {
  /** 이름의 문장 키 (게임의 언어 파일 ui) */
  name: string;
  /** 등급 번호 (HERO_RARITIES) */
  rarity: number;
  /** 역할 (HERO_ROLES의 id) */
  role: string;
  /** 1레벨·처음 별의 공격(한 번 때리는 피해)과 체력 */
  atk: number; hp: number;
  /** 옷 색을 역할의 것 대신 (없으면 역할의 색) */
  cloth?: number;
}

/** 영웅을 키우는 규칙 */
export interface HeroRules {
  /** 별의 상한 */
  maxStars: number;
  /** 그 별에서 오를 수 있는 레벨의 상한 (별을 올려야 더 오른다) */
  maxLv: (stars: number) => number;
  /** 레벨 업에 치르는 재화와 값 (지금 레벨, 등급 번호) */
  levelCur: Coin;
  levelCost: (lv: number, rarity: number) => number;
  /** 별을 하나 올리는 데 드는 조각 (지금 별) */
  starCost: (stars: number) => number;
  /** 레벨 하나마다 공격·체력이 늘어나는 비율 (0.1이면 레벨마다 처음 값의 10%) */
  grow: number;
  /** 별 하나마다 곱해지는 비율 (0.25면 별마다 +25%, 처음 별이 기준) */
  starMul: number;
}

/** 배너 하나의 뽑기 판 한 칸: 이 영웅이 나올 무게 (확률 = 무게 / 그 배너의 무게의 합) */
export interface BannerSlot { hero: string; w: number }

/** 뽑기의 배너 */
export interface BannerDef {
  /** 이름의 문장 키 (게임의 언어 파일 ui) */
  name: string;
  /** 치르는 재화와 1번·10번의 값 */
  cur: Coin; one: number; ten: number;
  /** 뽑기 판: 영웅마다의 무게. 확률은 이 무게로만 정해진다 (공개하는 확률표가 이것을 그대로 셈한다) */
  pool: readonly BannerSlot[];
  /**
   * 천장: 이 배너에서 rarity 등급 이상이 나오지 않은 채 after번째 뽑기가 되면 그 뽑기는 rarity 이상의 칸에서만 뽑는다 (칸 사이의 비율은 그대로).
   * rarity 이상이 나오면 셈이 0으로 돌아간다. 셈은 사람마다·배너마다 저장된다
   */
  pity?: { after: number; rarity: number };
  /** 10번 뽑기의 보장: 앞의 아홉에 이 등급 이상이 없으면 열째는 이 등급 이상의 칸에서만 뽑는다 */
  tenAtLeast?: number;
}

/** 뽑기의 규칙 */
export interface GachaRules {
  /** 사람마다 남기는 뽑기 기록의 수 (최근 것부터) */
  history: number;
}

/** 편성의 규칙 */
export interface SquadRules {
  /** 함께 싸우는 영웅의 수 */
  size: number;
  /** 주인에게서 이 거리(m) 안의 몬스터를 노린다 */
  seek: number;
  /** 주인에게서 이 거리(m)보다 멀어지면 싸움을 그치고 돌아온다. 그 두 배보다 멀면 주인 곁으로 바로 옮긴다 */
  leash: number;
  /** 쓰러진 영웅이 다시 일어나기까지(초) */
  reviveS: number;
  /** 싸우지 않는 동안 초마다 최대 체력의 이 비율만큼 회복한다 */
  regen: number;
  /** 영웅을 처음 얻으면 빈 자리에 저절로 넣는다 */
  autoFill: boolean;
}

/** 단계 하나의 물결: 몬스터의 종류와 수 */
export interface WaveDef { type: string; n: number }

/** 단계 하나 */
export interface StageDef {
  /** 물결들: 차례대로 나온다. 한 물결을 다 잡으면 다음 물결 */
  waves: readonly (readonly WaveDef[])[];
  /** 마지막에 나오는 우두머리 (없으면 물결만). scale은 이 단계의 scale에 곱한다 */
  boss?: { type: string; scale?: number };
  /** 몬스터의 체력과 피해에 곱하는 값 (1이면 정의 그대로) */
  scale: number;
  /** 깰 때마다 받는 보상 (지갑과 가방으로 바로). first는 처음 깰 때 더 받는 것 */
  reward: Reward; first?: Reward;
  /** 권장 전투력 (화면에 보일 뿐: 서버는 막지 않는다) */
  rec: number;
  /** 제한 시간(초). 없으면 STAGE_RULES.timeS */
  timeS?: number;
}

/** 장 하나: 이름의 문장 키와 단계들 (단계의 id는 '장 번호-단계 번호', 1부터) */
export interface ChapterDef { name: string; stages: readonly StageDef[] }

/** 단계의 규칙 */
export interface StageRules {
  /** 단계가 벌어지는 곳: 사람마다의 층(인스턴스)에서 이 자리를 가운데로. 물결은 radius(m) 둘레에서 나온다 */
  arena: { x: number; z: number }; radius: number;
  /** 물결 사이(초), 깬 뒤 다음 단계까지(초), 실패한 뒤 다시 하기까지(초) */
  waveGapS: number; nextS: number; retryS: number;
  /** 단계의 제한 시간(초) (StageDef.timeS가 없을 때) */
  timeS: number;
  /** 단계 안에서 사람도 서버가 대신 싸운다 (손으로 움직이면 1.5초 동안은 맡기지 않는다) */
  leaderAuto: boolean;
  /** 접속하면 바로 지금 단계로 들어간다 (방치형). 아니면 '도전'을 눌러야 들어간다 */
  enterOnJoin: boolean;
}

/** 방치 보상(idle 모듈)의 셈에 틀이 넘기는 것: 깬 단계의 수 (stages 모듈이 없으면 0) */
export interface IdleCtx { stage: number }

// ---------- 표를 읽는 도우미 ----------
/** 영웅의 표를 id가 문자열인 표로 본 것 (영웅이 없는 게임에서도 읽힌다. 없는 id는 undefined) */
export const HERO_TABLE: Readonly<Record<string, HeroDef>> = HEROES;
export const HERO_IDS: readonly string[] = Object.keys(HEROES);
export const isHeroId = (v: unknown): v is string => typeof v === 'string' && Object.hasOwn(HEROES, v);
export const heroDef = (id: string): HeroDef => HERO_TABLE[id];
const ROLE_TABLE: Readonly<Record<string, HeroRoleDef>> = HERO_ROLES;
/** 그 영웅의 역할 (없는 역할이면 붙어서 치는 기본) */
export const heroRole = (id: string): HeroRoleDef => ROLE_TABLE[heroDef(id)?.role ?? ''] ?? { name: '', hand: 'sword', range: 2, atkCd: 1.2, speed: 4.5, cloth: 0x8a8a8a };
export const rarityDef = (r: number): HeroRarityDef => HERO_RARITIES[r] ?? HERO_RARITIES[0] ?? { id: 'none', name: '', color: 0x9a9a9a, stars: 1, shards: 1 };
export const BANNER_TABLE: Readonly<Record<string, BannerDef>> = BANNERS;
export const BANNER_IDS: readonly string[] = Object.keys(BANNERS);
export const isBannerId = (v: unknown): v is string => typeof v === 'string' && Object.hasOwn(BANNERS, v);

/** 영웅 하나의 지금 능력치: 레벨과 별로 (서버의 영웅 엔티티와 화면의 카드가 같은 셈을 쓴다) */
export function heroStats(id: string, lv: number, stars: number): { atk: number; hp: number } {
  const d = heroDef(id);
  if (!d) return { atk: 0, hp: 0 };
  const k = (1 + HERO_RULES.grow * (Math.max(1, lv) - 1)) * (1 + HERO_RULES.starMul * Math.max(0, stars - rarityDef(d.rarity).stars));
  return { atk: Math.round(d.atk * k), hp: Math.round(d.hp * k) };
}
/** 전투력: 공격 × 4 + 체력 ÷ 2 (단계의 권장 전투력과 견준다) */
export const heroPower = (id: string, lv: number, stars: number): number => { const s = heroStats(id, lv, stars); return Math.round(s.atk * 4 + s.hp / 2); };

/** 가진 영웅 하나: 레벨, 별, 모아 둔 조각 */
export interface OwnedHero { lv: number; stars: number; shards: number }

// ---------- 뽑기의 확률 (공개 확률표와 서버가 같은 셈) ----------
/** 확률표의 한 줄: 영웅, 등급, 확률(0~1) */
export interface Odds { hero: string; rarity: number; p: number }
/** 그 칸들 가운데 minRarity 이상만의 확률 (칸 사이의 비율은 그대로). 무게가 0 이하인 칸과 없는 영웅은 빠진다 */
export function poolOdds(pool: readonly BannerSlot[], minRarity = -1): Odds[] {
  const live = pool.filter((s) => s.w > 0 && isHeroId(s.hero) && heroDef(s.hero).rarity >= minRarity);
  const sum = live.reduce((a, s) => a + s.w, 0);
  return sum > 0 ? live.map((s) => ({ hero: s.hero, rarity: heroDef(s.hero).rarity, p: s.w / sum })) : [];
}
/** 배너의 평소 확률표 (영웅마다) */
export const bannerOdds = (b: BannerDef): Odds[] => poolOdds(b.pool);
/** 등급마다의 확률 (등급 번호의 차례. 그 등급의 영웅들의 합) */
export function rarityOdds(odds: readonly Odds[]): number[] {
  const out = HERO_RARITIES.map(() => 0);
  for (const o of odds) out[o.rarity] = (out[o.rarity] ?? 0) + o.p;
  return out;
}
/** 천장에 닿은 뽑기의 확률표 (천장이 없으면 빈 목록) */
export const pityOdds = (b: BannerDef): Odds[] => (b.pity ? poolOdds(b.pool, b.pity.rarity) : []);
/** 확률표에서 하나를 뽑는다: r은 0 이상 1 미만의 수 (서버가 자기 난수로 준다). 표가 비었으면 undefined */
export function pickOdds(odds: readonly Odds[], r: number): Odds | undefined {
  let acc = 0;
  for (const o of odds) { acc += o.p; if (r < acc) return o; }
  return odds[odds.length - 1];
}
/** 확률을 백분율 글로: 소수 넷째 자리까지, 끝의 0은 지운다 (0.7500% → 0.75%) */
export const pctText = (p: number): string => `${(Math.round(p * 1e6) / 1e4).toFixed(4).replace(/\.?0+$/, '')}%`;

/** 시험과 게임이 쓰는 정해진 난수 (mulberry32): 같은 씨앗이면 같은 차례 */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- 단계 ----------
/** 단계의 목록 (장의 차례, 그 안의 단계의 차례): 번호(i, 0부터), id('1-3'), 장 번호(ch, 0부터), 장 안의 번호(n, 0부터), 정의 */
export interface StageRef { i: number; id: string; ch: number; n: number; def: StageDef }
export const STAGES: readonly StageRef[] = CHAPTERS.flatMap((c, ch) => c.stages.map((def, n) => ({ id: `${ch + 1}-${n + 1}`, ch, n, def }))).map((s, i) => ({ i, ...s }));
/** id의 단계 번호 (없으면 -1) */
export const stageIndex = (id: string): number => STAGES.findIndex((s) => s.id === id);
/** 단계의 물결 수 (우두머리도 한 물결로 센다) */
export const waveCount = (d: StageDef): number => d.waves.length + (d.boss ? 1 : 0);

// ---------- 줄 위의 모양 (개인 상태와 메시지) ----------
/** 개인 상태 'heroes': 가진 영웅마다 [레벨, 별, 조각] */
export type HeroesMe = Record<string, [lv: number, stars: number, shards: number]>;
/** 뽑기 기록 한 줄: 시각(ms), 배너, 영웅, 등급, 천장·10번 보장으로 나온 것인가 */
export interface PullLog { at: number; b: string; h: string; r: number; pity: boolean }
/** 개인 상태 'gacha': 배너마다 천장의 셈(그 등급 이상이 나오지 않은 뽑기의 수)과 최근 기록 (새 것이 앞) */
export interface GachaMe { pity: Record<string, number>; log: PullLog[] }
/** 뽑기의 결과 하나 (메시지 gacha): 영웅, 등급, 이미 가진 것이라 조각이 되었나와 받은 조각, 천장·보장으로 나왔나 */
export interface PullGot { h: string; r: number; dup: boolean; n: number; pity: boolean }
/** 개인 상태 'squad': 편성한 영웅(자리의 차례)과 그 전투력의 합 */
export interface SquadMe { ids: string[]; power: number }
/** 단계 안의 진행 (개인 상태 'stage'의 run): 단계 id, 지금 물결(0부터, 우두머리는 마지막), 물결 수, 남은 적, 이 물결의 적, 남은 시간(초), 상태 */
export interface StageRun { id: string; wave: number; waves: number; foes: number; total: number; left: number; state: 'fight' | 'gap' | 'clear' | 'fail'; boss: boolean }
/** 개인 상태 'stage': 지금 단계, 가장 멀리 깬 단계(없으면 ''), 자동 진행, 안에 있으면 그 진행 */
export interface StageMe { cur: string; best: string; auto: boolean; run: StageRun | null }
/** 개인 상태 'keys' (열쇠를 쓰는 던전이 있는 게임): 던전마다 가진 열쇠와 오늘 산 수 */
export type KeysMe = Record<string, { n: number; bought: number }>;
