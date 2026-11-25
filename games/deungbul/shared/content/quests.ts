// 메인 퀘스트. 장(chapter)마다 단계가 차례로 이어지고, 진행은 플레이어마다 따로 저장한다.
// 주민이 서버 전체에서 이미 돌아왔더라도, 늦게 온 사람은 그 장을 처음부터 겪는다.
// 제목과 단계 문장은 언어 파일에 있다 (quests[장 id]).
import type { ItemId } from '@engine/shared/defs/items';
import type { MonsterId } from '@engine/shared/defs/monsters';
import { SHOP } from './items';
import { CLEARINGS, TOWER, TOWERS } from './map';

export type QuestGoal =
  /** 몬스터를 n마리 잡는다 */
  | { kind: 'kill'; monster: MonsterId; n: number }
  /**
   * 불씨를 n개 바친다 (등탑이든 주민이든). tower를 적으면 그 번호의 등탑에 바친 것만 센다.
   * to: 'resident'면 주민에게 보탠 것(등탑 창의 '보태기')만 센다: 대장장이·약초꾼을 되돌리는 길로 이끈다.
   * 서버에서 주민이 모두 돌아와 보탤 곳이 없으면 등탑에 바친 것도 센다(늦게 온 사람이 막히지 않게)
   */
  | { kind: 'offer'; n: number; tower?: number; to?: 'resident' }
  /** 그 자리에 간다 */
  | { kind: 'visit'; r: number }
  /** 상점에서 그 물건을 n개 산다 */
  | { kind: 'buy'; item: ItemId; n: number }
  /** 안개 습격을 n번 막아 낸다 (맞서 싸운 사람으로 인정받아야 한다) */
  | { kind: 'raid'; n: number };

export interface QuestStep {
  goal: QuestGoal;
  /** 가야 할 곳. 화면에 길잡이를 띄운다 */
  at: { x: number; z: number };
  reward: { exp: number; sparks: number };
}
export interface QuestChapter { id: string; steps: readonly QuestStep[] }

/** 등탑 앞(바치는 거리 안). 등탑의 한가운데로 걸으면 기둥에 막혀 둘레 어딘가에 서고, 잿빛 숲에서는 바치는 거리(6m) 밖(6.2m)에 섰다(후반부 검토) */
const front = (t: { x: number; z: number; r: number }) => ({ x: t.x, z: t.z + t.r + 1.8 });

/** 옛 대장간 터: 브람의 그림자가 맴도는 곳 */
export const FORGE = CLEARINGS[4];
/** 옛 약초밭: 미라의 그림자가 맴도는 곳 */
export const HERB_FIELD = CLEARINGS[5];

export const QUESTS = [
  {
    id: 'bram',
    steps: [
      { goal: { kind: 'kill', monster: 'slime', n: 3 }, at: CLEARINGS[0], reward: { exp: 20, sparks: 0 } },
      { goal: { kind: 'offer', n: 1 }, at: front(TOWER), reward: { exp: 20, sparks: 2 } },
      { goal: { kind: 'visit', r: 7 }, at: FORGE, reward: { exp: 30, sparks: 0 } },
      { goal: { kind: 'kill', monster: 'shade_bram', n: 1 }, at: FORGE, reward: { exp: 60, sparks: 2 } },
      { goal: { kind: 'offer', n: 30, to: 'resident' }, at: front(TOWER), reward: { exp: 100, sparks: 5 } }, // 30: 대장장이 브람이 돌아오는 데 드는 만큼 (혼자서도 되돌린다)
    ],
  },
  {
    id: 'mira',
    steps: [
      { goal: { kind: 'buy', item: 'potion', n: 1 }, at: SHOP, reward: { exp: 30, sparks: 0 } },
      { goal: { kind: 'kill', monster: 'wisp', n: 4 }, at: CLEARINGS[1], reward: { exp: 50, sparks: 2 } },
      { goal: { kind: 'visit', r: 7 }, at: HERB_FIELD, reward: { exp: 40, sparks: 0 } },
      { goal: { kind: 'kill', monster: 'shade_mira', n: 1 }, at: HERB_FIELD, reward: { exp: 90, sparks: 3 } },
      { goal: { kind: 'offer', n: 60, to: 'resident' }, at: front(TOWER), reward: { exp: 150, sparks: 5 } }, // 60: 약초꾼 미라가 돌아오는 데 드는 만큼
    ],
  },
  {
    id: 'ashwood',
    steps: [
      { goal: { kind: 'visit', r: 9 }, at: TOWERS[1].spawn, reward: { exp: 60, sparks: 0 } },
      { goal: { kind: 'offer', n: 5, tower: 1 }, at: front(TOWERS[1]), reward: { exp: 80, sparks: 3 } },
      { goal: { kind: 'kill', monster: 'boar', n: 3 }, at: CLEARINGS[6], reward: { exp: 120, sparks: 4 } },
      { goal: { kind: 'kill', monster: 'goblin', n: 4 }, at: CLEARINGS[7], reward: { exp: 140, sparks: 4 } },
      { goal: { kind: 'kill', monster: 'ash_troll', n: 1 }, at: CLEARINGS[11], reward: { exp: 300, sparks: 10 } },
    ],
  },
  {
    // 등탑지기 할멈의 이야기: 등탑을 밝히고, 옛 등탑지기들을 쉬게 하고, 밤의 습격을 함께 막는다
    id: 'halmeom',
    steps: [
      { goal: { kind: 'offer', n: 10, tower: 0 }, at: front(TOWER), reward: { exp: 150, sparks: 0 } },
      { goal: { kind: 'kill', monster: 'lost_soldier', n: 3 }, at: CLEARINGS[8], reward: { exp: 200, sparks: 6 } },
      { goal: { kind: 'raid', n: 1 }, at: front(TOWER), reward: { exp: 400, sparks: 15 } },
    ],
  },
] as const satisfies readonly QuestChapter[];
export type QuestId = (typeof QUESTS)[number]['id'];

/** 단계의 목표 수치 (진행 표시용) */
export function goalCount(g: QuestGoal): number { return g.kind === 'visit' ? 1 : g.n; }
