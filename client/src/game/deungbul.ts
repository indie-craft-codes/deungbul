// 이 게임(등불지기)의 클라이언트 모듈: 틀의 화면 코드가 묻는 규칙(rules)을 채우고, 돌아온 주민을 세우고, 이 게임의 단축키를 등록한다.
// 서버의 server/game/deungbul.ts(installDeungbul)와 짝이다. 틀의 파일은 이 파일을 import하지 않는다 (modules.ts의 목록만 안다).
// 등탑이 정하는 것: 이동 속도(환한 구역에서 빨라진다)와, 주민이 돌아와야 풀리는 것(상점 물건, 대장간).
import { RESIDENTS, SHOPS, speedFor } from '../../../shared/defs';
import { TOWER, TOWERS } from '../../../shared/world';
import { onKey, onMsg } from '../bus';
import { addNpc, setMerchantLook } from '../entities';
import { goToQuest } from '../hud/quest';
import { L } from '../i18n';
import { rules } from '../rules';
import { makeHumanoid } from '../scene/models';
import { S, stage } from '../state';

const NPC_CLOTH = [0x7a5a3a, 0x4c9a6a, 0x8a6aa0];
/** 이미 마을에 세운 주민 (RESIDENTS의 번호) */
const standing = new Set<number>();

const residentIndex = (id: string): number => RESIDENTS.findIndex((r) => r.id === id);
/** 그 주민이 돌아왔는가. 서버의 Tower.returned와 같은 판정 */
const returned = (i: number): boolean => S.world.tower.residents[i] >= RESIDENTS[i].need;

/** 공유 상태에 맞춰 돌아온 주민을 마을에 세운다 (서버 엔티티가 아니라 화면에만 세워 둔다). */
function syncNpcs(): void {
  RESIDENTS.forEach((def, i) => {
    if (!returned(i) || standing.has(i)) return;
    standing.add(i);
    addNpc(def.x, def.z, makeHumanoid(NPC_CLOTH[i % NPC_CLOTH.length], false), () => L().residents[def.id].name, { x: TOWER.x, z: TOWER.z + 6 });
  });
}

export function initDeungbul(): void {
  // 서버(systems/tower.ts)가 g.rules에 채우는 것과 같은 식이어야 한다: 속도는 같은 공유 함수(speedFor)로 셈한다
  rules.speed = () => speedFor(stage());
  // 열쇠는 주민의 id다. 주민이 아닌 열쇠는 잠그지 않는다
  rules.unlocked = (key) => { const i = residentIndex(key); return i < 0 || returned(i); };
  rules.lockNote = (key) => {
    const i = residentIndex(key), loc = L();
    return i < 0 ? '' : loc.fmt.needsResident(loc.residents[RESIDENTS[i].id].name);
  };
  // 주민의 그림자를 쓰러뜨려 장을 마쳤는데 그 주민이 아직 돌아오지 않았으면, 어떻게 되돌리는지 알려 준다 (장 이름이 주민 id와 같다: bram, mira)
  rules.lockHint = (key) => {
    const i = residentIndex(key);
    if (i < 0 || returned(i)) return '';
    const loc = L();
    return loc.fmt.residentHint(loc.residents[RESIDENTS[i].id].name, RESIDENTS[i].need - S.world.tower.residents[i]);
  };
  // 상인은 곁의 등탑을 바라본다 (SHOPS의 tower는 TOWERS의 번호)
  setMerchantLook((_s, i) => TOWERS[SHOPS[i].tower] ?? TOWER);
  // main.ts가 공유 상태(S.world)를 받아 둔 뒤에 불린다: 같은 종류의 처리기는 등록한 순서대로 돈다
  onMsg('world', syncNpcs);
  // F: 퀘스트의 목적지까지 걸어간다
  onKey('f', goToQuest);
}
