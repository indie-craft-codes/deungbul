// English. Must have the same shape as ko.ts (GameLocale enforces it).
import type { MsgArg } from '@engine/shared';
import { keyHints } from '@engine/client/i18n/ko';
import type { GameLocale } from './ko';

const TEAM = ['Ember', 'Tide'];
const team = (s: MsgArg) => TEAM[Number(s)] ?? '';

export const enGame: GameLocale = {
  ui: {
    title: 'Rollball',
    hint: keyHints(['Click ground/WASD: move', 'Run into the ball to push it', 'F: kick', 'V: whole pitch', 'H: back to our half', 'Wheel: zoom', 'M: menu', 'N: map', 'Enter: chat']),
    mapLegend: '■ goals · white: ball and people',
    goingTown: 'Walking back to our half.',
    pickTitle: 'Pick a team',
    pickInfo: 'Push the ball with your body or kick it into the other goal. You cannot join the team with more players.',
    teamA: 'Ember',
    teamB: 'Tide',
    kick: 'Kick[[ (F)|]]',
    overview: 'Pitch[[ (V)|]]',
    switchTeam: 'Switch team',
    phaseGoal: 'Goal!',
    ballArrow: 'Ball direction',
    phaseOver: 'Full time',
  },
  fmt: {
    clock: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
    round: (n: number) => `Round ${n}`,
    teamCount: (n: number) => (n === 1 ? '1 player' : `${n} players`),
    myTeam: (side: number, goals: number) => `Team ${team(side)} · my goals ${goals}`,
  },
  msg: {
    goal: (a) => `${team(a[0])} scores!${a[1] ? ` Goal by ${a[1]}.` : ''} ${a[2]} : ${a[3]}`,
    roundOver: (a) => (Number(a[0]) < 0 ? `Draw. ${a[1]} : ${a[2]}` : `${team(a[0])} wins! ${a[1]} : ${a[2]}`),
    roundStart: (a) => `Round ${a[0]} starts.`,
    teamFull: (a) => `${team(a[0])} has more players. Pick the other team.`,
    teamJoined: (a) => `You joined ${team(a[0])}.`,
  },
};
