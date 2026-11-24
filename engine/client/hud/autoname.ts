// 처음 접속할 때 붙는 무작위 이름은 그때의 언어로 한 번 지어져 서버에 저장된다.
// 그래서 한국어 브라우저로 처음 들어온 사람은 화면을 영어로 바꿔도 이름이 한글로 남았다.
// 그 이름을 손대지 않고 그대로 쓰는 사람이 언어를 바꾸면, 새 언어의 무작위 이름으로 바꿔 준다.
// 직접 지은 이름은 건드리지 않는다.
import { rename } from '../actions';
import { L, autoNameLocale, onLangChange, randomName } from '../i18n';
import { S } from '../state';

/** 서버는 이름을 연달아 바꾸지 못하게 막는다 (engine/server/net/server.ts의 RENAME_GAP_MS, 5초). 그보다 조금 길게 기다린다 */
const GAP_MS = 5500;
let lastAt = -GAP_MS;
let timer = 0;

/** 지금 이름이 다른 언어로 지어진 무작위 이름이면 바꾼다. 방금 바꿨으면 서버가 받아 줄 때까지 미룬다 */
function fix(): void {
  clearTimeout(timer);
  const me = S.me;
  if (!me) return;
  const from = autoNameLocale(me.name);
  if (!from || from === L().code) return;
  const wait = lastAt + GAP_MS - performance.now();
  if (wait > 0) { timer = window.setTimeout(fix, wait); return; }
  lastAt = performance.now();
  rename(randomName());
}

export function initAutoName(): void {
  onLangChange(fix);
}
