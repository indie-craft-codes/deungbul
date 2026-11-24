// 언어 묶음의 확장 지점: 게임이 자기 문장의 모양을 여기에 선언 병합으로 더한다 (shared/ext.ts, server/game/ext.ts와 같은 방식).
// 틀의 화면 코드는 L()을 틀의 모양(EngineLocale)으로 보고, 게임이 병합한 컴파일에서는 같은 L()이 게임의 묶음(residents, quests …)과 게임의 ui·fmt·msg 키까지 보인다.
// 그래서 L().ui.x, t('x'), L().fmt.y(...)를 부르는 곳은 틀의 것이든 게임의 것이든 같은 모양으로 쓴다.
// 이 파일은 아무것도 import하지 않는다. 이 게임의 선언은 client/src/game/i18n/index.ts에 있다.

/** 게임이 언어 묶음에 더하는 것. 틀만 있을 때는 비어 있다 */
export interface LocaleExt {}
