// 별 줍기의 화면 (판 모듈 rooms의 본보기: 서버는 ../server/stars.ts). 문서 14절 '화면'의 조각이 여기서 따온다.
// 공 마당의 화면(main.ts)은 판 모듈을 고르지 않아 이 파일을 읽지 않는다: 타입 검사(engine/test/core/tsconfig.json)만 받는다.
import { myRoom, onRoomChange, send, setCameraYaw, setRoomLook, setTapHandler, type RoomView } from '@engine/client';

/** 자리의 색 (자리 0~3) */
const SEAT_COLORS = ['#f0c040', '#6ab0ff', '#ff8ac0', '#7ad67a'];

export function initStars(): void {
  // 판 화면에 더하는 것: 자리의 글자 색, 컴퓨터의 이름(자리마다 다르게), 좁은 화면에서 막대를 위로 (아래에 이 게임의 창이 있다)
  setRoomLook({
    seatColor: (i) => SEAT_COLORS[i] ?? '',
    seatName: (v: RoomView, i) => (v.seats[i]?.cpu ? `★${i + 1}` : ''),
    barAt: 'top',
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
