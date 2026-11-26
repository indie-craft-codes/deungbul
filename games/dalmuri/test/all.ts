// 달무리 원정대의 시험 (node scripts/game.mjs test dalmuri, npm test도 함께 돈다).
//   content  배너의 확률·천장, 단계의 표(다섯째마다 우두머리, 갈수록 어렵다), 영웅·던전·방치 보상의 표
//   pacing   처음 30분의 흐름 (틀의 게임 그대로, 정해진 난수): 처음 10번 뽑기, 처음 우두머리, 2장
//   net      실제 서버와 웹소켓: 접속 → 단계를 깸 → 뽑기 → 원정(별정수·열쇠 던전) → 다시 접속하면 방치 보상의 창
import { failures } from '@engine/testing';

const ALL = ['content', 'pacing', 'net'];
const only = process.argv.slice(2);
for (const name of only.length ? only : ALL) {
  console.log(`\n[dalmuri/${name}]`);
  await import(`./${name}.test.ts`);
}
console.log(failures() ? `\n실패 ${failures()}건` : '\n모두 통과');
process.exit(failures() ? 1 : 0);
