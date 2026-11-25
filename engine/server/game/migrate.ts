// 저장 형식의 버전과 이전. 캐릭터 저장(PlayerSave)과 월드 저장(WorldSave)마다 버전 칸이 둘이다:
//   v   틀의 칸과 틀이 정한 모양의 버전. 아래 PLAYER_UP·WORLD_UP(틀의 이전 목록)이 올린다
//   gv  게임의 칸의 버전. 게임이 플러그인에서 g.migrations.player·world에 더한 이전 목록이 올린다
// 둘을 따로 세는 까닭: 틀은 여러 게임이 함께 쓴다. 틀이 저장의 모양을 바꿔도 게임의 번호가 밀리지 않고, 게임이 바꿔도 다른 게임과 틀의 번호가 그대로다.
// 읽을 때(players.spawn, importWorld) 낮은 버전부터 차례로 올린다: 틀의 목록을 먼저 끝까지, 그다음 게임의 목록. 쓸 때(players.export, exportWorld)는 지금의 버전을 적는다.
// 버전 칸이 없는 저장은 v0, gv0이다. 틀의 첫 이전(0 → 1)이 예전에 읽는 길에서 하던 일(Saver.legacy: 옛 최상위 칸에서 자기 몫을 찾는다)을 그대로 한다.
// 이전 함수는 순수하게 짠다: 받은 저장(복사본이다)을 고쳐 돌려준다. 시스템의 상태를 건드리지 않는다. 저장이 깨져 있어도 예외를 던지지 않는 편이 낫다(던지면 그 단계만 건너뛴다).
import type { PlayerSave, WorldSave } from '../store';
import type { Game } from './game';

/** 이전 한 단계: 버전 to-1의 저장을 to로 올린다. 고친 저장을 돌려주거나, 받은 것을 고치고 아무것도 돌려주지 않는다 */
export interface Migration<T> {
  to: number;
  /** 무엇을 바꾸는지 한 줄 (로그와 문서에) */
  note?: string;
  up: (save: T, g: Game) => T | void;
}
/** 게임이 더하는 이전 목록 (g.migrations) */
export interface Migrations { player: Migration<PlayerSave>[]; world: Migration<WorldSave>[] }

type Bag = Record<string, unknown>;

/**
 * 틀의 캐릭터 저장 이전 목록. 새 단계는 끝에 더한다(to는 1부터 하나씩). 지운 단계는 없다: 옛 저장이 남아 있는 한 지우지 않는다.
 *   1: 시스템의 몫이 최상위 칸에 있던 옛 형식 → ext[이름]. 자기 칸(ext[이름])이 없는 시스템만 Saver.legacy로 옛 칸에서 찾는다(둘 다 있으면 ext가 이긴다). 옛 칸은 지우지 않는다(읽는 쪽이 보지 않을 뿐이다)
 */
export const PLAYER_UP: readonly Migration<PlayerSave>[] = [
  {
    to: 1, note: '옛 최상위 칸 → ext (Saver.legacy)',
    up: (save, g) => {
      const whole = structuredClone(save) as Readonly<Bag>; // 모든 legacy가 같은 원본을 본다 (앞의 것이 고친 모양을 뒤의 것이 보지 않게)
      const ext: Bag = typeof save.ext === 'object' && save.ext !== null ? { ...save.ext } : {};
      for (const s of g.saves) {
        if (ext[s.name] !== undefined || !s.legacy) continue;
        try { const old = s.legacy(whole); if (old !== undefined) ext[s.name] = old; } catch { /* 찾지 못한 칸은 처음 상태로 둔다 (예전과 같다) */ }
      }
      save.ext = ext;
    },
  },
];

/**
 * 틀의 월드 저장 이전 목록.
 *   1: 칸 이름이 생기기 전의 옛 형식 → 시스템마다 한 칸. 자기 칸이 없는(이름이 저장에 없는) 시스템만 legacy로 통째에서 자기 몫을 찾는다
 */
export const WORLD_UP: readonly Migration<WorldSave>[] = [
  {
    to: 1, note: '이름 없는 옛 월드 → 시스템마다 한 칸 (worldSaves의 legacy)',
    up: (w, g) => {
      const whole = structuredClone(w);
      for (const s of g.worldSaves) {
        if (s.name in w || !s.legacy) continue;
        try { const old = s.legacy(whole); if (old !== undefined) w[s.name] = old; } catch (err) { console.error(`[game] 옛 월드 저장에서 '${s.name}' 칸을 찾지 못했습니다:`, err); }
      }
    },
  },
];

/** 목록의 마지막 버전 (비었으면 0) */
export const latest = (list: readonly { to: number }[]): number => list.length ? list[list.length - 1].to : 0;

/** 목록이 1부터 하나씩 늘어나는가. 아니면 무엇이 틀렸는지 (서버를 띄울 때 알린다) */
export function checkList(list: readonly { to: number }[], what: string): void {
  list.forEach((m, i) => { if (m.to !== i + 1) throw new Error(`${what}의 ${i + 1}번째 이전의 to가 ${m.to}입니다: 1부터 하나씩 늘어나야 합니다`); });
}

/** 저장에 적힌 버전 (없거나 이상하면 0) */
const versionOf = (save: Bag, field: 'v' | 'gv'): number => { const v = save[field]; return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0; };

/** 앞날의 버전(이 코드보다 새 서버가 쓴 저장)을 이미 알렸는가: 한 프로세스에 한 번만 */
const warned = new Set<string>();

/**
 * 저장을 지금의 버전으로 올린 복사본. 올릴 것이 없으면 받은 것을 그대로 돌려준다(복사하지 않는다).
 * 앞날의 버전이면 건드리지 않고 그대로 읽는다(되돌린 배포에서 새 칸은 모르는 채 무시된다). 틀의 버전(v)이 앞날이면 게임의 이전도 돌리지 않는다:
 * 게임의 이전은 지금의 틀이 아는 모양을 바탕으로 짠 것이라, 모르는 모양 위에서 돌리면 망가뜨릴 수 있다.
 */
export function upgrade<T extends object>(save: T, g: Game, lists: { own: readonly Migration<T>[]; game: readonly Migration<T>[] }, what: string): T {
  let out = save;
  for (const [field, list] of [['v', lists.own], ['gv', lists.game]] as const) {
    const from = versionOf(out as Bag, field), to = latest(list);
    if (from > to) {
      if (!warned.has(what + field)) { warned.add(what + field); console.warn(`[save] ${what} 저장의 ${field}가 ${from}입니다. 이 서버는 ${to}까지 압니다 (새 서버가 쓴 저장): 올리지 않고 읽습니다`); }
      if (field === 'v') return out;
      continue;
    }
    for (const m of list.slice(from)) {
      if (out === save) out = structuredClone(save);
      try { out = (m.up(out, g) ?? out) as T; } catch (err) { console.error(`[save] ${what} 저장을 ${field}${m.to}로 올리지 못했습니다 (그 단계를 건너뜁니다):`, err); }
    }
  }
  return out;
}
