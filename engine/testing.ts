// 틀의 시험 도구 입구: 게임의 시험이 읽는 것 (검사 기록, 서버에 붙는 가짜 손님, 기다리기). 입구의 목록은 engine/shared/index.ts.
export { check, connect, failures, removeTemp, settle, sleep, until, type Peer } from './test/harness';
