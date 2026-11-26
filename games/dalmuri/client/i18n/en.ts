// English: the same shape as ko.ts (the reference language).
import { withIdNames } from '@engine/client/i18n/names';
import type { GameLocale } from './ko';

export const enNames = withIdNames({
  monsters: {
    mossling: 'Mossling', thornwolf: 'Thorn Wolf', sporecaster: 'Sporecaster', mossking: 'Moss King', elderroot: 'Elder Root',
    cinderimp: 'Cinder Imp', ashhound: 'Ash Hound', slinger: 'Ember Slinger', magmabrute: 'Magma Brute', ashwyrm: 'Ash Wyrm',
    frostwisp: 'Frost Wisp', icewarden: 'Ice Warden', shardarcher: 'Shard Archer', frostgiant: 'Frost Giant', moonlich: 'Moonshadow Lord',
    goldbeetle: 'Gold Beetle', vaultgolem: 'Vault Golem', wellsprite: 'Well Sprite', wellguardian: 'Wellkeeper',
  },
  items: {
    moonblade: { name: 'Moon Blade', info: "The captain's blade" },
    essence: { name: 'Star Essence', info: 'From the Star Well and idle rewards. Trade it for shards of a hero you own in the Heroes tab' },
    starchart: { name: 'Star Chart', info: "Raises a hero's skill level" },
    moonshard: { name: 'Moon Shard', info: 'Awakens a 6★ hero' },
    starsteel: { name: 'Starsteel', info: 'Enhances hero gear' },
    sweepticket: { name: 'Sweep Ticket', info: 'Clears a beaten stage once without fighting' },
    herochoice: { name: 'Legend Selector', info: 'Pick one of the three legendary heroes' },
  },
  classes: { captain: { name: 'Captain', info: 'Leads the heroes in search of the fallen moon shards.' } },
  skills: {
    cleave: { name: 'Cleave', info: 'Heavy hit on the foe ahead' },
    quake: { name: 'Quake', info: 'Hits and slows every foe around you' },
    banner: { name: 'Halo Banner', info: 'Nearby allies hit 30% harder for 7 s' },
    bulwark: { name: 'Shield Shove', info: 'Hits and stuns' },
    pierce: { name: 'Piercing Shot', info: 'Heavy hit from afar' },
    starfall: { name: 'Starfall', info: 'Hits every foe around the target' },
    moonlight: { name: 'Moonlight', info: 'Heals nearby allies' },
  },
  dungeons: {
    goldvein: { name: 'Gold Vein', info: 'Beat the gold beetles and the Vault Golem for lots of gold (one key).' },
    starwell: { name: 'Star Well', info: 'Beat the Wellkeeper for Star Essence to grow heroes (one key).' },
  },
  dailies: { hunt: 'Defeat 120 monsters', clears: 'Clear 15 stages', keyrun: 'Clear 2 key dungeons' },
  places: { stage: 'the stage', '': 'the camp' },
  currency1: { name: 'Gold', unit: 'gold' },
  currency2: { name: 'Moonstones', one: 'moonstone' },
  nameA: ['Blue', 'Quiet', 'Swift', 'Steady', 'Bright', 'Farwalking'],
  nameB: ['Captain', 'Pathfinder', 'Moonkeeper', 'Starhunter', 'Cloudstep'],
});

export const enGame: GameLocale = {
  ui: {
    title: 'Moonhalo Vanguard',
    intro: 'Lead your heroes across the drifting sky isles to gather the fallen moon shards.',
    classHint: '',
    hint: 'Battles are automatic · M: Menu (heroes, summons, stages …) · N: Map · Enter: Chat',
    mapLegend: 'Center: you · red: monsters · light blue: heroes',
    heroAnvil: 'Anvil', heroReed: 'Reed', heroEmber: 'Ember', heroDew: 'Dew',
    heroStoneheart: 'Stoneheart', heroHawkeye: 'Hawkeye', heroFrostshot: 'Frostshot', heroSparkhand: 'Sparkhand', heroWillow: 'Willow',
    heroMoonshield: 'Moonshield', heroStarfall: 'Starfall', heroDawnsaint: 'Dawn Saint',
    roleGuardian: 'Guardian', roleRanger: 'Ranger', roleMystic: 'Mystic', roleHealer: 'Healer',
    bannerHalo: 'Moonhalo Summon', bannerFroststar: 'Froststar Summon',
    chapterMoss: 'Mosswood', chapterAsh: 'Ashen Gorge', chapterFrost: 'Frost Spire',
    bannerEclipseMoon: 'Eclipse Summon: Moonshield', bannerEclipseStar: 'Eclipse Summon: Starfall', bannerEclipseDawn: 'Eclipse Summon: Dawn Saint',
    hgSlotWeapon: 'Weapon', hgSlotArmor: 'Armor', hgSlotCharm: 'Charm',
    hgIronedge: 'Iron Edge', hgQuiltcoat: 'Quilted Coat', hgPebblecharm: 'Pebble Charm',
    hgLunarblade: 'Lunar Blade', hgLunarmail: 'Lunar Mail', hgLunarcharm: 'Lunar Bell',
    hgAstralstaff: 'Astral Staff', hgAstralrobe: 'Astral Robe', hgAstralcharm: 'Astral Astrolabe',
    hgEclipseblade: 'Eclipse Blade',
    setLunar: 'Lunar', setAstral: 'Astral',
    synSun: 'Oath of the Sun', synMoon: 'Moon Ward', synStar: 'Star Guidance',
    passiveMoonveil: 'Moonveil', passiveFullmoon: 'Full Moon',
    tabExpedition: 'Expedition',
    expDungeons: 'Key dungeons',
    expDungeonsNote: 'Keys refill by 2 each day (up to 2). Buy 2 more per day with moonstones. Inside, your captain fights automatically and returns to the stage afterwards. Rewards arrive by mail; sweep them in the Stages tab.',
    expGo: 'Enter',
    expBuy: 'Buy key',
  },
  fmt: {
    expNeedLv: (lv) => `from captain Lv ${lv}`,
    keyLine: (n, cap, bought, buyMax, cost) => `Keys ${n} / ${cap} · buy for ${cost} moonstones (${buyMax - bought} left today)`,
  },
  msg: {},
};
