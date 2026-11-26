// 채널 선택: 내 정보 창에서 지금 채널과 채널별 인원을 보여 주고, 고르면 그 채널로 옮긴다.
// 옮길 수 있는지는 서버가 정한다. 못 옮기면 서버의 안내문(싸우는 중, 잠시 뒤에, 가득 참)이 한 줄 알림으로 뜨고
// 선택 상자는 지금 채널로 돌아간다. 던전 안에서는 바꿀 수 없어 흐리게 잠근다.
import { $ } from '../app';
import { onMsg } from '../bus';
import { L, onLangChange } from '../i18n';
import { send } from '../net';

const sel = $<HTMLSelectElement>('channel');
/** 서버가 알려 준 내 채널(1부터), 채널별 인원, 게임이 '바쁜 때'를 알리면 채널별 남은 적 */
let me = 0, list: number[] = [], foes: number[] = [];
/** 좁은 화면(폰): 닫혀 있는 상자는 좁게 잘려 보이므로 고른 채널을 짧게("Ch 1") 적고, 펼칠 때 길게 적는다 (css의 #channel과 같은 기준) */
const narrow = typeof matchMedia === 'function' ? matchMedia('(max-width: 720px), (max-height: 480px)') : null;

function render(): void {
  const loc = L();
  sel.hidden = list.length < 2; // 채널이 하나뿐이면 고를 것이 없다
  // 목록을 새로 만들지 않고 글자만 고친다: 펼쳐 놓고 고르는 중에 인원 소식이 와도 목록이 닫히지 않는다
  while (sel.options.length > list.length) sel.remove(sel.options.length - 1);
  while (sel.options.length < list.length) sel.add(new Option('', String(sel.options.length + 1)));
  list.forEach((people, i) => {
    const short = !!narrow?.matches && document.activeElement !== sel && i + 1 === me;
    const text = short ? loc.fmt.channelShort(i + 1) : loc.fmt.channelOpt(i + 1, people, foes[i] ?? 0);
    if (sel.options[i].text !== text) sel.options[i].text = text;
  });
  if (document.activeElement !== sel) sel.value = String(me);
}

export function initChannel(): void {
  sel.addEventListener('change', () => {
    const n = Number(sel.value);
    if (n !== me) send({ t: 'channel', n });
    // 서버가 옮겨 줄 때까지는 지금 채널을 보여 준다 (거절되면 그대로 남는다)
    sel.blur();
    sel.value = String(me);
  });
  onMsg('channels', (m) => { me = m.me; list = m.list; foes = m.foes ?? []; render(); });
  // 이 모듈이 던전 모듈보다 먼저 불리므로 S.dungeon이 아니라 메시지에서 바로 읽는다
  onMsg('dungeon', (m) => { sel.disabled = !!m.id; });
  onLangChange(render);
  // 펼치면 길게, 닫히면 짧게
  sel.addEventListener('focus', render);
  sel.addEventListener('blur', render);
  narrow?.addEventListener('change', render);
}
