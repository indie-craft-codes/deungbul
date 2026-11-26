// 스냅샷: 클라이언트마다 시야(AOI) 안의 엔티티와 그에 얽힌 사건만 추려서 보낼 내용을 만든다.
// 비용을 줄이는 두 가지 (근거는 docs/infra.md의 측정):
//   1. 엔티티 상태는 한 번만 문자열로 만들어 모든 클라이언트가 나눠 쓴다.
//   2. 지난번과 상태가 같은 엔티티(서 있는 캐릭터)는 다시 보내지 않는다. 클라이언트는 마지막 상태를 그대로 둔다.
//   3. 공간 격자를 층(Ent.layer)마다 따로 둔다: 단계·던전의 인스턴스는 사람마다 다른 층이지만 같은 좌표(경기장)에서 벌어지므로,
//      한 격자에 모으면 사람마다 남의 인스턴스 엔티티까지 모두 훑었다(인원의 제곱). 층마다 나누어도 한 칸 안의 차례(엔티티를 만든 차례)는 같아 보내는 글자는 그대로다.
import type { EnterInfo, Ev } from '../../shared/protocol';
import { AOI, AOI_LEAVE, CELL } from '../../shared/world';
import type { Ent } from '../game/entity';

const r2 = (v: number) => Math.round(v * 100) / 100;
const cellOf = (v: number) => Math.floor((v + 4096) / CELL); // 4096: 음수 좌표를 없애는 넉넉한 값
const cellKey = (cx: number, cz: number) => cx * 1024 + cz;
const REACH = Math.ceil(AOI_LEAVE / CELL);

/** 엔티티마다 지난번에 만든 상태: 줄 위의 글자와 그 재료(둘째 자리로 자른 수). 재료가 같으면 글자를 다시 만들지 않는다 */
interface Last { x: number; z: number; f: number; m: number; hp: number; withHp: boolean; more: string; s: string }
const lastState = new WeakMap<Ent, Last>();
/**
 * Math.hypot(dx, dz) > r 와 같은 답을 더 싸게: 제곱의 합이 r²에서 넉넉히(10⁻⁹) 떨어져 있으면 그것으로, 경계 가까이면 예전처럼 hypot으로 (시야 경계의 판정이 한 자리도 달라지지 않게)
 */
function outside(dx: number, dz: number, r: number): boolean {
  const q = dx * dx + dz * dz, rr = r * r;
  if (q < rr * (1 - 1e-9)) return false;
  if (q > rr * (1 + 1e-9)) return true;
  return Math.hypot(dx, dz) > r;
}
/** 같은 수인가: 글자로 견주던 것과 같게 NaN끼리도 같다 (0과 -0은 글자가 '0'으로 같고 ===도 같다) */
const same = (a: number, b: number) => a === b || (a !== a && b !== b);

/** 한 번의 전송에 쓰는 재료: 공간 격자, 엔티티별 상태 문자열, 지난번과 달라진 엔티티 */
export interface Frame {
  /** 가까운 칸만 훑어서 주변 엔티티를 찾기 위한 격자: 층 → 칸 → 엔티티 (칸 안은 엔티티를 만든 차례) */
  grid: Map<number, Map<number, Ent[]>>;
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
    const x = r2(e.x), z = r2(e.z), f = r2(e.face), m = e.moving ? 1 : 0, hp = fields.hp ? Math.ceil(e.hp) : 0;
    const L = lastState.get(e);
    let s: string;
    // 지난번과 재료가 같으면 글자도 같다: 다시 만들지 않는다 (서 있는 것, 그대로인 것)
    if (L && same(L.x, x) && same(L.z, z) && same(L.f, f) && L.m === m && L.withHp === fields.hp && same(L.hp, hp) && L.more === more) s = L.s;
    else {
      s = `[${e.id},${x},${z},${f},${m}${fields.hp ? `,${hp}` : ''}${more}]`;
      if (L?.s !== s) frame.changed.add(e.id);
      lastState.set(e, { x, z, f, m, hp, withHp: fields.hp, more, s });
    }
    frame.state.set(e.id, s);
    if (more) frame.more.set(e.id, more);
    let cells = frame.grid.get(e.layer);
    if (!cells) frame.grid.set(e.layer, cells = new Map());
    const k = cellKey(cellOf(e.x), cellOf(e.z));
    const list = cells.get(k);
    if (list) list.push(e); else cells.set(k, [e]);
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
  const cells = frame.grid.get(me.layer);
  if (cells) for (let ix = cx - REACH; ix <= cx + REACH; ix++) {
    for (let iz = cz - REACH; iz <= cz + REACH; iz++) {
      const cell = cells.get(cellKey(ix, iz));
      if (!cell) continue;
      for (const e of cell) {
        if (e === me || e.layer !== me.layer) continue;
        const was = known.has(e.id);
        if (outside(e.x - me.x, e.z - me.z, was ? AOI_LEAVE : AOI)) continue;
        seen.add(e.id);
        if (!was) {
          // 칸의 차례가 줄 위의 차례다 (undefined인 칸은 JSON에서 빠진다): 모듈을 다 고른 게임은 예전과 같은 글자
          const f = frame.fields;
          const info: EnterInfo = { id: e.id, kind: e.kind, type: e.type, name: e.name, w: f.weapon ? e.weapon : undefined, a: e.armor || undefined, c: f.cls ? e.cls : undefined, x: r2(e.x), z: r2(e.z), face: r2(e.face), hp: f.hp ? Math.ceil(e.hp) : undefined, maxHp: f.hp ? e.maxHp : undefined };
          // 갑옷(아이템), 몰려온 적(전투), 길드(길드)는 그 모듈을 고르지 않은 게임의 엔티티에는 칸이 없다(undefined): 빠진다
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

  // you: 내 상태. 게임이 플레이어에게 실어 보내는 값(playerSync)이 있으면 끝에 붙는다. 체력과 노리는 대상의 칸은 늘 있고, 전투 모듈이 없으면 0이다
  const fight = frame.fields.hp;
  let json = `{"t":"snap","n":${online},"you":[${r2(me.x)},${r2(me.z)},${me.moving ? 1 : 0},${fight ? Math.ceil(me.hp) : 0},${fight ? me.targetId : 0}${frame.more.get(me.id) ?? ''}]`;
  if (enter.length) json += `,"enter":${JSON.stringify(enter)}`;
  if (leave.length) json += `,"leave":[${leave.join(',')}]`;
  json += `,"ents":[${ents.join(',')}]`;
  if (ev.length) json += `,"ev":${JSON.stringify(ev)}`;
  return { json: json + '}', seen };
}
