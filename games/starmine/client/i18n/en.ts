// English. Must have the same shape as ko.ts (ContentNames and GameLocale enforce it).
import { keyHints } from '@engine/client/i18n/ko';
import type { ContentNames } from '@engine/client/i18n/names';
import type { GameLocale } from './ko';

export const enNames: ContentNames = {
  monsters: { snail: 'Crystal Snail', bat: 'Hollow Bat', pebble: 'Pebble Sprite', golem: 'Boulder Golem' },
  items: {
    pick1: { name: 'Worn Pick', staff: 'Birch Staff', info: 'Starting weapon' },
    pick2: { name: 'Stariron Pick', staff: 'Stariron Staff' },
    apron: { name: 'Leather Apron' },
    tea: { name: 'Moss Tea' },
  },
  classes: {
    miner: { name: 'Miner', info: 'Fights up close with a pick. Sturdy, with more health.' },
    seer: { name: 'Star Seer', info: 'Drops starlight from afar. Damage over time and healing.' },
  },
  skills: {
    smash: { name: 'Pick Smash', info: 'Heavy damage to the target and a 1 s stun' },
    tunnel: { name: 'Tunnel Rush', info: 'Burrow up to the target in a flash and hit it' },
    stoneskin: { name: 'Stoneskin', info: 'Take 35% less damage for 8 s' },
    starfall: { name: 'Starfall', info: 'Damages and slows everything around the target' },
    dust: { name: 'Stardust Blight', info: 'Damage over 5 s to everything around the target' },
    mend: { name: 'Starlight Mend', info: 'Restore health' },
  },
  gearSlots: { weapon: 'Weapon', armor: 'Armor', ring: 'Ring', amulet: 'Necklace', charm: 'Charm' },
  rarities: { common: 'Plain', uncommon: 'Fine', rare: 'Rare', epic: 'Radiant' },
  buildStats: { pow: 'Might', vit: 'Vigor', luck: 'Luck' },
  dungeons: {},
  dailies: { kill20: 'Defeat 20 monsters', collect3: 'Collect stardust from the drill 3 times' },
  places: { mine: 'the mine entrance' },
  currency2: { name: 'Stardust', one: 'stardust' },
  nameA: ['Shiny', 'Sleepy', 'Sturdy', 'Careful', 'Easy', 'Brave'],
  nameB: ['Mole', 'Digger', 'Tit', 'Badger', 'Otter', 'Guide'],
};

export const enGame: GameLocale = {
  ui: {
    title: 'Stardust Mine',
    intro: 'A valley where fallen stardust lies buried. Your hero hunts on its own; you upgrade the drill and engravings to grow stronger faster.',
    classHint: 'You can change class later. Auto-hunt is on from the start.',
    hint: keyHints(['Click/WASD: move', 'Click a monster: attack', '1–3: skills', 'Q: tea', 'G: collect stardust', 'R: auto-hunt', 'H: to the mine', 'B: bag', 'M: menu', 'N: map', 'Tab: target', 'Enter: chat']),
    mapLegend: '■ Mine entrance · green: merchant',
    goingTown: 'Walking to the mine entrance.',
    bagPotions: 'Drinks',
    drill: 'Star Drill',
    drillNone: 'No drill yet. Build one with gold and stardust piles up by itself.',
    drillTake: 'Collect[[ (G)|]]',
    drillMaxed: 'The drill is at its highest level',
    engraveMaxed: 'The engraving is at its highest level',
    mine: 'Mine Entrance',
    mineInfo: 'Where the Star Drill stands. You get back up here when you fall.',
    deepVein: 'Deep Vein',
  },
  fmt: {
    drillLv: (lv) => (lv > 0 ? `Lv ${lv}` : 'none'),
    drillRate: (rate) => `${rate} stardust/min · even while away`,
    drillStash: (n, cap) => `Store ${n} / ${cap}`,
    drillBuild: (cost) => `Build · ${cost} gold`,
    drillUpBtn: (cost, next) => `Upgrade ${cost} gold → ${next}/min`,
    engraveBtn: (lv, cost) => `Engrave Lv ${lv} → ${lv + 1} · ${cost} stardust`,
    engraveNote: (pct) => `Star engraving: +${pct}% damage dealt`,
    potions: (n) => `Tea ${n}`,
  },
  msg: {
    drillUp: (a) => (a[0] === 1 ? 'You built the Star Drill. Stardust now piles up by itself.' : `The drill is now Lv ${a[0]}.`),
    drillPoor: (a) => `Not enough gold (${a[0]} needed).`,
    drillMax: () => 'The drill is already at its highest level.',
    drillTook: (a) => `You collected ${a[0]} stardust.`,
    drillEmpty: () => 'The store is empty.',
    drillAway: (a) => `While you were gone (${a[1]} min) the drill dug ${a[0]} stardust.`,
    engraveUp: (a) => `Star engraving Lv ${a[0]}: your damage went up.`,
    engravePoor: (a) => `Not enough stardust (${a[0]} needed).`,
    engraveMax: () => 'The engraving is already at its highest level.',
    noPotion: () => 'No tea. The merchant sells it.',
  },
};
