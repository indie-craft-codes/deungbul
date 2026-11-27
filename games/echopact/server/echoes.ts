// 이 게임의 메아리 열: 손으로 쓴 캐릭터 정의. 나중에 AI가 내놓을 정의와 같은 모양이라 타입을 붙이지 않은 날것(unknown)으로 두고,
// 서버가 검증기(g.chars.add → validateCharDef, 규칙은 내용의 CHAR_RULES)를 거쳐서만 받는다. 이 게임은 AI를 부르지 않는다: 정의를 더하는 길(g.chars.add)만 둔다.
// 하나의 정의가 두 쪽에서 쓰인다: 수집형 쪽의 영웅(뽑기 판·편성·단계: chars 모듈이 영웅의 표에 더한다)과 들판의 변신(morph).
// 이름·소개는 사람이 쓴 글 하나다(한국어). 영어 화면의 글은 화면이 이 게임의 언어 파일(charText)로 바꿔 보인다 (client/echoes.ts).
// 등급마다 예산(공격 × 4 + 체력 × 0.5): 일반 170, 희귀 220, 전설 290. 부품은 저마다 다르게.

/** 정의 열: 일반 넷, 희귀 넷, 전설 둘 */
export const ECHO_DEFS: readonly unknown[] = [
  // ---------- 일반 ----------
  {
    v: 1, id: 'brindle', name: '이끼등 브린들', bio: '등에 이끼가 자란 느긋한 방패지기. 처음 맺는 계약의 단골이다.',
    look: { parts: { body: 'stout', head: 'box', hair: 'short', hat: 'helm', face: 'beard', back: 'shield' }, colors: { skin: 0xe2b98e, cloth: 0x4c7a3a, hair: 0x6a4a2a, accent: 0xc8a040 }, pattern: 'belt', size: 1.04, width: 1.1 },
    role: 'vanguard', rarity: 0, stats: { atk: 12, hp: 240 }, skills: ['bash'],
  },
  {
    v: 1, id: 'pell', name: '바람결 펠', bio: '골짜기 바람을 읽는 사수. 화살보다 말이 빠르다.',
    look: { parts: { body: 'slim', head: 'round', hair: 'tail', hat: 'hood', face: 'none', back: 'scarf' }, colors: { skin: 0xf3cfa8, cloth: 0x3f8a5a, hair: 0x8a5a2a, accent: 0xe0d070 }, pattern: 'sash', size: 0.96 },
    role: 'ranger', rarity: 0, stats: { atk: 20, hp: 170 }, skills: ['volley'],
  },
  {
    v: 1, id: 'tamsin', name: '촛농 탐신', bio: '꺼지지 않는 초를 들고 다니는 비술사. 연기 냄새가 난다.',
    look: { parts: { body: 'robe', head: 'tall', hair: 'long', hat: 'pointed', face: 'eyes', back: 'none' }, colors: { skin: 0xf0c9a0, cloth: 0x6a3a8a, hair: 0x2a2030, accent: 0xffb040 }, pattern: 'trim', size: 1.0 },
    role: 'mystic', rarity: 0, stats: { atk: 21, hp: 160 }, skills: ['flare'],
  },
  {
    v: 1, id: 'oddo', name: '약초꾼 오도', bio: '배낭 가득 풀을 지고 다니는 치유사. 늘 무언가를 달이고 있다.',
    look: { parts: { body: 'plain', head: 'wide', hair: 'bun', hat: 'cap', face: 'none', back: 'pack' }, colors: { skin: 0xc99a74, cloth: 0xd8d0b0, hair: 0x5a3a1a, accent: 0x6aa04a }, pattern: 'none', size: 0.9, width: 1.12 },
    role: 'mender', rarity: 0, stats: { atk: 10, hp: 250 }, skills: ['chant'],
  },
  // ---------- 희귀 ----------
  {
    v: 1, id: 'sorrel', name: '뿔투구 소렐', bio: '뿔 달린 투구를 물려받은 선봉. 물러서는 법을 배우지 않았다.',
    look: { parts: { body: 'stout', head: 'box', hair: 'none', hat: 'horns', face: 'mask', back: 'cape' }, colors: { skin: 0xd9a77e, cloth: 0x8a2a2a, hair: 0x1a1a1a, accent: 0xd8d0c0 }, pattern: 'belt', size: 1.1 },
    role: 'vanguard', rarity: 1, stats: { atk: 24, hp: 240 }, skills: ['bash'],
  },
  {
    v: 1, id: 'wren', name: '굴뚝새 렌', bio: '고글을 쓴 정찰병. 지붕 위에서 쏘는 것을 좋아한다.',
    look: { parts: { body: 'slim', head: 'round', hair: 'spiky', hat: 'band', face: 'goggles', back: 'scarf' }, colors: { skin: 0xf0c9a0, cloth: 0x3a5a8a, hair: 0xc06a2a, accent: 0xe0e040 }, pattern: 'stripe', size: 0.9 },
    role: 'ranger', rarity: 1, stats: { atk: 30, hp: 190 }, skills: ['volley'],
  },
  {
    v: 1, id: 'ilsa', name: '울림고리 일사', bio: '머리 위에 울림의 고리를 띄운 비술사. 종소리로 길을 찾는다.',
    look: { parts: { body: 'robe', head: 'round', hair: 'long', hat: 'halo', face: 'none', back: 'wings' }, colors: { skin: 0xf6dcc0, cloth: 0xe0e8f0, hair: 0xe8d890, accent: 0x9ad0ff }, pattern: 'sash', size: 1.02 },
    role: 'mystic', rarity: 1, stats: { atk: 28, hp: 200 }, skills: ['flare'],
  },
  {
    v: 1, id: 'murk', name: '늪지기 머크', bio: '늪의 물로 상처를 씻어 주는 털보 치유사. 말수는 적지만 손은 따뜻하다.',
    look: { parts: { body: 'plain', head: 'wide', hair: 'short', hat: 'hood', face: 'beard', back: 'pack' }, colors: { skin: 0xb08a64, cloth: 0x3a5a4a, hair: 0x3a2a1a, accent: 0x8ac0a0 }, pattern: 'belt', size: 1.06, width: 1.15 },
    role: 'mender', rarity: 1, stats: { atk: 16, hp: 300 }, skills: ['chant'],
  },
  // ---------- 전설 ----------
  {
    v: 1, id: 'aurelle', name: '새벽관 오렐', bio: '새벽빛 관을 쓴 옛 계약자의 메아리. 곁에 있으면 모두의 손에 힘이 붙는다.',
    look: { parts: { body: 'robe', head: 'tall', hair: 'long', hat: 'crown', face: 'eyes', back: 'wings' }, colors: { skin: 0xf6dcc0, cloth: 0xf0d890, hair: 0xffffff, accent: 0xffc040 }, pattern: 'trim', size: 1.08 },
    role: 'mystic', rarity: 2, stats: { atk: 38, hp: 260 }, skills: ['rally'],
  },
  {
    v: 1, id: 'grimbell', name: '종지기 그림벨', bio: '무너진 종탑을 홀로 지킨 거인 파수꾼. 걸을 때마다 등의 종이 울린다.',
    look: { parts: { body: 'stout', head: 'wide', hair: 'none', hat: 'helm', face: 'mask', back: 'shield' }, colors: { skin: 0xa07a5a, cloth: 0x4a4a5a, hair: 0x1a1a1a, accent: 0xd0a040 }, pattern: 'stripe', size: 1.15, width: 1.2 },
    role: 'vanguard', rarity: 2, stats: { atk: 26, hp: 370 }, skills: ['bash'],
  },
];
