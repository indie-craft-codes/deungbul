// 수집형·방치형 RPG의 모양 (선택 모듈 roster, gacha, squad, stages): 동료(영웅)의 표, 뽑기의 배너, 편성, 단계(장과 단계).
// 표와 수치는 게임의 내용에 있다 (@game/shared/content의 HEROES, HERO_RARITIES, HERO_ROLES, HERO_RULES, BANNERS, GACHA_RULES, SQUAD_RULES, CHAPTERS, STAGE_RULES).
// 서버(engine/server/game/systems/roster.ts, gacha.ts, squad.ts, stages.ts)와 화면(engine/client/hud/collect*.ts)이 함께 읽는다:
// 영웅의 능력치·전투력, 뽑기의 확률(공개하는 확률표와 서버가 뽑는 확률이 이 한 곳의 셈이다), 단계의 목록은 여기의 함수로만 구한다.
// 줄 위에서 영웅은 HEROES의 id로, 등급은 HERO_RARITIES의 번호(0부터, 클수록 귀하다)로, 단계는 '장-단계'의 id('1-3')로 오간다.
import { BANNERS, CHAPTERS, GACHA_RULES, HERO_RARITIES, HERO_ROLES, HERO_RULES, HEROES, STAGE_RULES } from '../content';
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
  /**
   * 픽업(확률 업): 이 영웅이 자기 등급의 확률 가운데 share(0~1)만큼을 갖는다. 그 등급의 나머지 영웅은 남은 몫을 자기 무게의 비율로 나눈다.
   * 등급의 확률(그 등급 영웅들의 무게의 합)은 그대로다. 없으면 무게 그대로 (예전과 같다)
   */
  pickup?: { hero: string; share: number };
  /** 반반(50/50): 픽업의 등급이 나왔는데 픽업이 아니면, 다음에 그 등급이 나올 때는 픽업이 확정이다 (확정은 천장 무리 pityGroup과 함께 이어진다) */
  fiftyFifty?: boolean;
  /** 천장을 함께 세는 무리: 같은 이름의 배너들이 천장의 셈과 반반의 확정을 함께 쓴다 (기간 한정 배너가 바뀌어도 이어진다). 무리의 배너들은 pity가 같아야 한다 */
  pityGroup?: string;
  /** 열리는 때와 닫히는 때 (서버 시계의 ms, Date.getTime()). 이 사이에만 화면에 보이고 뽑을 수 있다. 없으면 늘 열려 있다 */
  start?: number; end?: number;
}

/** 뽑기의 규칙 */
export interface GachaRules {
  /** 사람마다 남기는 뽑기 기록의 수 (최근 것부터) */
  history: number;
  /** 영웅 선택권: 아이템 id(가방의 'token' 같은 것) → 고를 수 있는 영웅들. 선택권 하나를 쓰고 그 가운데 하나를 얻는다 (items 모듈이 있어야 한다). 없으면 선택권이 없다 */
  select?: Readonly<Record<string, readonly string[]>>;
}

/** 소탕의 값: 게임 안의 재화(cur) 또는 가방의 아이템(item, 소탕권) n개. 한 번 소탕할 때마다 */
export type SweepCost = { cur: Coin; n: number } | { item: string; n: number };
/** 소탕: 이미 깬 단계·던전을 싸우지 않고 바로 끝내 보통 보상(처음 깬 보상이 아니다)을 받는다. cost는 한 번마다의 값(없으면 공짜), max는 한 번에 할 수 있는 횟수(기본 10) */
export interface SweepRule { cost?: SweepCost; max?: number }
/**
 * 오프라인 단계 진행: 접속하지 않은 동안 서버가 '얼마나 더 깼을까'를 셈한다 (자동 진행을 켜 둔 사람만).
 * 가장 멀리 깬 단계의 다음부터, 편성의 전투력이 권장 전투력 × need(기본 1) 이상인 단계를 perStageS초에 하나씩 깬 것으로 친다.
 * 비운 시간은 maxH시간까지만, 한 번 돌아올 때 maxStages단계까지만. clearReward(기본 true)면 깬 단계마다 보통 보상도 준다 (처음 깬 보상은 언제나)
 */
export interface OfflineRules { perStageS: number; maxH: number; maxStages: number; need?: number; clearReward?: boolean }

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
  /** false면 이 단계는 소탕할 수 없다 (STAGE_RULES.sweep이 있을 때. 기본은 깬 단계 모두) */
  sweep?: boolean;
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
  /** 소탕(깬 단계를 바로 끝내기)의 값과 한 번에 하는 수. 없으면 소탕이 없다 */
  sweep?: SweepRule;
  /** 오프라인 단계 진행. 없으면 하지 않는다 (방치 보상의 수치만 깬 단계로 커진다) */
  offline?: OfflineRules;
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
/** 뽑기의 규칙을 넓은 타입으로 본 것 (게임이 적은 GACHA_RULES에 선택 칸 select가 없어도 읽힌다) */
export const GACHA_RULE_VIEW: GachaRules = GACHA_RULES;
/** 선택권의 표: 아이템 id → 고를 수 있는 영웅들 (없는 영웅은 뺀다) */
export const SELECT_TICKETS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(Object.entries(GACHA_RULE_VIEW.select ?? {}).map(([k, v]) => [k, v.filter((h) => isHeroId(h))]));

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
// ---------- 픽업·반반·천장 무리·기간 (공개 확률표와 서버가 같은 셈) ----------
/**
 * 한 번 뽑을 때의 확률표: 이 함수 하나가 서버의 뽑기와 화면의 공개 확률표를 함께 만든다 (둘이 어긋날 수 없다).
 * floor: 이 등급 이상의 칸에서만 (천장·10번 보장. -1이면 모두). sure: 반반의 확정 (픽업의 등급이 나오면 픽업).
 * 픽업이 있으면 픽업의 등급의 확률(합)은 그대로 두고, 그 안에서 픽업이 share(확정이면 전부)를, 나머지 영웅이 남은 몫을 무게의 비율로 나눈다.
 * 픽업이 없는 배너는 poolOdds와 같다 (예전과 글자까지 같은 확률)
 */
export function pullOdds(b: BannerDef, floor = -1, sure = false): Odds[] {
  const base = poolOdds(b.pool, floor), pk = b.pickup;
  const me = pk ? base.find((o) => o.hero === pk.hero) : undefined;
  if (!pk || !me) return base;
  const same = base.filter((o) => o.rarity === me.rarity);
  const mass = same.reduce((s, o) => s + o.p, 0), others = mass - me.p;
  const share = sure || others <= 0 ? 1 : Math.max(0, Math.min(1, pk.share));
  return base.map((o) => (o.rarity !== me.rarity ? o : o === me ? { ...o, p: mass * share } : { ...o, p: others > 0 ? (o.p / others) * mass * (1 - share) : 0 }));
}
/** 배너가 천장을 세는 열쇠: 무리(pityGroup)가 있으면 'group:이름', 없으면 배너 id (예전 저장과 같은 열쇠) */
export const pityKey = (id: string): string => { const g = BANNER_TABLE[id]?.pityGroup; return g ? `group:${g}` : id; };
/** 같은 천장 무리의 배너들 (무리가 없으면 자기 하나) */
export const pityMates = (id: string): string[] => { const k = pityKey(id); return BANNER_IDS.filter((x) => pityKey(x) === k); };
/** 그 시각(서버 시계의 ms)에 열려 있는 배너인가 */
export const bannerOpen = (b: BannerDef, now: number): boolean => (b.start === undefined || now >= b.start) && (b.end === undefined || now < b.end);
/** 기간이 있는 배너가 하나라도 있는가 (없으면 개인 상태에 열린 배너의 칸이 생기지 않는다) */
export const hasTimedBanners = (): boolean => Object.values(BANNER_TABLE).some((b) => b.start !== undefined || b.end !== undefined);
/** 반반을 쓰는 배너가 하나라도 있는가 (없으면 확정의 칸이 생기지 않는다) */
export const hasFiftyFifty = (): boolean => Object.values(BANNER_TABLE).some((b) => !!b.fiftyFifty && !!b.pickup);
/** 한 번 뽑은 뒤의 반반 확정: 픽업의 등급이 나왔으면 픽업이 아니었을 때 확정이 되고 픽업이면 풀린다. 다른 등급이면 그대로 */
export function nextSure(b: BannerDef, got: { hero: string; rarity: number }, sure: boolean): boolean {
  if (!b.fiftyFifty || !b.pickup || !isHeroId(b.pickup.hero)) return sure;
  return got.rarity === heroDef(b.pickup.hero).rarity ? got.hero !== b.pickup.hero : sure;
}
/**
 * 1번 뽑기를 오래 되풀이할 때 영웅마다 실제로 나오는 비율 (천장과 반반까지 넣은 '실효 확률'): 천장의 셈과 확정을 상태로 한 마르코프 사슬의 정상 분포로 셈한다.
 * 이 셈도 pullOdds만 쓴다. 천장도 반반도 없는 배너는 평소의 확률과 같다
 */
export function effectiveOdds(b: BannerDef): Odds[] {
  const after = b.pity ? Math.max(1, b.pity.after) : 1, fifty = !!b.fiftyFifty && !!b.pickup;
  const S = after * (fifty ? 2 : 1), idx = (c: number, s: boolean) => c * (fifty ? 2 : 1) + (s ? 1 : 0);
  const tables: Odds[][] = [];
  for (let c = 0; c < after; c++) for (const s of fifty ? [false, true] : [false]) tables[idx(c, s)] = pullOdds(b, b.pity && c + 1 >= b.pity.after ? b.pity.rarity : -1, s);
  // 정상 분포 π: π(P − I) = 0, Σπ = 1. 상태가 많아야 천장 × 2개라 가우스 소거로 바로 푼다 (A πᵀ = e, A = (P − I)ᵀ의 마지막 줄을 1로)
  const A = Array.from({ length: S }, () => new Float64Array(S + 1));
  for (let c = 0; c < after; c++) for (const s of fifty ? [false, true] : [false]) {
    const i = idx(c, s);
    A[i][i] -= 1;
    for (const o of tables[i]) {
      const c2 = b.pity && o.rarity >= b.pity.rarity ? 0 : Math.min(after - 1, c + 1);
      A[idx(c2, fifty ? nextSure(b, o, s) : false)][i] += o.p;
    }
  }
  for (let j = 0; j <= S; j++) A[S - 1][j] = 1;
  for (let col = 0; col < S; col++) {
    let piv = col;
    for (let r = col + 1; r < S; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col];
    if (Math.abs(d) < 1e-300) continue;
    for (let r = 0; r < S; r++) {
      if (r === col || !A[r][col]) continue;
      const f = A[r][col] / d;
      for (let j = col; j <= S; j++) A[r][j] -= f * A[col][j];
    }
  }
  const pi = A.map((r, i) => (Math.abs(r[i]) < 1e-300 ? 0 : Math.max(0, r[S] / r[i])));
  const out = new Map<string, Odds>();
  for (let i = 0; i < S; i++) for (const o of tables[i] ?? []) { const x = out.get(o.hero) ?? { ...o, p: 0 }; x.p += pi[i] * o.p; out.set(o.hero, x); }
  return [...out.values()];
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
/** 단계의 규칙을 넓은 타입으로 본 것 (게임이 적은 STAGE_RULES의 타입에 선택 칸 sweep, offline이 없어도 읽힌다) */
export const STAGE_RULE_VIEW: StageRules = STAGE_RULES;
/** 한 번에 할 수 있는 소탕의 수 (SweepRule.max, 기본 10) */
export const sweepMax = (r: SweepRule | undefined): number => Math.max(1, Math.floor(r?.max ?? 10));
/** 그 단계를 소탕할 수 있는 단계인가 (깼는가는 따로 본다) */
export const stageSweepable = (s: StageRef | undefined): boolean => !!STAGE_RULE_VIEW.sweep && !!s && s.def.sweep !== false;

/**
 * 오프라인 단계 진행의 셈 (서버가 돌아온 사람에게, 시험과 화면이 같은 셈을 쓴다). 아무것도 바꾸지 않는다.
 * best: 가장 멀리 깬 단계의 번호(-1이면 없음), power: 편성의 전투력, ms: 비운 시간.
 * 돌려주는 것: 깬 것으로 칠 단계의 번호들과 그 각각을 깬 때(비우기 시작한 때부터의 ms). 깨진 시간(음수, NaN, 무한대)은 0으로 본다
 */
export function offlinePlan(best: number, power: number, ms: number, rules: OfflineRules | undefined): { passed: number[]; at: number[] } {
  const out = { passed: [] as number[], at: [] as number[] };
  if (!rules || !(ms > 0) || !Number.isFinite(power)) return out;
  const budget = Math.min(ms, Math.max(0, rules.maxH) * 3600000);
  const per = Math.max(1, rules.perStageS) * 1000, need = rules.need ?? 1, cap = Math.max(0, Math.floor(rules.maxStages));
  for (let i = Math.max(-1, best) + 1, t = per; i < STAGES.length && out.passed.length < cap && t <= budget; i++, t += per) {
    if (power < STAGES[i].def.rec * need) break;
    out.passed.push(i); out.at.push(t);
  }
  return out;
}
/**
 * 방치 보상의 분(minutes)을 깬 단계의 수가 같은 토막으로 나눈다: [분, 그동안 깬 단계의 수]. 토막의 분을 더하면 minutes다.
 * cleared: 비우기 시작할 때 깬 단계의 수, at: offlinePlan이 준 깬 때들 (비었으면 한 토막: 예전의 셈과 같다)
 */
export function idleSegments(minutes: number, cleared: number, at: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  let from = 0;
  at.forEach((t, k) => {
    const to = Math.min(minutes, Math.floor(t / 60000));
    if (to > from) { out.push([to - from, cleared + k]); from = to; }
  });
  if (minutes > from || !out.length) out.push([minutes - from, cleared + at.length]);
  return out;
}

// ---------- 줄 위의 모양 (개인 상태와 메시지) ----------
/** 개인 상태 'heroes': 가진 영웅마다 [레벨, 별, 조각] */
export type HeroesMe = Record<string, [lv: number, stars: number, shards: number]>;
/** 뽑기 기록 한 줄: 시각(ms), 배너, 영웅, 등급, 천장·10번 보장으로 나온 것인가 */
export interface PullLog { at: number; b: string; h: string; r: number; pity: boolean }
/** 개인 상태 'gacha': 배너마다 천장의 셈(그 등급 이상이 나오지 않은 뽑기의 수)과 최근 기록 (새 것이 앞) */
export interface GachaMe {
  pity: Record<string, number>; log: PullLog[];
  /** 기간이 있는 배너가 있는 게임만: 지금 열린 배너 → 닫히기까지 남은 분(끝이 없으면 -1). 여기에 없는 배너는 닫혀 있다 */
  open?: Record<string, number>;
  /** 반반을 쓰는 게임만: 천장의 열쇠(pityKey) → 1이면 다음 픽업 등급은 픽업 확정 */
  sure?: Record<string, 1>;
}
/** 뽑기의 결과 하나 (메시지 gacha): 영웅, 등급, 이미 가진 것이라 조각이 되었나와 받은 조각, 천장·보장으로 나왔나 */
export interface PullGot { h: string; r: number; dup: boolean; n: number; pity: boolean }
/** 개인 상태 'squad': 편성한 영웅(자리의 차례)과 그 전투력의 합 */
export interface SquadMe { ids: string[]; power: number }
/** 단계 안의 진행 (개인 상태 'stage'의 run): 단계 id, 지금 물결(0부터, 우두머리는 마지막), 물결 수, 남은 적, 이 물결의 적, 남은 시간(초), 상태 */
export interface StageRun { id: string; wave: number; waves: number; foes: number; total: number; left: number; state: 'fight' | 'gap' | 'clear' | 'fail'; boss: boolean }
/** 개인 상태 'stage': 지금 단계, 가장 멀리 깬 단계(없으면 ''), 자동 진행, 안에 있으면 그 진행 */
export interface StageMe { cur: string; best: string; auto: boolean; run: StageRun | null }
/** 개인 상태 'keys' (열쇠를 쓰는 던전이 있는 게임): 던전마다 가진 열쇠와 오늘 산 수 */
export type KeysMe = Record<string, { n: number; bought: number; won?: boolean }>;
/** 소탕의 결과 (메시지 sweep): 단계·던전, id, 횟수, 받은 것의 합: 재화(cur: 재화 id → 양), 아이템(goods: 아이템 id → 수), 장비의 수(equip) */
export interface SweepGot { k: 'stage' | 'dungeon'; id: string; n: number; cur: Record<string, number>; goods: Record<string, number>; equip: number }
