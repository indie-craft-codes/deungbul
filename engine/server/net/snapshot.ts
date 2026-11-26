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
  /** EntState를 JSON으로 만든 것: [id, x, z, 방향, 이동 중, 체력(전투가 있는 게임만), …게임의 값] */
  state: Map<number, string>;
  /** 엔티티마다 게임의 값만 (',값,값' 꼴): 본인에게 보내는 you의 끝에 붙인다 (플레이어의 playerSync) */
  more: Map<number, string>;
  changed: Set<number>;
  fields: Fields;
}

/**
 * 고르지 않은 모듈의 칸을 줄 위에서 뺀다 (모두 켜진 게임은 예전과 바이트까지 같다).
 * hp: 엔티티 상태 줄의 체력 칸과 EnterInfo의 hp·maxHp (combat). weapon: EnterInfo의 w (items). cls: EnterInfo의 c (classes)
 */
export interface Fields { hp: boolean; weapon: boolean; cls: boolean }
const ALL: Fields = { hp: true, weapon: true, cls: true };

/** syncOf: 그 엔티티가 실어 보내는 게임의 값 (게임이 등록한 종류의 sync, 플레이어는 g.playerSync: engine/server/game/game.ts). 없으면 칸을 더하지 않는다 */
export function buildFrame(ents: Iterable<Ent>, syncOf: (e: Ent) => readonly number[] | null | undefined = () => undefined, fields: Fields = ALL): Frame {
  const frame: Frame = { grid: new Map(), state: new Map(), more: new Map(), changed: new Set(), fields };
  for (const e of ents) {
    if (e.dead) continue;
    const vals = syncOf(e);
    let more = '';
    if (vals) for (const v of vals) more += ',' + (typeof v === 'number' && Number.isFinite(v) ? r2(v) : 0);
    const s = `[${e.id},${r2(e.x)},${r2(e.z)},${r2(e.face)},${e.moving ? 1 : 0}${fields.hp ? `,${Math.ceil(e.hp)}` : ''}${more}]`;
    if (lastState.get(e) !== s) { frame.changed.add(e.id); lastState.set(e, s); }
    frame.state.set(e.id, s);
    if (more) frame.more.set(e.id, more);
    const k = cellKey(cellOf(e.x), cellOf(e.z));
    const list = frame.grid.get(k);
    if (list) list.push(e); else frame.grid.set(k, [e]);
  }
  return frame;
}

/**
 * 한 클라이언트에 보낼 스냅샷(JSON 문자열)을 만든다. 형식은 engine/shared/protocol.ts의 'snap' 메시지다.
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
          // 칸의 차례가 줄 위의 차례다 (undefined인 칸은 JSON에서 빠진다): 모듈을 다 고른 게임은 예전과 같은 글자
          const f = frame.fields;
          const info: EnterInfo = { id: e.id, kind: e.kind, type: e.type, name: e.name, w: f.weapon ? e.weapon : undefined, a: e.armor || undefined, c: f.cls ? e.cls : undefined, x: r2(e.x), z: r2(e.z), face: r2(e.face), hp: f.hp ? Math.ceil(e.hp) : undefined, maxHp: f.hp ? e.maxHp : undefined };
          if (e.swarm) info.r = 1; // 줄 위의 칸 이름은 그대로 r (몰려온 적)
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

  // you: 내 상태. 게임이 플레이어에게 실어 보내는 값(playerSync)이 있으면 끝에 붙는다
  let json = `{"t":"snap","n":${online},"you":[${r2(me.x)},${r2(me.z)},${me.moving ? 1 : 0},${Math.ceil(me.hp)},${me.targetId}${frame.more.get(me.id) ?? ''}]`;
  if (enter.length) json += `,"enter":${JSON.stringify(enter)}`;
  if (leave.length) json += `,"leave":[${leave.join(',')}]`;
  json += `,"ents":[${ents.join(',')}]`;
  if (ev.length) json += `,"ev":${JSON.stringify(ev)}`;
  return { json: json + '}', seen };
}
