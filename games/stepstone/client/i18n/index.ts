// 이 게임의 언어 묶음: 틀의 문장(koBase, enBase)에 비운 이름표(withIdNames)를 넘기고, 이 게임의 문장을 합친다.
import { enBase } from '@engine/client/i18n/en';
import { koBase, type Locale } from '@engine/client/i18n/ko';
import { mergeLocale } from '@engine/client/i18n/merge';
import { withIdNames } from '@engine/client/i18n/names';
import { enGame } from './en';
import { koGame, type GameLocale } from './ko';

declare module '@engine/client/i18n/ext' {
  interface LocaleExt extends GameLocale {}
}

const koNames = withIdNames({ nameA: ['조용한', '단단한', '느긋한', '재빠른'], nameB: ['돌지기', '수읽기', '징검이', '바둑이'] });
const enNames = withIdNames({ nameA: ['Quiet', 'Steady', 'Patient', 'Nimble'], nameB: ['Warden', 'Thinker', 'Stepper', 'Mason'] });

/** 이 게임이 갖춘 언어들. 맨 앞이 기본 언어다 */
export const LOCALES: readonly Locale[] = [mergeLocale(koBase(koNames), koGame), mergeLocale(enBase(enNames), enGame)];
