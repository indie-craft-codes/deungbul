// 방치 보상: 접속하지 않은 시간만큼 골드와 경험치가 쌓여, 돌아오면 우편으로 온다.
// 자동 사냥을 켠 채 나가 서버가 대신 사냥한 시간(systems/away.ts)은 여기에 들지 않는다: 그때는 캐릭터가 월드에 남아 있었다.
// 보상의 식(내용의 IDLE.reward)은 비운 분과 레벨, 그리고 틀이 넘기는 것(IdleCtx: 깬 단계의 수)을 받는다. 깬 단계는 단계 모듈(stages)이 stageOf에 건다.
// IDLE.popup을 켠 게임은 돌아온 사람에게 메시지 idleBack(그 우편의 id, 분, 보상, 진행)도 보낸다: 화면(hud/idleback.ts)이 가운데 창으로 알리고 '받기'는 그 우편을 받는다.
// 그런 게임에서는 오프라인 진행의 안내문 stageAway를 내지 않는다(창이 같은 것을 보인다. 창이 뜨지 않았을 때만 awayNote가 낸다).
// 오프라인 단계 진행(STAGE_RULES.offline)이 켜져 있으면 단계 모듈이 advance를 건다: 비운 동안 깬 것으로 친 단계로 시간을 토막 내어,
// 토막마다 그때 깬 단계의 수로 보상의 식을 불러 더한다 (idleSegments). 진행이 없으면 한 토막이라 예전의 셈과 같다.
import { IDLE, IDLE_VIEW, idleSegments, type IdleCtx, type Reward } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { CURS } from './wallet';

/** 보상 둘을 더한다 (재화와 아이템은 수를 더하고, 장비는 잇는다). 새 묶음을 돌려준다 */
export function addReward(a: Reward, b: Reward): Reward {
  const sum = (x?: number, y?: number) => (x || y ? (x ?? 0) + (y ?? 0) : undefined);
  const counts = { ...(a.items ?? {}) };
  for (const [id, n] of Object.entries(b.items ?? {})) counts[id] = (counts[id] ?? 0) + n;
  const merged: Reward = Object.fromEntries(CURS.map((k) => [k, sum(a[k], b[k])]).filter(([, v]) => v !== undefined));
  return { ...merged, ...(a.items || b.items ? { items: counts } : {}), ...(a.gear?.length || b.gear?.length ? { gear: [...(a.gear ?? []), ...(b.gear ?? [])] } : {}) };
}

export class Idle {
  /** 그 사람이 깬 단계의 수 (단계 모듈이 건다. 없으면 0) */
  stageOf: (p: Ent) => number = () => 0;
  /**
   * 오프라인 단계 진행 (단계 모듈이 STAGE_RULES.offline이 있을 때 건다. 없으면 null): 비운 ms 동안의 진행을 적용하고,
   * 비우기 시작할 때 깬 단계의 수, 단계마다 깬 때(ms), 처음과 끝의 단계 id를 돌려준다
   */
  advance: (p: Ent, ms: number) => { cleared: number; at: number[]; from: string; to: string } | null = () => null;

  constructor(g: Game) {
    g.on('playerJoined', (p) => {
      const prog = this.advance(p, p.offMs);
      const minutes = Math.min(IDLE.maxMin, Math.floor(p.offMs / 60000));
      if (!(minutes >= IDLE.minMin)) { this.awayNote(g, p, prog); return; }
      // ctx를 읽지 않는 식(예전 모양)도 이 모양으로 받는다
      const reward: (minutes: number, lv: number, ctx: IdleCtx) => Reward = IDLE.reward;
      const lv = g.field(p, 'lv');
      if (!prog) { const r = reward(minutes, lv, { stage: this.stageOf(p) }); g.mail.send(p, 'idle', [minutes], r); this.popup(g, p, minutes, r, null); return; }
      let sum: Reward = {};
      for (const [m, stage] of idleSegments(minutes, prog.cleared, prog.at)) if (m > 0) sum = addReward(sum, reward(m, lv, { stage }));
      g.mail.send(p, 'idle', prog.to ? [minutes, prog.from, prog.to] : [minutes], sum);
      if (!this.popup(g, p, minutes, sum, prog)) this.awayNote(g, p, prog);
    });
  }

  /**
   * 창(IDLE.popup)을 쓰는 게임에서 창이 뜨지 않았을 때(짧게 비움, 우편이 없음): 단계 모듈이 내지 않은 진행의 안내문 stageAway를 여기서 낸다.
   * 창을 쓰지 않는 게임은 단계 모듈이 이미 냈다 (예전과 같다)
   */
  private awayNote(g: Game, p: Ent, prog: { at: number[]; from: string; to: string } | null): void {
    if (IDLE_VIEW.popup && prog?.to) g.notify(p, 'stageAway', prog.from, prog.to, prog.at.length);
  }

  /** 돌아왔을 때의 창 (IDLE.popup): 방금 보낸 방치 우편의 id와 보상, 오프라인 진행을 본인에게 알린다 (받기는 우편으로: 장부의 원인은 우편의 것 그대로) */
  private popup(g: Game, p: Ent, min: number, r: Reward, prog: { at: number[]; from: string; to: string } | null): boolean {
    if (!IDLE_VIEW.popup || p.bot) return false;
    const mail = p.mail.find((m) => m.id === p.mailSeq && m.k === 'idle');
    if (!mail) return false;
    g.out.push({ id: p.id, msg: { t: 'idleBack', mail: mail.id, min, r, ...(prog?.to ? { from: prog.from, to: prog.to, n: prog.at.length } : {}) } });
    return true;
  }
}
