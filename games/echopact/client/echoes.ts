// 메아리(캐릭터 정의)의 화면 쪽: 울림 샘 둘레의 석상 (정의마다 그 겉모습의 사람을 세운다: 부품이 다른 메아리를 한눈에 보는 자리).
// 언어마다의 이름·소개는 틀이 정의의 text로 보인다 (CharDef.text: 변신 탭·영웅 탭·뽑기 결과·안내문·이름표가 모두 그 언어의 글을 읽는다).
import { charText } from '@engine/shared/defs';
import { addNpc, makeHumanoid, onChars } from '@engine/client';
import { WELL } from '../shared/content/pact';

export function initEchoes(): void {
  let placed = false;
  onChars((list) => {
    if (placed || !list.length) return;
    placed = true;
    // 울림 샘의 북쪽 반원에 석상처럼, 샘을 바라보게
    list.forEach((d, i) => {
      const a = Math.PI * (0.15 + (0.7 * i) / Math.max(1, list.length - 1)), r = 6;
      const x = WELL.x + Math.cos(a) * r * 1.3, z = WELL.z - Math.sin(a) * r;
      addNpc(x, z, makeHumanoid(d.look.colors.cloth ?? 0x8a8a8a, false, d.look.colors.skin, undefined, undefined, d.look), () => charText(d).name, { x: WELL.x, z: WELL.z });
    });
  });
}
