// 메아리(캐릭터 정의)의 화면 쪽:
//   1. 언어마다의 이름·소개: 캐릭터 정의의 이름과 소개는 사람이 쓴 글 하나(이 게임은 한국어)라 틀은 번역하지 않는다 (틀의 빈 곳: docs/proof-echopact.md).
//      이 게임은 정의를 받을 때마다(onChars, 틀이 알고 있는 정의와 영웅의 표를 채운 바로 뒤) 그 둘을 '지금 언어의 글을 읽는' 것으로 바꿔 둔다.
//      이 게임의 언어 파일(charText)에 없는 id(나중에 AI가 만든 정의)는 정의의 글 그대로다. 변신 탭·영웅 탭·뽑기 결과·안내문·싸우는 영웅의 이름표가 모두 이것을 읽는다.
//   2. 울림 샘 둘레의 석상: 정의마다 그 겉모습의 사람을 세운다 (부품이 다른 메아리를 한눈에 보는 자리).
import { addHeroDef, charHero, heroRole, setKnownChars, type CharDef } from '@engine/shared/defs';
import { addNpc, makeHumanoid, onChars, redrawMenu } from '@engine/client';
import { L, onLangChange } from '@engine/client/i18n';
import { uiText } from '@engine/client/i18n/names';
import { WELL } from '../shared/content/pact';

/** 지금 언어의 이름·소개 (이 게임의 언어 파일에 없으면 정의의 글) */
export const echoName = (d: CharDef): string => L().charText[d.id]?.name ?? d.name;
const echoBio = (d: CharDef): string => L().charText[d.id]?.bio ?? d.bio;

/** 정의를 '읽을 때마다 지금 언어의 글'로 (값을 베껴 두지 않고 읽는 순간의 언어를 따르게: 언어를 바꾸면 다시 그리기만 하면 된다) */
function localized(d: CharDef): CharDef {
  // 역할도: 틀의 변신 탭은 역할의 id('vanguard')를 그대로 보인다 (틀의 빈 곳). 알고 있는 정의의 역할은 화면에 보이는 데만 쓰이므로 이름으로 바꿔 둔다
  const role = d.role ? heroRole(d.id).name : '';
  return Object.defineProperties({ ...d }, {
    name: { get: () => echoName(d), enumerable: true },
    bio: { get: () => echoBio(d), enumerable: true },
    ...(role ? { role: { get: () => uiText.get(role), enumerable: true } } : {}),
  });
}

export function initEchoes(): void {
  let placed = false;
  onChars((list) => {
    // 틀이 채운 것(정의의 글 그대로)을 바꾼다: 알고 있는 정의(변신 탭, 안내문의 이름)와 영웅의 표(영웅·뽑기·편성 탭, 싸우는 영웅의 이름표)
    setKnownChars(list.map(localized));
    for (const d of list) {
      const hero = charHero(d);
      addHeroDef(d.id, Object.defineProperty(hero, 'label', { get: () => echoName(d), enumerable: true }));
    }
    if (placed || !list.length) return;
    placed = true;
    // 울림 샘의 북쪽 반원에 석상처럼, 샘을 바라보게
    list.forEach((d, i) => {
      const a = Math.PI * (0.15 + (0.7 * i) / Math.max(1, list.length - 1)), r = 6;
      const x = WELL.x + Math.cos(a) * r * 1.3, z = WELL.z - Math.sin(a) * r;
      addNpc(x, z, makeHumanoid(d.look.colors.cloth ?? 0x8a8a8a, false, d.look.colors.skin, undefined, undefined, d.look), () => echoName(d), { x: WELL.x, z: WELL.z });
    });
  });
  onLangChange(() => redrawMenu(true));
}
