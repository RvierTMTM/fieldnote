/* settings.js — 화면 설정·실사자 이름 (localStorage 'fn.settings')
   공개: getSettings(), setSetting(key, value), applySettings()
   항목: fontSize 1|2|3(보통/크게/아주 크게), theme 'light'|'dark', surveyor(실사자 이름),
         guideSeen(첫 실행 안내를 봤는지) */
const KEY = 'fn.settings';
const DEFAULTS = { fontSize: 1, theme: 'light', surveyor: '', guideSeen: false };

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch (e) { return { ...DEFAULTS }; }
}
let cur = load();

export function getSettings() { return { ...cur }; }

export function setSetting(key, value) {
  cur[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { /* 저장 공간 문제는 무시 */ }
  applySettings();
}

export function applySettings() {
  const d = document.documentElement;
  d.dataset.fs = String(cur.fontSize || 1);
  if (cur.theme === 'dark') d.dataset.theme = 'dark'; else delete d.dataset.theme;
}
