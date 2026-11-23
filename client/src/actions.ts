// 플레이어가 할 수 있는 일. 입력(마우스, 키보드, 터치, 버튼)은 모두 여기를 거친다.
// 각 행동은 서버에 명령을 보내고, 응답을 기다리지 않고 화면에 먼저 반영할 것을 반영한다.
import { ITEMS, SKILL_SLOTS, classOf, skillDef, type ClassId, type ItemId } from '../../shared/defs';
import { TOWN, clampPoint } from '../../shared/world';
import { view } from './app';
import { markMove } from './fx';
import { feed } from './hud/notify';
import { hideCard, showCard } from './hud/party';
import { t } from './i18n';
import { send } from './net';
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

/** 첫불 마을의 등탑 앞까지 걸어간다 (물약을 사거나 불씨를 바치러 돌아갈 때). */
export function goToTown(): void {
  if (!S.me) return;
  // 등탑 창이 열리는 거리 안까지 간다. 여럿이 눌러도 한 점에 겹치지 않게 조금씩 흩는다
  moveTo(TOWN.x + (Math.random() - 0.5) * 1.6, TOWN.z + (Math.random() - 0.5) * 1.6);
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
  const list = monstersNear(30);
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
  send({ t: 'skill', n });
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

/** 등탑에 불씨를 바친다. 가진 것보다 많이 고르면 가진 만큼만 바친다. */
export function offer(to: 'tower' | 'resident', n: number): void {
  const me = S.me;
  if (me && me.sparks > 0) send({ t: 'offer', to, n: Math.min(n, me.sparks) });
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
  const order: ItemId[] = hurt >= ITEMS.tonic.heal ? ['tonic', 'potion'] : ['potion', 'tonic'];
  const id = order.find(have);
  send({ t: 'use', id: id ?? 'potion' }); // 없으면 서버가 없다고 알려 준다
}

export function rename(name: string): void {
  const me = S.me;
  const next = name.trim();
  if (me && next && next !== me.name) send({ t: 'rename', name: next });
}
