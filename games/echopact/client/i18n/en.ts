// English. Must have the same shape as ko.ts (ContentNames and GameLocale enforce it).
import { charName } from '@engine/shared/defs';
import { keyHints } from '@engine/client/i18n/ko';
import type { ContentNames } from '@engine/client/i18n/names';
import type { GameLocale } from './ko';

export const enNames: ContentNames = {
  monsters: { mossling: 'Mossling', thornboar: 'Thorn Boar', stonehorn: 'Stonehorn', wisp: 'Stray Echo', hollowkin: 'Hollowkin', shadeshot: 'Shade Archer', bellgolem: 'Belltower Golem', echowarden: 'Echo Warden' },
  items: {
    blade1: { name: 'Pactbinder Sword', bow: 'Pactbinder Bow', info: 'Starting weapon' },
    blade2: { name: 'Ringsteel Sword', bow: 'Ringsteel Bow' },
    jerkin: { name: 'Quilted Vest' },
    chain: { name: 'Chain Mail' },
    tonic: { name: 'Well Tonic' },
  },
  classes: {
    warden: { name: 'Warden', info: 'Fights up close with a sword. More health.' },
    seeker: { name: 'Seeker', info: 'Shoots from afar with a bow. Less health.' },
  },
  skills: {
    cleave: { name: 'Cleave', info: 'Heavy damage to the target' },
    whirl: { name: 'Whirlwind', info: 'Damage to everything around you' },
    brace: { name: 'Brace', info: 'Take less damage for a while' },
    pierce: { name: 'Pierce', info: 'Heavy damage to a distant target' },
    snare: { name: 'Snare Arrow', info: 'Damages and slows everything around the target' },
    mend: { name: 'Catch Breath', info: 'Restore health' },
    bash: { name: 'Shield Bash', info: 'Strikes and stuns for 1 s' },
    volley: { name: 'Volley', info: 'Rains arrows around the target' },
    flare: { name: 'Echo Flare', info: 'Burns the area around the target' },
    chant: { name: 'Healing Song', info: 'Heals nearby allies' },
    rally: { name: 'Dawn Cry', info: 'Nearby allies deal +25% damage (6 s)' },
  },
  gearSlots: { weapon: 'Weapon', armor: 'Armor', ring: 'Ring', amulet: 'Necklace', charm: 'Charm' },
  rarities: { common: 'Plain', uncommon: 'Fine', rare: 'Rare', epic: 'Radiant' },
  buildStats: { pow: 'Might', vit: 'Vigor', luck: 'Luck' },
  dungeons: {},
  dailies: {
    kill30: 'Defeat 30 monsters in the vale', stage5: 'Clear 5 stages', pull1: 'Summon once at the Echo Well', morph1: 'Take an echo\'s form once',
    kill2000: 'Defeat 2000 monsters', stage150: 'Clear 150 stages',
  },
  places: { stage: 'the stage', well: 'the Echo Well' },
  currency2: { name: 'Echo Shards', one: 'shard' },
  nameA: ['Wandering', 'Quiet', 'Bold', 'Sleepy', 'Bright', 'Easy'],
  nameB: ['Binder', 'Rover', 'Bellkeeper', 'Guide', 'Hunter', 'Warden'],
};

/** Echo names and bios in English (the character definitions are written in Korean: client/echoes.ts shows these instead) */
const charText: Readonly<Record<string, { name: string; bio: string }>> = {
  brindle: { name: 'Brindle Mossback', bio: 'An easygoing shield-bearer with moss on his back. A regular at first pacts.' },
  pell: { name: 'Pell Windgrain', bio: 'An archer who reads the valley wind. Talks faster than her arrows fly.' },
  tamsin: { name: 'Tamsin Wick', bio: 'A mystic carrying a candle that never goes out. Smells of smoke.' },
  oddo: { name: 'Oddo the Herbalist', bio: 'A healer with a pack full of herbs. Always brewing something.' },
  sorrel: { name: 'Sorrel Hornhelm', bio: 'A vanguard who inherited a horned helm. Never learned how to step back.' },
  wren: { name: 'Wren', bio: 'A scout in goggles. Loves shooting from rooftops.' },
  ilsa: { name: 'Ilsa Ringhalo', bio: 'A mystic with a ring of echoes floating overhead. Finds her way by bell sounds.' },
  murk: { name: 'Murk Fenwarden', bio: 'A bearded healer who washes wounds with marsh water. Few words, warm hands.' },
  aurelle: { name: 'Aurelle Dawncrown', bio: 'The echo of an old pactbinder in a crown of dawn. Allies grow stronger at her side.' },
  grimbell: { name: 'Grimbell Bellkeeper', bio: 'A giant warden who guarded a fallen bell tower alone. The bell on his back rings with every step.' },
};

export const enGame: GameLocale = {
  charText,
  ui: {
    title: 'Echo Pact',
    intro: 'You are a pactbinder of the Ringing Vale. Hunt in the fields, call the echoes of old heroes at the Echo Well, clear stages together, and take on their forms.',
    classHint: 'You can change class later beside the Echo Well.',
    hint: keyHints(['Click/WASD: move', 'Click a monster: attack', '1–3: skills', 'Q: tonic', 'R: auto-hunt', 'H: to the Echo Well', 'B: bag', 'M: menu (summon, squad, stages, morph)', 'N: map', 'Tab: target', 'Enter: chat']),
    mapLegend: '■ Echo Well · green: merchant',
    goingTown: 'Walking to the Echo Well.',
    roleVanguard: 'Vanguard', roleRanger: 'Ranger', roleMystic: 'Mystic', roleMender: 'Mender',
    bannerWell: 'Echo Well', chapterPath: 'Whispering Path', chapterRuins: 'Bell Ruins', chapterSpire: 'Echo Spire',
    tutPact: 'First steps of the pact',
    tutMove: '[[Click the ground (or use WASD)|Tap the ground]] to walk.',
    tutAttack: 'Tap a monster in the vale to attack it. Vale monsters drop Echo Shards.',
    tutMenu: 'Open the menu[[ (M)|]]. Summon, squad, stages and morph are all here.',
    tutStage: 'Try a stage from the Stages tab. Your squad of echoes fights with you, and first clears give plenty of Echo Shards.',
    tutPull: 'With 100 Echo Shards, call an echo from the Summon tab. All odds are public under \'Show odds\'.',
    tutMorph: 'Every echo you own is also a form you can take in the vale. Try it in the Morph tab: others see you in that form too.',
    setEchoTags: 'Show name tags',
  },
  fmt: {
    potions: (n) => `Tonic ${n}`,
  },
  msg: {
    charNew: (a) => `${charName(a[0])}: you can take this echo's form in the vale.`,
    classFar: () => 'You can change class beside the Echo Well.',
    noPotion: () => 'No tonic. The merchant sells it.',
  },
};
