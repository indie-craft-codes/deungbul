// 메인 퀘스트 표시: 지금 할 일, 진행 수치, 목적지 길잡이(빛기둥과 화면 가장자리 화살표).
// 창을 누르면 목적지까지 걸어간다. 가는 것만 자동이고, 도착한 뒤의 일(전투, 구매, 바치기)은 직접 한다.
import { QUESTS, goalCount, type QuestStep } from '../../shared/defs';
import { $, inDungeon, moveTo, onFrame, S, view } from '@engine/client';
import { L, onLangChange, t } from '@engine/client/i18n';
import { goalBeam } from '../scene/scene';
import { G } from '../state';

/** 화면의 요소들. initQuest에서 잡는다 (이 게임의 창이 화면에 붙은 뒤다) */
let ui: Record<'panel' | 'title' | 'step' | 'prog' | 'dist' | 'arrow' | 'go', HTMLElement>;

let needSparks = false;

function current(): QuestStep | null {
  return QUESTS[G.quest.c]?.steps[G.quest.s] ?? null;
}

/** 지금 단계의 목적지로 걸어간다. 길은 길찾기가 알아서 잡고, 직접 움직이면 그만둔다. */
export function goToQuest(): void {
  const step = current();
  if (S.me && step && !inDungeon()) moveTo(step.at.x, step.at.z); // 던전 안에서는 들판의 목적지로 걸어갈 수 없다
}

export function initQuest(): void {
  ui = { panel: $('quest'), title: $('questTitle'), step: $('questStep'), prog: $('questProg'), dist: $('questDist'), arrow: $('goalArrow'), go: $('questGo') };
  ui.panel.addEventListener('click', goToQuest);
  onFrame(questFrame);
  onLangChange(renderQuest);
}

/** 퀘스트 진행이나 언어가 바뀌었을 때 다시 쓴다. */
export function renderQuest(): void {
  const loc = L(), chapter = QUESTS[G.quest.c], step = current();
  if (!chapter || !step) {
    ui.title.textContent = t('quest');
    ui.step.textContent = t('questAllDone');
    ui.prog.textContent = '';
    ui.dist.textContent = '';
    ui.go.hidden = true;
    return;
  }
  ui.go.hidden = false;
  needSparks = step.goal.kind === 'offer' && (S.me?.sparks ?? 0) === 0;
  ui.go.textContent = t(needSparks ? 'questNeedSparks' : 'questGo'); // 터치 화면에는 단축키 안내가 빠진다 (i18n의 forInput)
  const text = loc.quests[chapter.id];
  ui.title.textContent = text.title;
  ui.step.textContent = text.steps[G.quest.s] ?? '';
  const of = goalCount(step.goal);
  ui.prog.textContent = of > 1 ? loc.fmt.questProgress(G.quest.n, of) : '';
}

/** 매 프레임: 목적지에 빛기둥을 세우고, 화면 밖이면 가장자리 화살표로 방향을 알린다. */
export function questFrame(now: number): void {
  const me = S.me, step = current();
  // 던전 안에서는 들판의 목적지까지의 거리와 방향이 뜻이 없다: 거리, 화살표, 걸어가기 안내를 숨기고 할 일만 남긴다
  const away = inDungeon();
  ui.panel.classList.toggle('away', away);
  if (!me || !step || away) { goalBeam.visible = false; ui.arrow.hidden = true; ui.dist.textContent = ''; return; }
  if ((step.goal.kind === 'offer' && me.sparks === 0) !== needSparks) renderQuest(); // 불씨가 생기거나 떨어지면 안내를 바꾼다
  const dx = step.at.x - me.x, dz = step.at.z - me.z, d = Math.hypot(dx, dz);
  goalBeam.visible = true;
  goalBeam.position.set(step.at.x, 7, step.at.z);
  goalBeam.material.opacity = 0.24 + Math.sin(now / 400) * 0.08;
  ui.dist.textContent = d > 6 ? L().fmt.distance(Math.round(d)) : '';

  // 목적지가 화면 안에 보이면 화살표는 필요 없다
  const p = view.project(step.at.x, 0, step.at.z);
  const margin = 70;
  if (d < 10 || (p && p.x > margin && p.x < view.width - margin && p.y > margin && p.y < view.height - margin)) { ui.arrow.hidden = true; return; }
  // 고정 쿼터뷰에서 월드 방향을 화면 방향으로: 오른쪽은 (+x, -z), 아래쪽은 (+x, +z)
  const sx = dx - dz, sy = dx + dz, angle = Math.atan2(sy, sx);
  const r = Math.min(view.width, view.height) * 0.3;
  const x = view.width / 2 + Math.cos(angle) * r, y = view.height / 2 + Math.sin(angle) * r;
  ui.arrow.hidden = false;
  ui.arrow.style.transform = `translate(${(x - 11).toFixed(1)}px,${(y - 11).toFixed(1)}px) rotate(${(angle + Math.PI / 2).toFixed(3)}rad)`;
}
