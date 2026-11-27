// [codex] 도감 (묶음 6): 내용의 CODEX. 묶음마다 무엇을 모으나(of: hero 가진 영웅, monster 처치한 몬스터, item 얻은 아이템)와 그 목록(ids, 없으면 그 종류 모두).
// 처음 얻은 때를 적고(UTC ms), 모은 수가 rewards의 n에 닿으면 그 보상을 우편으로 (선택: 보유 보상).
//   영웅    사건 heroChanged(가진 영웅이 생기거나 바뀜). 들어올 때 이미 가진 영웅도 조용히 적는다
//   몬스터  사건 monsterKilled (때린 사람 모두)
//   아이템  상점에서 산 것(bought), 상품(goods.ts), 그리고 게임이 g.codex.note(p, 'item', id)로 알리는 것
// 저장: ext.codex = { seen: 묶음 → id → 때, got: 묶음 → 받은 보상의 차례들 }. 개인 상태 'codex'(CodexMe: 모은 id, 받은 차례, 묶음의 목록).
import { MONSTERS, codexDef, codexIds, heroIds, isHeroId, isItemId, isMonsterId, ITEMS, type CodexDef, type CodexMe } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

interface State { seen: Record<string, Record<string, number>>; got: Record<string, number[]> }

export class CodexSys {
  private st = new WeakMap<Ent, State>();

  constructor(private g: Game) {
    if (g.has('roster')) {
      g.on('heroChanged', (p, id) => { if (p.heroes[id]) this.note(p, 'hero', id); });
      g.on('playerJoined', (p) => { for (const id of Object.keys(p.heroes)) this.note(p, 'hero', id, true); });
    }
    if (g.has('combat')) g.on('monsterKilled', (m, hitters) => { for (const p of hitters) this.note(p, 'monster', m.type); });
    g.on('bought', (p, item) => this.note(p, 'item', item));
    g.saves.push({
      name: 'codex',
      save: (p) => { const s = this.st.get(p); return s && Object.keys(s.seen).length ? s : undefined; },
      load: (p, raw) => {
        const r = raw as Partial<State> | null;
        if (typeof r !== 'object' || r === null) return;
        const s: State = { seen: {}, got: {} };
        for (const [gid, ids] of Object.entries(r.seen ?? {})) {
          if (!codexDef(gid) || typeof ids !== 'object' || ids === null) continue;
          s.seen[gid] = {};
          for (const [id, at] of Object.entries(ids)) if (typeof at === 'number' && Number.isFinite(at)) s.seen[gid][id] = at;
        }
        for (const [gid, list] of Object.entries(r.got ?? {})) if (codexDef(gid) && Array.isArray(list)) s.got[gid] = list.filter((x): x is number => Number.isInteger(x) && x >= 0);
        this.st.set(p, s);
      },
    });
    g.personal.push({ name: 'codex', state: (p): CodexMe & { ids: Record<string, string[]> } => this.me(p) });
  }

  /** 그 묶음에 드는 id들 (ids를 적지 않았으면 그 종류 모두: 영웅은 실행 중에 더한 것까지) */
  members(def: CodexDef): string[] {
    if (def.ids) return [...def.ids];
    return def.of === 'hero' ? [...heroIds()] : def.of === 'monster' ? Object.keys(MONSTERS) : Object.keys(ITEMS);
  }
  private fits(def: CodexDef, id: string): boolean {
    if (def.ids) return def.ids.includes(id);
    return def.of === 'hero' ? isHeroId(id) : def.of === 'monster' ? isMonsterId(id) : isItemId(id);
  }
  state(p: Ent): State { let s = this.st.get(p); if (!s) { s = { seen: {}, got: {} }; this.st.set(p, s); } return s; }
  me(p: Ent): CodexMe & { ids: Record<string, string[]> } {
    const s = this.state(p), seen: Record<string, string[]> = {}, got: Record<string, number[]> = {}, ids: Record<string, string[]> = {};
    for (const gid of codexIds()) { seen[gid] = Object.keys(s.seen[gid] ?? {}); got[gid] = [...(s.got[gid] ?? [])]; ids[gid] = this.members(codexDef(gid)!); }
    return { seen, got, ids };
  }

  /** 처음 얻은 것을 적는다 (이미 있으면 아무것도). quiet면 알리지 않는다 (들어올 때 이미 가진 것). 새로 적은 묶음의 수 */
  note(p: Ent, of: CodexDef['of'], id: string, quiet = false): number {
    if (p.bot || p.kind !== 'p') return 0;
    let n = 0;
    for (const gid of codexIds()) {
      const def = codexDef(gid)!;
      if (def.of !== of || !this.fits(def, id)) continue;
      const s = this.state(p), seen = (s.seen[gid] ??= {});
      if (Object.hasOwn(seen, id)) continue;
      seen[id] = this.g.now();
      n++;
      p.metaDirty = true; p.unsaved = true;
      if (!quiet) this.g.notify(p, 'codexNew', gid, id);
      const have = Object.keys(seen).length, got = (s.got[gid] ??= []);
      (def.rewards ?? []).forEach((rw, i) => {
        if (have < rw.n || got.includes(i)) return;
        got.push(i);
        this.g.mail.send(p, 'codex', [gid, rw.n], rw.r);
      });
    }
    return n;
  }
}
