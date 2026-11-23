// 자리 비움 자동 사냥: 자동 사냥을 켠 채 접속이 끊기면(창을 닫음, 폰 화면이 꺼짐) 캐릭터가 월드에 남아 계속 사냥한다.
// 다시 접속하면 그 캐릭터를 그대로 이어받는다. 판단은 클라이언트의 자동 사냥(client/src/auto.ts)과 같고,
// 사람이 누른 것과 같은 명령(g.command)만 내므로 전투 규칙은 그대로다.
import { AUTO, pickPotion, pickSkill } from '../../../shared/auto';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';

const ROAM = 60; // 자리를 비운 곳에서 이보다 먼 몬스터는 쫓지 않는다
const THINK_S = 0.3;
/** 자리를 비운 채 사냥을 이어 가는 최대 시간(초). 지나면 저장하고 월드에서 나간다 */
export const AWAY_MAX_S = 8 * 3600;

interface Stay { x: number; z: number; until: number; at: number; sparks: number; gold: number; lv: number }

export class Away {
  private stays = new Map<number, Stay>();

  constructor(private g: Game) {
    // 클라이언트가 자동 사냥을 켜고 끌 때마다 알려 준다
    g.commands.set('auto', (p, m) => { p.auto = m.on === true; });
    g.on('playerLeft', (id) => { this.stays.delete(id); });
  }

  /** 접속이 끊겼다: 여기서부터 서버가 대신 사냥한다. */
  start(p: Ent): void {
    this.stays.set(p.id, { x: p.x, z: p.z, until: this.g.clock + AWAY_MAX_S, at: this.g.now(), sparks: p.sparks, gold: p.gold, lv: p.lv });
    p.wait = 0;
  }

  /** 주인이 돌아왔다: 그동안 얻은 것을 알려 주고 손을 뗀다. */
  stop(p: Ent): void {
    const s = this.stays.get(p.id);
    if (!s) return;
    this.stays.delete(p.id);
    const minutes = Math.max(1, Math.round((this.g.now() - s.at) / 60000));
    this.g.notify(p, 'awayBack', minutes, Math.max(0, p.sparks - s.sparks), Math.max(0, p.gold - s.gold), p.lv - s.lv);
  }

  think(p: Ent, dt: number): void {
    const s = this.stays.get(p.id);
    if (!s) return;
    const g = this.g;
    if (g.clock > s.until) { p.auto = false; return; } // 통신 계층이 저장하고 내보낸다
    p.wait -= dt;
    if (p.wait > 0) return;
    p.wait = THINK_S;
    const ratio = p.hp / p.maxHp;

    const potion = p.itemCd <= 0 ? pickPotion(ratio, p.items) : null;
    if (potion) g.command(p, { t: 'use', id: potion });

    // 대상이 없거나 죽었으면 가장 가까운 몬스터로 바꾼다
    let target = g.ents.get(p.targetId);
    if (!target || target.dead) {
      target = undefined;
      let nd = AUTO.seek;
      for (const m of g.ents.values()) {
        if (m.kind !== 'm' || m.dead || m.homing || m.layer !== p.layer || dist(s, m) > ROAM) continue;
        const d = dist(p, m);
        if (d < nd) { nd = d; target = m; }
      }
      if (target) g.command(p, { t: 'attack', id: target.id });
      // 쓰러져 등탑에서 일어났거나 멀리 끌려갔으면 자리를 비운 곳으로 돌아간다
      else if (!p.moving && dist(p, s) > 4) g.movement.goTo(p, s.x, s.z);
    }
    const d = target ? dist(p, target) : Infinity;

    const n = pickSkill(p.cls, ratio, d, (i) => p.cds[i] <= 0);
    if (n >= 0) g.command(p, { t: 'skill', n });
  }
}
