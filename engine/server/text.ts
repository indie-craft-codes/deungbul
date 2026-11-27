// 글 다듬기와 금칙어 가리기. 통신 계층(대화, 이름)과 게임 규칙(길드 이름과 공지)이 함께 쓰므로 어느 쪽에도 속하지 않는 자리에 둔다.
// 정규화와 목록·거르개 고리는 engine/shared/textfilter.ts에 있다 (캐릭터 정의의 검증도 같은 것을 쓴다): 여기는 그것을 다시 내보낸다.
// 금칙어 목록은 시작용의 짧은 목록이다(한국어, 영어). 게임은 addBannedWords로 자기 언어와 자기 세계의 낱말을, addTextFilter로 거르개(외부 검열 같은 것)를 더한다.
export { addAllowedWords, addBannedWords, addTextFilter, bannedWords, clearTextFilters, filterKey, isClean, mask, tidy, type TextFilter, type TextWhere } from '../shared/textfilter';
