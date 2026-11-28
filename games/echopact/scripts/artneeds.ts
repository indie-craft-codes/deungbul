// 이 게임만 아는 그림 칸 (node scripts/art-list.mjs echopact가 읽는다): 내용(shared/content)에 없는 것.
//   메아리 열 (server/echoes.ts의 손으로 쓴 캐릭터 정의: 영어 이름·소개는 text.en), 탑의 장면 둘 (홈 'tower', 모험 지도 'adventure': client/tower.ts)
import { ECHO_DEFS } from '../server/echoes';

interface EchoDef { id: string; rarity: number; role: string; text?: { en?: { name?: string; bio?: string } }; look?: { colors?: Record<string, number> } }
const RAR = ['Common', 'Rare', 'Legendary'];
const ROLE: Record<string, string> = { vanguard: 'Vanguard (shield fighter)', ranger: 'Ranger (archer)', mystic: 'Mystic (spellcaster)', mender: 'Mender (healer)' };
/** 단계의 적의 생김새 (client/scene.ts의 SPIRITS·BEASTS와 같은 색): 틀이 만든 설명 뒤에 붙인다 */
const SPIRIT = 'a floating echo spirit: cone-shaped robed body, round head with two glowing eyes, a golden halo ring above';
const LOOKS: Record<string, string> = {
  mossling: 'Looks like a small mossy green boar-piglet.', thornboar: 'Looks like a brown boar with short horns.', stonehorn: 'Looks like a big grey horned beast of stone.',
  wisp: `Looks like ${SPIRIT}, pale blue #9ad0ff, small.`, hollowkin: `Looks like ${SPIRIT}, dusky violet #8a7aa0.`, shadeshot: `Looks like ${SPIRIT}, dark slate #4a4a6a, holds a bow.`,
  bellgolem: 'A huge golem made of a bronze bell tower (#b08a50).', echowarden: `Looks like ${SPIRIT}, deep violet #6a5aa0, giant and armored.`,
  chimeling: `Looks like ${SPIRIT}, golden #d0b060, quick and small, little chimes.`, dirgecaster: `Looks like ${SPIRIT}, teal #3a6a6a, holds a staff.`,
  mirrorshade: `Looks like ${SPIRIT}, silvery mirror-like #c8d8e8.`, knellwraith: `Looks like ${SPIRIT}, dark maroon #5a3a4a, giant wraith with a funeral bell.`,
  pactsovereign: `Looks like ${SPIRIT}, regal gold #e0c070, giant, crowned final boss.`,
};
const hex = (n?: number): string => (n === undefined ? '' : `#${n.toString(16).padStart(6, '0')}`);

export function ART_NEEDS(): { key: string; prio: 1 | 2 | 3; desc: string; append?: boolean }[] {
  const out: { key: string; prio: 1 | 2 | 3; desc: string; append?: boolean }[] = [
    { key: 'bg:tower', prio: 1, desc: 'Home lobby backdrop: the Pact Spire, a tall violet bell tower at dusk, echoes drifting like fireflies, stylized low-poly fantasy' },
    { key: 'bg:adventure', prio: 2, desc: 'Adventure map backdrop: chapter path winding up the floors of the Pact Spire, parchment-and-violet fantasy map, stylized low-poly' },
  ];
  for (const raw of ECHO_DEFS as readonly EchoDef[]) {
    const en = raw.text?.en ?? {}, c = raw.look?.colors ?? {};
    out.push({
      key: `portrait:${raw.id}`, prio: 1,
      desc: `Character portrait of "${en.name ?? raw.id}", ${RAR[raw.rarity] ?? ''} ${ROLE[raw.role] ?? raw.role}: ${en.bio ?? ''} Cloth ${hex(c.cloth)}, accent ${hex(c.accent)}. Full body centered, transparent background, stylized low-poly fantasy`,
    });
  }
  // 탑 전투의 유닛 그림: 메아리는 초상(portrait)을 그대로 쓴다. 따로 그리고 싶을 때만 unit:<id>
  for (const raw of ECHO_DEFS as readonly EchoDef[]) out.push({ key: `unit:${raw.id}`, prio: 3, desc: `Optional in-battle sprite of "${raw.text?.en?.name ?? raw.id}" (else portrait:${raw.id} is used): full body standing, facing right, feet at the bottom edge, transparent background` });
  for (const [id, d] of Object.entries(LOOKS)) out.push({ key: `enemy:${id}`, prio: 2, desc: d, append: true });
  return out;
}
