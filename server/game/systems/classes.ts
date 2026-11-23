// 직업: 고르고 바꾼다. 처음에는 어디서든 고를 수 있고, 그 뒤에는 등탑 가까이에서만 바꿀 수 있다.
import { SKILL_SLOTS, isClassId, type ClassId } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

export class Classes {
  constructor(private g: Game) {
    g.commands.set('class', (p, m) => { if (isClassId(m.id)) this.choose(p, m.id); });
  }

  choose(p: Ent, cls: ClassId): void {
    const g = this.g;
    if (p.cls === cls) return;
    if (p.cls !== '' && !g.rules.canChangeClass(p)) { g.notify(p, 'classFar'); return; }
    this.apply(p, cls);
    p.dirty = true; p.unsaved = true;
    g.gears.push({ id: p.id, weapon: p.weapon, armor: p.armor, cls });
    g.notify(p, 'classChanged', cls);
  }

  /** 직업에 맞춰 체력과 기술 칸을 다시 잡는다 (접속할 때도 쓴다). */
  apply(p: Ent, cls: string): void {
    p.cls = cls;
    this.g.players.refresh(p);
    p.cds = Array.from({ length: SKILL_SLOTS }, () => 0);
    p.targetId = 0;
  }
}
