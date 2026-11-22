/* router.js — 주소의 # 뒤(해시)로 화면을 바꾼다
   공개:
     addRoute(pattern, loader)     pattern 예: '/p/:pid/pl/:id'   loader(ctx) → 화면 객체(Promise)
     setApply(fn)                  화면 객체를 실제 화면에 붙이는 함수(app.js)
     setLinkHandler(fn)            '#p=…' 사업 링크가 왔을 때 부르는 함수 → 옮겨 갈 해시를 돌려준다
     onBeforeRender(fn)            화면을 새로 그리기 직전에 부르는 함수(저장 밀어내기 등)
     startRouter() → Promise       처음 한 번
     go(hash, {replace})           화면 이동(열린 창을 먼저 닫는다)
     refresh()                     지금 화면 다시 그리기(스크롤 위치 유지)
   화면 객체: { title, sub, crumbs:[{label, href, back}], brand, menu:'home'|'routes'|'export'|null,
               projectId, scope, body:Node|Node[] }
   loader 가 받는 ctx: { params, go, refresh } */
import { closeAllOverlays } from './ui.js';

const routes = [];
const before = [];
let apply = () => {};
let linkHandler = null;
let token = 0;

export function addRoute(pattern, loader) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-z]+)/gi, (m, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ re, keys, loader });
}
export function setApply(fn) { apply = fn; }
export function setLinkHandler(fn) { linkHandler = fn; }
export function onBeforeRender(fn) { before.push(fn); }

function match(path) {
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch (e) { params[k] = m[i + 1]; } });
    return { loader: r.loader, params };
  }
  return null;
}

export async function go(hash, { replace = false } = {}) {
  await closeAllOverlays();
  if (replace) {
    history.replaceState(history.state, '', hash);
    return dispatch();
  }
  if (location.hash === hash) return dispatch();
  location.hash = hash;          // hashchange 가 dispatch 를 부른다
  return undefined;
}

export function refresh() { return dispatch({ keepScroll: true }); }

async function dispatch({ keepScroll = false } = {}) {
  const my = ++token;
  for (const fn of before) {
    try { await fn(); } catch (e) { console.error(e); }
  }
  let hash = location.hash || '#/';
  if (hash.startsWith('#p=') && linkHandler) {
    const next = await linkHandler(hash.slice(3));
    history.replaceState(history.state, '', next || '#/');
    hash = next || '#/';
  }
  const path = hash.slice(1).split('?')[0] || '/';
  const m = match(path);
  if (!m) {
    if (path !== '/') { history.replaceState(history.state, '', '#/'); return dispatch(); }
    return undefined;
  }
  const ctx = { params: m.params, go, refresh };
  let screen;
  try {
    screen = await m.loader(ctx);
  } catch (e) {
    console.error(e);
    screen = { error: e };
  }
  if (my !== token) return undefined;      // 그 사이에 다른 화면으로 넘어갔다
  apply(screen, { keepScroll });
  return undefined;
}

export function startRouter() {
  window.addEventListener('hashchange', () => { dispatch(); });
  return dispatch();
}
