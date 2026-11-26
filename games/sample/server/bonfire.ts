// 모닥불: 이 게임에만 있는 규칙. 멧돼지와 곰이 떨어뜨린 장작(아이템 log)을 모닥불 곁에서 넣으면 서버 전체의 온기가 오르고,
// 온기가 있는 동안 곁에 선 사람은 회복이 빨라진다. 온기는 시간이 지나면 식는다. 쓰러지면 모닥불 앞에서 일어난다.
// 틀의 시스템처럼 필요한 것을 생성자에서 스스로 등록한다. 틀은 이 파일을 모른다.
import { BONFIRE } from '../shared/content/bonfire';
import type { MeState } from '../shared/sample';
import { dist, type Ent, type Game, readInt } from '@engine/server';

export class Bonfire {
  /** 온기 (0 ~ BONFIRE.heatMax) */
  heat = 0;

  constructor(private g: Game) {
    // 엔티티 칸(지금까지 넣은 장작)의 처음 값과 저장
    g.entInit.push((e) => { e.fed = 0; });
    g.saves.push({ name: 'bonfire', save: (p) => ({ fed: p.fed }), load: (p, raw) => { p.fed = readInt((raw as { fed?: unknown } | null)?.fed, 0, 1e9, 0); } });
    g.rules.touched = (p) => p.fed > 0;
    // 본인에게만 알리는 값과 모두에게 알리는 값
    g.personal.push({ name: 'fed', state: (p): MeState['fed'] => p.fed });
    g.shared.push({ name: 'bonfire', state: () => ({ heat: Math.ceil(this.heat) }) });
    // 서버를 껐다 켜도 온기가 남는다
    g.worldSaves.push({ name: 'bonfire', save: () => ({ heat: this.heat }), load: (raw) => { this.heat = readInt((raw as { heat?: unknown } | null)?.heat, 0, BONFIRE.heatMax, 0); } });
    g.commands.set('feed', (p, m) => { if (typeof m.n === 'number') this.feed(p, m.n); });
    // 기능 깃발 bonfire가 꺼져 있으면 장작 넣기를 받지 않는다 (내용의 FLAGS. 꺼진 동안 안내문 featureOff)
    g.live.gate('feed', 'bonfire');
    g.ticks.push((dt) => this.cool(dt));
    // 틀의 규칙과 수치에 끼어든다: 일어나는 자리, 직업을 바꿀 수 있는 곳, 자연 회복의 배율
    g.rules.respawn = () => ({ x: BONFIRE.x, z: BONFIRE.z + 4, id: 'bonfire' });
    g.rules.canChangeClass = (p) => dist(p, BONFIRE) <= BONFIRE.reach;
    g.mods.provide('regen', (p) => (p && this.warms(p) ? BONFIRE.regen : 1));
  }

  /** 그 사람이 온기를 쬐고 있는가 */
  warms(p: Ent): boolean { return this.heat > 0 && dist(p, BONFIRE) <= BONFIRE.reach; }

  private feed(p: Ent, want: number): void {
    const g = this.g, have = p.items.log ?? 0;
    if (!Number.isInteger(want) || want < 1) return;
    if (dist(p, BONFIRE) > BONFIRE.reach) { g.notify(p, 'bonfireFar'); return; }
    if (have < 1) { g.notify(p, 'noLogs'); return; }
    const n = Math.min(want, have), cold = this.heat <= 0;
    // 장작은 틀의 가방 통로로 뺀다: 장부가 어디로 나갔는지 적고, 아이템 칸을 고치는 곳이 가방 하나로 남는다
    g.bag.takeItem(p, 'log', n, 'cmd:feed');
    p.fed += n; p.dirty = true; p.unsaved = true;
    // 장작 하나의 온기는 원격 설정으로 바꿀 수 있다 (내용의 LIVE_KEYS의 bonfireHeat: 처음 값은 BONFIRE.heatPerLog와 같다)
    this.heat = Math.min(BONFIRE.heatMax, this.heat + n * this.g.live.get<number>('bonfireHeat'));
    g.stateDirty = true; g.saveDirty = true;
    if (cold) g.announce('bonfireLit', p.name);
    g.notify(p, 'fed', n, Math.ceil(this.heat));
    g.fire('fed', p, n);
  }

  private cool(dt: number): void {
    if (this.heat <= 0) return;
    const before = Math.ceil(this.heat);
    this.heat = Math.max(0, this.heat - dt / BONFIRE.coolS);
    if (Math.ceil(this.heat) !== before) { this.g.stateDirty = true; this.g.saveDirty = true; }
  }
}
