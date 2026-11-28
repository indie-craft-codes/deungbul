// 나에게 걸린 강화(기술의 buff): 내 정보 창의 막대 아래에 기술 이름과 남은 시간(초)을 띄운다. 끝나면 사라진다.
// 서버가 강화를 걸 때 보내는 'buff' 사건을 entities.ts가 받아 S.buffs에 적고, 여기서는 그것을 그리기만 한다.
import { isSkillId } from '../../shared/defs';
import { $ } from '../app';
import { onMsg, onSlow } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { S } from '../state';
import { artPic } from './artdom';

const box = $('buffs');
let shown = '';

function render(): void {
  const now = performance.now(), loc = L();
  for (const [id, until] of S.buffs) if (until <= now) S.buffs.delete(id);
  const items = [...S.buffs].sort((a, b) => a[1] - b[1]).map(([id, until]) => ({ id, text: loc.fmt.buffLeft(isSkillId(id) ? loc.skills[id].name : id, Math.ceil((until - now) / 1000)) }));
  const list = items.map((x) => x.text);
  const sig = list.join('|');
  if (sig === shown) return;
  shown = sig;
  box.hidden = list.length === 0;
  // 그림 (art2): 강화마다 'icon:buff-<기술 id>' → 그 기술의 'skill:<id>' (없으면 글만)
  box.replaceChildren(...items.map(({ id, text }) => { const s = document.createElement('span'); s.className = 'buff'; s.textContent = text; const p = artPic(`icon:buff-${id}`, 'buffPic') ?? artPic(`skill:${id}`, 'buffPic'); if (p) s.prepend(p); return s; }));
  box.title = t('buffs');
}

export function initBuffs(): void {
  onSlow(render);
  onLangChange(() => { shown = ''; render(); });
  // 다른 캐릭터로 이어받으면 앞 캐릭터의 강화를 지운다
  onMsg('welcome', () => { S.buffs.clear(); render(); });
}
