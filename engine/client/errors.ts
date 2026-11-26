// 화면 오류 수집 (외부 서비스 없이): 처리되지 않은 오류, Promise 거절, 그리기 장치(WebGL)를 잃은 것을 게임 서버로 보낸다.
// 서버(engine/server/net/web.ts의 POST /client-error)가 속도·크기를 제한하고, 개인정보(주소의 쿼리·호스트, 토큰, 이메일, IP)를 빼고, 같은 오류를 한 줄로 센다.
// 운영자는 관리자 명령 errors로 본다 (docs/infra.md). 받는 일은 플랫폼 접점(platform().errors)을 거친다: 웹은 window.onerror·unhandledrejection.
// 이 페이지에서: 같은 오류는 처음 한 번 곧바로 보내고, 그 뒤의 되풀이는 세어 두었다가 30초마다 수만 보낸다. 한 페이지에서 보내는 것은 40번까지.
import { scrubLocal } from './errorscalc';
import { httpBase } from './net';
import { platform, type RawError } from './platform';
import { L } from './i18n';

const FLUSH_MS = 30_000;
const SEND_MAX = 40;
let sent = 0;
let base: Promise<string> | null = null;
/** 이 페이지에서 본 오류: 열쇠 → 아직 보내지 않은 되풀이 수 */
const seen = new Map<string, { raw: RawError; extra: number }>();

function post(raw: RawError, n: number): void {
  if (sent >= SEND_MAX) return;
  sent++;
  const p = platform();
  const body = JSON.stringify({
    kind: raw.kind, msg: scrubLocal(raw.msg).slice(0, 300), stack: scrubLocal(raw.stack ?? '').slice(0, 2000), at: scrubLocal(raw.at ?? ''),
    where: p.app.page(), build: p.app.version(), lang: L().code, n,
  });
  base ??= httpBase().catch(() => '');
  void base.then((b) => { if (b) p.errors.report(`${b}/client-error`, body); });
}

/** 한 건 받는다 */
function got(raw: RawError): void {
  const k = `${raw.kind}|${raw.msg}|${(raw.stack ?? raw.at ?? '').split('\n')[1] ?? ''}`;
  const had = seen.get(k);
  if (had) { had.extra++; return; }
  if (seen.size > 200) return;
  seen.set(k, { raw, extra: 0 });
  post(raw, 1);
}

/** 게임이 직접 알린다 (잡은 오류, 이상한 상태). 서버의 목록에 report로 남는다 */
export function reportError(err: unknown, what = ''): void {
  const e = err as { message?: unknown; stack?: unknown } | null;
  const msg = (what ? what + ': ' : '') + (typeof e?.message === 'string' ? e.message : String(err));
  got({ kind: 'report', msg, stack: typeof e?.stack === 'string' ? e.stack : undefined });
}

/** 틀이 시작할 때 한 번 (main.ts): 오류를 듣는다. canvas를 주면 그리기 장치를 잃는 것도 */
export function initErrors(): void {
  const p = platform();
  if (!p.has('errors')) return;
  p.errors.listen(got);
  setInterval(() => {
    for (const v of seen.values()) if (v.extra) { post(v.raw, v.extra); v.extra = 0; }
  }, FLUSH_MS);
}
/** 그리기 장치(WebGL)를 잃는 것을 듣는다 (main.ts가 화면을 만든 뒤에) */
export function watchCanvas(canvas: HTMLCanvasElement): void {
  canvas.addEventListener('webglcontextlost', () => got({ kind: 'webgl', msg: 'WebGL context lost' }));
}
