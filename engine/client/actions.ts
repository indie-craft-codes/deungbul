// 플레이어가 할 수 있는 일. 입력(마우스, 키보드, 터치, 버튼)은 모두 여기를 거친다.
// 각 행동은 서버에 명령을 보내고, 응답을 기다리지 않고 화면에 먼저 반영할 것을 반영한다.
import { POTIONS, potionOrder } from '../shared/auto';
import { SKILL_SLOTS, classOf, isMonsterId, monsterDef, skillDef, type ClassId, type ItemId } from '../shared/defs';
import { clampPoint } from '../shared/world';
import { view } from './app';
import { markMove } from './fx';
import { feed } from './hud/notify';
import { hideCard, showCard } from './hud/party';
import { t } from './i18n';
import { send } from './net';
import { rules } from './rules';
import { S, type Remote } from './state';

const MOVE_SEND_MS = 100; // 방향 입력 중에 이동 명령을 보내는 간격
let steering = false, lastMoveSent = 0;

export function moveTo(x: number, z: number): void {
  const me = S.me;
  if (!me) return;
  S.auto = false; // 직접 움직이면 자동 사냥은 꺼진다
  const to = clampPoint(x, z);
  me.tx = to.x; me.tz = to.z;
  me.moving = true; me.stuck = 0; me.path = null; me.lastCmd = performance.now(); me.attackId = 0;
  send({ t: 'move', x: me.tx, z: me.tz });
  markMove(me.tx, me.tz);
}

/** 자동 사냥이 스스로 걷는다: 자동 사냥을 끄지 않고, 목적지 표시도 하지 않는다 */
export function autoWalk(x: number, z: number): void {
  const me = S.me;
  if (!me) return;
  const to = clampPoint(x, z);
  me.tx = to.x; me.tz = to.z;
  me.moving = true; me.stuck = 0; me.path = null; me.lastCmd = performance.now(); me.attackId = 0;
  send({ t: 'move', x: me.tx, z: me.tz });
}

/** 마을까지 걸어간다 (물약을 사거나 볼일을 보러 돌아갈 때). 어디가 마을인지는 게임의 규칙이 안다 (rules.home: 이 게임에서는 첫불 마을의 등탑 앞). */
export function goToTown(): void {
  if (!S.me) return;
  // 여럿이 눌러도 한 점에 겹치지 않게 조금씩 흩는다
  const town = rules.home();
  moveTo(town.x + (Math.random() - 0.5) * 1.6, town.z + (Math.random() - 0.5) * 1.6);
  feed(t('goingTown'));
}

export function stop(): void {
  const me = S.me;
  if (!me) return;
  S.auto = false;
  me.moving = false; me.attackId = 0;
  send({ t: 'stop' });
}

export function attack(id: number): void {
  const me = S.me;
  if (!me) return;
  me.attackId = id; me.attackAt = performance.now(); me.stuck = 0;
  send({ t: 'attack', id });
}

/** 가까운 순서로 정렬한, 살아 있는 몬스터들 */
export function monstersNear(range: number): Remote[] {
  const me = S.me;
  if (!me) return [];
  const d = (r: Remote) => Math.hypot(r.x - me.x, r.z - me.z);
  return [...S.others.values()].filter((r) => r.kind === 'm' && !r.dying && !r.gone && d(r) < range).sort((a, b) => d(a) - d(b));
}

/** 가까운 대상부터 차례로 바꿔 가며 공격한다. */
export function nextTarget(): void {
  const me = S.me;
  if (!me) return;
  // 가까운 차례로 돌되, 센 몬스터(우두머리, 체력이 내 최대 체력 이상)는 뒤로 미룬다: 처음 온 사람이 Tab으로 퀘스트의 그림자부터 잡던 것(플레이어 재검토)
  const strong = (r: Remote) => (isMonsterId(r.type) && !!monsterDef(r.type).boss) || r.maxHp >= me.maxHp;
  const near = monstersNear(30), list = [...near.filter((r) => !strong(r)), ...near.filter(strong)];
  if (!list.length) { feed(t('noTargetNearby')); return; }
  const i = list.findIndex((r) => r.id === me.attackId);
  attack(list[(i + 1) % list.length].id);
}

export function useSkill(n: number): void {
  const me = S.me;
  if (!me || n < 0 || n >= SKILL_SLOTS || performance.now() < S.cdEnd[n]) return;
  // 대상이 필요한 기술인데 대상이 없으면 가장 가까운 몬스터를 잡는다
  const def = skillDef(classOf(me.cls).skills[n]);
  if (def.range !== undefined && !me.attackId) { const near = monstersNear(Math.max(12, def.range))[0]; if (near) attack(near.id); }
  // 대상이 사거리 밖이면 다가가서 쓴다: 공격 명령으로 다가가게 하고(서버가 쫓아간다), 사거리 안에 들어오면 skillQueueTick이 쓴다.
  // 전에는 "대상이 너무 멉니다"만 뜨고 아무것도 하지 않았다(플레이어 재검토)
  const t = def.range !== undefined ? S.others.get(me.attackId) : undefined;
  if (t && Math.hypot(t.x - me.x, t.z - me.z) > def.range!) {
    if (!me.moving) attack(t.id);
    queued = { n, target: t.id, until: performance.now() + 6000 };
    return;
  }
  queued = null;
  send({ t: 'skill', n });
}

/** 사거리 밖이라 다가가는 동안 기다리는 기술 (칸 번호, 대상, 그만 기다리는 때) */
let queued: { n: number; target: number; until: number } | null = null;
/** 매 프레임: 기다리는 기술의 대상이 사거리 안에 들어오면 쓴다. 대상이 바뀌거나 사라지거나 6초가 지나면 그만둔다 */
export function skillQueueTick(now: number): void {
  const me = S.me, q = queued;
  if (!q || !me) return;
  const t = S.others.get(q.target);
  if (!t || t.dying || t.gone || me.attackId !== q.target || now > q.until) { queued = null; return; }
  const def = skillDef(classOf(me.cls).skills[q.n]);
  if (Math.hypot(t.x - me.x, t.z - me.z) <= (def.range ?? 0) - 0.3) { queued = null; send({ t: 'skill', n: q.n }); }
}

/** 화면의 점을 눌렀다: 몬스터면 공격, 아니면 그 자리로 이동. */
export function tapAt(sx: number, sy: number, touch: boolean): void {
  let pick: Remote | null = null, best = touch ? 46 : 34;
  for (const r of S.others.values()) {
    if (r.kind !== 'm' || r.dying || r.gone) continue;
    const p = view.project(r.x, r.h * 0.45, r.z);
    if (!p) continue;
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d < best) { best = d; pick = r; }
  }
  hideCard();
  if (pick) { attack(pick.id); return; }
  // 다른 사람을 눌렀으면 초대 단추를 띄운다 (몬스터보다 좁게 잡아서 이동을 방해하지 않게 한다)
  let who: Remote | null = null;
  best = touch ? 34 : 24;
  for (const r of S.others.values()) {
    if (r.kind !== 'p' || r.gone) continue;
    const at = view.project(r.x, 1.2, r.z);
    if (!at) continue;
    const d = Math.hypot(at.x - sx, at.y - sy);
    if (d < best) { best = d; who = r; }
  }
  if (who) { showCard(who.id, who.name, sx, sy); return; }
  const p = view.pick(sx, sy);
  if (p) moveTo(p.x, p.z);
}

/**
 * 방향 입력(WASD, 조이스틱)으로 걷는다. kx, kz는 화면 기준 방향(-1~1)이다.
 * 화면 방향을 월드 방향으로 바꿔서 조금 앞을 목표로 삼고, 입력이 끝나면 멈춘다.
 */
export function steer(kx: number, kz: number, now: number): void {
  const me = S.me;
  if (!me) return;
  if (Math.abs(kx) + Math.abs(kz) > 0.2) {
    S.auto = false;
    const mx = (kx + kz) * 0.7071, mz = (kz - kx) * 0.7071, len = Math.hypot(mx, mz);
    const to = clampPoint(me.x + (mx / len) * 4, me.z + (mz / len) * 4);
    me.tx = to.x; me.tz = to.z;
    me.moving = true; me.stuck = 0; me.lastCmd = now; me.attackId = 0;
    if (now - lastMoveSent > MOVE_SEND_MS) { lastMoveSent = now; send({ t: 'move', x: me.tx, z: me.tz }); }
    steering = true;
  } else if (steering) {
    steering = false;
    me.moving = false;
    send({ t: 'stop' });
  }
}

export function chooseClass(id: ClassId): void { send({ t: 'class', id }); }

export function buy(id: ItemId): void { send({ t: 'buy', id }); }
export function craft(id: ItemId): void { send({ t: 'craft', id }); }

/** 물약을 마신다. 많이 다쳤으면 진한 물약부터, 아니면 보통 물약부터 쓴다. */
export function usePotion(): void {
  const me = S.me;
  if (!me || performance.now() < S.itemCdEnd) return;
  const have = (id: ItemId) => (me.items[id] ?? 0) > 0;
  const hurt = me.maxHp - me.hp;
  // 물약의 id를 적지 않고 정의(회복량)에서 고른다: 자동 사냥과 같은 목록이다 (engine/shared/auto.ts)
  const id = potionOrder(hurt).find(have);
  if (!POTIONS.length) return;
  send({ t: 'use', id: id ?? POTIONS[POTIONS.length - 1] }); // 없으면 (가장 약한 물약으로 물어) 서버가 없다고 알려 준다
}

export function rename(name: string): void {
  const me = S.me;
  const next = name.trim();
  if (me && next && next !== me.name) send({ t: 'rename', name: next });
}
