/* settings.js — 화면 설정·실사자 이름 (localStorage 'fn.settings')
   공개: getSettings(), setSetting(key, value), applySettings()
   항목: fontSize 1|2|3(보통/크게/아주 크게), theme 'auto'|'light'|'dark'(자동=폰 설정 따름, v0.30 기본값), surveyor(실사자 이름),
         guideSeen(첫 실행 안내를 봤는지), admin(관리자 기능 켬 — js/admin.js),
         themeAuto30(v0.20 '밝게'를 '자동'으로 한 번 바꿨는지) */
const KEY = 'fn.settings';
const DEFAULTS = { fontSize: 1, theme: 'auto', surveyor: '', guideSeen: false };

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch (e) { return { ...DEFAULTS }; }
}
let cur = load();
// v0.30: v0.20까지 저장된 '밝게'(그때 기본값)를 한 번만 '자동'으로 바꾼다. 그 뒤 고른 '밝게'는 그대로 둔다.
if (!cur.themeAuto30) {
  if (cur.theme === 'light') cur.theme = 'auto';
  cur.themeAuto30 = true;
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { /* 저장 공간 문제는 무시 */ }
}

export function getSettings() { return { ...cur }; }

export function setSetting(key, value) {
  cur[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { /* 저장 공간 문제는 무시 */ }
  applySettings();
}

export function applySettings() {
  const d = document.documentElement;
  d.dataset.fs = String(cur.fontSize || 1);
  // 자동(auto·값 없음): 속성을 빼면 css 가 폰 설정(prefers-color-scheme)을 따른다
  if (cur.theme === 'dark' || cur.theme === 'light') d.dataset.theme = cur.theme; else delete d.dataset.theme;
}
