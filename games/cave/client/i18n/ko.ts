// 한국어: 버섯 동굴의 이름표와 문장
import type { MsgMap } from '@engine/shared/ext';
import type { MsgArg, MsgKey } from '@engine/shared';
import { keyHints } from '@engine/client/i18n/ko';
import type { ContentNames } from '@engine/client/i18n/names';

export const koNames: ContentNames = {
  monsters: { sporeling: '포자돌이', puffcap: '뻥버섯', lurker: '숨은갓', mycelord: '균사왕' },
  items: {
    pick1: { name: '낡은 곡괭이', staff: '이끼 지팡이', info: '기본 무기' },
    pick2: { name: '단단한 곡괭이', staff: '빛이끼 지팡이' },
    cap: { name: '버섯갓 투구' },
    broth: { name: '버섯 수프' },
    spore: { name: '빛포자', info: '뻥버섯이 떨어뜨립니다' },
  },
  classes: {
    digger: { name: '굴꾼', info: '곡괭이로 가까이 붙어 싸웁니다. 체력이 많습니다.' },
    glimmer: { name: '빛술사', info: '멀리서 빛을 쏩니다. 체력이 적습니다.' },
  },
  skills: {
    smash: { name: '내려치기', info: '큰 피해와 1초 기절' },
    quake: { name: '땅 울림', info: '주변 모두에게 피해' },
    glowshot: { name: '빛살', info: '멀리 있는 대상에게 큰 피해' },
    sporecloud: { name: '포자 구름', info: '대상 둘레에 5초 동안 지속 피해' },
    mend: { name: '숨 돌리기', info: '체력 회복' },
  },
  gearSlots: { weapon: '무기', armor: '갑옷', ring: '반지', amulet: '목걸이', charm: '부적' },
  rarities: { common: '평범한', uncommon: '쓸 만한', rare: '희귀한', epic: '빛나는' },
  buildStats: { pow: '힘', vit: '체력', luck: '행운' },
  dungeons: { deep: { name: '깊은 굴', info: '균사왕이 사는 굴 안쪽' } },
  dailies: { kill15: '몬스터 15마리 잡기' },
  places: { camp: '야영 불빛' },
  nameA: ['축축한', '반짝이는', '느린', '졸린'],
  nameB: ['두더지', '박쥐', '달팽이', '굴꾼'],
};

export const koGame = {
  ui: {
    title: '버섯 동굴',
    intro: '빛나는 버섯이 자라는 동굴을 탐험합니다. 포자를 모으고 깊은 굴의 균사왕을 쓰러뜨리세요.',
    classHint: '직업은 나중에 야영 불빛 곁에서 바꿀 수 있습니다.',
    hint: keyHints(['땅 클릭/WASD: 이동', '몬스터 클릭: 공격', '1–3: 기술', 'Q: 수프', 'G: 균사왕에게', 'R: 자동 사냥', 'H: 야영지로', 'B: 가방', 'M: 메뉴', 'N: 지도', 'Tab: 대상', 'Enter: 대화']),
    mapLegend: '■ 야영 불빛 · 초록 상인',
    goingTown: '야영 불빛으로 걸어갑니다.',
    camp: '야영 불빛',
    campInfo: '쓰러지면 여기서 다시 일어납니다.',
    goBoss: '균사왕에게[[ (G)|]]',
    bossSpot: '균사왕의 자리',
  },
  fmt: {
    potions: (n: number) => `수프 ${n}`,
  },
  msg: {
    noPotion: () => '수프가 없습니다. 상인에게서 살 수 있습니다.',
    classFar: () => '직업은 야영 불빛 곁에서 바꿀 수 있습니다.',
  } satisfies Record<keyof MsgMap, (a: MsgArg[]) => string> & Partial<Record<MsgKey, (a: MsgArg[]) => string>>,
};

export type GameLocale = typeof koGame;
