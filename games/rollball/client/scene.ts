// 굴림공의 겉모습: 줄무늬 잔디, 흰 줄, 두 골문(팀 색 그물), 미니맵의 바탕.
import * as THREE from 'three';
import { mat, part, setMapPaint, view, type Look } from '@engine/client';
import { PITCH, TEAM_COLOR } from '../shared/content/pitch';

const { halfW: W, halfH: H, goalHalf: GH, netDepth: D } = PITCH;
const stripe = [new THREE.Color(0x5fa64e), new THREE.Color(0x529645)];
const outside = new THREE.Color(0x4a7a3c);

export const look: Look = {
  // 경기장 안은 4m 폭의 줄무늬, 밖은 어두운 풀
  ground: (x, z, j, c) => {
    if (Math.abs(x) <= W && Math.abs(z) <= H) c.copy(stripe[Math.floor((x + W) / 4) % 2]).offsetHSL(0, 0, (j - 0.5) * 0.02);
    else c.copy(outside).offsetHSL(0, 0, (j - 0.5) * 0.04);
  },
  scenery: (scene) => {
    const white = new THREE.MeshBasicMaterial({ color: 0xf4f4ee });
    const line = (x0: number, z0: number, x1: number, z1: number) => {
      const w = Math.max(Math.abs(x1 - x0), 0.15), d = Math.max(Math.abs(z1 - z0), 0.15);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), white);
      m.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
      scene.add(m);
    };
    line(-W, -H, W, -H); line(-W, H, W, H); line(-W, -H, -W, H); line(W, -H, W, H); line(0, -H, 0, H);
    const circle = new THREE.Mesh(new THREE.RingGeometry(4.4, 4.58, 40).rotateX(-Math.PI / 2), white);
    circle.position.y = 0.03; scene.add(circle);
    // 골문: 기둥 둘, 가로대, 팀 색 그물(반투명 상자). 왼쪽(x<0)은 노을이 지키고 물결이 노린다
    for (const sx of [-1, 1]) {
      const team = sx < 0 ? 0 : 1, g = new THREE.Group();
      const post = mat(0xffffff);
      for (const sz of [-1, 1]) g.add(part(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 8), post, 0, 1.1, sz * (GH + 0.3)));
      const bar = part(new THREE.CylinderGeometry(0.14, 0.14, GH * 2 + 0.6, 8), post, 0, 2.2, 0);
      bar.rotation.x = Math.PI / 2; g.add(bar);
      const net = new THREE.Mesh(new THREE.BoxGeometry(D, 2.1, GH * 2 + 0.4), new THREE.MeshStandardMaterial({ color: TEAM_COLOR[team], transparent: true, opacity: 0.28 }));
      net.position.set(sx * D / 2, 1.05, 0); g.add(net);
      g.position.x = sx * W;
      scene.add(g);
    }
  },
};

export function initScene(): void {
  // 안개는 카메라가 멀어도(배율 2.4면 약 110m) 경기장이 흐려지지 않게 멀리
  view.setMood({ sky: 0xbfe3f5, hemi: 2.0, sun: 2.3, fogNear: 120, fogFar: 240 });
  setMapPaint((b) => {
    b.quad(-W - 4, -H - 4, W + 4, H + 4, '#3f6a34');
    b.quad(-W, -H, W, H, '#5fa64e');
    b.quad(-W - D, -GH, -W, GH, '#f06a3c');
    b.quad(W, -GH, W + D, GH, '#3c8ef0');
  });
}
