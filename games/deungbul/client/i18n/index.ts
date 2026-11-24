// 이 게임(등불지기)의 언어 묶음: 틀의 문장(engine/client/i18n의 koBase, enBase)에 이 게임의 이름표를 넘기고, 이 게임의 문장을 합친다.
// 화면(DOM)을 건드리지 않는다: 게임 화면(../words.ts가 틀에 등록한다)과 도감(guide/data.ts), 시험(node)이 같은 묶음을 여기서 얻는다.
// 언어를 더하려면 이 폴더에 ko.ts와 같은 모양의 파일을 만들고(틀의 문장도 같은 언어로 engine/client/i18n에) 아래 LOCALES에 한 줄 더한다.
import { enBase } from '@engine/client/i18n/en';
import { koBase, type Locale } from '@engine/client/i18n/ko';
import { mergeLocale } from '@engine/client/i18n/merge';
import { enGame, enNames } from './en';
import { koGame, koNames, type GameLocale } from './ko';

// 틀의 확장 지점(engine/client/i18n/ext.ts)에 이 게임의 문장 모양을 더한다: L()과 t()가 이 게임의 묶음과 키까지 보게 된다
declare module '@engine/client/i18n/ext' {
  interface LocaleExt extends GameLocale {}
}

export const ko: Locale = mergeLocale(koBase(koNames), koGame);
export const en: Locale = mergeLocale(enBase(enNames), enGame);
/** 이 게임이 갖춘 언어들. 맨 앞이 기본 언어다 */
export const LOCALES: readonly Locale[] = [ko, en];
