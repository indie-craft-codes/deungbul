// 도감으로 가는 단추. 도감(client/guide.html)은 게임의 수치와 규칙을 모두 보여 주는 따로 떨어진 페이지다.
// 새 창으로 연다: 게임의 접속이 끊기지 않는다. 지금 고른 언어를 주소에 실어 보내 도감도 같은 언어로 열린다.
// 다른 창의 자리에 기대지 않으려고 HTML에 자리를 두지 않고 여기서 만들어 화면 가장자리에 띄운다.
import '../guide/link.css';
import { linkText } from '../guide/link.text';
import { L, onLangChange } from '../i18n';

export function initGuideLink(): void {
  const a = document.createElement('a');
  a.id = 'guideLink';
  a.target = '_blank';
  a.rel = 'noopener';
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
