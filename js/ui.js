/* ui.js — 화면 조각 공통 도구
   공개:
     h(tag, attrs, ...children)            DOM 만들기(글자는 항상 textContent 로 들어간다)
     openOverlay(content, {kind,onClose})  창 열기. kind: 'dialog'|'sheet'|'full'
     closeOverlay(result) → Promise        맨 위 창 닫기
     closeAllOverlays() → Promise
     overlayCount()
     dialog({title, body, buttons}) → Promise<value|undefined>   ✕·바깥·뒤로 가기 = undefined(취소)
     confirmDialog({title, body, ok, cancel, danger}) → Promise<boolean>
     alertDialog(title, text) → Promise
     promptText({title, label, value, placeholder, ok}) → Promise<string|undefined>
     sheet({title, items}) → Promise<value|undefined>   items: {label, sub, value, on, danger}
     toast(text), flashSaved(), savedMark()
   창 규칙: 모든 창에 ✕. 바깥 어두운 부분·폰 뒤로 가기로도 닫힌다(history 에 한 칸씩 쌓는다).
            삭제처럼 위험한 항목(danger)은 메뉴 맨 아래에 띄워서 ✕와 멀리 둔다. */

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  add(el, kids);
  return el;
}
/* el 내용을 비우고 kids로 채운다(배열은 펼치고 null/false는 건너뜀). replaceChildren 대신 쓴다. */
export function fill(el, ...kids) {
  el.replaceChildren();
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

/* ── 창 쌓기 (history 연동) ───────────────────────────── */
const stack = [];
let waiters = [];
let closing = 0;

window.addEventListener('popstate', () => {
  const want = (history.state && history.state.ov) || 0;
  while (stack.length > want) {
    const o = stack.pop();
    o.root.remove();
    try { if (o.onClose) o.onClose(o.result); } catch (e) { console.error(e); }
  }
  closing = 0;
  const w = waiters; waiters = [];
  w.forEach((f) => f());
});

export function overlayCount() { return stack.length; }

export function openOverlay(content, { kind = 'dialog', onClose, dismissable = true } = {}) {
  const root = h('div', { class: 'ov ov-' + kind });
  root.addEventListener('click', (e) => { if (e.target === root && dismissable) closeOverlay(); });
  root.append(content);
  document.getElementById('overlays').append(root);
  const o = { root, onClose, result: undefined };
  stack.push(o);
  history.pushState({ ov: stack.length }, '');
  return o;
}

export function closeOverlay(result) {
  if (!stack.length) return Promise.resolve();
  return new Promise((res) => {
    waiters.push(res);
    if (closing >= stack.length) return;      // 이미 닫는 중(두 번 눌림)
    stack[stack.length - 1 - closing].result = result;
    closing++;
    history.back();
  });
}

export function closeAllOverlays() {
  if (!stack.length) return Promise.resolve();
  return new Promise((res) => {
    waiters.push(res);
    const n = stack.length - closing;
    if (n <= 0) return;
    closing = stack.length;
    history.go(-n);
  });
}

function closeX() {
  return h('button', { type: 'button', class: 'more', 'aria-label': '닫기', onclick: () => closeOverlay() }, '✕');
}

/* ── 알림창 ───────────────────────────────────────────── */
export function dialog({ title, body, buttons = [] }) {
  return new Promise((resolve) => {
    const box = h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'dlg-h' }, h('b', null, title || ''), closeX()),
      body,
      buttons.length ? h('div', { class: 'two' }, buttons.map((b) =>
        h('button', { type: 'button', class: 'btn ' + (b.cls || 'sub'), onclick: () => closeOverlay(b.value) }, b.label))) : null);
    openOverlay(box, { kind: 'dialog', onClose: resolve });
  });
}

function paras(text) {
  if (text instanceof Node) return text;
  if (Array.isArray(text)) return text.map((t) => (t instanceof Node ? t : h('p', null, t)));
  return h('p', null, text || '');
}

export function alertDialog(title, text) {
  return dialog({ title, body: paras(text), buttons: [{ label: '확인', cls: 'pri', value: true }] });
}

export async function confirmDialog({ title, body, ok = '확인', cancel = '취소', danger = false }) {
  const v = await dialog({
    title, body: paras(body),
    buttons: [{ label: cancel, cls: 'sub', value: false }, { label: ok, cls: danger ? 'kill' : 'pri', value: true }],
  });
  return v === true;
}

export function promptText({ title, label, value = '', placeholder = '', ok = '확인', inputmode }) {
  return new Promise((resolve) => {
    const inp = h('input', { class: 'inp', type: 'text', placeholder, inputmode, 'aria-label': label || title });
    inp.value = value;
    const done = () => closeOverlay(inp.value.trim());
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
    const box = h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'dlg-h' }, h('b', null, title || ''), closeX()),
      label ? h('p', null, label) : null,
      inp,
      h('div', { class: 'two' },
        h('button', { type: 'button', class: 'btn sub', onclick: () => closeOverlay() }, '취소'),
        h('button', { type: 'button', class: 'btn pri', onclick: done }, ok)));
    openOverlay(box, { kind: 'dialog', onClose: (r) => resolve(r === '' ? undefined : r) });
    setTimeout(() => inp.focus(), 50);
  });
}

/* ── 아래에서 올라오는 메뉴 ───────────────────────────── */
export function sheet({ title, items = [], note }) {
  return new Promise((resolve) => {
    const normal = items.filter((i) => i && !i.danger);
    const danger = items.filter((i) => i && i.danger);
    const btn = (i) => h('button', {
      type: 'button', class: 'item' + (i.on ? ' on' : '') + (i.danger ? ' danger' : ''),
      onclick: () => closeOverlay(i.value),
    }, i.label, i.sub ? h('i', null, i.sub) : null);
    const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'dlg-h' }, h('b', null, title || ''), closeX()),
      note ? h('p', { class: 'hint' }, note) : null,
      normal.map(btn),
      danger.length ? [h('div', { class: 'gap' }), danger.map(btn)] : null);
    openOverlay(box, { kind: 'sheet', onClose: resolve });
  });
}

/* ── 짧은 알림 · 자동 저장 표시 ───────────────────────── */
let toastTimer = null;
export function toast(text, ms = 3200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export function savedMark() {
  return h('p', { class: 'saved', 'data-saved': '1' }, '✓ 자동 저장됨');
}
export function flashSaved() {
  document.querySelectorAll('[data-saved]').forEach((el) => {
    el.classList.remove('flash');
    void el.offsetWidth;            // 애니메이션 다시 시작
    el.classList.add('flash');
  });
}
