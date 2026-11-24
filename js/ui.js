/* ui.js — 화면 조각 공통 도구
   공개:
     h(tag, attrs, ...children)            DOM 만들기(글자는 항상 textContent 로 들어간다)
     nwText(text) → (string|Node)[]        숫자+단위("사진 0", "14일", "2F")를 줄바꿈 없이 한 덩어리(span.nw)로 — h() 의 자식으로 넘긴다
     openOverlay(content, {kind,onClose})  창 열기. kind: 'dialog'|'sheet'|'full'
     closeOverlay(result) → Promise        맨 위 창 닫기
     closeAllOverlays() → Promise
     overlayCount()
     dialog({title, body, buttons}) → Promise<value|undefined>   ✕·바깥·뒤로 가기 = undefined(취소)
     confirmDialog({title, body, ok, cancel, danger}) → Promise<boolean>
     alertDialog(title, text) → Promise
     promptText({title, label, value, placeholder, ok}) → Promise<string|undefined>
     sheet({title, items, note}) → Promise<value|undefined>   items: {label, sub, value, on, danger}
     toast(text), flashSaved(), savedMark()
     fitText(el, {min, title}) → el        글자가 길면 칸을 키우지 않고 글자 크기를 줄인다(아래 "글자 자동 축소")
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
/* 숫자+단위 조각: 앞 낱말(있으면) + 숫자 + 짧은 단위, 공백으로 이어진 숫자 묶음("11월 22일")까지. 폰에서 "사진 / 0"처럼 갈라지지 않게 */
const NW_RE = /(?:[가-힣A-Za-z]{1,6} )?\d[\d.,~]*[가-힣A-Za-z%]{0,3}(?: \d[\d.,~]*[가-힣A-Za-z%]{0,3})*/g;
export function nwText(text) {
  const s = String(text == null ? '' : text);
  const out = [];
  let last = 0;
  for (const m of s.matchAll(NW_RE)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(h('span', { class: 'nw' }, m[0]));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
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

export function closeX() {
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

/* ── 글자 자동 축소 ───────────────────────────────────────
   fitText(el, { min, title })
     · el 한 줄 글자가 칸(el 폭)보다 길면 글자 크기를 칸에 맞을 때까지 줄인다. 최소 크기 min(rem, 기본 0.8125 = 글자 크기 "보통"에서 13px,
       화면 설정 글자 크기를 키우면 같이 커진다 — v0.30, 예전 0.67) 아래로는 줄이지 않고, 그래도 넘치면 한 줄 "…"(text-overflow)로 자른다.
     · 넘침 판정은 글자 실제 폭(Range 의 getBoundingClientRect, 소수점까지)으로 한다(v0.30). scrollWidth·clientWidth 는 정수라
       줄인 뒤에도 0.x px 넘쳐 끝 1~3글자가 "…"로 남던 문제가 있었다. 줄일 때는 0.5px 여유를 더 남긴다.
     · css 에서 white-space 를 normal 로 바꾼 요소(줄을 나누는 곳)는 넘치지 않으므로 글자를 줄이지 않는다.
     · 잘렸을 때만 전체 글을 title 속성(기본 el, title 로 다른 요소를 줄 수 있다)에 넣는다. 맞으면 title 을 걷는다.
     · el 은 폭이 정해진 요소(블록 · 플렉스/그리드 자식, 폭이 안 늘어나게 min-width:0)여야 한다. 화면에 붙기 전에 불러도 되고,
       붙어서 크기가 잡히면(ResizeObserver) 맞춘다. 칸 폭이나 화면 설정 글자 크기(html[data-fs])가 바뀌어도 다시 맞춘다.
     · 글자를 바꿨으면 fitText(el) 를 다시 부르면 바로 다시 맞춘다.
     · 화면을 만드는 중(아직 안 붙음)에 등록한 요소를 정리(fitPrune)가 지우면 그 글자는 영영 안 맞춰진다 → 한 번도 안 붙은 요소는 지우지 않는다(v0.25).
       화면을 붙인 직후 fitPending 이 맞추고, 두 프레임 뒤 한 번 더 맞춘다. */
const FIT_MIN = 0.8125;
const fitReg = new Map();          // el → { min, titleEl, w, titled, fitted, seen, at }
let fitRO = null;
let fitQ = new Set();
let fitRaf = 0;
let fitCalls = 0;

function fitOne(el, rec) {
  if (!el.isConnected) return;
  rec.seen = true;
  el.style.fontSize = '';
  if (!el.clientWidth && getComputedStyle(el).display === 'inline') el.style.display = 'block';
  const cs = getComputedStyle(el);
  const base = parseFloat(cs.fontSize) || 16;
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 18;
  const min = Math.min(base, rec.min * root);
  const cw = el.clientWidth;
  if (!cw) return;                                      // 안 보이는 중(보이면 ResizeObserver 가 다시 부른다)
  rec.fitted = true;
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
  const range = document.createRange();
  const textW = () => { range.selectNodeContents(el); return range.getBoundingClientRect().width; };   // 글자 실제 폭(소수점)
  const room = () => el.getBoundingClientRect().width - pad;                                            // 글자가 들어갈 칸 폭(소수점)
  const over = (slack) => el.scrollWidth > el.clientWidth + 0.5 || textW() > room() - slack;
  let cut = false;
  if (over(0.01)) {
    let s = Math.max(min, base * Math.max(1, room() - 0.5) / Math.max(1, textW()));
    el.style.fontSize = s + 'px';
    let guard = 0;
    while (over(0.5) && s > min && guard++ < 14) { s = Math.max(min, s - 0.5); el.style.fontSize = s + 'px'; }
    cut = over(0.01);
  }
  const t = rec.titleEl || el;
  if (cut) { t.setAttribute('title', (el.textContent || '').trim()); rec.titled = true; }
  else if (rec.titled) { t.removeAttribute('title'); rec.titled = false; }
}

function fitFlush() {
  fitRaf = 0;
  const q = fitQ; fitQ = new Set();
  for (const el of q) { const rec = fitReg.get(el); if (rec) fitOne(el, rec); }
}
function fitLater(el) {
  fitQ.add(el);
  if (!fitRaf) fitRaf = requestAnimationFrame(fitFlush);
}
/** 화면에서 사라진 요소를 등록에서 뺀다. 아직 화면에 안 붙은 새 요소(화면을 만드는 중에 등록한 것)는 빼지 않는다 —
    한 번이라도 붙었다가 떨어졌거나(seen), 등록한 지 30초가 넘도록 안 붙은 것(만들다 버린 화면)만 뺀다. */
const FIT_ABANDON_MS = 30000;
function fitPrune() {
  const now = Date.now();
  for (const [el, rec] of fitReg) {
    if (el.isConnected) { rec.seen = true; continue; }
    if (rec.seen || now - rec.at > FIT_ABANDON_MS) { fitReg.delete(el); if (fitRO) fitRO.unobserve(el); }
  }
}

/** 등록된 글자를 모두 다시 맞춘다(화면 설정 글자 크기가 바뀔 때) */
export function refitAll() {
  fitPrune();
  for (const [el, rec] of fitReg) fitOne(el, rec);
}

/** 아직 못 맞춘(화면에 붙기 전에 등록된) 글자를 지금 맞춘다 — 화면을 다 붙인 직후 app.js 가 부른다(첫 그림 전에 맞추려고) */
export function fitPending() {
  for (const [el, rec] of fitReg) if (!rec.fitted && el.isConnected) fitOne(el, rec);
  // 붙은 직후에는 폭이 아직 덜 잡혔을 수 있다(스크롤바·글꼴·플렉스 폭). 레이아웃이 끝난 뒤(다음 두 번째 프레임)에 등록된 것을 한 번 더 맞춘다.
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(refitAll));
}

export function fitText(el, { min = FIT_MIN, title } = {}) {
  if (!el) return el;
  el.classList.add('fit');
  const rec = { min, titleEl: title || null, w: -1, titled: false, fitted: false, seen: false, at: Date.now() };
  const known = fitReg.has(el);
  fitReg.set(el, rec);
  if (typeof ResizeObserver === 'function') {
    if (!fitRO) {
      fitRO = new ResizeObserver((entries) => {
        for (const e of entries) {
          const r = fitReg.get(e.target);
          if (!r) { fitRO.unobserve(e.target); continue; }
          const w = Math.round(e.contentRect.width);
          if (w === r.w) continue;
          r.w = w;
          fitLater(e.target);
        }
      });
      if (typeof MutationObserver === 'function') new MutationObserver(refitAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-fs'] });
    }
    if (!known) fitRO.observe(el);
  }
  if (++fitCalls % 100 === 0) fitPrune();                 // 화면에서 사라진 것 정리
  if (el.isConnected) fitOne(el, rec);
  return el;
}

/** 글자를 클립보드로 복사 → 성공 여부(앱 안 브라우저 안내·실사정보 배포에서 쓴다) */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* 아래 옛 방법 */ }
  try {
    const ta = h('textarea', { readonly: true, style: 'position:fixed;left:-9999px;top:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
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
