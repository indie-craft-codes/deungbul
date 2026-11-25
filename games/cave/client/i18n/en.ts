// English for the Mushroom Cave. Same shape as ko.ts.
import { keyHints } from '@engine/client/i18n/ko';
import type { ContentNames } from '@engine/client/i18n/names';
import type { GameLocale } from './ko';

export const enNames: ContentNames = {
  monsters: { sporeling: 'Sporeling', puffcap: 'Puffcap', lurker: 'Lurkcap', mycelord: 'Mycelord' },
  items: {
    pick1: { name: 'Old Pick', staff: 'Moss Staff', info: 'Starting weapon' },
    pick2: { name: 'Sturdy Pick', staff: 'Glowmoss Staff' },
    cap: { name: 'Mushroom Helm' },
    broth: { name: 'Mushroom Broth' },
    spore: { name: 'Glowspore', info: 'Dropped by puffcaps' },
  },
  classes: {
    digger: { name: 'Digger', info: 'Fights up close with a pick. More health.' },
    glimmer: { name: 'Glimmer', info: 'Shoots light from afar. Less health.' },
  },
  skills: {
    smash: { name: 'Smash', info: 'Heavy damage and a 1 s stun' },
    quake: { name: 'Quake', info: 'Damage to everything around you' },
    glowshot: { name: 'Glowshot', info: 'Heavy damage to a distant target' },
    sporecloud: { name: 'Spore Cloud', info: 'Damage over 5 s around the target' },
    mend: { name: 'Breather', info: 'Restore health' },
  },
  gearSlots: { weapon: 'Weapon', armor: 'Armor', ring: 'Ring', amulet: 'Necklace', charm: 'Charm' },
  rarities: { common: 'Plain', uncommon: 'Fine', rare: 'Rare', epic: 'Radiant' },
  buildStats: { pow: 'Might', vit: 'Vigor', luck: 'Luck' },
  dungeons: { deep: { name: 'The Deep', info: 'The inner cave where the Mycelord lives' } },
  dailies: { kill15: 'Defeat 15 monsters' },
  places: { camp: 'the camp light' },
  nameA: ['Damp', 'Shiny', 'Slow', 'Sleepy'],
  nameB: ['Mole', 'Bat', 'Snail', 'Digger'],
};

export const enGame: GameLocale = {
  ui: {
    title: 'Mushroom Cave',
    intro: 'Explore a cave of glowing mushrooms. Gather spores and defeat the Mycelord in the Deep.',
    classHint: 'You can change class later beside the camp light.',
    hint: keyHints(['Click/WASD: move', 'Click a monster: attack', '1–3: skills', 'Q: broth', 'G: to the Mycelord', 'R: auto-hunt', 'H: to camp', 'B: bag', 'M: menu', 'N: map', 'Tab: target', 'Enter: chat']),
    mapLegend: '■ Camp light · green: merchant',
    goingTown: 'Walking to the camp light.',
    camp: 'Camp light',
    campInfo: 'You get back up here when you fall.',
    goBoss: 'To the Mycelord[[ (G)|]]',
    bossSpot: "the Mycelord's lair",
  },
  fmt: {
    potions: (n) => `Broth ${n}`,
  },
  msg: {
    noPotion: () => 'No broth. The merchant sells it.',
    classFar: () => 'You can change class beside the camp light.',
  },
};
