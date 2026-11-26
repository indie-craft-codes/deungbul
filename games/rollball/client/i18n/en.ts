// English. Must have the same shape as ko.ts (GameLocale enforces it).
import { keyHints, teamName } from '@engine/client/i18n/ko';
import type { GameLocale } from './ko';

/** 팀의 이름: 틀의 teamName이 내용의 TEAMS(name 키 teamA, teamB)로 이 파일의 ui에서 찾는다 */
const team = teamName;

export const enGame: GameLocale = {
  ui: {
    title: 'Rollball',
    hint: keyHints(['Click ground/WASD: move', 'Run into the ball to push it', 'F: kick', 'V: whole pitch', 'H: back to our half', 'Wheel: zoom', 'M: menu', 'N: map', 'Enter: chat']),
    mapLegend: '■ goals · white: ball and people',
    goingTown: 'Walking back to our half.',
    teamA: 'Ember',
    teamB: 'Tide',
    teamPickInfo: 'Push the ball with your body or kick it into the other goal.',
    kick: 'Kick[[ (F)|]]',
    overview: 'Pitch[[ (V)|]]',
    phaseGoal: 'Goal!',
    ballArrow: 'Ball direction',
    phaseOver: 'Full time',
  },
  fmt: {
    clock: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
    round: (n: number) => `Round ${n}`,
    teamMine: (name: string, goals: number) => `Team ${name} · my goals ${goals}`,
  },
  msg: {
    goal: (a) => `${team(a[0])} scores!${a[1] ? ` Goal by ${a[1]}.` : ''} ${a[2]} : ${a[3]}`,
    roundOver: (a) => (Number(a[0]) < 0 ? `Draw. ${a[1]} : ${a[2]}` : `${team(a[0])} wins! ${a[1]} : ${a[2]}`),
    roundStart: (a) => `Round ${a[0]} starts.`,
  },
};
