// 코드 모델의 3D 동작(engine/client/scene/motion.ts): 기본은 꺼져 있고(예전 그대로), 켜면 쓰러짐 신호를 받아 길이를 알려 주고 실제로 쓰러진다.
// 동작의 생김새는 화면으로 확인한다 (등불지기 들판: 검 내려치기·활 당기기·지팡이 내지르기·늑대 옆으로 쓰러짐)
import { animate, cueAnim, cueLength, makeBlob, makeHumanoid } from '../../client/scene/models';
import { key, useMotion } from '../../client/scene/motion';
import { check } from '../harness';

const off = makeBlob();
check(!cueAnim(off, 'die') && cueLength(off, 'die') === 0 && off.mo === undefined, '끄면(기본) 코드 모델은 동작 신호를 받지 않는다 (예전처럼 줄어들며 사라진다)');
check(key(0, [[0, 1], [1, 3]]) === 1 && key(1, [[0, 1], [1, 3]]) === 3 && key(0.5, [[0, 1], [1, 3]]) === 2 && key(2, [[0.2, 5], [0.6, 7]]) === 7, '키프레임: 처음·끝·가운데, 끝 뒤는 끝 값');

useMotion();
const man = makeHumanoid(0x884422, 'sword');
check(cueAnim(man, 'die') && cueLength(man, 'die') > 0.5, `켜면 쓰러짐 신호에 true와 길이를 돌려준다 (${cueLength(man, 'die')}초: 엔티티가 그동안 누워 있게 한다)`);
for (let i = 0; i < 60; i++) animate(man, 0, 0, 0, false, i, 1 / 60, 0, 1);
check(Math.abs(man.root.rotation.x) > 1.2 || Math.abs(man.root.rotation.z) > 1.2, '1초 뒤 사람은 뒤나 옆으로 누워 있다');
const blob = makeBlob();
cueAnim(blob, 'attack');
check(!cueAnim(blob, 'attack') && cueLength(blob, 'attack') > 0, '공격 신호는 false (클립처럼 길이만 있다)');
useMotion(false);
