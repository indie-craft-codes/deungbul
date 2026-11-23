// 스냅샷: 클라이언트마다 시야(AOI) 안의 엔티티와 그에 얽힌 사건만 추려서 보낼 내용을 만든다.
// 비용을 줄이는 두 가지 (근거는 docs/infra.md의 측정):
//   1. 엔티티 상태는 한 번만 문자열로 만들어 모든 클라이언트가 나눠 쓴다.
//   2. 지난번과 상태가 같은 엔티티(서 있는 캐릭터)는 다시 보내지 않는다. 클라이언트는 마지막 상태를 그대로 둔다.
import type { EnterInfo, Ev } from '../../shared/protocol';
import { AOI, AOI_LEAVE, CELL } from '../../shared/world';
import type { Ent } from '../game/entity';

const r2 = (v: number) => Math.round(v * 100) / 100;
const cellOf = (v: number) => Math.floor((v + 4096) / CELL); // 4096: 음수 좌표를 없애는 넉넉한 값
const cellKey = (cx: number, cz: number) => cx * 1024 + cz;
const REACH = Math.ceil(AOI_LEAVE / CELL);

/** 엔티티마다 지난번에 보낸 상태 */
const lastState = new WeakMap<Ent, string>();

/** 한 번의 전송에 쓰는 재료: 공간 격자, 엔티티별 상태 문자열, 지난번과 달라진 엔티티 */
export interface Frame {
  /** 가까운 칸만 훑어서 주변 엔티티를 찾기 위한 격자 */
  grid: Map<number, Ent[]>;
  /** EntState를 JSON으로 만든 것: [id, x, z, 방향, 이동 중, 체력] */
  state: Map<number, string>;
  changed: Set<number>;
}

export function buildFrame(ents: Iterable<Ent>): Frame {
  const frame: Frame = { grid: new Map(), state: new Map(), changed: new Set() };
  for (const e of ents) {
    if (e.dead) continue;
    const s = `[${e.id},${r2(e.x)},${r2(e.z)},${r2(e.face)},${e.moving ? 1 : 0},${Math.ceil(e.hp)}]`;
    if (lastState.get(e) !== s) { frame.changed.add(e.id); lastState.set(e, s); }
    frame.state.set(e.id, s);
    const k = cellKey(cellOf(e.x), cellOf(e.z));
    const list = frame.grid.get(k);
    if (list) list.push(e); else frame.grid.set(k, [e]);
  }
  return frame;
}

/**
 * 한 클라이언트에 보낼 스냅샷(JSON 문자열)을 만든다. 형식은 shared/protocol.ts의 'snap' 메시지다.
 * known은 지난번에 보이던 엔티티이고, 돌려주는 seen이 다음 known이 된다.
 * 시야에 들어올 때는 AOI, 빠질 때는 조금 넓은 AOI_LEAVE를 써서 경계에서 깜빡이지 않게 한다.
 */
export function snapshotFor(me: Ent, known: Set<number>, frame: Frame, events: readonly Ev[], online: number): { json: string; seen: Set<number> } {
  const cx = cellOf(me.x), cz = cellOf(me.z);
  const seen = new Set<number>();
  const ents: string[] = [];
  const enter: EnterInfo[] = [];
  for (let ix = cx - REACH; ix <= cx + REACH; ix++) {
    for (let iz = cz - REACH; iz <= cz + REACH; iz++) {
      const cell = frame.grid.get(cellKey(ix, iz));
      if (!cell) continue;
      for (const e of cell) {
        if (e === me || e.layer !== me.layer) continue;
        const d = Math.hypot(e.x - me.x, e.z - me.z);
        const was = known.has(e.id);
        if (d > (was ? AOI_LEAVE : AOI)) continue;
        seen.add(e.id);
        if (!was) {
          const info: EnterInfo = { id: e.id, kind: e.kind, type: e.type, name: e.name, w: e.weapon, a: e.armor || undefined, c: e.cls, x: r2(e.x), z: r2(e.z), face: r2(e.face), hp: Math.ceil(e.hp), maxHp: e.maxHp };
          if (e.raid) info.r = 1;
          if (e.guild) info.g = e.guild;
          enter.push(info);
        }
        // 새로 보이거나 상태가 달라진 것만 보낸다
        if (!was || frame.changed.has(e.id)) ents.push(frame.state.get(e.id)!);
      }
    }
  }
  const leave: number[] = [];
  for (const id of known) if (!seen.has(id)) leave.push(id);
  // 사건은 내가 보고 있던(또는 이제 보이는) 엔티티가 얽힌 것만 보낸다
  const sees = (id: number) => id === me.id || seen.has(id) || known.has(id);
  const ev = events.length ? events.filter((e) => (e[0] === 'h' ? sees(e[1]) || sees(e[2]) : sees(e[1]))) : [];

  let json = `{"t":"snap","n":${online},"you":[${r2(me.x)},${r2(me.z)},${me.moving ? 1 : 0},${Math.ceil(me.hp)},${me.targetId}]`;
  if (enter.length) json += `,"enter":${JSON.stringify(enter)}`;
  if (leave.length) json += `,"leave":[${leave.join(',')}]`;
  json += `,"ents":[${ents.join(',')}]`;
  if (ev.length) json += `,"ev":${JSON.stringify(ev)}`;
  return { json: json + '}', seen };
}
