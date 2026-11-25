// 한국어: 이 게임의 내용의 이름(koNames)과 이 게임의 문장(koGame). 기준 언어다: en.ts는 이 파일과 같은 모양을 갖춰야 컴파일된다.
import type { MsgMap } from '@engine/shared/ext';
import type { MsgArg, MsgKey } from '@engine/shared';
import { keyHints } from '@engine/client/i18n/ko';
import type { ContentNames } from '@engine/client/i18n/names';

export const koNames: ContentNames = {
  monsters: { sludge: '진흙방울', burrower: '굴쥐', spitter: '독침두꺼비', brute: '바위등딱지' },
  // staff: 지팡이를 드는 직업(약초꾼)에게 보이는 이름
  items: {
    blade1: { name: '낡은 검', staff: '참나무 지팡이', info: '기본 무기' },
    blade2: { name: '담지기 검', staff: '버드나무 지팡이' },
    vest: { name: '누빔 조끼' },
    tea: { name: '약초차' },
  },
  classes: {
    warden: { name: '담지기', info: '검을 들고 문 앞에서 막아섭니다. 체력이 많고, 곁의 동료에게 힘을 북돋웁니다.' },
    herbalist: { name: '약초꾼', info: '멀리서 가시를 날리고 포자로 적을 느리게 합니다. 곁의 동료를 나무껍질로 감쌉니다.' },
  },
  skills: {
    bash: { name: '방패 치기', info: '대상에게 큰 피해를 주고 1.5초 기절시킨다' },
    quake: { name: '땅 구르기', info: '주변 모두에게 피해를 주고 느리게 함' },
    rally: { name: '함성', info: '나와 곁의 동료가 8초 동안 피해 +40%' },
    needle: { name: '가시 쏘기', info: '멀리 있는 대상에게 큰 피해' },
    spore: { name: '포자 구름', info: '대상 주변 모두에게 피해를 주고 4초 느리게 함' },
    bark: { name: '나무껍질', info: '나와 곁의 동료가 10초 동안 받는 피해 −35%' },
  },
  gearSlots: { weapon: '무기', armor: '갑옷', ring: '반지', amulet: '목걸이', charm: '부적' },
  rarities: { common: '평범한', uncommon: '쓸 만한', rare: '희귀한', epic: '빛나는' },
  buildStats: { pow: '힘', vit: '체력', luck: '행운' },
  dungeons: {},
  dailies: { kill20: '몬스터 20마리 잡기', defend1: '물결 하나 막아 내기' },
  places: { well: '우물 곁' },
  nameA: ['든든한', '부지런한', '날랜', '졸린', '씩씩한', '조용한'],
  nameB: ['담지기', '물지기', '나무꾼', '돌쇠', '파수', '길손'],
};

/** 초를 '1:05'처럼 */
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export const koGame = {
  ui: {
    title: '돌담 마을',
    intro: '돌담으로 두른 마을의 우물을 지킵니다. 몇 분마다 들에서 적이 물결로 몰려옵니다. 함께 막아 내고, 물결 사이에는 우물을 고치세요.',
    classHint: '직업은 나중에 우물 곁에서 바꿀 수 있습니다.',
    hint: keyHints(['땅 클릭/WASD: 이동', '몬스터 클릭: 공격', '1–3: 기술', 'Q: 약초차', 'R: 자동 사냥', 'H: 우물로', 'B: 가방', 'M: 메뉴', 'N: 지도', 'Tab: 대상', 'Enter: 대화']),
    mapLegend: '■ 우물 · 초록 상인',
    goingTown: '우물로 걸어갑니다.',
    bagPotions: '마실 것',
    well: '마을 우물',
    wellFar: '우물 곁에서 고치거나 되살릴 수 있습니다.',
    wellHelp: '물결 사이에 우물 곁에서 골드로 내구를 채웁니다. 무너지면 잠시 뒤 절반으로 되살아나거나, 골드를 내어 바로 되살립니다.',
    phaseBroken: '우물이 무너졌습니다. 되살아나기를 기다리거나 바로 되살리세요.',
  },
  fmt: {
    mmss,
    wellHp: (hp: number, max: number) => `내구 ${hp} / ${max}`,
    wellInfo: (hp: number, max: number, wave: number) => `내구 ${hp} / ${max} · 다음은 ${wave}번째 물결`,
    held: (n: number) => `내가 막아 낸 물결 ${n}`,
    nextWave: (wave: number) => `다음은 ${wave}번째 물결입니다. 물결마다 적이 많아지고 단단해집니다.`,
    clockNext: (wave: number, t: string) => `${wave}번째 물결까지 ${t}`,
    clockActive: (wave: number, foes: number, t: string) => `${wave}번째 물결 · 남은 적 ${foes} · ${t}`,
    clockBroken: (t: string) => `우물 무너짐 · 되살아나기까지 ${t}`,
    phaseIdle: (wave: number) => `물결 사이: 다음은 ${wave}번째`,
    phaseActive: (wave: number, foes: number) => `${wave}번째 물결과 싸우는 중 · 남은 적 ${foes}`,
    repairBtn: (gold: number, hp: number) => `고치기 (${gold}골드 → +${hp})`,
    restoreBtn: (gold: number) => `바로 되살리기 (${gold}골드)`,
    potions: (n: number) => `약초차 ${n}`,
  },
  msg: {
    waveSoon: (a) => `${a[1]}초 뒤 ${a[0]}번째 물결이 몰려옵니다! 우물로 모이세요.`,
    waveStart: (a) => `${a[0]}번째 물결이 왔습니다. 적 ${a[1]}`,
    waveWon: (a) => `${a[0]}번째 물결을 막아 냈습니다! (${a[1]}명이 함께 싸움)`,
    waveReward: (a) => `물결을 막은 몫: 골드 ${a[0]}, 경험치 ${a[1]}`,
    waveLost: (a) => `${a[0]}번째 물결에 우물이 무너졌습니다.`,
    gateRestored: (a) => (a[0] ? `${a[0]} 님이 우물을 되살렸습니다.` : '우물이 절반만큼 되살아났습니다.'),
    repaired: (a) => `우물을 고쳤습니다: 내구 +${a[0]} (골드 ${a[1]})`,
    repairFar: () => '우물 곁에서 할 수 있습니다.',
    repairBusy: () => '물결과 싸우는 동안에는 고칠 수 없습니다.',
    repairFull: () => '우물이 멀쩡합니다.',
    repairPoor: (a) => `골드가 모자랍니다 (${a[0]}골드).`,
    gateBroken: () => '우물이 무너졌습니다. 먼저 되살려야 합니다.',
    classFar: () => '직업은 우물 곁에서 바꿀 수 있습니다.',
    noPotion: () => '약초차가 없습니다. 상인에게서 살 수 있습니다.',
  } satisfies Record<keyof MsgMap, (a: MsgArg[]) => string> & Partial<Record<MsgKey, (a: MsgArg[]) => string>>,
};

/** 이 게임이 언어 묶음에 더하는 것의 모양 */
export type GameLocale = typeof koGame;
