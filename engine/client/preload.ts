// 미리 불러오기: 게임이 등록한 모델과 효과음 파일(engine/client/assets.ts)을 접속 화면 동안 읽고, 접속 화면에 진행률을 보인다.
// 등록한 것이 없는 게임은 아무것도 하지 않는다 (접속 화면도 예전과 같다). 접속이 먼저 끝나도 다 읽을 때까지(길어도 WAIT_MAX_MS) 접속 화면을 둔다:
// 들어가자마자 코드 모델이 파일의 모델로 바뀌는 모습을 보이지 않게. 읽지 못한 파일은 건너뛴다 (그 자리는 코드 모델과 합성음).
import { $ } from './app';
import { preloadList } from './assets';
import { t } from './i18n';
import { preloadModel } from './scene/models';
import { fetchSound } from './sound';

/** 이보다 오래 걸리면 기다리지 않고 들어간다 (남은 파일은 뒤에서 마저 읽고, 다 읽히면 바꿔 끼운다) */
const WAIT_MAX_MS = 12000;
let done = true;
const waiting: (() => void)[] = [];

function finish(): void {
  if (done) return;
  done = true;
  const el = document.querySelector<HTMLElement>('#gateLoad');
  if (el) el.hidden = true;
  for (const fn of waiting.splice(0)) fn();
}

/** 미리 읽기를 시작한다. 시작할 때 한 번 (게임의 모듈이 등록을 마친 뒤) */
export function startPreload(): void {
  const { models, sounds } = preloadList();
  const jobs = [...models.map((u) => () => preloadModel(u)), ...sounds.map((u) => () => fetchSound(u))];
  if (!jobs.length) return;
  done = false;
  // 접속 화면의 안내 아래에 진행 막대와 글: '모델과 소리를 불러오는 중 3/6'
  const box = document.createElement('div');
  box.id = 'gateLoad';
  box.innerHTML = '<progress id="gateLoadBar"></progress><span class="note"><span data-i18n="loadingAssets"></span> <span id="gateLoadN"></span></span>';
  $('gateMsg').after(box);
  const bar = $<HTMLProgressElement>('gateLoadBar'), label = box.querySelector<HTMLElement>('[data-i18n]'), count = $('gateLoadN');
  bar.max = jobs.length;
  if (label) label.textContent = t('loadingAssets');
  let n = 0;
  const show = () => { bar.value = n; count.textContent = `${n}/${jobs.length}`; };
  show();
  void Promise.all(jobs.map((job) => job().finally(() => { n++; show(); }))).then(finish);
  window.setTimeout(finish, WAIT_MAX_MS);
}

/** 미리 읽기가 끝나면 부른다 (끝났거나 읽을 것이 없으면 바로) */
export function afterPreload(fn: () => void): void {
  if (done) fn(); else waiting.push(fn);
}
