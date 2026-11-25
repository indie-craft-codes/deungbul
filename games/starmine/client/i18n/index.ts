// 이 게임의 언어 묶음: 틀의 문장(koBase, enBase)에 이 게임의 이름표를 넘기고, 이 게임의 문장을 합친다.
import { enBase } from '@engine/client/i18n/en';
import { koBase, type Locale } from '@engine/client/i18n/ko';
import { mergeLocale } from '@engine/client/i18n/merge';
import { enGame, enNames } from './en';
import { koGame, koNames, type GameLocale } from './ko';

// 틀의 확장 지점에 이 게임의 문장 모양을 더한다: L()과 t()가 이 게임의 키(t('bonfire'), L().fmt.heat)까지 본다
declare module '@engine/client/i18n/ext' {
  interface LocaleExt extends GameLocale {}
}

/** 이 게임이 갖춘 언어들. 맨 앞이 기본 언어다 */
export const LOCALES: readonly Locale[] = [mergeLocale(koBase(koNames), koGame), mergeLocale(enBase(enNames), enGame)];
