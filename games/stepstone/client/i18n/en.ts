// English. Must have the same shape as ko.ts (GameLocale enforces it).
import { keyHints } from '@engine/client/i18n/ko';
import type { GameLocale } from './ko';

const WHY: Record<string, string> = { ko: 'All pieces knocked down.', rounds: 'Out of rounds: decided by remaining health.', resign: 'Ended by resignation.', left: 'A player disconnected and did not return.' };

export const enGame: GameLocale = {
  ui: {
    title: 'Stepstone Tactics',
    hint: keyHints(['Click ground/WASD: walk (lobby)', 'Click tiles: select, move, attack', 'Space: end turn', 'Wheel: zoom', 'M: menu', 'N: map', 'Enter: chat']),
    mapLegend: '■ board · ● lobby',
    roomLobby: 'Game Hall',
    roomLobbyInfo: 'Take turns moving three stone pieces and knock down all of your opponent\'s. Each turn is 30 seconds.',
    roomCpu: 'Stone Sage (CPU)',
    roomPass: 'End turn[[ (Space)|]]',
    pickUnit: 'Tap a piece to move it. Walk onto blue tiles; attack enemies glowing red.',
    waitFoe: 'Wait while your opponent plays.',
    openerNote: 'First turn: the second player deals 1 less damage.',
    unitDone: 'This piece is done for this turn.',
    lampTip: 'Lantern stone (center): a piece standing on it regains 1 health when your turn ends.',
    myTurn: 'Your turn',
    unitShield: 'Shieldstone',
    unitSling: 'Slingstone',
    unitRunner: 'Runnerstone',
    infoShield: 'Sturdy. Takes 1 less damage from stones thrown from afar.',
    infoSling: 'Only hits enemies 2–3 tiles away. Weak up close.',
    infoRunner: 'Walks three tiles.',
  },
  fmt: {
    roomRound: (n: number, max: number) => `Turn ${n} / ${max}`,
    roomWhy: (why: string) => WHY[why] ?? '',
    rec: (w: number, l: number, d: number) => `Record ${w}W ${l}L ${d}D`,
    unitStat: (hp: number, max: number, move: number, lo: number, hi: number, atk: number) => `HP ${hp}/${max} · Move ${move} · Range ${lo === hi ? lo : `${lo}–${hi}`} · Damage ${atk}`,
  },
  msg: {
    duelBad: () => 'That move is not allowed.',
  },
};
