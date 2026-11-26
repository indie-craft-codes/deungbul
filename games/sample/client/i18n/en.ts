// English. Must have the same shape as ko.ts (ContentNames and GameLocale enforce it).
import { keyHints } from '@engine/client/i18n/ko';
import type { ContentNames } from '@engine/client/i18n/names';
import type { GameLocale } from './ko';

export const enNames: ContentNames = {
  monsters: { rabbit: 'Hare', boar: 'Boar', bear: 'Brown Bear' },
  items: {
    axe1: { name: 'Hatchet', bow: 'Wooden Bow', info: 'Starting weapon' },
    axe2: { name: 'Felling Axe', bow: 'Hunting Bow' },
    coat: { name: 'Fur Coat' },
    scale: { name: 'Scale Vest' },
    stew: { name: 'Meat Stew' },
    log: { name: 'Firewood', info: 'Dropped by boars and bears. Feed it to the bonfire' },
  },
  classes: {
    woodcutter: { name: 'Woodcutter', info: 'Fights up close with an axe. More health.' },
    hunter: { name: 'Hunter', info: 'Shoots from afar. Less health.' },
  },
  skills: {
    chop: { name: 'Chop', info: 'Heavy damage to the target and a 1 s stun' },
    sweep: { name: 'Sweep', info: 'Damage to everything around you' },
    aim: { name: 'Aimed Shot', info: 'Heavy damage to a distant target' },
    snare: { name: 'Snare Arrow', info: 'Damages and slows everything around the target' },
    rest: { name: 'Catch Breath', info: 'Restore health' },
  },
  // 장비 칸, 등급, 능력치의 이름 (id는 내용의 GEAR_SLOTS, RARITIES, BUILD_STATS: 이 예제는 틀의 기본값을 그대로 쓴다)
  gearSlots: { weapon: 'Weapon', armor: 'Armor', ring: 'Ring', amulet: 'Necklace', charm: 'Charm' },
  rarities: { common: 'Plain', uncommon: 'Fine', rare: 'Rare', epic: 'Radiant' },
  buildStats: { pow: 'Might', vit: 'Vigor', luck: 'Luck' },
  dungeons: {},
  dailies: { kill20: 'Defeat 20 monsters', feed5: 'Feed 5 firewood to the bonfire' },
  places: { bonfire: 'the bonfire' },
  nameA: ['Sleepy', 'Brave', 'Calm', 'Hungry', 'Quiet', 'Jolly'],
  nameB: ['Raccoon', 'Owl', 'Fox', 'Squirrel', 'Badger', 'Rover'],
};

export const enGame: GameLocale = {
  ui: {
    title: 'Bonfire Hunting Ground',
    intro: 'You are a hunter at a forest camp. Hunt for firewood, feed the bonfire and warm up together.',
    classHint: 'You can change class later beside the bonfire.',
    hint: keyHints(['Click/WASD: move', 'Click a monster: attack', '1–3: skills', 'Q: stew', 'F: feed the fire', 'R: auto-hunt', 'H: to the bonfire', 'B: bag', 'M: menu', 'N: map', 'Tab: target', 'Enter: chat']),
    mapLegend: '■ Bonfire · green: merchant',
    goingTown: 'Walking to the bonfire.',
    bagMats: 'Materials',
    bagPotions: 'Food',
    bonfire: 'Bonfire',
    bonfireCold: 'The fire is out. Feed it firewood to bring it back.',
    bonfireWarm: 'Health recovers faster while you stay by the fire.',
    feedOne: 'Feed firewood[[ (F)|]]',
    feedAll: 'Feed all',
    // Tutorial and settings (client/tutorial.ts)
    tutBasics: 'Basics',
    tutMove: '[[Click the ground (or use WASD)|Tap the ground]] to walk.',
    tutAttack: 'Tap a beast to attack it.',
    tutMenu: 'Open the menu[[ (M)|]]. The Settings tab has sound and graphics options.',
    tutFire: 'Gather firewood and feed the bonfire: everyone beside it heals faster. Happy hunting!',
    setTags: 'Show name tags',
    // Terms and privacy (texts that LEGAL in shared/content points to. Examples only)
    legalTermsText: 'Terms of Service (example)\n\n1. This game is an example for the framework. Progress may be reset without notice.\n2. Offensive names and chat may be restricted.\n3. Do not play with automation programs.',
    legalPrivacyText: 'Privacy Policy (example)\n\nWhat we collect: a hash of a random token in this browser (save key), your character name and progress, your IP address (only for connection limits and bans, not stored), screen errors (with addresses and tokens removed).\nWhy: saving your progress, preventing abuse, fixing errors.\nYour rights: in Settings > My data you can download your data or request deletion. Deletion runs 7 days after the request.',
  },
  fmt: {
    heat: (heat, max) => `Warmth ${heat} / ${max}`,
    logs: (have, fed) => `Firewood ${have} · ${fed} fed so far`,
    logsMini: (have) => `Firewood ${have}`,
    potions: (n) => `Stew ${n}`,
  },
  msg: {
    fed: (a) => `You fed ${a[0]} firewood to the bonfire. Warmth ${a[1]}`,
    noLogs: () => 'No firewood. Boars and bears drop it.',
    bonfireFar: () => 'Get closer to the bonfire to feed it.',
    bonfireLit: (a) => `${a[0]} lit the bonfire. Health recovers faster beside it.`,
    loot: () => 'You picked up firewood. Feed it to the bonfire.',
    classFar: () => 'You can change class beside the bonfire.',
    noPotion: () => 'No stew. The merchant sells it.',
  },
};
