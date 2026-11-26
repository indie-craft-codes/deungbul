// [chars] 캐릭터 정의: 바깥(AI의 결과, 사람이 적은 JSON, 다른 서버)이 만든 정의를 검증기(engine/shared/defs/chardef.ts의 validateCharDef)로 거른 뒤 두고,
// 화면에 보내고(개인 상태 'chars': 바뀐 때만), roster를 함께 고른 게임에서는 영웅의 표에 더한다(addHeroDef: 뽑기·편성·저장이 내용의 영웅처럼 읽는다).
// 정의를 두는 곳은 저장소(CharStore)다. 기본은 월드 저장의 칸 'chars'(서버 DB의 월드). 계정 공용 저장소로 옮길 때는 useStore로 바꿔 끼운다:
// 두 게임 서버가 같은 저장소를 읽으면 같은 정의를 본다 (소유의 싱크는 그 저장소와 계정의 일이다: 이 틀에는 계정이 없다).
// 정의를 더하는 길은 add 하나다 (게임의 규칙, 관리자, 나중의 AI 만들기 요청). 여기서는 사람이 정의를 보내는 명령을 두지 않는다.
// 읽은 정의가 지금의 규칙(예산·부품)으로 거절되면 쓰지 않고 그대로 간직했다가 다시 적는다 (규칙을 되돌리면 이어진다).
import { addHeroDef, charHero, dropHeroDef, setKnownChars, validateCharDef, type CharCheck, type CharDef } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

/**
 * 정의를 두는 저장소. 틀의 기본은 월드 저장(WorldCharStore 없이 이 시스템이 직접)이고, 게임이나 운영이 바꿔 끼울 수 있다.
 * all은 바꿔 끼울 때 한 번 읽는다. put·remove는 바뀔 때마다 불린다 (늦어도 되는 저장소는 스스로 모아 적는다)
 */
export interface CharStore {
  all(): unknown[];
  put(def: CharDef): void;
  remove(id: string): void;
}

export class Chars {
  private defs = new Map<string, CharDef>();
  /** 읽었지만 지금의 규칙으로 거절된 정의 (쓰지 않고 다시 적는다) */
  private parked: unknown[] = [];
  /** 바꿔 끼운 저장소 (없으면 월드 저장) */
  private store: CharStore | null = null;
  /** 정의의 목록이 바뀐 차례: 사람마다 마지막으로 보낸 차례와 다르면 다시 보낸다 */
  private version = 1;
  private sentTo = new WeakMap<Ent, number>();

  constructor(private g: Game) {
    g.worldSaves.push({
      name: 'chars',
      save: () => (this.store || (!this.defs.size && !this.parked.length) ? undefined : [...this.defs.values(), ...this.parked]),
      load: (raw) => { if (!this.store && Array.isArray(raw)) this.loadAll(raw); },
    });
    g.personal.push({
      name: 'chars',
      state: () => [...this.defs.values()],
      dirty: (p) => this.sentTo.get(p) !== this.version,
      sent: (p) => { this.sentTo.set(p, this.version); },
    });
  }

  /** 그 id의 정의 (없으면 undefined) */
  get(id: string): CharDef | undefined { return this.defs.get(id); }
  has(id: string): boolean { return this.defs.has(id); }
  /** 둔 정의 전부 (더한 차례) */
  list(): CharDef[] { return [...this.defs.values()]; }

  /**
   * 정의를 검증하고 더한다. 객체나 JSON 글자를 받는다. replace면 같은 id의 정의를 바꾼다 (아니면 'idTaken'으로 거절).
   * 돌려주는 것은 검증의 결과 그대로다: 거절되면 issues에 까닭(코드·자리)이 있고 아무것도 바뀌지 않는다
   */
  add(raw: unknown, opts: { replace?: boolean } = {}): CharCheck {
    const r = validateCharDef(raw, (id) => this.defs.has(id) && !opts.replace);
    if (!r.ok) return r;
    this.put(r.def);
    this.store?.put(r.def);
    this.changed();
    this.g.fire('charAdded', r.def);
    return r;
  }

  /** 정의를 뺀다 (회수). 영웅의 표에서도 빠진다: 그 영웅을 가진 사람의 저장에서는 다음 저장부터 사라진다 */
  remove(id: string): boolean {
    if (!this.defs.delete(id)) return false;
    dropHeroDef(id);
    this.store?.remove(id);
    this.changed();
    this.g.fire('charRemoved', id);
    return true;
  }

  /** 저장소를 바꿔 끼운다: 그 저장소의 정의를 모두 읽어 지금의 것을 바꾼다. 그 뒤로 월드 저장에는 적지 않는다 */
  useStore(store: CharStore): void {
    for (const id of [...this.defs.keys()]) dropHeroDef(id);
    this.defs.clear(); this.parked = [];
    this.store = store;
    this.loadAll(store.all());
    this.changed();
  }

  private put(def: CharDef): void {
    this.defs.set(def.id, def);
    if (this.g.has('roster')) addHeroDef(def.id, charHero(def));
  }
  private changed(): void { this.version++; this.g.saveDirty = true; setKnownChars(this.list()); }
  private loadAll(list: unknown[]): void {
    for (const raw of list) {
      // 게임이 서버를 켤 때 이미 더한 id(g.ready에서 add)는 그것이 이긴다: 저장된 옛 것은 버린다 (다음 저장에는 새 것이 적힌다)
      const id = typeof raw === 'object' && raw !== null ? (raw as { id?: unknown }).id : undefined;
      if (typeof id === 'string' && this.defs.has(id)) continue;
      const r = validateCharDef(raw, (x) => this.defs.has(x));
      if (r.ok) this.put(r.def);
      else { this.parked.push(raw); console.warn(`[chars] 저장된 정의 하나를 지금의 규칙으로 쓸 수 없어 간직만 합니다: ${r.issues.map((x) => `${x.code}@${x.path}`).join(', ')}`); }
    }
    this.version++; // 읽기만 했다: 다시 저장할 것은 없다
    setKnownChars(this.list());
  }
}
