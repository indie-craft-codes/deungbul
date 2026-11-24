// 등탑지기의 일: 오늘 등탑을 지킨 사람의 명단과, 누적 기여에 따른 단계 보상.
// 등탑지기 할멈이 마을로 돌아오면 열린다. 그 전의 기여도 모두 세어 두었다가 돌아오는 순간 한꺼번에 인정한다.
// 순위를 겨루게 하지 않으려고, 명단은 오늘 하루치만 보여 주고 날이 바뀌면 비운다.
import { CONTRIB_TIERS, KEEPERS_SHOWN, RAID_KEEP_POINTS } from '../../../shared/defs';
import type { WorldState } from '../../../shared/protocol';
import { NAME_MAX } from '../../../shared/world';
import { readInt, type Ent } from '../entity';
import type { Game } from '../game';

export class Keepers {
  private day = '';
  /**
   * 오늘 등탑을 지킨 사람: 저장 키(pid)별 이름과 점수 (바친 불씨 + 막아 낸 습격).
   * 이름으로 구분하면 남의 이름으로 바꿔 그 사람의 줄에 얹히거나 줄을 차지할 수 있다. 손님(저장 키 없음)은 명단에 올리지 않는다.
   * 이름으로 저장하던 때의 줄은 '~이름'을 열쇠로 그날 하루만 남는다.
   */
  private scores = new Map<string, { name: string; n: number }>();
  private rollT = 0;

  constructor(private g: Game) {
    // 엔티티 칸과 저장: 받은 기여 단계 보상의 수. ext.keepers = { tier }. 칸을 옮기기 전의 저장은 최상위 tier에 있다
    g.entInit.push((e) => { e.tier = 0; });
    g.saves.push({
      name: 'keepers',
      save: (p) => ({ tier: p.tier }),
      load: (p, raw) => { p.tier = readInt((raw as { tier?: unknown } | null)?.tier, 0, 99, 0); },
      legacy: (whole) => (whole.tier === undefined ? undefined : { tier: whole.tier }),
      legacySave: (p) => ({ tier: p.tier }),
    });
    g.ticks.push((dt) => this.tick(dt));
    g.worldSaves.push({ name: 'keepers', save: () => this.save(), load: (d) => this.load(d) });
    g.shared.push({ name: 'keepers', state: () => this.state() });
    g.on('offered', (p, _to, n) => { this.add(p, n); this.claim(p); });
    g.on('raidWon', (fighters) => { for (const p of fighters) this.add(p, RAID_KEEP_POINTS); });
    g.on('playerJoined', (p) => this.claim(p));
    g.on('playerRenamed', (p) => this.renamed(p));
    g.on('residentReturned', (id) => {
      if (id !== 'halmeom') return;
      for (const p of g.ents.values()) if (p.kind === 'p') this.claim(p);
      g.stateDirty = true;
    });
  }

  private get open(): boolean { return this.g.tower.returned('halmeom'); }

  private today(): string {
    const d = new Date(this.g.now());
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  /** 날이 바뀌었으면 명단을 비운다. */
  private roll(): void {
    const t = this.today();
    if (t === this.day) return;
    this.day = t;
    if (this.scores.size) { this.scores.clear(); this.g.stateDirty = true; this.g.saveDirty = true; }
  }

  private add(p: Ent, n: number): void {
    if (p.bot || !p.pid) return;
    this.roll();
    this.scores.set(p.pid, { name: p.name, n: (this.scores.get(p.pid)?.n ?? 0) + n });
    this.g.stateDirty = true; this.g.saveDirty = true;
  }

  /** 이름을 바꾸면 명단의 내 줄도 따라간다 */
  renamed(p: Ent): void {
    const row = p.pid ? this.scores.get(p.pid) : undefined;
    if (row) { row.name = p.name; this.g.stateDirty = true; this.g.saveDirty = true; }
  }

  /** 누적 기여가 다음 단계에 닿았으면 보상을 준다. 여러 단계를 한꺼번에 넘을 수도 있다. */
  claim(p: Ent): void {
    if (!this.open || p.bot) return;
    while (p.tier < CONTRIB_TIERS.length && p.contrib >= CONTRIB_TIERS[p.tier].need) {
      const gold = CONTRIB_TIERS[p.tier].gold;
      p.tier++; p.gold += gold; p.dirty = true; p.unsaved = true;
      this.g.notify(p, 'tierUp', p.tier, gold);
    }
  }

  tick(dt: number): void {
    this.rollT += dt;
    if (this.rollT < 30) return;
    this.rollT = 0;
    this.roll();
  }

  /** 클라이언트에 보여 줄 명단: 점수가 높은 순으로 몇 명만. 할멈이 돌아오기 전에는 비어 있다 */
  state(): WorldState['keepers'] {
    if (!this.open) return [];
    return [...this.scores.values()].sort((a, b) => b.n - a.n).slice(0, KEEPERS_SHOWN).map(({ name, n }) => ({ name, n }));
  }

  save(): unknown { return { day: this.day, rows: [...this.scores].map(([pid, r]) => ({ pid, name: r.name, n: r.n })) }; }
  load(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as { day?: unknown; scores?: unknown; rows?: unknown };
    if (typeof d.day !== 'string' || !(Array.isArray(d.rows) || Array.isArray(d.scores))) return;
    this.day = d.day;
    this.scores.clear();
    const pts = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(1e9, Math.floor(v)) : 0);
    for (const row of Array.isArray(d.rows) ? (d.rows as { pid?: unknown; name?: unknown; n?: unknown }[]) : []) {
      if (typeof row === 'object' && row !== null && typeof row.pid === 'string' && row.pid && typeof row.name === 'string' && pts(row.n)) this.scores.set(row.pid, { name: row.name.slice(0, NAME_MAX), n: pts(row.n) });
    }
    // 예전 형식([이름, 점수]): 누구의 줄인지 알 수 없으므로 아무도 이어받지 않고 그날 하루만 보인다
    for (const row of Array.isArray(d.scores) ? d.scores : []) {
      if (Array.isArray(row) && typeof row[0] === 'string' && pts(row[1])) this.scores.set('~' + row[0], { name: row[0].slice(0, NAME_MAX), n: pts(row[1]) });
    }
    this.roll(); // 저장된 날짜가 오늘이 아니면 비운다
  }
}
