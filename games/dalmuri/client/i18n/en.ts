// English: the same shape as ko.ts (the reference language).
import { heroName } from '@engine/client/i18n/ko';
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
    essence: { name: 'Star Essence', info: 'From the Star Well. Trade it for hero shards in the Expedition tab' },
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

const rw = (gold: number, sparks: number, ess: number) => [gold ? `Gold ${gold.toLocaleString('en-US')}` : '', sparks ? `Moonstones ${sparks}` : '', ess ? `Star Essence ${ess}` : ''].filter(Boolean).join(' · ');

export const enGame: GameLocale = {
  ui: {
    title: 'Moonhalo Vanguard',
    intro: 'Lead your heroes across the drifting sky isles to gather the fallen moon shards.',
    classHint: '',
    hint: 'Battles are automatic · M: Menu (Heroes, Summon, Squad, Stages, Expedition) · N: Map · Enter: Chat',
    mapLegend: 'Center: you · red: monsters · light blue: heroes',
    heroAnvil: 'Anvil', heroReed: 'Reed', heroEmber: 'Ember', heroDew: 'Dew',
    heroStoneheart: 'Stoneheart', heroHawkeye: 'Hawkeye', heroFrostshot: 'Frostshot', heroSparkhand: 'Sparkhand', heroWillow: 'Willow',
    heroMoonshield: 'Moonshield', heroStarfall: 'Starfall', heroDawnsaint: 'Dawn Saint',
    roleGuardian: 'Guardian', roleRanger: 'Ranger', roleMystic: 'Mystic', roleHealer: 'Healer',
    bannerHalo: 'Moonhalo Summon', bannerFroststar: 'Froststar Summon',
    chapterMoss: 'Mosswood', chapterAsh: 'Ashen Gorge', chapterFrost: 'Frost Spire',
    tabExpedition: 'Expedition',
    expDungeons: 'Key dungeons',
    expDungeonsNote: 'Keys refill by 2 each day (up to 2). Buy 2 more per day with moonstones. Rewards arrive by mail.',
    expGo: 'Enter',
    expBuy: 'Buy key',
    expEssence: 'Star Essence → hero shards',
    expEssenceNote: 'Trade Star Essence for one bundle of shards of a hero you own (common 5 · rare 10 · legendary 25). Raise stars in the Heroes tab.',
    expUse: 'Trade',
    idleTitle: 'While your vanguard rested',
    idleClaim: 'Claim',
    idleLater: 'Later (keep in mail)',
  },
  fmt: {
    expNeedLv: (lv) => `from captain Lv ${lv}`,
    keyLine: (n, cap, bought, buyMax, cost) => `Keys ${n} / ${cap} · buy for ${cost} moonstones (${buyMax - bought} left today)`,
    essenceHave: (n) => `Star Essence: ${n}`,
    essenceRow: (lv, stars, shards, need) => `Lv ${lv} · ${stars}★ · shards ${shards} — ${need} essence`,
    idleBody: (min) => `Gathered by your vanguard over ${Math.floor(min / 60) ? `${Math.floor(min / 60)} h ` : ''}${min % 60} min`,
    idleReward: rw,
  },
  msg: {
    essenceUsed: (a) => `${heroName(a[0])}: +${a[1]} shards. Star Essence left: ${a[2]}`,
    essenceShort: (a) => `Not enough Star Essence (need ${a[0]}, have ${a[1]}). Get it in the Star Well.`,
    essenceNoHero: () => 'You can only use it on a hero you own.',
  },
};
