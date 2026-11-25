/* install.js — 홈 화면에 추가(설치)
   공개: initInstall(), canShowInstall(), isStandalone(), hasInstallPrompt(), askInstall(), installButton()
   · 크롬이 beforeinstallprompt 를 주면 잡아 두었다가 버튼을 누를 때 설치 창을 띄운다.
   · 이벤트가 없으면 "크롬 메뉴 ⋮ → 홈 화면에 추가" 안내 창을 띄운다.
   · 이미 앱처럼(standalone) 열려 있으면 버튼을 숨긴다.
   · v0.36: 아이폰·아이패드(isIOS)는 설치 창이 없으므로 "공유 버튼 □↑ → 홈 화면에 추가" 안내를 띄운다. */
import { h, alertDialog } from './ui.js';

let deferred = null;
let installed = false;

export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    document.querySelectorAll('[data-install]').forEach((el) => el.remove());
  });
}

export function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}

/** 아이폰·아이패드(아이패드 OS 는 맥처럼 보고하므로 터치 여부로 가린다) */
export const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || '')
  || (!/Android/i.test(navigator.userAgent || '') && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function canShowInstall() { return !installed && !isStandalone(); }

/** 크롬이 설치 창(beforeinstallprompt)을 줘서 바로 띄울 수 있으면 true */
export function hasInstallPrompt() { return !!deferred; }

export async function askInstall() {
  if (deferred) {
    const e = deferred;
    deferred = null;
    e.prompt();
    try { await e.userChoice; } catch (err) { /* 닫아도 그대로 둔다 */ }
    return;
  }
  await alertDialog('홈 화면에 추가', [
    isIOS() ? '사파리나 크롬의 공유 버튼(□↑)을 누른 뒤 "홈 화면에 추가"를 누르세요.' : '크롬 오른쪽 위 메뉴 ⋮ 를 누른 뒤 "홈 화면에 추가"를 누르세요.',
    '추가하면 아이콘으로 바로 열 수 있고, 인터넷이 안 되는 곳에서도 열립니다.',
  ]);
}

export function installButton() {
  if (!canShowInstall()) return null;
  return h('button', { type: 'button', class: 'btn sub', 'data-install': '1', onclick: askInstall }, '홈 화면에 추가');
}
