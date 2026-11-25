// 아이템 그림(hud/icons.ts): 시트의 칸과 아이템 id, 손 모양마다 다른 무기 그림 (시험용 내용 위에서. 화면 요소는 만들지 않고 고르는 규칙만 본다)
import { addItemSheet, hasItemIcon } from '../../client/hud/icons';
import { check } from '../harness';

// 시험용 내용: knight는 검(sword), ranger는 활(bow), sage는 지팡이(staff)를 든다
addItemSheet('./items/a.jpg', 3, 2, ['draught', null, 'ore']);
check(hasItemIcon('draught') && hasItemIcon('ore') && !hasItemIcon('brew'), '시트에 적은 아이템만 그림이 있다 (빈 칸 null은 건너뛴다)');

addItemSheet('./items/gear.jpg', 2, 2, ['blade1', 'blade2'], 'sword');
check(hasItemIcon('blade1', 'knight') && !hasItemIcon('blade1', 'ranger') && !hasItemIcon('blade1', 'sage'), '손 모양을 정한 그림은 그 손의 직업에게만 (궁수에게 검 그림을 보이지 않는다)');
addItemSheet('./items/bows.jpg', 2, 1, ['blade1'], 'bow');
check(hasItemIcon('blade1', 'ranger') && !hasItemIcon('blade1', 'sage') && hasItemIcon('blade1', 'knight'), '손 모양마다 따로 등록한다 (활 그림을 더하면 궁수에게도 보인다)');
addItemSheet('./items/gear.jpg', 2, 2, [null, null, 'plate1']);
check(hasItemIcon('plate1', 'knight') && hasItemIcon('plate1', 'ranger'), '손 모양을 정하지 않은 그림(갑옷)은 모두에게');
