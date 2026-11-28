// 이 게임의 그림 등록 표 (scripts/art-import.mjs가 만든다: 손으로 고치지 말고 그림을 넣은 뒤 다시 돌린다).
// 열쇠 → 파일(public/ 아래, 빌드하면 화면과 같은 자리). 표에 없는 그림은 틀이 대신 그린다 (engine/client/art.ts).
export const ART: Readonly<Record<string, string>> = {
  'banner:echofest': 'art/banner/echofest.webp',
  'banner:season': 'art/banner/season.webp',
  'bg:tower@landscape': 'art/bg/tower@landscape.webp',
  'bg:tower@portrait': 'art/bg/tower@portrait.webp',
  'portrait:aurelle': 'art/portrait/aurelle.webp',
  'portrait:brindle': 'art/portrait/brindle.webp',
  'portrait:grimbell': 'art/portrait/grimbell.webp',
  'portrait:ilsa': 'art/portrait/ilsa.webp',
  'portrait:murk': 'art/portrait/murk.webp',
  'portrait:oddo': 'art/portrait/oddo.webp',
  'portrait:pell': 'art/portrait/pell.webp',
  'portrait:sorrel': 'art/portrait/sorrel.webp',
  'portrait:tamsin': 'art/portrait/tamsin.webp',
  'portrait:wren': 'art/portrait/wren.webp',
};
