// English, this game's share (Lamp Tower). Must have the same shape as ko.ts in this folder (GameLocale and ContentNames enforce it).
// 틀의 문장(client/src/i18n/en.ts의 enBase)과 합쳐 한 언어 묶음이 된다 (index.ts).
import type { ClassId, ItemId, MonsterId, QuestId, ResidentId } from '../../shared/defs';
import type { MsgArg } from '@engine/shared/messages';
import { count, num, signed } from '@engine/client/i18n/en';
import { keyHints } from '@engine/client/i18n/ko';
import { itemNameOf, type ContentNames } from '@engine/client/i18n/names';
import type { GameLocale } from './ko';

const monsters: Record<MonsterId, string> = { slime: 'Slime', wisp: 'Wisp', wolf: 'Wolf', shade_bram: "Bram's Shade", shade_mira: "Mira's Shade", boar: 'Boar', goblin: 'Goblin', lost_soldier: 'Lost Soldier', ash_troll: 'Ash Troll', crypt_lord: 'Lord of the Crypt' };
const residents: Record<ResidentId, { name: string; bonus: string }> = {
  bram: { name: 'Bram the Smith', bonus: 'The shop stocks the Lamp Sword, and the forge opens' },
  mira: { name: 'Mira the Herbalist', bonus: 'The shop stocks Strong Potions' },
  halmeom: { name: 'Granny the Lampwarden', bonus: "Today's keepers are listed at the tower, and each contribution tier pays a reward" },
};
const classes: Record<ClassId, { name: string; info: string }> = {
  warrior: { name: 'Warrior', info: 'Fights up close. More health.' },
  archer: { name: 'Archer', info: 'Shoots from afar. Less health.' },
  mage: { name: 'Mage', info: 'Casts from afar. Slows foes and heals those nearby. Least health.' },
};
const items: Record<ItemId, { name: string; info?: string; bow?: string; staff?: string }> = {
  sword1: { name: 'Worn Sword', bow: 'Worn Bow', staff: 'Worn Staff', info: 'Starting weapon' },
  sword2: { name: 'Iron Sword', bow: 'Sturdy Bow', staff: 'Sturdy Staff' },
  sword3: { name: 'Lamp Sword', bow: 'Lamp Bow', staff: 'Lamp Staff' },
  sword4: { name: 'Ember Sword', bow: 'Ember Bow', staff: 'Ember Staff' },
  armor1: { name: 'Leather Armor' },
  armor2: { name: 'Iron Armor' },
  hide: { name: 'Tough Hide', info: 'Material dropped by boars' },
  iron: { name: 'Iron Scrap', info: 'Material dropped by goblins and lost soldiers' },
  ashcore: { name: 'Ash Core', info: 'Material dropped by the Ash Troll' },
  potion: { name: 'Potion' },
  tonic: { name: 'Strong Potion' },
};
const itemName = itemNameOf(items);
const towers: Record<string, string> = { first: 'Firstlight Village Tower', ash: 'Ashwood Tower', crypt: 'the crypt entrance' };
const dungeons = {
  crypt: { name: 'The Ash Crypt', info: 'Fight through goblins and lost soldiers and bring down the Lord of the Crypt. Better with a party.' },
};
const towerName = (id: MsgArg) => towers[String(id)] ?? String(id);
const questTitles: Record<QuestId, string> = { bram: 'Chapter 1 · The Sound of a Hammer', mira: 'Chapter 2 · The Withered Herb Field', ashwood: 'Chapter 3 · A Lamp for the Ashwood', halmeom: "Chapter 4 · The Keeper's Night" };
const zones: readonly string[] = ['Lampfield', 'The Ashwood'];
const stages: readonly [string, string, string] = ['Dim', 'Steady', 'Bright'];
const dailies = { kill30: 'Defeat 30 monsters', offer10: 'Offer 10 sparks', enhance1: 'Enhance gear once' };

/** Content names the engine's sentences use (passed to enBase) */
export const enNames: ContentNames = {
  monsters,
  items,
  classes,
  skills: {
    smash: { name: 'Smash', info: 'Heavy damage to your target' },
    whirl: { name: 'Whirl', info: 'Damage to everything around you' },
    breath: { name: 'Breather', info: 'Recover health' },
    aimed: { name: 'Aimed Shot', info: 'Heavy damage to a distant target' },
    volley: { name: 'Volley', info: 'Damage to everything around your target' },
    bolt: { name: 'Firebolt', info: 'Heavy damage to a distant target' },
    frost: { name: 'Frost', info: 'Damages and slows everything around your target' },
    mend: { name: 'Mend', info: 'Heals you and those nearby' },
  },
  dungeons,
  dailies,
  places: towers,
  /** 1 spark, 2 sparks */
  currency2: { name: 'Sparks', one: 'spark' },
  nameA: ['Sleepy', 'Brave', 'Calm', 'Shy', 'Bold', 'Hungry', 'Bright', 'Quiet', 'Odd', 'Kind'],
  nameB: ['Lamp', 'Owl', 'Fox', 'Acorn', 'Hedgehog', 'Rover', 'Pinecone', 'Frog', 'Firefly', 'Squirrel'],
};

export const enGame: GameLocale = {
  ui: {
    title: 'Lamp Tower',
    hint: keyHints(['Click or WASD: move', 'Click a monster: attack', '1–3: skills', 'Q: potion', 'F: quest', 'R: auto-hunt', 'H: town', 'B: bag', 'M: menu', 'Tab: target', 'Enter: chat']),
    toTown: 'To town',
    mapLegend: '■ tower · ○ quest · green merchant',
    goingTown: 'Walking back to Firstlight Village.',
    questNeedSparks: 'You have no sparks to offer. Defeat monsters to gather some.',
    tower: 'Lamp tower',
    offerVerb: 'Offer',
    helpVerb: 'Give',
    count1: '1',
    count5: '5',
    countAll: 'All',
    residents: 'Residents',
    allReturned: 'Everyone has returned',
    forge: "Bram's Forge",
    towerDark: 'The lamp is out. Once everyone offers sparks to light it, you will rise here when you fall in these woods.',
    keepersToday: "Today's keepers",
    keepersEmpty: 'No one yet. Offer sparks or hold off a raid to be listed.',
    quest: 'Quest',
    questGo: '[[Click to walk there (F)|Tap to walk there]]',
    intro: 'In a land lost to mist, you keep the lamp towers lit. Hunt monsters for sparks and offer them at the tower to light the village.',
    classHint: 'You can change class later at a lamp tower.',
    towerOff: 'Unlit',
    zoneDark: 'The lamp tower here is unlit. Monsters are strong and attack on sight. If you fall, you rise in Firstlight Village.',
    offerNote: 'Lights the tower. A brighter tower holds out longer in a raid.',
    questAllDone: 'You have finished the story so far.',
  },
  residents,
  towers,
  stages,
  zones,
  quests: {
    bram: {
      title: questTitles.bram,
      steps: [
        'Hunt slimes in the western field to gather sparks',
        'Offer a spark at the lamp tower in the village',
        'Find the old forge beyond the western woods',
        "Defeat Bram's Shade, lost to the mist",
        'Offer sparks at the lamp tower to grow the village light',
      ],
    },
    mira: {
      title: questTitles.mira,
      steps: [
        'Buy a potion from the road merchant in the village',
        'Hunt wisps in the southern woods',
        'Find the old herb field east of the pond',
        "Defeat Mira's Shade, lost to the mist",
        'Offer sparks at the lamp tower to grow the village light',
      ],
    },
    ashwood: {
      title: questTitles.ashwood,
      steps: [
        'Follow the east road to the unlit lamp tower in the Ashwood',
        'Offer sparks at the Ashwood tower to light it',
        'Hunt boars in the north of the Ashwood',
        'Drive off the goblin pack in the south of the Ashwood',
        'Defeat the Ash Troll at the far east of the woods. Bring others if you can',
      ],
    },
    halmeom: {
      title: questTitles.halmeom,
      steps: [
        'Offer sparks at the Firstlight Village tower. Granny has kept this flame all her life',
        'Defeat lost soldiers in the east of the Ashwood. They were keepers once, before the mist took them',
        'Help hold off a mist raid at the village tower. Raids come on the hour at noon, 3, 6 and 8 to 11 pm',
      ],
    },
  },
  fmt: {
    sparks: (n) => `Sparks ${n}`,
    contrib: (n) => `Contribution ${n}`,
    towerMini: (stage, glow) => `Tower: ${stages[stage]} ${glow}`,
    glow: (stage, glow, max) => `${stages[stage]} · ${glow} / ${max}`,
    stageNote: (stage, bright, speedPct, regen) => ['The light is weak. No bonuses.', `At ${bright} it turns bright: +${speedPct}% move speed, ${regen}x recovery`, `Bright: +${speedPct}% move speed, ${regen}x recovery`][stage],
    nextResident: (name) => `Bring back: ${name}`,
    whenBack: (bonus) => `On return: ${bonus}`,
    raidNext: (time, tomorrow, perDay) => `Next raid ${tomorrow ? 'tomorrow ' : ''}${time} · ${perDay} a day`,
    raidSoon: (sec) => `Mist is closing on Firstlight Village · in ${sec}s`,
    raidActive: (foes, time) => `Raid on Firstlight Village · ${foes} left · ${time}`,
    raidFoe: (name) => `Mist ${name}`,
    towerHp: (hp, max) => `Tower HP ${hp} / ${max}`,
    questProgress: (n, of) => `${n} / ${of}`,
    rested: (n) => `Rested ${n}`,
    tier: (tier, next) => (next === null ? `Tier ${tier} (max)` : `Tier ${tier} · next at ${next}`),
    keeper: (name, n) => `${name} ${n}`,
    residentHint: (name, left) => `${name} has not returned yet. Add sparks at the lamp tower to bring them back (${left} to go).`,
    needsResident: (name) => `In stock once ${name} returns`,
  },
  msg: {
    offerFar: () => 'Move closer to the lamp tower to offer sparks.',
    noSparks: () => 'You have no sparks.',
    towerFull: () => 'The lamp tower is already at its brightest.',
    noResident: () => 'There is no one left to bring back.',
    offered: (a) => (a[2] === 'resident' ? `Gave ${count(a[0], 'spark')} toward bringing a resident back.` : `Offered ${count(a[0], 'spark')} to the tower.`) + ` (${a[1]} in total)`,
    stageChanged: (a) => `${towerName(a[1])}'s light changed: ${stages[Number(a[0])]}`,
    towerLit: (a) => `${towerName(a[0])} is lit. You can now rise there when you fall.`,
    residentBack: (a) => { const r = residents[a[0] as ResidentId]; return r ? `${r.name} has returned to the village. ${r.bonus}` : String(a[0]); },
    raidSoon: (a) => `Mist is closing on Firstlight Village. Gather at the village tower in ${a[0]}s.`,
    raidStart: (a) => `A raid on Firstlight Village has begun. ${a[0]} foes marked "Mist" are heading for the tower.`,
    raidWon: (a) => `The raid was held off. Village tower light ${signed(a[0])}`,
    raidLost: (a) => (Number(a[0]) === 0 ? 'The lamp tower fell. Its light could not drop any lower.' : `The lamp tower fell. Village tower light ${signed(a[0])}`),
    raidReward: (a) => `Raid reward: +${count(a[0], 'spark')}, +${a[1]} exp`,
    questStep: (a) => `Quest step complete. +${a[0]} exp${Number(a[1]) > 0 ? `, +${count(a[1], 'spark')}` : ''}`,
    classFar: () => 'Move closer to the lamp tower to change class.',
    bossUp: (a) => `${monsters[a[0] as MonsterId] ?? a[0]} has appeared deep in the Ashwood.`,
    tierUp: (a) => `You reached contribution tier ${a[0]}. Granny hands you ${num(a[1])} gold.`,
    loot: (a) => `Picked up ${itemName(a[0])}. Bram can use it at the forge.`,
    forgeFar: () => 'Move closer to Bram the smith to forge.',
    forgeClosed: () => 'Bram the smith has not returned yet.',
    raidElsewhere: (a) => `No Mist foes in this channel. Some remain in channel ${a[0]}. Switch there to help hold the tower.`,
    raidAbandoned: (a) => `No one held channel ${a[0]}, so the foes there struck the tower and went back into the Mist.`,
    rested: (a) => `Your lamp gathered light at the tower while you were away. Rested bonus ${a[0]} (double exp from kills)`,
    questDone: (a) => `You finished "${questTitles[a[0] as QuestId] ?? a[0]}".`,
  },
};
