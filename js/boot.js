/* boot.js — 화면이 그려지기 전에 글자 크기·바탕 설정을 먼저 적용한다(깜빡임 방지).
   모듈이 아닌 일반 스크립트. 설정 저장 형식은 js/settings.js 와 같다. */
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('fn.settings') || '{}');
    var d = document.documentElement;
    d.dataset.fs = String(s.fontSize || 1);
    if (s.theme === 'dark') d.dataset.theme = 'dark';
  } catch (e) { /* 저장된 설정을 못 읽으면 기본값으로 둔다 */ }
})();
