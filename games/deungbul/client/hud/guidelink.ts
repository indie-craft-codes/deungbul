// 도감으로 가는 단추. 도감(games/deungbul/client/guide.html)은 게임의 수치와 규칙을 모두 보여 주는 따로 떨어진 페이지다.
// 새 창으로 연다: 게임의 접속이 끊기지 않는다. 지금 고른 언어를 주소에 실어 보내 도감도 같은 언어로 열린다.
// 여는 것은 플랫폼이 한다(platform().openUrl: 웹은 새 탭, 앱은 앱 안의 창이나 바깥 브라우저). 바깥 주소를 열 수 없는 곳(포털)에는 단추를 두지 않는다.
// 다른 창의 자리에 기대지 않으려고 HTML에 자리를 두지 않고 여기서 만들어 화면 가장자리에 띄운다.
import '../guide/link.css';
import { linkText } from '../guide/link.text';
import { L, onLangChange } from '@engine/client/i18n';
import { platform } from '@engine/client';

export function initGuideLink(): void {
  if (!platform().has('link.external')) return;
  const a = document.createElement('a');
  a.id = 'guideLink';
  a.rel = 'noopener';
  // 그냥 누르면 플랫폼으로 연다. Ctrl·Shift·가운데 단추로 누르면 브라우저가 하던 대로 둔다 (새 탭, 새 창)
  a.addEventListener('click', (ev) => {
    if (ev.button !== 0 || ev.ctrlKey || ev.shiftKey || ev.metaKey || ev.altKey) return;
    ev.preventDefault();
    void platform().openUrl(a.href);
  });
  const draw = (): void => {
    const code = L().code, text = linkText(code);
    a.textContent = text.label;
    a.title = text.title;
    a.setAttribute('aria-label', text.title);
    // 상대 경로: 게임 서버가 내보낼 때도, GitHub Pages의 하위 경로에서도 같은 폴더의 도감을 가리킨다
    a.href = `./guide.html?lang=${code}`;
  };
  draw();
  onLangChange(draw);
  document.body.append(a);
}
