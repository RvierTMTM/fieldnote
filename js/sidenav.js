/* sidenav.js — 넓은 화면(폴드 펼침·태블릿, 폭 720px 이상) 왼쪽 메뉴
   공개: updateSideNav(screen)   app.js 가 화면을 그린 뒤마다 부른다(screen = 화면 객체)
   · 실사 안의 화면(screen.projectId 있음)에서만 보인다. 좁은 화면에서는 아무것도 하지 않는다.
     폭이 바뀌면(폴드 접기·펴기, 화면 돌리기) 바로 켜고 끈다. 켜지면 #app 에 sn-on 클래스(css/sidenav.css).
   · 트리: 홈 › 현장 › 장소 › 설치 지점 / 케이블 경로 › 구간 / 내보내기 › 입력 현황 · 장표 미리보기
     장비·자유 추가는 넣지 않는다(그 화면에서는 위 설치 지점·장소를 지금 위치로 본다).
   · 상태: 완료(사용자가 누름) 초록 점 / 빠진 값 노란 ! / 완료 전 회색 빈 원 / 미작성(isBlankNode) 표시 없음.
     판단은 화면 카드 배지와 같다(home.js·site.js·place.js·preview-status.js).
   · 지금 화면 항목은 파랑. 다른 화면으로 옮길 때 지금 위치까지 자동으로 펼친다.
     접고 편 상태는 sessionStorage 'fn.sidenav.<실사 ID>' 에 둔다(읽기·쓰기 실패는 무시).
   · 지우기 기능 없음(미작성 [지우기]는 오른쪽 목록 카드에만).
   · 화면을 다시 그리지 않는 입력(글자·사진 등) 뒤에도 잠시 뒤 상태를 다시 읽는다. */
import { h } from './ui.js';
import { projectNodes, photoKeys, missingItems, isBlankNode, nameOf, val } from './store.js';
import { P, hrefOf } from './screens/common.js';

const WIDE = '(min-width: 720px)';
const NOT_DONE = '완료 표시 전';
const ST_LABEL = { ok: '완료', no: '빠진 값 있음', plain: '완료 전' };
const DEFAULT_OPEN = ['home', 'routes', 'export'];

const mq = window.matchMedia ? window.matchMedia(WIDE) : null;
let aside = null;
let pid = null;          // 지금 화면의 실사 ID(없으면 메뉴 없음)
let tree = null;         // 마지막으로 만든 트리
let cur = null;          // 지금 화면 항목 키
let token = 0;
let lastCall = 0;
let timer = null;
const lastCur = new Map();   // 실사 ID → 마지막으로 펼쳐 준 지금 위치
const openSets = new Map();  // 실사 ID → 펼친 항목 키 Set

const isWide = () => !!(mq && mq.matches);

/* ── 접힘 상태 ───────────────────────────────────────── */
function openSet(id) {
  if (openSets.has(id)) return openSets.get(id);
  let list = null;
  try { list = JSON.parse(sessionStorage.getItem('fn.sidenav.' + id) || 'null'); } catch (e) { list = null; }
  const s = new Set(Array.isArray(list) ? list : DEFAULT_OPEN);
  openSets.set(id, s);
  return s;
}
function saveOpen(id) {
  try { sessionStorage.setItem('fn.sidenav.' + id, JSON.stringify([...openSet(id)])); } catch (e) { /* 저장 못 해도 동작 */ }
}

/* ── 지금 위치 ───────────────────────────────────────── */
function hashPath() { return (location.hash || '#/').slice(1).split('?')[0]; }

/** 주소 → 트리 키. 장비·자유 추가는 트리에 있는 가장 가까운 위 항목. */
function currentKey(byId, inTree) {
  const m = /^\/p\/[^/]+(?:\/(s|pl|pt|cd|dv|ex|rt)\/([^/]+)|\/(routes|export|preview|trash))?$/.exec(hashPath());
  if (!m) return null;
  if (m[3]) return { routes: 'routes', export: 'x-status', preview: 'x-slides' }[m[3]] || null;
  if (!m[1]) return 'home';
  let id = m[2];
  try { id = decodeURIComponent(id); } catch (e) { /* 그대로 */ }
  if (inTree.has(id)) return id;
  const node = byId.get(id);
  if (!node) return null;
  const ids = node.path.split('/').slice(1, -1).reverse();
  return ids.find((x) => inTree.has(x)) || null;
}

/* ── 트리 만들기 ─────────────────────────────────────── */
async function buildTree(id) {
  const [nodes, keys] = await Promise.all([projectNodes(id), photoKeys(id)]);
  const miss = await missingItems(id, { nodes, keys });
  const sorted = nodes.filter((n) => n.type !== 'device' && n.type !== 'extra').sort((a, b) => a.order - b.order);
  const kids = new Map();
  for (const n of sorted) {
    if (!kids.has(n.parentId)) kids.set(n.parentId, []);
    kids.get(n.parentId).push(n);
  }
  const of = (pidOrId, type) => (kids.get(pidOrId) || []).filter((n) => n.type === type);
  const blank = (n) => isBlankNode(n, nodes, keys);
  const doneOf = (n) => val(n, 'done') === true;
  const inTree = new Set();
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const pointItem = (q) => {
    inTree.add(q.id);
    let st = null;
    if (!blank(q)) st = miss.some((m) => m.node.id === q.id) ? 'no' : doneOf(q) ? 'ok' : 'plain';
    return { key: q.id, label: nameOf(q), href: hrefOf(q), st, parent: q.parentId };
  };
  const placeItem = (p) => {
    inTree.add(p.id);
    const isBlank = blank(p);
    let st = null;
    if (!isBlank) st = miss.some((m) => m.placeId === p.id && m.text !== NOT_DONE) ? 'no' : doneOf(p) ? 'ok' : 'plain';
    return { key: p.id, label: nameOf(p), href: hrefOf(p), st, blank: isBlank, done: doneOf(p), parent: p.parentId, kids: of(p.id, 'point').map(pointItem) };
  };
  const siteItem = (s) => {
    inTree.add(s.id);
    const places = of(s.id, 'place').map(placeItem);
    let st = null;
    if (!blank(s)) {
      const real = places.filter((p) => !p.blank);
      if (!real.length) st = 'plain';
      else if (real.some((p) => p.st === 'no')) st = 'no';
      else st = real.every((p) => p.done) ? 'ok' : 'plain';
    }
    return { key: s.id, label: nameOf(s), href: hrefOf(s), st, parent: 'home', kids: places };
  };
  const sites = of(id, 'site');
  const routeItems = sites.flatMap((s) => of(s.id, 'route')).map((r) => {
    inTree.add(r.id);
    let st = null;
    if (!blank(r)) st = miss.some((m) => m.node.id === r.id) ? 'no' : doneOf(r) ? 'ok' : 'plain';
    return { key: r.id, label: nameOf(r), href: hrefOf(r), st, parent: 'routes' };
  });
  const lacks = miss.filter((m) => m.text !== NOT_DONE).length;
  const base = P(id);
  const top = [
    { key: 'home', label: '홈', href: base, top: true, kids: sites.map(siteItem) },
    { key: 'routes', label: '케이블 경로', href: base + '/routes', top: true, kids: routeItems },
    { key: 'export', label: '내보내기', href: base + '/export', top: true, kids: [
      { key: 'x-status', label: '입력 현황', href: base + '/export', st: lacks ? 'no' : null, parent: 'export' },
      { key: 'x-slides', label: '장표 미리보기', href: base + '/preview', parent: 'export' },
    ] },
  ];
  const index = new Map();
  const walk = (list) => list.forEach((n) => { index.set(n.key, n); if (n.kids) walk(n.kids); });
  walk(top);
  return { top, index, byId, inTree };
}

/** 키의 위 항목들 + 자기 자신 */
function pathOf(t, key) {
  const out = [];
  let n = t.index.get(key);
  while (n) {
    out.unshift(n.key);
    if (n.top) break;
    n = t.index.get(n.parent);
  }
  return out;
}

/* ── 그리기 ──────────────────────────────────────────── */
function draw({ scrollToCur } = {}) {
  if (!aside || !tree) return;
  const open = openSet(pid);
  const rows = [];
  const row = (n, depth) => {
    const has = !!(n.kids && n.kids.length);
    const isOpen = has && open.has(n.key);
    const here = cur === n.key;
    rows.push(h('div', { class: 'sn-row' + (n.top ? ' sn-top' : '') + (here ? ' sn-cur' : ''), style: 'padding-left:' + (0.2 + depth * 0.9) + 'rem' },
      has
        ? h('button', { type: 'button', class: 'sn-tg', 'data-k': n.key, 'aria-expanded': String(isOpen), 'aria-label': n.label + (isOpen ? ' 접기' : ' 펼치기') }, isOpen ? '▾' : '▸')
        : h('span', { class: 'sn-tg sn-leaf', 'aria-hidden': 'true' }),
      h('a', { class: 'sn-l', href: n.href, 'aria-current': here ? 'page' : null }, n.label),
      n.st ? h('span', { class: 'sn-st sn-' + n.st, role: 'img', 'aria-label': ST_LABEL[n.st] }) : null));
    if (isOpen) n.kids.forEach((k) => row(k, depth + 1));
  };
  tree.top.forEach((n) => row(n, 0));
  aside.replaceChildren(...rows);
  if (scrollToCur) {
    const el = aside.querySelector('.sn-cur');
    if (el) {
      const t = el.offsetTop;
      const b = t + el.offsetHeight;
      if (t < aside.scrollTop) aside.scrollTop = Math.max(0, t - 8);
      else if (b > aside.scrollTop + aside.clientHeight) aside.scrollTop = b - aside.clientHeight + 8;
    }
  }
}

function ensureAside() {
  if (aside) return aside;
  aside = h('nav', { id: 'sidenav', class: 'sidenav', 'aria-label': '메뉴' });
  aside.addEventListener('click', (e) => {
    const t = e.target.closest('[data-k]');
    if (!t || !pid) return;
    const s = openSet(pid);
    const k = t.getAttribute('data-k');
    if (s.has(k)) s.delete(k); else s.add(k);
    saveOpen(pid);
    draw();
  });
  const view = document.getElementById('view');
  view.parentNode.insertBefore(aside, view);
  return aside;
}

function setOn(on) {
  document.getElementById('app').classList.toggle('sn-on', on);
  if (aside) aside.hidden = !on;
}

async function rebuild({ fromRender } = {}) {
  const id = pid;
  const my = ++token;
  if (!id || !isWide()) { setOn(false); return; }
  let t;
  try { t = await buildTree(id); } catch (e) { console.error(e); return; }
  if (my !== token || id !== pid || !isWide()) return;
  ensureAside();
  tree = t;
  cur = currentKey(t.byId, t.inTree);
  let moved = false;
  if (cur && lastCur.get(id) !== cur) {
    const s = openSet(id);
    pathOf(t, cur).forEach((k) => s.add(k));
    saveOpen(id);
    lastCur.set(id, cur);
    moved = true;
  }
  setOn(true);
  draw({ scrollToCur: moved || fromRender === 'first' });
}

/** app.js: 화면을 그린 뒤마다 부른다 */
export function updateSideNav(screen) {
  const was = pid;
  pid = (screen && screen.projectId) || null;
  lastCall = Date.now();
  clearTimeout(timer);
  if (!pid || !isWide()) { token++; setOn(false); return; }
  rebuild({ fromRender: was !== pid ? 'first' : true });
}

/* 화면을 다시 그리지 않는 입력 뒤 잠시 있다 상태 다시 읽기 */
function schedule() {
  if (!pid || !isWide()) return;
  if (Date.now() - lastCall < 300) return;       // 방금 화면을 그리며 생긴 변화
  clearTimeout(timer);
  timer = setTimeout(() => rebuild(), 1200);
}

function watchView() {
  const view = document.getElementById('view');
  if (!view) return;
  ['input', 'change', 'click'].forEach((ev) => view.addEventListener(ev, schedule, true));
  if (window.MutationObserver) new MutationObserver(schedule).observe(view, { childList: true, subtree: true });
}

if (mq) {
  const onChange = () => { if (isWide() && pid) rebuild({ fromRender: 'first' }); else { token++; setOn(false); } };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchView);
else watchView();
