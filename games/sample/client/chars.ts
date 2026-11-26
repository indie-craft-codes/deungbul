// 캐릭터 정의를 쓰는 화면 쪽의 예: 모닥불 곁에 정의마다 그 겉모습의 사람을 하나씩 세운다 (부품이 다른 캐릭터를 한눈에 보는 자리).
// 정의는 틀이 서버에서 받아 둔다 (chars 모듈의 개인 상태): 게임은 onChars로 받아 쓰기만 한다. 변신 창(메뉴의 '변신' 탭)은 틀의 것이다.
import { addNpc, makeHumanoid, onChars } from '@engine/client';
import { BONFIRE } from '../shared/content/bonfire';

export function initCharStands(): void {
  let placed = false;
  onChars((list) => {
    if (placed || !list.length) return;
    placed = true;
    // 모닥불 북쪽에 한 줄로, 모닥불을 바라보게
    list.forEach((d, i) => {
      const x = BONFIRE.x + (i - (list.length - 1) / 2) * 2.4, z = BONFIRE.z - 5.5;
      addNpc(x, z, makeHumanoid(d.look.colors.cloth ?? 0x8a8a8a, false, d.look.colors.skin, undefined, undefined, d.look), () => d.name, { x: BONFIRE.x, z: BONFIRE.z });
    });
  });
}
