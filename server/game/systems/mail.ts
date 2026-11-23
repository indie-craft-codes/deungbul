// 우편: 보상을 바로 주지 않고 우편으로 보내 두면, 플레이어가 열어서 받는다.
// 방치 보상, 출석, 일일 임무가 이 통로를 쓴다. 새 보상도 send()만 부르면 된다.
import { MAIL_MAX, type Mail, type MailKind, type Reward } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export class MailSys {
  constructor(private g: Game) {
    // id가 0이면 모두 받는다
    g.commands.set('mailClaim', (p, m) => { if (num(m.id)) this.claim(p, m.id); });
    g.saves.push({
      name: 'mail',
      save: (p) => ({ list: p.mail, seq: p.mailSeq }),
      load: (p, raw) => {
        const d = raw as { list?: unknown; seq?: unknown };
        if (!Array.isArray(d.list)) return;
        p.mail = (d.list as Mail[]).filter((x) => typeof x === 'object' && x !== null && num(x.id) && typeof x.k === 'string' && Array.isArray(x.a) && typeof x.r === 'object' && x.r !== null).slice(-MAIL_MAX);
        p.mailSeq = Math.max(num(d.seq) ? d.seq : 0, ...p.mail.map((x) => x.id));
      },
    });
  }

  /** 우편을 보낸다. 가득 찼으면 가장 오래된 것부터 밀려난다 */
  send(p: Ent, k: MailKind, a: (string | number)[], r: Reward): void {
    if (p.bot) return;
    p.mail.push({ id: ++p.mailSeq, k, a, r });
    if (p.mail.length > MAIL_MAX) p.mail.shift();
    p.metaDirty = true; p.unsaved = true;
    this.g.notify(p, 'mailNew');
  }

  claim(p: Ent, id: number): void {
    const take = p.mail.filter((x) => id === 0 || x.id === id);
    if (!take.length) return;
    let gold = 0, exp = 0, sparks = 0;
    for (const m of take) { gold += m.r.gold ?? 0; exp += m.r.exp ?? 0; sparks += m.r.sparks ?? 0; }
    p.mail = p.mail.filter((x) => !take.includes(x));
    p.gold += gold;
    this.g.players.grant(p, exp, sparks);
    p.metaDirty = true;
    this.g.notify(p, 'mailGot', gold, exp, sparks);
  }
}
