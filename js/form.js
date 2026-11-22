/* form.js — 입력 칸을 목록(items)으로 적어 주면 화면을 만들고, 바뀌는 즉시 자동 저장한다.
   공개:
     renderForm(node, items, ctx) → HTMLElement
     flushPending() → Promise          아직 저장 전인 글자 입력을 바로 저장(화면 이동 전에 부른다)
   ctx: { refresh() }  — 화면 다시 그리기
   items 한 줄의 모양(t 로 구분):
     { t:'sec',  label }                              묶음 제목
     { t:'hint', label }                              작은 안내 글
     { t:'text', k, label, ph, inputmode, inputType, rerender }
     { t:'memo', k, label, ph }                       여러 줄 글
     { t:'num',  k, label, unit, quick:[숫자…], none, unknown, rerender }   숫자 + 빠른 값 버튼
     { t:'one',  k, label, opts, none, unknown, custom, exclusive, rerender }   하나 고르기
     { t:'multi',k, label, opts, none, unknown, custom, exclusive }          여러 개 고르기
     { t:'seg',  k, label, opts:[둘], none, unknown, rerender }             두 칸 버튼
     { t:'flag', k, label }                           켜고 끄는 버튼 하나
     { t:'pick', k, label, choices() → [{ref,label,sub}], custom, none, unknown, rerender }
                                                      긴 목록에서 고르기(창이 열림). 값은 { ref, label } 또는 글자
     { t:'photo', slot, label, multi, hint, warnEmpty }  사진 칸(js/photo-slot.js)
     { t:'rows', k, label, addLabel, rowTitle, cols:[위와 같은 item…] }   여러 줄(값은 배열)
     { t:'fold', label, items:[…], open }             접어 두는 묶음
     { t:'custom', render(node, ctx) }                직접 만든 조각
   모든 고르기 항목에는 "없음 / 확인 못 함"이 붙는다(none:false, unknown:false 로 뺄 수 있다).
   고른 값은 화면 글자 그대로 저장한다. 여러 개 고르기는 배열. */
import { h, promptText, confirmDialog, flashSaved, sheet, fill } from './ui.js';
import { setField, val, stamp, uid, deletePhotosOfSlot, pickLabel } from './store.js';
import { NONE, UNKNOWN } from './options.js';
import { photoSlot } from './photo-slot.js';

const pending = new Set();
const foldOpen = new Map();

export async function flushPending() {
  const fs = [...pending];
  pending.clear();
  await Promise.all(fs.map((f) => f().catch((e) => console.error(e))));
}
document.addEventListener('visibilitychange', () => { if (document.hidden) flushPending(); });
window.addEventListener('pagehide', () => { flushPending(); });

/* 값을 읽고 쓰는 곳(노드 항목 또는 여러 줄 항목의 한 줄)을 같은 모양으로 감싼다 */
function nodeBind(node) {
  return {
    projectId: node.projectId,
    path: node.path,
    key: node.id,
    slot: (s) => s,
    get: (k) => val(node, k),
    set: async (k, v) => {
      const n = await setField(node.id, k, v);
      node.data = n.data;
      node.updatedAt = n.updatedAt;
      flashSaved();
    },
  };
}
function rowBind(parent, field, rowId) {
  const rows = () => (Array.isArray(parent.get(field)) ? parent.get(field) : []);
  return {
    projectId: parent.projectId,
    path: parent.path,
    key: parent.key + ':' + field + ':' + rowId,
    slot: (s) => field + ':' + rowId + ':' + s,
    get: (k) => { const r = rows().find((x) => x.id === rowId); return r ? r[k] : undefined; },
    set: async (k, v) => {
      const next = rows().map((r) => (r.id === rowId ? { ...r, [k]: v, _m: stamp() } : r));
      await parent.set(field, next);
    },
  };
}

export function renderForm(node, items, ctx) {
  return build(nodeBind(node), items, ctx, node);
}

function build(bind, items, ctx, node) {
  const box = h('div', { class: 'form' });
  for (const it of items) {
    if (!it) continue;
    const el = item(bind, it, ctx, node);
    if (el) box.append(el);
  }
  return box;
}

function item(bind, it, ctx, node) {
  switch (it.t) {
    case 'sec': return h('p', { class: 'sec' }, it.label);
    case 'hint': return h('p', { class: 'hint' }, it.label);
    case 'text': return h('label', { class: 'row' }, h('span', { class: 'l' }, it.label), textInput(bind, it, ctx, false));
    case 'memo': return h('div', { class: 'fi' }, it.label ? h('p', { class: 'sec' }, it.label) : null, textInput(bind, it, ctx, true));
    case 'num': return numItem(bind, it, ctx);
    case 'one': case 'multi': case 'seg': return choiceItem(bind, it, ctx);
    case 'flag': return flagItem(bind, it, ctx);
    case 'pick': return pickItem(bind, it, ctx);
    case 'photo': return photoSlot({
      projectId: bind.projectId, ownerPath: bind.path, slot: bind.slot(it.slot),
      label: it.label, multi: it.multi !== false, hint: it.hint, warnEmpty: !!it.warnEmpty,
      onChange: it.rerender ? () => ctx.refresh() : null,
    });
    case 'rows': return rowsItem(bind, it, ctx, node);
    case 'fold': return foldItem(bind, it, ctx, node);
    case 'custom': return it.render(node, ctx);
    default: return null;
  }
}

/* 글자 입력: 치는 동안 0.6초 뒤 저장, 칸을 벗어나면 바로 저장 */
function textInput(bind, it, ctx, area) {
  const inp = area
    ? h('textarea', { class: 'memo', rows: 2, placeholder: it.ph || '', 'aria-label': it.label || it.ph || '메모' })
    : h('input', { class: 'inp', type: it.inputType || 'text', placeholder: it.ph || '', inputmode: it.inputmode, autocomplete: 'off' });
  const cur = bind.get(it.k);
  inp.value = cur == null ? '' : String(cur);
  let timer = null;
  let changed = false;
  const flush = async () => {
    clearTimeout(timer); timer = null;
    pending.delete(flush);
    const v = inp.value.trim();
    const before = bind.get(it.k);
    if ((before == null ? '' : String(before)) === v) return;
    await bind.set(it.k, v === '' ? null : v);
    changed = true;
  };
  inp.addEventListener('input', () => {
    clearTimeout(timer);
    pending.add(flush);
    timer = setTimeout(() => flush().catch((e) => console.error(e)), 600);
  });
  inp.addEventListener('change', async () => {
    await flush();
    if (changed && it.rerender) { changed = false; ctx.refresh(); }
  });
  return inp;
}

/* 숫자 + 빠른 값 버튼 + 없음/확인 못 함 */
function numItem(bind, it, ctx) {
  const wrap = h('div', { class: 'row' });
  const specials = [];
  if (it.none) specials.push(NONE);
  if (it.unknown !== false) specials.push(UNKNOWN);
  const draw = () => {
    const cur = bind.get(it.k);
    const inp = h('input', { class: 'inp num', type: 'number', inputmode: 'decimal', step: 'any', min: '0', 'aria-label': it.label });
    inp.value = typeof cur === 'number' ? String(cur) : '';
    const put = async (v) => {
      await bind.set(it.k, v);
      if (it.rerender) ctx.refresh(); else draw();
    };
    const flush = async () => {
      pending.delete(flush);
      const raw = inp.value.trim();
      const before = bind.get(it.k);
      if (raw === '') { if (typeof before === 'number') await put(null); return; }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n === before) return;
      await put(n);
    };
    inp.addEventListener('input', () => pending.add(flush));
    inp.addEventListener('change', () => flush().catch((e) => console.error(e)));
    const chip = (v, text) => h('button', {
      type: 'button', class: 'chip sm' + (cur === v ? ' on' : ''), 'aria-pressed': String(cur === v),
      onclick: () => { pending.delete(flush); put(cur === v ? null : v); },
    }, text);
    const chips = (it.quick || []).map((q) => chip(q, q + (it.unit || ''))).concat(specials.map((s) => chip(s, s)));
    fill(wrap, 
      h('span', { class: 'l' }, it.label),
      inp,
      it.unit ? h('span', { class: 'unit' }, it.unit) : null,
      chips.length ? h('div', { class: 'chips' }, chips) : null);
  };
  draw();
  return wrap;
}

/* 버튼을 눌러 고르기(하나/여러 개/두 칸) */
function choiceItem(bind, it, ctx) {
  const multi = it.t === 'multi';
  const wrap = h('div', { class: it.t === 'seg' ? 'row' : 'fi' });
  const draw = () => {
    const cur = bind.get(it.k);
    const sel = multi ? (Array.isArray(cur) ? cur : []) : (cur == null ? [] : [cur]);
    const opts = typeof it.opts === 'function' ? it.opts() : it.opts;
    const specials = [];
    if (it.none !== false && !opts.includes(NONE)) specials.push(NONE);
    if (it.unknown !== false && !opts.includes(UNKNOWN)) specials.push(UNKNOWN);
    const alone = new Set([NONE, UNKNOWN, ...(it.exclusive || [])]);   // 이 값을 고르면 다른 값은 풀린다
    const customs = sel.filter((v) => !opts.includes(v) && !specials.includes(v));
    const pick = async (v) => {
      let next;
      if (multi) {
        if (sel.includes(v)) next = sel.filter((x) => x !== v);
        else if (alone.has(v)) next = [v];
        else next = sel.filter((x) => !alone.has(x)).concat(v);
        if (!next.length) next = null;
      } else {
        next = sel[0] === v ? null : v;
      }
      await bind.set(it.k, next);
      if (it.rerender) ctx.refresh(); else draw();
    };
    const btn = (v, cls) => h('button', {
      type: 'button', class: (cls ? cls + ' ' : '') + (sel.includes(v) ? 'on' : ''), 'aria-pressed': String(sel.includes(v)),
      onclick: () => pick(v),
    }, String(v));
    const addCustom = it.custom ? h('button', {
      type: 'button', class: 'chip new',
      onclick: async () => {
        const t = await promptText({ title: it.label || '직접 입력', placeholder: '직접 입력' });
        if (t && !sel.includes(t)) pick(t);
      },
    }, '+ 직접 입력') : null;

    if (it.t === 'seg') {
      fill(wrap, 
        h('span', { class: 'l' }, it.label),
        h('div', { class: 'seg' }, opts.map((o) => btn(o))),
        specials.length ? h('div', { class: 'chips' }, specials.map((s) => btn(s, 'chip sm'))) : null);
    } else {
      fill(wrap, 
        it.label ? h('p', { class: 'fl' }, it.label + (multi ? ' (여러 개 선택)' : '')) : null,
        h('div', { class: 'chips' },
          opts.map((o) => btn(o, 'chip')), customs.map((o) => btn(o, 'chip')), specials.map((s) => btn(s, 'chip')), addCustom));
    }
  };
  draw();
  return wrap;
}

function flagItem(bind, it, ctx) {
  const wrap = h('div', { class: 'fi' });
  const draw = () => {
    const on = bind.get(it.k) === true;
    fill(wrap, h('button', {
      type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on),
      onclick: async () => { await bind.set(it.k, on ? null : true); if (it.rerender) ctx.refresh(); else draw(); },
    }, it.label));
  };
  draw();
  return wrap;
}

/* 긴 목록에서 고르기: 누르면 창이 열린다 */
function pickItem(bind, it, ctx) {
  const wrap = h('div', { class: 'row' });
  const open = async () => {
    const cur = bind.get(it.k);
    const list = await it.choices();
    const items = list.map((c) => ({
      label: c.label, sub: c.sub, value: { ref: c.ref, label: c.label },
      on: !!cur && typeof cur === 'object' && cur.ref === c.ref,
    }));
    if (it.custom !== false) items.push({ label: '+ 직접 입력', sub: it.customSub, value: '\u0000custom' });
    if (it.none !== false) items.push({ label: NONE, value: NONE, on: cur === NONE });
    if (it.unknown !== false) items.push({ label: UNKNOWN, value: UNKNOWN, on: cur === UNKNOWN });
    if (cur != null) items.push({ label: '고른 것 지우기', value: '\u0000clear' });
    let v = await sheet({ title: it.label, items });
    if (v === undefined) return;
    if (v === '\u0000custom') {
      const t = await promptText({ title: it.label, placeholder: '직접 입력' });
      if (!t) return;
      v = { ref: null, label: t };
    }
    if (v === '\u0000clear') v = null;
    await bind.set(it.k, v);
    if (it.rerender) ctx.refresh(); else draw();
  };
  const draw = () => {
    const cur = bind.get(it.k);
    fill(wrap, 
      h('span', { class: 'l' }, it.label),
      h('button', { type: 'button', class: 'sel', onclick: open }, (cur == null ? '고르기' : pickLabel(cur)) + ' ▾'));
  };
  draw();
  return wrap;
}

/* 여러 줄(반복) 항목: 줄마다 카드 하나 */
function rowsItem(bind, it, ctx, node) {
  const wrap = h('div', { class: 'fi' });
  const rows = () => (Array.isArray(bind.get(it.k)) ? bind.get(it.k) : []);
  const draw = () => {
    const list = rows();
    fill(wrap, 
      it.label ? h('p', { class: 'sec' }, it.label) : null,
      list.map((r, i) => h('div', { class: 'rowcard' },
        h('div', { class: 'rc-h' },
          h('span', null, (it.rowTitle || '줄') + ' ' + (i + 1)),
          h('button', {
            type: 'button', class: 'lnk',
            onclick: async () => {
              const ok = await confirmDialog({ title: '이 줄을 지울까요?', body: '이 줄에 넣은 값과 사진이 지워집니다. 복구할 수 없습니다.', ok: '지우기', danger: true });
              if (!ok) return;
              const rb = rowBind(bind, it.k, r.id);
              for (const c of it.cols) if (c.t === 'photo') await deletePhotosOfSlot(bind.path, rb.slot(c.slot));
              await bind.set(it.k, rows().filter((x) => x.id !== r.id));
              draw();
            },
          }, '줄 지우기')),
        build(rowBind(bind, it.k, r.id), it.cols, ctx, node))),
      h('button', {
        type: 'button', class: 'add',
        onclick: async () => {
          await bind.set(it.k, rows().concat({ id: uid(6), _m: stamp() }));
          draw();
        },
      }, it.addLabel || '+ 줄 추가'));
  };
  draw();
  return wrap;
}

function foldItem(bind, it, ctx, node) {
  const key = bind.key + '|' + it.label;
  const open = foldOpen.has(key) ? foldOpen.get(key) : !!it.open;
  const d = h('details', { class: 'fold', open },
    h('summary', null, it.label),
    build(bind, it.items, ctx, node));
  d.addEventListener('toggle', () => foldOpen.set(key, d.open));
  return d;
}
