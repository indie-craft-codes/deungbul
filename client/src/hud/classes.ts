// 직업 고르기 창. 직업을 아직 고르지 않았으면 저절로 뜨고, 게임이 둔 단추(openClasses: 이 게임에서는 등탑 창의 단추)로 다시 열 수 있다.
import { CLASS_IDS, classOf } from '../../../shared/defs';
import { chooseClass } from '../actions';
import { $ } from '../app';
import { onMsg, onSlow } from '../bus';
import { L, onLangChange } from '../i18n';
import { S } from '../state';

let ui: Record<'pick' | 'list', HTMLElement>;
let open = false;

/** 직업을 다시 고르려고 창을 연다 */
export function openClasses(): void { open = true; renderClasses(); classSlow(); }

export function initClasses(): void {
  ui = { pick: $('classPick'), list: $('classList') };
  $('classClose').addEventListener('click', () => { open = false; classSlow(); });
  renderClasses();
  // 내 수치(stat)를 받으면 곧바로 띄울지 정한다: 직업이 없는 새 캐릭터에게 느린 주기를 기다리지 않고 창을 띄운다
  onMsg('stat', classSlow);
  onSlow(classSlow);
  onLangChange(renderClasses);
}

/** 언어가 바뀌면 다시 그린다. */
export function renderClasses(): void {
  const loc = L();
  ui.list.textContent = '';
  for (const id of CLASS_IDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'classopt';
    const name = document.createElement('div');
    name.className = 'cname';
    name.textContent = loc.classes[id].name + (S.me?.cls === id ? ` · ${loc.ui.currentClass}` : '');
    b.classList.toggle('current', S.me?.cls === id);
    const info = document.createElement('div');
    info.textContent = loc.classes[id].info;
    const skills = document.createElement('div');
    skills.className = 'note';
    skills.textContent = classOf(id).skills.map((s) => loc.skills[s].name).join(' · ');
    b.append(name, info, skills);
    b.addEventListener('click', () => { chooseClass(id); open = false; });
    ui.list.appendChild(b);
  }
}

/** 가끔: 창을 띄울지 정한다. */
export function classSlow(): void {
  const me = S.me;
  const must = !!me && me.ready && me.cls === ''; // 아직 고르지 않았다
  ui.pick.hidden = !(must || (open && !!me));
  $('classClose').hidden = must; // 처음에는 반드시 골라야 한다
}
