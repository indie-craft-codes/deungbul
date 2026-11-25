// 틀의 문장 가운데 게임의 내용에 따라 달라지는 것 (시험용 내용 위에서, 이름표 없이 띄운 기본 이름표로)
// 새 게임 만들기 검증(2026-11-25)에서 드러난 것: 일어나는 곳을 정하지 않은 게임의 쓰러짐 안내, 상점·제작이 없는 게임의 장비 탭 안내
import { enBase } from '../../client/i18n/en';
import { koBase } from '../../client/i18n/ko';
import { idNames } from '../../client/i18n/names';
import { check } from '../harness';

const ko = koBase(idNames()), en = enBase(idNames());

// g.rules.respawn의 기본은 id ''를 보낸다: 빈 이름이 아니라 '처음 자리'로 적는다
check(ko.msg.died(['']).includes('처음 자리에서') && en.msg.died(['']).includes('at the starting point'), `일어나는 곳을 정하지 않았으면 '처음 자리' (${ko.msg.died([''])})`);
const named = koBase({ ...idNames(), places: { '': '동굴 입구', camp: '야영지' } });
check(named.msg.died(['']).includes('동굴 입구에서') && named.msg.died(['camp']).includes('야영지에서') && ko.msg.died(['nowhere']).includes('nowhere에서'), '이름표의 places가 먼저다 (빈 id도 덮어쓸 수 있다). 모르는 id는 그대로');

// 장비 탭의 강화 안내: 상점에서 장비를 팔지 않거나 제작이 없는 게임에서는 그것을 말하지 않는다
const full = ko.fmt.gearHint(5, 10), plain = ko.fmt.gearHint(5, 10, false, false), enPlain = en.fmt.gearHint(5, 10, false, false);
check(full.includes('상점에서 산') && full.includes('만들거나 주운'), '상점과 제작이 있는 게임: 둘 다 말한다 (기본)');
check(!plain.includes('상점') && !plain.includes('만들거나') && plain.includes('+5') && plain.includes('+10') && !enPlain.includes('shop') && !enPlain.includes('crafted'), `없는 게임: 상점·제작을 말하지 않는다 (${plain})`);
