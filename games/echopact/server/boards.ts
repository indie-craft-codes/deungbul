// 메아리 계약의 순위표 (경쟁 묶음 8의 boards 모듈): 경쟁 판은 없다. 수치(주기)는 임시값 (docs/proof-echopact.md '순위표', 사용자 결정 목록).
//   tower  탑 최고 단계 (주간): 이번 주에 깬 가장 높은 단계 (장×100 + 단계: 화면이 '3-5'로 적는다). 주의 초기화 시각(RESET)에 비운다
//   squad  편성 전투력 (상시): 접속해 있는 사람의 편성 전투력을 30초마다 (내려가도 그 값으로)
import type { Game } from '@engine/server';

const SQUAD_EVERY_S = 30;

export function installBoards(g: Game): void {
  g.boards.define({ id: 'tower', name: 'boardTower', period: 'week', fmt: 'stage' });
  g.boards.define({ id: 'squad', name: 'boardPower', period: 'ever', fmt: 'num' });
  g.on('stageCleared', (p, id) => {
    const [ch, st] = id.split('-').map(Number);
    if (Number.isInteger(ch) && Number.isInteger(st)) g.boards.submit('tower', p, ch * 100 + st);
  });
  let acc = SQUAD_EVERY_S;
  g.ticks.push((dt) => {
    acc += dt;
    if (acc < SQUAD_EVERY_S) return;
    acc = 0;
    for (const p of g.ents.values()) if (p.kind === 'p' && !p.bot && p.pid) g.boards.submit('squad', p, g.squad.power(p), 'set');
  });
}
