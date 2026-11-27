// 이 게임의 메아리 열: 손으로 쓴 캐릭터 정의. 나중에 AI가 내놓을 정의와 같은 모양이라 타입을 붙이지 않은 날것(unknown)으로 두고,
// 서버가 검증기(g.chars.add → validateCharDef, 규칙은 내용의 CHAR_RULES)를 거쳐서만 받는다. 이 게임은 AI를 부르지 않는다: 정의를 더하는 길(g.chars.add)만 둔다.
// 하나의 정의가 두 쪽에서 쓰인다: 수집형 쪽의 영웅(뽑기 판·편성·단계: chars 모듈이 영웅의 표에 더한다)과 들판의 변신(morph).
// 이름·소개는 사람이 쓴 한국어 글이고, 영어는 정의의 text.en (틀의 CharDef.text: 검증기가 같은 규칙으로 본다. 화면이 그 언어일 때 보인다).
// 등급마다 예산(공격 × 4 + 체력 × 0.5): 일반 170, 희귀 220, 전설 290. 부품은 저마다 다르게.

/** 정의 열: 일반 넷, 희귀 넷, 전설 둘 */
export const ECHO_DEFS: readonly unknown[] = [
  // ---------- 일반 ----------
  {
    v: 1, id: 'brindle', name: '이끼등 브린들', bio: '등에 이끼가 자란 느긋한 방패지기. 처음 맺는 계약의 단골이다.',
    text: { en: { name: 'Brindle Mossback', bio: 'An easygoing shield-bearer with moss on his back. A regular at first pacts.' } },
    look: { parts: { body: 'stout', head: 'box', hair: 'short', hat: 'helm', face: 'beard', back: 'shield' }, colors: { skin: 0xe2b98e, cloth: 0x4c7a3a, hair: 0x6a4a2a, accent: 0xc8a040 }, pattern: 'belt', size: 1.04, width: 1.1 },
    role: 'vanguard', rarity: 0, stats: { atk: 12, hp: 240 }, skills: ['bash'],
  },
  {
    v: 1, id: 'pell', name: '바람결 펠', bio: '골짜기 바람을 읽는 사수. 화살보다 말이 빠르다.',
    text: { en: { name: 'Pell Windgrain', bio: 'An archer who reads the valley wind. Talks faster than her arrows fly.' } },
    look: { parts: { body: 'slim', head: 'round', hair: 'tail', hat: 'hood', face: 'none', back: 'scarf' }, colors: { skin: 0xf3cfa8, cloth: 0x3f8a5a, hair: 0x8a5a2a, accent: 0xe0d070 }, pattern: 'sash', size: 0.96 },
    role: 'ranger', rarity: 0, stats: { atk: 20, hp: 170 }, skills: ['volley'],
  },
  {
    v: 1, id: 'tamsin', name: '촛농 탐신', bio: '꺼지지 않는 초를 들고 다니는 비술사. 연기 냄새가 난다.',
    text: { en: { name: 'Tamsin Wick', bio: 'A mystic carrying a candle that never goes out. Smells of smoke.' } },
    look: { parts: { body: 'robe', head: 'tall', hair: 'long', hat: 'pointed', face: 'eyes', back: 'none' }, colors: { skin: 0xf0c9a0, cloth: 0x6a3a8a, hair: 0x2a2030, accent: 0xffb040 }, pattern: 'trim', size: 1.0 },
    role: 'mystic', rarity: 0, stats: { atk: 21, hp: 160 }, skills: ['flare'],
  },
  {
    v: 1, id: 'oddo', name: '약초꾼 오도', bio: '배낭 가득 풀을 지고 다니는 치유사. 늘 무언가를 달이고 있다.',
    text: { en: { name: 'Oddo the Herbalist', bio: 'A healer with a pack full of herbs. Always brewing something.' } },
    look: { parts: { body: 'plain', head: 'wide', hair: 'bun', hat: 'cap', face: 'none', back: 'pack' }, colors: { skin: 0xc99a74, cloth: 0xd8d0b0, hair: 0x5a3a1a, accent: 0x6aa04a }, pattern: 'none', size: 0.9, width: 1.12 },
    role: 'mender', rarity: 0, stats: { atk: 10, hp: 250 }, skills: ['chant'],
  },
  // ---------- 희귀 ----------
  {
    v: 1, id: 'sorrel', name: '뿔투구 소렐', bio: '뿔 달린 투구를 물려받은 선봉. 물러서는 법을 배우지 않았다.',
    text: { en: { name: 'Sorrel Hornhelm', bio: 'A vanguard who inherited a horned helm. Never learned how to step back.' } },
    look: { parts: { body: 'stout', head: 'box', hair: 'none', hat: 'horns', face: 'mask', back: 'cape' }, colors: { skin: 0xd9a77e, cloth: 0x8a2a2a, hair: 0x1a1a1a, accent: 0xd8d0c0 }, pattern: 'belt', size: 1.1 },
    role: 'vanguard', rarity: 1, stats: { atk: 24, hp: 240 }, skills: ['bash'],
  },
  {
    v: 1, id: 'wren', name: '굴뚝새 렌', bio: '고글을 쓴 정찰병. 지붕 위에서 쏘는 것을 좋아한다.',
    text: { en: { name: 'Wren', bio: 'A scout in goggles. Loves shooting from rooftops.' } },
    look: { parts: { body: 'slim', head: 'round', hair: 'spiky', hat: 'band', face: 'goggles', back: 'scarf' }, colors: { skin: 0xf0c9a0, cloth: 0x3a5a8a, hair: 0xc06a2a, accent: 0xe0e040 }, pattern: 'stripe', size: 0.9 },
    role: 'ranger', rarity: 1, stats: { atk: 30, hp: 190 }, skills: ['volley'],
  },
  {
    v: 1, id: 'ilsa', name: '울림고리 일사', bio: '머리 위에 울림의 고리를 띄운 비술사. 종소리로 길을 찾는다.',
    text: { en: { name: 'Ilsa Ringhalo', bio: 'A mystic with a ring of echoes floating overhead. Finds her way by bell sounds.' } },
    look: { parts: { body: 'robe', head: 'round', hair: 'long', hat: 'halo', face: 'none', back: 'wings' }, colors: { skin: 0xf6dcc0, cloth: 0xe0e8f0, hair: 0xe8d890, accent: 0x9ad0ff }, pattern: 'sash', size: 1.02 },
    role: 'mystic', rarity: 1, stats: { atk: 28, hp: 200 }, skills: ['flare'],
  },
  {
    v: 1, id: 'murk', name: '늪지기 머크', bio: '늪의 물로 상처를 씻어 주는 털보 치유사. 말수는 적지만 손은 따뜻하다.',
    text: { en: { name: 'Murk Fenwarden', bio: 'A bearded healer who washes wounds with marsh water. Few words, warm hands.' } },
    look: { parts: { body: 'plain', head: 'wide', hair: 'short', hat: 'hood', face: 'beard', back: 'pack' }, colors: { skin: 0xb08a64, cloth: 0x3a5a4a, hair: 0x3a2a1a, accent: 0x8ac0a0 }, pattern: 'belt', size: 1.06, width: 1.15 },
    role: 'mender', rarity: 1, stats: { atk: 16, hp: 300 }, skills: ['chant'],
  },
  // ---------- 전설 ----------
  {
    v: 1, id: 'aurelle', name: '새벽관 오렐', bio: '새벽빛 관을 쓴 옛 계약자의 메아리. 곁에 있으면 모두의 손에 힘이 붙는다.',
    text: { en: { name: 'Aurelle Dawncrown', bio: 'The echo of an old pactbinder in a crown of dawn. Allies grow stronger at her side.' } },
    look: { parts: { body: 'robe', head: 'tall', hair: 'long', hat: 'crown', face: 'eyes', back: 'wings' }, colors: { skin: 0xf6dcc0, cloth: 0xf0d890, hair: 0xffffff, accent: 0xffc040 }, pattern: 'trim', size: 1.08 },
    role: 'mystic', rarity: 2, stats: { atk: 38, hp: 260 }, skills: ['rally'],
  },
  {
    v: 1, id: 'grimbell', name: '종지기 그림벨', bio: '무너진 종탑을 홀로 지킨 거인 파수꾼. 걸을 때마다 등의 종이 울린다.',
    text: { en: { name: 'Grimbell Bellkeeper', bio: 'A giant warden who guarded a fallen bell tower alone. The bell on his back rings with every step.' } },
    look: { parts: { body: 'stout', head: 'wide', hair: 'none', hat: 'helm', face: 'mask', back: 'shield' }, colors: { skin: 0xa07a5a, cloth: 0x4a4a5a, hair: 0x1a1a1a, accent: 0xd0a040 }, pattern: 'stripe', size: 1.15, width: 1.2 },
    role: 'vanguard', rarity: 2, stats: { atk: 26, hp: 370 }, skills: ['bash'],
  },
];
