// 이 게임의 언어 묶음: 틀의 문장(koBase, enBase)에 이 게임의 이름표를 넘기고 이 게임의 문장을 합친다.
import { enBase } from '@engine/client/i18n/en';
import { koBase, type Locale } from '@engine/client/i18n/ko';
import { mergeLocale } from '@engine/client/i18n/merge';
import { enGame, enNames } from './en';
import { koGame, koNames, type GameLocale } from './ko';

declare module '@engine/client/i18n/ext' {
  interface LocaleExt extends GameLocale {}
}

export const LOCALES: readonly Locale[] = [mergeLocale(koBase(koNames), koGame), mergeLocale(enBase(enNames), enGame)];
