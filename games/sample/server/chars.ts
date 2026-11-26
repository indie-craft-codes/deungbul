// 이 게임의 캐릭터 정의 몇 개와 변신을 쓰는 법. 정의는 손으로 적었지만 나중에 AI가 내놓을 것과 같은 모양이다:
// 타입을 붙이지 않은 날것(unknown)으로 두고, 서버가 검증기(g.chars.add → validateCharDef)를 거쳐서만 받는다. 규칙은 내용의 CHAR_RULES.
import type { Game } from '@engine/server';

/** 손으로 쓴 정의 넷: 부품·색·크기가 저마다 다르다 (등급 0~2, 예산 안) */
export const SAMPLE_CHARS: readonly unknown[] = [
  {
    v: 1, id: 'mossguard', name: '이끼 파수꾼', bio: '숲 가장자리를 지키는 느긋한 파수꾼. 방패에 이끼가 끼었다.',
    look: { parts: { body: 'stout', head: 'box', hair: 'short', hat: 'helm', face: 'beard', back: 'shield' }, colors: { skin: 0xe2b98e, cloth: 0x4c7a3a, hair: 0x6a4a2a, accent: 0xc8a040 }, pattern: 'belt', size: 1.05, width: 1.1 },
    role: '', rarity: 0, stats: { atk: 12, hp: 200 }, skills: ['chop'],
  },
  {
    v: 1, id: 'emberfox', name: '잿빛 여우', bio: '모닥불 연기를 따라다니는 장난꾸러기 마법사.',
    look: { parts: { body: 'slim', head: 'round', hair: 'tail', hat: 'pointed', face: 'eyes', back: 'scarf' }, colors: { skin: 0xf3cfa8, cloth: 0xb0402a, hair: 0xd9d2c4, accent: 0xffa040 }, pattern: 'sash', size: 0.92 },
    role: '', rarity: 1, stats: { atk: 22, hp: 200 }, skills: ['aim'],
  },
  {
    v: 1, id: 'stagkeeper', name: '사슴지기', bio: '사슴뿔 관을 쓴 숲의 사냥꾼. 말수가 적다.',
    look: { parts: { body: 'robe', head: 'tall', hair: 'long', hat: 'antlers', face: 'none', back: 'cape' }, colors: { skin: 0xc99a74, cloth: 0x5a6a3a, hair: 0x2a2018, accent: 0x8a5a2a }, pattern: 'trim', size: 1.1 },
    role: '', rarity: 2, stats: { atk: 30, hp: 230 }, skills: ['rest'],
  },
  {
    v: 1, id: 'piptinker', name: 'Pip Tinker', bio: 'A cheerful tinker with goggles and a pack full of bolts.',
    look: { parts: { body: 'plain', head: 'wide', hair: 'bun', hat: 'band', face: 'goggles', back: 'pack' }, colors: { skin: 0xf0c9a0, cloth: 0x3a6aa0, hair: 0xc06a2a, accent: 0xe0e040 }, pattern: 'stripe', size: 0.88, width: 1.15 },
    role: '', rarity: 1, stats: { atk: 15, hp: 260 }, skills: [],
  },
];

/**
 * 서버가 켜질 때 정의를 더하고(같은 id는 바꾼다: 고친 정의가 다음 시작에 반영된다), 들어오는 사람에게 모두 준다 (예제라서. 실제 게임은 보상·상점·거래로 준다).
 * 정의를 더하는 것은 모든 시스템이 만들어진 뒤(ready)다: 월드 저장을 읽기 전이라도 된다 (같은 id면 저장된 것을 이것으로 바꾼다)
 */
export function installChars(g: Game): void {
  g.ready.push(() => {
    for (const raw of SAMPLE_CHARS) {
      const r = g.chars.add(raw, { replace: true });
      if (!r.ok) console.warn(`[sample] 캐릭터 정의가 거절됐다: ${r.issues.map((x) => `${x.code}@${x.path}`).join(', ')}`);
    }
  });
  g.on('playerJoined', (p) => { for (const d of g.chars.list()) g.morph.grant(p, d.id); });
}
