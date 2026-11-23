// 순위: 캐릭터의 전투력(레벨, 무기와 갑옷, 낀 드롭 장비)으로 줄을 세운다.
// 접속 중인 사람의 값을 주기적으로 갱신하고, 나간 사람의 마지막 값도 남겨 둔다. 월드와 함께 저장한다.
import { GEAR_SLOTS, RANK, gearScore, type RankRow } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { Shop } from './shop';

export class Rank {
  private rows: RankRow[] = [];
  private wait = 0;

  constructor(private g: Game) {
    g.ticks.push((dt) => this.tick(dt));
    g.worldSaves.push({ name: 'rank', save: () => this.save(), load: (d) => this.load(d) });
    g.commands.set('rank', (p) => { this.update(); g.out.push({ id: p.id, msg: { t: 'rank', list: this.rows.slice(0, RANK.show), me: this.rows.findIndex((r) => r.name === p.name) } }); });
  }

  /** 전투력: 순위와 화면 표시에 쓴다 */
  power(p: Ent): number {
    let score = Object.values(p.skillLv).reduce((s, lv) => s + (lv - 1) * 10, 0) + p.lv * 20 + (Shop.wornTier(p, 'weapon') + Shop.wornTier(p, 'armor')) * 15;
    for (const slot of GEAR_SLOTS) {
      const it = p.worn[slot] ? p.gear.find((x) => x.uid === p.worn[slot]) : undefined;
      if (it) score += gearScore(it);
    }
    return score;
  }

  private update(): void {
    for (const p of this.g.ents.values()) {
      if (p.kind !== 'p' || p.bot) continue;
      const row: RankRow = { name: p.name, lv: p.lv, cls: p.cls, power: this.power(p) };
      const i = this.rows.findIndex((r) => r.name === p.name);
      if (i < 0) this.rows.push(row);
      else if (this.rows[i].power !== row.power || this.rows[i].lv !== row.lv || this.rows[i].cls !== row.cls) this.rows[i] = row;
      else continue;
      this.g.saveDirty = true;
    }
    this.rows.sort((a, b) => b.power - a.power || b.lv - a.lv);
    this.rows.length = Math.min(this.rows.length, RANK.keep);
  }

  /** 이름을 바꾸면 순위의 이름도 따라간다 */
  renamed(before: string, name: string): void {
    const r = this.rows.find((x) => x.name === before);
    if (r) r.name = name;
  }

  tick(dt: number): void {
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = RANK.everyS;
    this.update();
  }

  top(): RankRow[] { return this.rows.slice(0, RANK.show); }
  save(): unknown { return this.rows; }
  load(data: unknown): void {
    if (!Array.isArray(data)) return;
    this.rows = (data as RankRow[]).filter((r) => typeof r === 'object' && r !== null && typeof r.name === 'string' && typeof r.lv === 'number' && typeof r.power === 'number' && typeof r.cls === 'string').slice(0, RANK.keep);
  }
}
