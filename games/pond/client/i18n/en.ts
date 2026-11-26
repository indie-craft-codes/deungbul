// Firefly Pond: English text (overrides the framework's room wording and adds this game's panel and notices)
import type { MsgArg } from '@engine/shared';
import { keyHints } from '@engine/client/i18n/ko';
import { withIdNames } from '@engine/client/i18n/names';
import type { GameLocale } from './ko';

const SPOT = ['A', 'B', 'C'];
const ORD = ['1st', '2nd', '3rd', '4th'];
export const enNames = withIdNames({
  nameA: ['Quiet', 'Lazy', 'Shiny', 'Sleepy', 'Swift', 'Night'],
  nameB: ['Angler', 'Bobber', 'Boater', 'Firefly', 'Heron'],
});

export const enGame: GameLocale = {
  ui: {
    title: 'Firefly Pond',
    hint: keyHints(['Click ground/WASD: move', '1–8: pick bait', 'Z·X·C: cast at dock A·B·C', 'M: menu', 'N: map', 'Enter: chat']),
    mapLegend: keyHints(['Center: you', 'White dots: people', 'Blue circle: pond']),
    roomLobby: 'Docks',
    roomLobbyInfo: 'Four anglers sit around the pond and cast face-down bait cards to catch fish. Empty seats are filled by computer anglers.',
    roomQuick: 'Quick game',
    roomWithCpu: 'Fish with computers',
    roomHost: 'Open a pond',
    roomOpen: 'Ponds waiting for people',
    roomCpuTurn: 'Computer is casting',
    pondHand: 'My bait',
    pondPick: '[[Pick a bait card, then a dock (fish) (1–8, Z·X·C)|Pick a bait card, then tap a dock (fish)]]',
    pondWait: 'Another angler is casting',
    pondRules: 'Equal baits tangle and drop out. A fish ignores bait smaller than itself. The biggest bait left catches it.',
    pondEmptyHand: 'All bait cast',
  },
  fmt: {
    pondCpu: (i: number) => `CPU ${['Amber', 'Blue', 'Rose', 'Green'][i] ?? i + 1}`,
    roomRound: (n: number, max: number) => `Cast ${n} / ${max}`,
    roomWhy: (why: string) => ({ score: 'All eight casts are done.', resign: 'Ended by resignation.', left: 'A player disconnected and did not return.', rounds: 'Out of casts.' } as Record<string, string>)[why] ?? '',
    pondSpot: (s: number) => `Dock ${SPOT[s] ?? '?'}`,
    pondSpotKey: (s: number) => SPOT[s] ?? '?',
    pondFish: (v: number) => `${v} pt${v === 1 ? '' : 's'}`,
    pondThrown: (n: number) => (n ? `${n} bobber${n === 1 ? '' : 's'}` : ''),
    pondMine: (spot: string, v: number) => `My bait: ${v} at ${spot}`,
    pondScore: (score: number, caught: number) => `${score} pts · ${caught} fish`,
    pondLeft: (n: number) => `${n} card${n === 1 ? '' : 's'}`,
    pondCatch: (spot: string, name: string, v: number, fish: number) => `${spot}: ${name} (${v}) caught ${fish} pt${fish === 1 ? "" : "s"}`,
    pondMiss: (spot: string, best: number, fish: number) => `${spot}: ${best ? `${best} too small for the ${fish}-pt fish` : 'no catch'}`,
    pondTangle: (vals: string) => `tangled ${vals}`,
    pondRevealTitle: (n: number) => `Cast ${n} revealed`,
    pondRank: (rank: number, score: number) => `${ORD[rank - 1] ?? `${rank}th`} · ${score} pts`,
    pondRecord: (games: number, wins: number, best: number) => (games ? `Record: ${wins} wins in ${games} · best ${best} pts` : ''),
    pondTurnNote: (cast: number, leader: string) => `Cast ${cast} · lead ${leader}`,
  },
  msg: {
    pondBad: () => 'That bait cannot be cast.',
    roomStart: (a: MsgArg[]) => `Four anglers begin.${Number(a[0]) ? ' You lead.' : ''}`,
    roomTimeout: (a: MsgArg[]) => `Time ran out: ${a[0] || 'the computer'}'s bait was cast automatically.`,
  },
};
