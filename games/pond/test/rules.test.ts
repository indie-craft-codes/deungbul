// 반딧불 연못의 규칙 (서버 없이 shared/rules.ts만): 패 나누기, 차례와 선, 펼치기(얽힘·크기), 점수와 끝, 컴퓨터, 컴퓨터끼리 1000판의 자리별 승률
import { check } from '@engine/testing';
import { POND } from '../shared/content/pond';
import { castFull, choose, expected, fullDeck, newBoard, place, rand, ranking, resolveSpot, reveal, sightOf, winner, type Board } from '../shared/rules';

const all4 = [true, true, true, true];

// ---------- 나누기 ----------
{
  const b = newBoard(7);
  const dealt = b.hands.flat();
  check(b.hands.length === 4 && b.hands.every((h) => h.length === POND.hand), '넷에게 여덟 장씩 나눈다');
  check(b.hands.every((h) => h.every((v, i) => i === 0 || h[i - 1] <= v)), '손패는 작은 수부터 놓인다');
  const deck = fullDeck(), count = (a: number[], v: number) => a.filter((x) => x === v).length;
  check(deck.length === 40 && [...new Set(dealt)].every((v) => count(dealt, v) <= count(deck, v)), '나눈 패는 한 벌(1~10이 넷씩) 안에서 나온다');
  check(b.fish.length === 3 && b.fish.every((f) => f >= 1 && f <= 5), '나루 셋에 크기 1~5의 물고기');
  const again = newBoard(7);
  check(JSON.stringify(again.hands) === JSON.stringify(b.hands) && again.fish.join() === b.fish.join(), '같은 씨앗이면 같은 판 (저장하고 되살릴 수 있다)');
}

// ---------- 차례와 선 ----------
{
  const b = newBoard(11);
  check(expected(b, all4) === 0, '첫 던지기의 선은 자리 0');
  check(!place(b, all4, 1, b.hands[1][0], 0), '차례가 아닌 자리는 던지지 못한다');
  check(!place(b, all4, 0, 99, 0), '손에 없는 수는 던지지 못한다');
  check(!place(b, all4, 0, b.hands[0][0], 3) && !place(b, all4, 0, b.hands[0][0], -1), '없는 나루에는 던지지 못한다');
  const v0 = b.hands[0][0];
  check(place(b, all4, 0, v0, 1) && b.hands[0].length === 7 && b.placed[0]?.value === v0, '던지면 손에서 빠지고 엎은 미끼가 된다');
  check(expected(b, all4) === 1 && !castFull(b, all4), '다음은 자리 1, 아직 모두 던지지 않았다');
  for (const s of [1, 2, 3]) place(b, all4, s, b.hands[s][0], s - 1);
  check(castFull(b, all4) && expected(b, all4) === -1, '넷이 다 던지면 펼칠 때');
  reveal(b, all4);
  check(b.cast === 2 && b.leader === 1 && expected(b, all4) === 1, '펼치면 다음 던지기의 선이 왼쪽(자리 1)으로');
  for (const s of [1, 2, 3, 0]) check(place(b, all4, s, b.hands[s][0], 0), `둘째 던지기: 자리 ${s}의 차례 (선 1부터 돌아 0이 끝)`);
  reveal(b, all4);
  check(b.leader === 2, '셋째 던지기의 선은 자리 2');
  // 빠진 자리(기권·몰수)는 건너뛴다
  const out = [true, true, false, true];
  check(expected(b, out) === 3, '선이 빠진 자리면 다음 살아 있는 자리가 선');
  for (const s of [3, 0, 1]) place(b, out, s, b.hands[s][0], 2);
  check(castFull(b, out), '빠진 자리는 기다리지 않고 펼친다');
  reveal(b, out);
  check(b.leader === 3, '선은 빠진 자리를 건너 옮긴다');
}

// ---------- 펼치기: 얽힘과 크기 ----------
{
  check(resolveSpot([[0, 7], [1, 5]], 3).win === 0, '가장 큰 미끼가 낚는다');
  const tie = resolveSpot([[0, 7], [1, 7], [2, 5]], 3);
  check(tie.win === 2 && tie.tangled.join() === '7', '같은 수끼리는 얽혀 빠지고, 남은 가장 큰 미끼가 낚는다');
  check(resolveSpot([[0, 4], [1, 4]], 1).win === -1, '모두 얽히면 아무도 못 낚는다');
  check(resolveSpot([[0, 3]], 4).win === -1 && resolveSpot([[0, 4]], 4).win === 0, '물고기는 제 크기보다 작은 미끼는 물지 않는다 (같으면 문다)');
  check(resolveSpot([[0, 9], [1, 9], [2, 2]], 5).win === -1, '얽히고 남은 미끼가 작으면 아무도 못 낚는다');
  check(resolveSpot([], 2).win === -1, '미끼가 없으면 아무도 못 낚는다');

  const b = newBoard(3);
  b.fish = [3, 2, 8];
  b.hands = [[9, 1], [9, 2], [4, 3], [6, 5]];
  place(b, all4, 0, 9, 0); place(b, all4, 1, 9, 0); place(b, all4, 2, 4, 0); place(b, all4, 3, 6, 2);
  const r = reveal(b, all4);
  check(r.spots[0].win === 2 && b.scores[2] === 3 && b.caught[2] === 1, '가 나루: 9와 9가 얽히고 4가 3점을 낚는다');
  check(r.spots[1].win === -1 && b.fish[1] === 3, '미끼 없는 나루의 물고기는 1 자란다');
  check(r.spots[2].win === -1 && b.fish[2] === 8, '6은 8점짜리에 작아 못 낚는다 (8에서 더 자라지 않는다)');
  check(r.spots[0].baits.length === 3 && b.seen.length === 4, '펼친 미끼는 모두가 아는 수가 된다');
}

// ---------- 끝과 순위 ----------
{
  const b = newBoard(5);
  let casts = 0;
  while (!b.done) {
    const s = expected(b, all4);
    place(b, all4, s, b.hands[s][0], casts % 3);
    if (castFull(b, all4)) { reveal(b, all4); casts++; }
  }
  check(casts === POND.hand && b.hands.every((h) => h.length === 0), '여덟 번 던지면 손패가 다 비고 끝난다');
  b.scores = [10, 12, 12, 3]; b.caught = [2, 3, 2, 1];
  check(winner(b, all4) === 1, '점수가 같으면 낚은 물고기가 많은 쪽이 이긴다');
  b.caught = [2, 3, 3, 1];
  check(winner(b, all4) === -2 && ranking(b, all4).filter(([, k]) => k === 1).length === 2, '그래도 같으면 비김 (둘이 1등)');
  check(winner(b, [true, false, true, true]) === 2, '빠진 자리는 이길 수 없다');
}

// ---------- 컴퓨터: 볼 수 있는 것만 ----------
{
  const b = newBoard(21);
  place(b, all4, 0, b.hands[0][3], 1);
  const s = sightOf(b, all4, 1);
  check(JSON.stringify(Object.keys(s).sort()) === JSON.stringify(['castsLeft', 'fish', 'hand', 'later', 'others', 'seen']) && s.others.join() === '1' && s.later === 2, '컴퓨터가 아는 것: 제 손패, 물고기, 남이 던진 나루(수는 없다), 뒤에 던질 사람 수, 펼쳐진 수');
  let ok = true;
  for (let k = 0; k < 200; k++) { const m = choose(s, () => rand(b)); if (!s.hand.includes(m.value) || m.spot < 0 || m.spot > 2) ok = false; }
  check(ok, '컴퓨터는 늘 제 손의 패를 있는 나루에 던진다');
}

// ---------- 컴퓨터끼리 1000판: 자리 차례별 승률 ----------
{
  const N = 1000, wins = [0, 0, 0, 0], scores = [0, 0, 0, 0];
  let draws = 0, turns = 0;
  for (let n = 0; n < N; n++) {
    const b: Board = newBoard(1000 + n * 7919);
    while (!b.done) {
      const s = expected(b, all4);
      const m = choose(sightOf(b, all4, s), () => rand(b));
      place(b, all4, s, m.value, m.spot);
      turns++;
      if (castFull(b, all4)) reveal(b, all4);
    }
    const w = winner(b, all4);
    if (w < 0) draws++; else wins[w]++;
    b.scores.forEach((v, i) => { scores[i] += v; });
  }
  const decided = N - draws, share = wins.map((w) => w / decided);
  console.log(`  컴퓨터끼리 ${N}판: 자리별 이김 ${wins.join(' / ')} (비김 ${draws}), 비율 ${share.map((x) => (x * 100).toFixed(1) + '%').join(' / ')}, 평균 점수 ${scores.map((x) => (x / N).toFixed(1)).join(' / ')}`);
  check(turns === N * 32, '한 판은 넷 × 여덟 번 = 32수');
  check(share.every((x) => x > 0.21 && x < 0.29), '자리 차례별 승률이 크게 쏠리지 않는다 (넷 모두 21~29%)');
  check(draws / N < 0.06, '비김은 드물다 (6% 아래)');
}
