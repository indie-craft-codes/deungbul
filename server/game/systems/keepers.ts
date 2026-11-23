// 등탑지기의 일: 오늘 등탑을 지킨 사람의 명단과, 누적 기여에 따른 단계 보상.
// 등탑지기 할멈이 마을로 돌아오면 열린다. 그 전의 기여도 모두 세어 두었다가 돌아오는 순간 한꺼번에 인정한다.
// 순위를 겨루게 하지 않으려고, 명단은 오늘 하루치만 보여 주고 날이 바뀌면 비운다.
import { CONTRIB_TIERS, KEEPERS_SHOWN, RAID_KEEP_POINTS } from '../../../shared/defs';
import type { WorldState } from '../../../shared/protocol';
import type { Ent } from '../entity';
import type { Game } from '../game';

export class Keepers {
  private day = '';
  /** 오늘 등탑을 지킨 사람: 이름별 점수 (바친 불씨 + 막아 낸 습격) */
  private scores = new Map<string, number>();
  private rollT = 0;

  constructor(private g: Game) {
    g.ticks.push((dt) => this.tick(dt));
    g.worldSaves.push({ name: 'keepers', save: () => this.save(), load: (d) => this.load(d) });
    g.shared.push({ name: 'keepers', state: () => this.state() });
    g.on('offered', (p, _to, n) => { this.add(p, n); this.claim(p); });
    g.on('raidWon', (fighters) => { for (const p of fighters) this.add(p, RAID_KEEP_POINTS); });
    g.on('playerJoined', (p) => this.claim(p));
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
    if (p.bot) return;
    this.roll();
    this.scores.set(p.name, (this.scores.get(p.name) ?? 0) + n);
    this.g.stateDirty = true; this.g.saveDirty = true;
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
    return [...this.scores].sort((a, b) => b[1] - a[1]).slice(0, KEEPERS_SHOWN).map(([name, n]) => ({ name, n }));
  }

  save(): unknown { return { day: this.day, scores: [...this.scores] }; }
  load(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as { day?: unknown; scores?: unknown };
    if (typeof d.day !== 'string' || !Array.isArray(d.scores)) return;
    this.day = d.day;
    this.scores.clear();
    for (const row of d.scores) {
      if (Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'number' && row[1] > 0) this.scores.set(row[0], Math.floor(row[1]));
    }
    this.roll(); // 저장된 날짜가 오늘이 아니면 비운다
  }
}
