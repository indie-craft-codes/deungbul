// 순위: 캐릭터의 전투력(레벨, 무기와 갑옷, 낀 드롭 장비)으로 줄을 세운다.
// 접속 중인 사람의 값을 주기적으로 갱신하고, 나간 사람의 마지막 값도 남겨 둔다. 월드와 함께 저장한다.
import { GEAR_SLOTS, RANK, powerOf, type Gear, type RankRow } from '../../../shared/defs';
import { NAME_MAX } from '../../../shared/world';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { Shop } from './shop';

/** 순위의 한 줄. 사람은 저장 키(pid)로 구분한다. pid가 빈 줄은 이름으로만 저장하던 때의 것이다 */
interface Row extends RankRow { pid: string }
/** 화면에 보낼 모양: 저장 키는 내보내지 않는다 */
const shown = (r: Row): RankRow => ({ name: r.name, lv: r.lv, cls: r.cls, power: r.power });

export class Rank {
  private rows: Row[] = [];
  private wait = 0;

  constructor(private g: Game) {
    g.ticks.push((dt) => this.tick(dt));
    g.worldSaves.push({ name: 'rank', save: () => this.save(), load: (d) => this.load(d) });
    g.commands.set('rank', (p) => { this.update(); g.out.push({ id: p.id, msg: { t: 'rank', list: this.top(), me: p.pid ? this.rows.findIndex((r) => r.pid === p.pid) : -1 } }); });
  }

  /** 전투력: 순위와 화면 표시에 쓴다. 식은 내용 정의에 있다 (engine/shared/defs/growth.ts의 powerOf) */
  power(p: Ent): number {
    const worn: Gear[] = [];
    for (const slot of GEAR_SLOTS) {
      const it = p.worn[slot] ? p.gear.find((x) => x.uid === p.worn[slot]) : undefined;
      if (it) worn.push(it);
    }
    return powerOf(p.lv, Shop.wornTier(p, 'weapon') + Shop.wornTier(p, 'armor'), Object.values(p.skillLv), worn);
  }

  private update(): void {
    for (const p of this.g.ents.values()) {
      // 손님(저장 키 없음)은 올리지 않는다: 가리킬 변하지 않는 값이 없어 이름으로 구분하게 되고, 이름은 남의 것으로 바꿀 수 있다
      if (p.kind !== 'p' || p.bot || !p.pid) continue;
      const row: Row = { pid: p.pid, name: p.name, lv: p.lv, cls: p.cls, power: this.power(p) };
      let i = this.rows.findIndex((r) => r.pid === p.pid);
      // 이름으로만 저장하던 때의 내 줄이 남아 있으면 이어받는다. 이름이 같고 전투력이 그 줄보다 낮지 않을 때만이다:
      // 이름만 맞춰 온 약한 캐릭터가 남의 옛 줄을 낮은 값으로 덮어쓰지 못한다
      if (i < 0) i = this.rows.findIndex((r) => !r.pid && r.name === p.name && r.power <= row.power);
      if (i < 0) this.rows.push(row);
      else if (this.rows[i].pid !== row.pid || this.rows[i].name !== row.name || this.rows[i].power !== row.power || this.rows[i].lv !== row.lv || this.rows[i].cls !== row.cls) this.rows[i] = row;
      else continue;
      // 같은 이름의 옛 줄(pid 없음)이 따로 남아 있으면 지운다: 이름은 한 사람만 쓰므로 그것도 이 사람의 것이고, 두면 순위에 두 번 나온다
      this.rows = this.rows.filter((r) => r.pid || r.name !== p.name);
      this.g.saveDirty = true;
    }
    this.rows.sort((a, b) => b.power - a.power || b.lv - a.lv);
    this.rows.length = Math.min(this.rows.length, RANK.keep);
  }

  /** 이름을 바꾸면 순위의 이름도 따라간다. 내 줄만 바뀐다: 남의 이름으로 바꿔도 남의 줄은 그대로다 */
  renamed(p: Ent): void {
    const r = p.pid ? this.rows.find((x) => x.pid === p.pid) : undefined;
    if (r) { r.name = p.name; this.g.saveDirty = true; }
  }

  tick(dt: number): void {
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = RANK.everyS;
    this.update();
  }

  top(): RankRow[] { return this.rows.slice(0, RANK.show).map(shown); }
  save(): unknown { return this.rows; }
  load(data: unknown): void {
    if (!Array.isArray(data)) return;
    const seen = new Set<string>();
    this.rows = (data as Row[]).filter((r) => typeof r === 'object' && r !== null && typeof r.name === 'string' && typeof r.lv === 'number' && typeof r.power === 'number' && typeof r.cls === 'string')
      // 예전 저장에는 pid가 없다: 빈 값으로 읽어 두고, 그 사람이 접속하면 이어받는다 (update)
      .map((r): Row => ({ pid: typeof r.pid === 'string' ? r.pid : '', name: r.name.slice(0, NAME_MAX), lv: r.lv, cls: r.cls, power: r.power }))
      .filter((r) => !r.pid || (!seen.has(r.pid) && !!seen.add(r.pid)))
      // 옛 줄 가운데 이미 pid 줄이 있는 이름의 것은 버린다 (순위에 같은 사람이 두 번 나오지 않게)
      .filter((r, _i, all) => r.pid || !all.some((o) => o.pid && o.name === r.name))
      .slice(0, RANK.keep);
  }
}
