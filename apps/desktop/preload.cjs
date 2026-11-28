// 데스크톱 앱의 preload (샌드박스, contextIsolation): 화면에 window.desktopBridge 하나만 내놓는다. Node·Electron 객체는 넘기지 않는다.
// 모양은 engine/client/platform/desktop.ts의 DesktopBridge와 같다: 저장(storage), 바깥 주소 열기(openUrl), 복사(copy), 파일 저장(saveFile), 버전(init.version),
// 그리고 시작 설정(게임·서버 주소·실행 인자)과 전체 화면. 일은 주 프로세스(main.cjs)가 하고, 주 프로세스는 app://<게임>/ 페이지가 보낸 것만 받는다.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// 시작 설정과 저장된 값의 사본: 한 번만 동기로 받는다 (화면은 언어·소리·설정을 첫 그림 전에 동기로 읽는다)
const init = ipcRenderer.sendSync('dg:init');
if (init) {
  let full = !!init.fullscreen;
  ipcRenderer.on('dg:fullscreen', (_e, on) => { full = !!on; });
  contextBridge.exposeInMainWorld('desktopBridge', {
    init: { game: init.game, server: init.server, version: init.version, params: init.params, store: init.store },
    storage: {
      set: (k, v) => ipcRenderer.send('dg:set', String(k), String(v)),
      remove: (k) => ipcRenderer.send('dg:remove', String(k)),
      secretGet: (k) => ipcRenderer.invoke('dg:secret-get', String(k)),
      secretSet: (k, v) => ipcRenderer.invoke('dg:secret-set', String(k), String(v)),
      secretRemove: (k) => ipcRenderer.invoke('dg:secret-remove', String(k)),
    },
    openUrl: (url) => ipcRenderer.invoke('dg:open', String(url)),
    copy: (text) => ipcRenderer.invoke('dg:copy', String(text)),
    saveFile: (name, data, mime) => ipcRenderer.invoke('dg:save', String(name), typeof data === 'string' ? data : new Uint8Array(data), String(mime)),
    fullscreen: { is: () => full, set: (on) => ipcRenderer.invoke('dg:fullscreen', !!on) },
  });
}
