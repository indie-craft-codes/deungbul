// 별 줍기의 화면 (판 모듈 rooms의 본보기: 서버는 ../server/stars.ts). 문서 14절 '화면'의 조각이 여기서 따온다.
// 화면의 진입점은 stars-main.ts(stars.html): 공 마당의 화면(main.ts)은 판 모듈을 고르지 않아 이 파일을 읽지 않는다.
import { myRoom, onMsg, onRoomChange, send, setCameraYaw, setRoomLook, setTapHandler, type RoomView } from '@engine/client';
import { L } from '@engine/client/i18n';
import type { StarsView } from '../server/stars';

/** 자리의 색 (자리 0~3) */
const SEAT_COLORS = ['#f0c040', '#6ab0ff', '#ff8ac0', '#7ad67a'];
/** 이 본보기의 글 (언어마다): 판의 이름, 규칙의 이름과 값, 막대 아래 줄 */
const TEXT = {
  ko: { main: '별 줍기', rush: '별 쏟기', lucky: '행운의 수', off: '끔', on: '켬', note: (v: StarsView) => `남은 별 ${v.pile} · 주운 별 ${v.got.join(' / ')}${v.luck ? ` · 행운의 수 ${v.luck}` : ''}` },
  en: { main: 'Star pick', rush: 'Star rush', lucky: 'Lucky number', off: 'Off', on: 'On', note: (v: StarsView) => `Stars left ${v.pile} · picked ${v.got.join(' / ')}${v.luck ? ` · lucky ${v.luck}` : ''}` },
};
const tx = () => (L().code === 'en' ? TEXT.en : TEXT.ko);

export function initStars(): void {
  // 판 화면에 더하는 것: 자리의 글자 색, 컴퓨터의 이름(자리마다 다르게), 좁은 화면에서 막대를 위로 (아래에 이 게임의 창이 있다)
  setRoomLook({
    seatColor: (i) => SEAT_COLORS[i] ?? '',
    seatName: (v: RoomView, i) => (v.seats[i]?.cpu ? `★${i + 1}` : ''),
    barAt: 'top',
  });
  // 판의 이름과 방장이 고르는 규칙의 글, 막대 아래 줄 (무더기와 주운 수, 내 행운의 수)
  let mine: StarsView | null = null;
  onMsg('me', (m) => { if (m.k === 'stars') mine = m.s as StarsView | null; });
  setRoomLook({
    defName: (id) => (id === 'rush' ? tx().rush : tx().main),
    optName: (k) => (k === 'lucky' ? tx().lucky : k),
    optValue: (_k, v) => (v === 'on' ? tx().on : v === 'off' ? tx().off : String(v)),
    note: () => (mine && myRoom()?.st === 'play' ? tx().note(mine) : ''),
  });
  // 누구나 자기 자리를 화면 아래에서 본다: 자리가 넷이면 자리마다 90도씩 돌린다
  onRoomChange((_before, r) => {
    setCameraYaw(r ? (r.me * 2 * Math.PI) / r.seats.length : 0);
  });
  // 판에 앉은 동안 땅 누르기는 별 하나 줍기
  setTapHandler(() => {
    if (!myRoom()) return false;
    send({ t: 'star', n: 1 } as never);
    return true;
  });
}
