// English. Must have the same shape as ko.ts (ContentNames and GameLocale enforce it).
import { keyHints } from '@engine/client/i18n/ko';
import type { ContentNames } from '@engine/client/i18n/names';
import type { GameLocale } from './ko';

export const enNames: ContentNames = {
  monsters: { sludge: 'Mudling', burrower: 'Burrow Rat', spitter: 'Needle Toad', brute: 'Stoneback' },
  items: {
    blade1: { name: 'Worn Sword', staff: 'Oak Staff', info: 'Starting weapon' },
    blade2: { name: 'Wallkeeper Sword', staff: 'Willow Staff' },
    vest: { name: 'Quilted Vest' },
    tea: { name: 'Herb Tea' },
  },
  classes: {
    warden: { name: 'Warden', info: 'Holds the gate with a sword. More health; rallies nearby allies.' },
    herbalist: { name: 'Herbalist', info: 'Shoots thorns from afar and slows foes with spores. Wraps allies in bark.' },
  },
  skills: {
    bash: { name: 'Shield Bash', info: 'Heavy damage to the target and a 1.5 s stun' },
    quake: { name: 'Stomp', info: 'Damages and slows everything around you' },
    rally: { name: 'War Cry', info: 'You and nearby allies deal +40% damage for 8 s' },
    needle: { name: 'Thorn Shot', info: 'Heavy damage to a distant target' },
    spore: { name: 'Spore Cloud', info: 'Damages everything around the target and slows it for 4 s' },
    bark: { name: 'Barkskin', info: 'You and nearby allies take 35% less damage for 10 s' },
  },
  gearSlots: { weapon: 'Weapon', armor: 'Armor', ring: 'Ring', amulet: 'Necklace', charm: 'Charm' },
  rarities: { common: 'Plain', uncommon: 'Fine', rare: 'Rare', epic: 'Radiant' },
  buildStats: { pow: 'Might', vit: 'Vigor', luck: 'Luck' },
  dungeons: {},
  dailies: { kill20: 'Defeat 20 monsters', defend1: 'Hold back one wave' },
  places: { well: 'the well' },
  nameA: ['Steady', 'Busy', 'Swift', 'Sleepy', 'Bold', 'Quiet'],
  nameB: ['Warden', 'Waterer', 'Woodsman', 'Mason', 'Watch', 'Wanderer'],
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export const enGame: GameLocale = {
  ui: {
    title: 'Stonewall Village',
    intro: 'Guard the well of a village ringed by a stone wall. Every few minutes foes pour in from the fields in waves. Hold them back together and repair the well between waves.',
    classHint: 'You can change class later beside the well.',
    hint: keyHints(['Click/WASD: move', 'Click a monster: attack', '1–3: skills', 'Q: herb tea', 'R: auto-hunt', 'H: to the well', 'B: bag', 'M: menu', 'N: map', 'Tab: target', 'Enter: chat']),
    mapLegend: '■ Well · green: merchant',
    goingTown: 'Walking to the well.',
    bagPotions: 'Drinks',
    well: 'Village Well',
    wellFar: 'Repair or restore it beside the well.',
    wellHelp: 'Between waves, spend gold beside the well to repair it. If it falls, it comes back at half after a while, or pay gold to restore it at once.',
    phaseBroken: 'The well has fallen. Wait for it to recover or restore it now.',
  },
  fmt: {
    mmss,
    wellHp: (hp, max) => `Integrity ${hp} / ${max}`,
    wellInfo: (hp, max, wave) => `Integrity ${hp} / ${max} · next: wave ${wave}`,
    held: (n) => `Waves you held: ${n}`,
    nextWave: (wave) => `Next is wave ${wave}. Each wave brings more and tougher foes.`,
    clockNext: (wave, t) => `Wave ${wave} in ${t}`,
    clockActive: (wave, foes, t) => `Wave ${wave} · ${foes} foes left · ${t}`,
    clockBroken: (t) => `Well fallen · recovers in ${t}`,
    phaseIdle: (wave) => `Between waves: wave ${wave} is next`,
    phaseActive: (wave, foes) => `Fighting wave ${wave} · ${foes} foes left`,
    repairBtn: (gold, hp) => `Repair (${gold} gold → +${hp})`,
    restoreBtn: (gold) => `Restore now (${gold} gold)`,
    potions: (n) => `Tea ${n}`,
  },
  msg: {
    waveSoon: (a) => `Wave ${a[0]} arrives in ${a[1]} s! Gather at the well.`,
    waveStart: (a) => `Wave ${a[0]} is here. ${a[1]} foes`,
    waveWon: (a) => `Wave ${a[0]} held! (${a[1]} defenders)`,
    waveReward: (a) => `Your share for holding the wave: ${a[0]} gold, ${a[1]} EXP`,
    waveLost: (a) => `The well fell to wave ${a[0]}.`,
    gateRestored: (a) => (a[0] ? `${a[0]} restored the well.` : 'The well recovered to half.'),
    repaired: (a) => `You repaired the well: +${a[0]} integrity (${a[1]} gold)`,
    repairFar: () => 'Do this beside the well.',
    repairBusy: () => 'You cannot repair during a wave.',
    repairFull: () => 'The well is in good shape.',
    repairPoor: (a) => `Not enough gold (${a[0]} gold).`,
    gateBroken: () => 'The well has fallen. Restore it first.',
    classFar: () => 'You can change class beside the well.',
    noPotion: () => 'No herb tea. The merchant sells it.',
  },
};
