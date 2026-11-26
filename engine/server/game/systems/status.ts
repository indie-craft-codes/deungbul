// 본인에게 보내는 모듈의 상태 메시지 두 가지 (engine/shared/protocol.ts의 'stat'과 'meta'). 핵심은 이 칸들을 모른다: 고른 모듈의 칸만 싣는다.
//   stat  성장 수치: 바뀌었을 때(p.dirty). 최대 체력[combat], 레벨·경험치[growth], 재화[economy], 든 무기·갑옷과 소지품[items], 직업[classes]
//   meta  장비·우편·일일 임무·전투력·능력치: 바뀌었을 때(p.metaDirty). 장비[gear], 우편[mail], 일일 임무[daily], 전투력[rank], 능력치[build]
// 그 칸의 모듈을 하나도 고르지 않은 게임에는 그 메시지를 보내지 않는다. 칸의 차례는 예전 그대로다 (모듈을 다 쓰는 게임이 받는 글자는 전과 같다).
import type { ModuleId } from '../../../shared/modules';
import type { ServerMsg } from '../../../shared/protocol';
import type { Ent } from '../entity';
import type { Game } from '../game';

type Stat = Extract<ServerMsg, { t: 'stat' }>;
type Meta = Extract<ServerMsg, { t: 'meta' }>;
/** stat과 meta에 칸을 가진 모듈 */
const STAT_OF: readonly ModuleId[] = ['combat', 'growth', 'economy', 'items', 'classes'];
const META_OF: readonly ModuleId[] = ['gear', 'mail', 'daily', 'rank', 'build'];

export class Status {
  constructor(g: Game) {
    const has = (m: ModuleId) => g.has(m);
    if (STAT_OF.some(has)) {
      g.perFlush.push((me: Ent) => {
        if (!me.dirty) return null;
        me.dirty = false;
        const s: Stat = { t: 'stat' };
        if (has('combat')) s.maxHp = me.maxHp;
        if (has('growth')) { s.lv = me.lv; s.exp = me.exp; s.need = me.need; }
        if (has('economy')) { s.sparks = me.sparks; s.gold = me.gold; }
        if (has('items')) { s.weapon = me.weapon; s.armor = me.armor; }
        if (has('classes')) s.cls = me.cls;
        if (has('items')) s.items = me.items;
        return s;
      });
    }
    if (META_OF.some(has)) {
      g.perFlush.push((me: Ent) => {
        if (!me.metaDirty) return null;
        me.metaDirty = false;
        const s: Meta = { t: 'meta' };
        if (has('gear')) { s.gear = me.gear; s.worn = me.worn; }
        if (has('mail')) s.mail = me.mail;
        if (has('daily')) s.daily = { prog: me.daily.prog, got: me.daily.got, streak: me.daily.streak, ...(g.daily.long ? { next: [...g.daily.next()] } : {}) }; // 주간·월간 임무가 있는 게임만 다음 초기화 시각
        if (has('rank')) s.power = g.rank.power(me);
        if (has('build')) s.build = { stats: me.stats, skillLv: me.skillLv, left: g.build.left(me) };
        return s;
      });
    }
  }
}
