// 게임 화면에 붙는 도감 단추의 글자. 게임의 번들에 들어가므로 도감의 긴 문장(text.*.ts)과 따로 둔다.
export interface LinkText {
  /** 단추에 적는 말 */
  label: string;
  /** 단추가 하는 일 (풍선 도움말, 화면 낭독기) */
  title: string;
}
/** 언어 코드별 글자. 게임에 언어를 더하면 여기에도 더한다 (없는 언어는 첫 번째 것을 쓴다) */
export const LINK_TEXT: Record<string, LinkText> = {
  ko: { label: '도감', title: '도감: 몬스터·아이템과 게임의 수치·규칙을 봅니다' },
  en: { label: 'Codex', title: 'Codex: monsters, items and every number and rule in the game' },
};
export const linkText = (code: string): LinkText => LINK_TEXT[code] ?? Object.values(LINK_TEXT)[0];
