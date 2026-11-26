// 영웅 들판의 화면: 수집형·방치형 모듈(영웅, 뽑기, 편성, 단계)과 열쇠 던전이 화면에 무엇을 갖는지 보는 본보기.
// 이 '게임'이 하는 일은 언어 묶음(내용의 이름과 영웅·역할·배너·장의 이름 키)을 등록하고, 메뉴 탭의 차례를 고르는 것뿐이다. 나머지는 틀의 모듈이 붙인다.
import { enBase } from '@engine/client/i18n/en';
import { koBase } from '@engine/client/i18n/ko';
import { mergeLocale } from '@engine/client/i18n/merge';
import { withIdNames } from '@engine/client/i18n/names';
import { setLocales } from '@engine/client/i18n';
import { setMenuTabs, startClient } from '@engine/client';

const koNames = withIdNames({
  monsters: { slime: '풀슬라임', wolf: '들늑대', goblin: '고블린', archer: '고블린 궁수', ogre: '들판의 오우거', golem: '능선 골렘', coinbug: '동전벌레', hoarder: '금광 수전노' },
  items: { oakblade: { name: '참나무 검' } },
  classes: { captain: { name: '대장', info: '영웅들을 이끄는 대장입니다.' } },
  skills: { slash: { name: '베기', info: '' }, sweep: { name: '휩쓸기', info: '' }, rally: { name: '진군의 함성', info: '' }, shieldbash: { name: '방패 치기', info: '' }, volley: { name: '화살 비', info: '' }, blaze: { name: '불꽃', info: '' }, prayer: { name: '기도', info: '' } },
  dungeons: { goldmine: { name: '금광', info: '동전벌레를 잡고 수전노를 쓰러뜨리면 골드를 많이 받습니다.' } },
  places: { stage: '단계의 자리' },
  currency2: { name: '보석', one: 'gem' },
  nameA: ['용감한', '빠른', '든든한'], nameB: ['대장', '길잡이', '수호자'],
});
const enNames = withIdNames({
  monsters: { slime: 'Grass Slime', wolf: 'Field Wolf', goblin: 'Goblin', archer: 'Goblin Archer', ogre: 'Meadow Ogre', golem: 'Ridge Golem', coinbug: 'Coin Bug', hoarder: 'Mine Hoarder' },
  items: { oakblade: { name: 'Oak Blade' } },
  classes: { captain: { name: 'Captain', info: 'Leads the heroes.' } },
  skills: { slash: { name: 'Slash', info: '' }, sweep: { name: 'Sweep', info: '' }, rally: { name: 'Rally', info: '' }, shieldbash: { name: 'Shield Bash', info: '' }, volley: { name: 'Volley', info: '' }, blaze: { name: 'Blaze', info: '' }, prayer: { name: 'Prayer', info: '' } },
  dungeons: { goldmine: { name: 'Gold Mine', info: 'Beat the coin bugs and the hoarder for lots of gold.' } },
  places: { stage: 'the stage' },
  currency2: { name: 'Gems', one: 'gem' },
  nameA: ['Brave', 'Quick', 'Steady'], nameB: ['Captain', 'Guide', 'Warden'],
});
/** 이 '게임'의 이름 키: 영웅·역할·배너·장 (내용의 name 칸) */
const koUi = {
  title: '영웅 들판',
  heroIronwall: '철벽', heroSwiftarrow: '날쌘활', heroCinderwitch: '잿불 마녀', heroDawnpriest: '새벽 사제', heroStormblade: '폭풍검', heroStarseer: '별읽는이',
  roleGuard: '수호', roleBowman: '궁수', rolePyro: '불 마법', roleCleric: '치유',
  bannerDawn: '새벽의 부름', chapterMeadow: '풀밭', chapterRidge: '바람 능선',
};
const enUi = {
  title: 'Hero Heath',
  heroIronwall: 'Ironwall', heroSwiftarrow: 'Swiftarrow', heroCinderwitch: 'Cinder Witch', heroDawnpriest: 'Dawn Priest', heroStormblade: 'Stormblade', heroStarseer: 'Starseer',
  roleGuard: 'Guard', roleBowman: 'Bowman', rolePyro: 'Pyromancer', roleCleric: 'Cleric',
  bannerDawn: 'Call of Dawn', chapterMeadow: 'Meadow', chapterRidge: 'Windy Ridge',
};
setLocales([mergeLocale(koBase(koNames), { ui: koUi }), mergeLocale(enBase(enNames), { ui: enUi })]);
// 메뉴의 탭: 수집형의 넷을 앞에, 우편(방치 보상과 던전 보상) 뒤에
setMenuTabs(['heroes', 'gacha', 'squad', 'stages', 'mail']);
startClient({});
