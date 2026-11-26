// 화면이 아는 고른 모듈 (../shared/picked.ts를 다시 내보낸다). 화면의 창·단추·메뉴 탭·단축키는 그 모듈을 고른 게임에만 생긴다:
//   뼈대(hud/skeleton.ts)의 data-mod 요소는 붙일 때 고르지 않은 모듈의 것을 빼고(hud/shell.ts), 틀의 화면 모듈은 고른 것만 init한다(modules.ts).
export { MODS, anyModule, hasModule } from '../shared/picked';
