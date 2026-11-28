// 그림 칸의 종류 표 (art2): 그림 넣기(art-import.mjs)와 필요한 그림 목록(art-list.mjs)이 함께 읽는다. 화면 쪽의 열쇠 규칙은 engine/client/art.ts.
//   ext      받는 확장자          size   권장 크기([너비, 높이] 하나라도 맞으면 됨)     alpha  투명 배경이 필요한가 (없으면 경고)
//   max      경고할 파일 크기     where  쓰이는 곳                                         fallback 그림이 없을 때 (지금 그대로)
export const SLOTS = {
  portrait: { ext: ['.webp', '.png'], size: [[512, 512]], alpha: true, max: 400_000, where: '카드 격자·상세·뽑기 공개·편성·전투 초상·홈의 대표', fallback: '3D 모델 초상' },
  bg: { ext: ['.webp', '.png'], size: [[1080, 1920], [1920, 1080]], alpha: false, max: 1_500_000, where: '큰 화면의 배경 (홈·메뉴 탭·편성 확인·결과·뽑기 연출·모험·직업 고르기)', fallback: 'css 바탕' },
  banner: { ext: ['.webp', '.png'], size: [[1200, 500]], alpha: false, max: 500_000, where: '홈의 이벤트 배너 카드', fallback: '색 두 개 + 아이콘' },
  icon: { ext: ['.svg', '.webp', '.png'], size: [[128, 128]], alpha: true, max: 60_000, where: '화면 아이콘 (메뉴·홈·상태)', fallback: '코드로 그린 SVG' },
  cur: { ext: ['.webp', '.png'], size: [[128, 128]], alpha: true, max: 60_000, where: '재화 줄·내 정보·단계 보상·우편', fallback: '시트의 칸 → SVG 아이콘' },
  item: { ext: ['.webp', '.png'], size: [[256, 256]], alpha: true, max: 120_000, where: '가방·상점·대장간·장비·도감·보상·우편', fallback: '시트의 칸 → 글자만' },
  skill: { ext: ['.webp', '.png'], size: [[256, 256]], alpha: false, max: 120_000, where: '들판의 기술 단추', fallback: '기술 이름 글자' },
  unit: { ext: ['.webp', '.png'], size: [[512, 512]], alpha: true, max: 300_000, where: '탑 전투의 유닛 그림 (useSprites: 없으면 영웅은 portrait, 적은 enemy)', fallback: 'portrait·enemy → 3D 모델' },
  sheet: { ext: ['.png', '.webp'], size: [], alpha: true, max: 3_000_000, where: '움직이는 유닛 (useSprites: 탑 전투의 영웅·적, field를 켜면 들판의 사람·변신·몬스터). 4열×4행: 대기·걷기·공격·맞음/쓰러짐', fallback: 'unit·portrait·enemy 한 장 → 3D 모델' },
  enemy: { ext: ['.webp', '.png'], size: [[512, 512]], alpha: true, max: 300_000, where: '도감의 몬스터 줄·단계 정보의 적 목록·(useSprites) 전투의 적 유닛', fallback: '글자만' },
  frame: { ext: ['.webp', '.png'], size: [[400, 500]], alpha: true, max: 200_000, where: '카드 격자·뽑기 카드의 등급 테두리 (가운데는 투명)', fallback: 'css 등급 색 테두리' },
  fx: { ext: ['.webp', '.png'], size: [[512, 512]], alpha: true, max: 300_000, where: '뽑기 연출의 예고 빛 덩이', fallback: 'css 빛 덩이' },
  logo: { ext: ['.webp', '.png'], size: [[1200, 400]], alpha: true, max: 300_000, where: '접속(로딩) 화면의 제목', fallback: '게임 이름 글자' },
  splash: { ext: ['.webp', '.png'], size: [[1080, 1920], [1920, 1080]], alpha: false, max: 1_500_000, where: '접속(로딩) 화면의 배경', fallback: 'css 바탕' },
  appicon: { ext: ['.png'], size: [[1024, 1024]], alpha: false, max: 2_000_000, where: '앱 아이콘 원본 → favicon·PWA(192/512·maskable)·apple-touch(180)·OG(1200×630)·데스크톱(256)', fallback: '없음 (빈 favicon)' },
};
export const BRAND = ['logo', 'splash', 'appicon'];
export const ORIENT = { portrait: [1080, 1920], landscape: [1920, 1080] };
/** 앱 아이콘 한 장에서 만드는 파일 (art/brand/ 아래): 이름 → [너비, 높이, 그림 크기(바탕 위), 바탕을 까는가] */
export const APPICON_OUT = {
  'icon-32.png': [32, 32, 32, false],
  'icon-180.png': [180, 180, 180, true],
  'icon-192.png': [192, 192, 192, false],
  'icon-256.png': [256, 256, 256, false],
  'icon-512.png': [512, 512, 512, false],
  'icon-maskable-512.png': [512, 512, 410, true],
  'og.png': [1200, 630, 520, true],
};
export const sizeText = (list) => list.map(([w, h]) => `${w}×${h}`).join(' 또는 ');

/** 그림의 크기를 머리에서 읽는다 (PNG의 IHDR, WebP의 VP8·VP8L·VP8X). 모르면 null */
export function sizeOf(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  }
  return null;
}
/** WebP에 알파가 있는가 (VP8X의 알파 표시, VP8L의 알파 힌트). WebP가 아니면 null */
export function webpAlpha(buf) {
  if (!(buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')) return null;
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return (buf[20] & 0x10) !== 0;
  if (chunk === 'VP8L') return ((buf.readUInt32LE(21) >> 28) & 1) === 1;
  return false;
}
