// 분석 사건 (핵심: 운영 도구와 고객지원, docs/genre-features.md 5.5): g.track(이름, 속성, 누가)으로 사건 한 줄을 쌓는다.
// 서버에서만 적는다: 화면은 사건을 보내지 않는다 (광고 차단기에 막히지 않고, 화면을 고쳐 숫자를 부풀리지 못하게).
// 게임 계층은 저장소를 모른다: 쌓인 줄은 통신 계층이 저장 주기에 drain()으로 가져가 저장소(OpsStore.addEvents)에 얹는다 (재화 흐름 지표와 같은 방향).
// 통신 계층이 없는 곳(시험, 황금 실행)에서는 아무도 가져가지 않으므로 BUFFER_MAX를 넘으면 오래된 것부터 버린다. 사건을 적는 일은 게임의 상태·난수·전송을 하나도 바꾸지 않는다.
//
// 틀이 주는 기본 사건 (게임이 더하는 것은 게임의 이름으로):
//   session_start  접속 { first: 처음 만든 캐릭터인가, lv }        (통신 계층: net/server.ts의 join)
//   session_end    접속 끝 { sec: 접속해 있던 초, lv }             (통신 계층: dropClient)
//   first_join     저장 키가 처음 들어왔다 {}                      (통신 계층: 저장된 캐릭터가 없던 키)
//   level_up       레벨이 올랐다 { lv }                            (growth 모듈: systems/players.ts의 levelUp)
//
// 개인정보: 속성의 값은 수, 참·거짓, 짧은 표(영문자·숫자·_.:- 40자까지)만 받는다. 띄어쓰기·한글이 든 글(자유 문장: 대화, 이름, 문의 글)은 받지 않고 그 칸을 뺀다.
// 이름과 칸의 이름도 모양을 본다. 걸린 것은 세어 두고(rejected) 처음 몇 번만 로그에 남긴다.
import type { EventRow } from '../../store/types';
import type { Ent } from '../entity';
import type { Game } from '../game';

/** 사건 이름: 영문 소문자로 시작, 소문자·숫자·밑줄 40자까지 */
export const EVENT_NAME = /^[a-z][a-z0-9_]{0,39}$/;
/** 속성 칸의 이름 */
const PROP_KEY = /^[a-z][a-zA-Z0-9_]{0,23}$/;
/** 속성의 글 값: 짧은 표만 (자유 문장은 받지 않는다) */
const PROP_TEXT = /^[A-Za-z0-9_.:-]{1,40}$/;
/** 한 사건의 속성 수 */
const PROP_MAX = 8;
/** 아무도 가져가지 않을 때 쌓아 두는 줄의 상한 */
const BUFFER_MAX = 20_000;

export type EventProps = Record<string, string | number | boolean>;

/**
 * 속성을 검사해 받을 것만 남긴다. 글 값이 자유 문장 꼴이면(띄어쓰기, 한글, 길이) 뺀다.
 * 돌려주는 것: 남긴 속성과 뺀 칸의 이름들 (시험과 로그용)
 */
export function cleanProps(props: unknown): { props: EventProps; dropped: string[] } {
  const out: EventProps = {}, dropped: string[] = [];
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return { props: out, dropped };
  for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
    if (!PROP_KEY.test(k) || Object.keys(out).length >= PROP_MAX) { dropped.push(k); continue; }
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 1000) / 1000;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && PROP_TEXT.test(v)) out[k] = v;
    else dropped.push(k);
  }
  return { props: out, dropped };
}

export class Analytics {
  private rows: EventRow[] = [];
  /** 저장 키 → 그 사람의 지금 접속 표 (통신 계층이 접속 때 알린다) */
  private sess = new Map<string, string>();
  /** 검사에 걸려 받지 않은 사건·칸의 수, 버퍼가 넘쳐 버린 줄의 수 */
  rejected = 0; overflow = 0;
  /** 꺼져 있으면 아무것도 쌓지 않는다 (통신 계층의 설정: 저장소가 사건을 적지 못하거나 운영자가 껐다) */
  on = true;
  private warned = 0;

  constructor(private g: Game) {}

  /** 통신 계층: 그 저장 키의 지금 접속 표를 정한다 (null이면 지운다) */
  session(key: string, sess: string | null): void { if (sess) this.sess.set(key, sess); else this.sess.delete(key); }

  /**
   * 사건 한 줄을 쌓는다. who는 사람(엔티티: 저장 키를 읽는다, 봇은 적지 않는다) 또는 저장 키. 없으면 서버의 사건(빈 키).
   * 이름이 모양에 맞지 않으면 버린다. 속성은 cleanProps를 지난 것만 남는다
   */
  track(name: string, props?: Record<string, unknown>, who?: Ent | string | null): void {
    if (!this.on) return;
    let key = '';
    if (typeof who === 'string') key = who;
    else if (who) { if (who.bot) return; key = who.pid ?? ''; }
    if (!EVENT_NAME.test(name)) { this.reject(`사건 이름 '${String(name).slice(0, 40)}'`); return; }
    const c = cleanProps(props);
    if (c.dropped.length) this.reject(`${name}의 속성 ${c.dropped.join(', ')} (자유 문장이나 모양이 아닌 값)`);
    this.rows.push({ at: this.g.now(), key, sess: key ? this.sess.get(key) ?? '' : '', name, props: c.props });
    if (this.rows.length > BUFFER_MAX) { const cut = this.rows.length - (BUFFER_MAX >> 1); this.rows.splice(0, cut); this.overflow += cut; }
  }

  private reject(what: string): void {
    this.rejected++;
    if (this.warned++ < 5) console.warn(`[analytics] 받지 않았습니다: ${what}`);
  }

  /** 아직 저장소에 얹지 않은 줄을 내어 주고 비운다 */
  drain(): EventRow[] { const out = this.rows; this.rows = []; return out; }
  /** 저장하지 못한 줄을 되돌려 받는다 (다음 저장 때 다시 나간다) */
  giveBack(rows: EventRow[]): void { this.rows.unshift(...rows); }
  /** 쌓여 있는 줄의 수 (시험) */
  get pending(): number { return this.rows.length; }
}
