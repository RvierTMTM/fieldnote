/* slide-preview.js — 장표 미리보기용: PPT 장표를 HTML 로 다시 그린다 (DOM·저장소를 건드리지 않아 node 에서도 돈다)
   공개:
     buildPreviewDeck(model, { team, surveyor }) → Promise<{ slides:[{ name, items }], master, width, height }>
        model = export.exportModel(projectId) 결과. 실제 내보내기와 같은 js/pptx-build.js buildPptx 를
        "기록만 하는 가짜 PptxGenJS" 로 돌려서 장표 순서·칸·글자를 그대로 받는다(따로 맞출 것이 없다).
        사진은 그리지 않고 자리만 받는다: 그림 data = 'fnphoto:<사진 id>' (화면에서 photo.thumb 로 채운다).
     slideHtml(slide, { index, deck, ciUrl }) → string     장표 한 장(900px 폭 기준) HTML. deck = buildPreviewDeck 결과(하단 줄·크기).
        <img data-pid="사진 id"> 의 src 는 비워 둔다(화면 쪽에서 보이는 장표만 채운다).
     SLIDE_W                                                 장표 HTML 폭(px)
   미리보기에만 넣는 표시: 빈 값(표 칸·글 속 '미입력', 사진 없음 칸)에 노란 칸 + 빨간 원 안 흰 '!'.
   실제 PPT(js/pptx-build.js)에는 넣지 않는다. */
import { buildPptx, TEAM_NAME } from './pptx-build.js';
import { buildOutline, assignNames } from './zipname.js';

export const SLIDE_W = 900;
const MISSING = '미입력';
const CI_MARK = 'fnci:';
const PHOTO_MARK = 'fnphoto:';
let PX_PER_IN = SLIDE_W / 11.69;    // 장표 1인치 → px (buildPreviewDeck 가 PPT 크기로 다시 맞춘다)

/* ── 기록만 하는 가짜 PptxGenJS ───────────────────────── */
const ignore = () => undefined;
function tolerant(target) {
  // pptx-build 가 나중에 다른 기능(addNotes 등)을 써도 멈추지 않게, 모르는 함수는 아무 일도 안 한다.
  return new Proxy(target, {
    get(t, k) {
      if (k in t || typeof k === 'symbol' || k === 'then' || k === 'toJSON') return t[k];
      return ignore;
    },
  });
}

class RecSlide {
  constructor() { this.items = []; }
  addText(text, o) { this.items.push({ k: 'text', text, o: o || {} }); return this; }
  addShape(type, o) { this.items.push({ k: 'shape', type: String(type || 'rect'), o: o || {} }); return this; }
  addImage(o) { this.items.push({ k: 'img', o: o || {} }); return this; }
  addTable(rows, o) { this.items.push({ k: 'table', rows: rows || [], o: o || {} }); return this; }
}

class RecPptx {
  constructor() {
    this.slides = [];
    this.master = null;
    this.size = { width: 11.69, height: 8.27 };
    return tolerant(this);
  }
  defineLayout(l) { if (l && l.width && l.height) this.size = { width: l.width, height: l.height }; }
  defineSlideMaster(m) { this.master = m || null; }
  addSlide() { const s = tolerant(new RecSlide()); this.slides.push(s); return s; }
  async write() { return this; }
}

/** 사진 가로·세로 비율(그림 칸 크기 계산용). 화면에서는 object-fit:contain 이라 조금 틀려도 찌그러지지 않는다. */
function photoSize(p) {
  const pts = p.corrected && Array.isArray(p.corrected.points) ? p.corrected.points : null;
  if (p.hasCorrected && pts && pts.length === 4) {
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const w = d(pts[0], pts[1]) + d(pts[3], pts[2]);
    const h = d(pts[0], pts[3]) + d(pts[1], pts[2]);
    if (w > 0 && h > 0) return { w, h };
  }
  const e = p.exif || {};
  if (e.saved && e.saved.width > 0 && e.saved.height > 0) return { w: e.saved.width, h: e.saved.height };
  if (e.width > 0 && e.height > 0) return { w: e.width, h: e.height };
  return { w: 4, h: 3 };
}

function slideName(slide, i) {
  // 제목 줄: 장표 위쪽(60px 안)의 첫 굵은 글
  for (const it of slide.items) {
    if (it.k !== 'text' || !it.o.bold) continue;
    if (it.o.y * PX_PER_IN > 60) continue;
    const t = plainText(it.text).trim();
    if (t) return t;
  }
  return i === 0 ? '표지' : '장표 ' + (i + 1);
}

export async function buildPreviewDeck(model, { team = TEAM_NAME, surveyor } = {}) {
  const outline = buildOutline(model);
  const names = assignNames(outline);
  const rec = await buildPptx({
    PptxGenJS: RecPptx,
    outline,
    names,
    image: async (p) => ({ data: PHOTO_MARK + p.id, ...photoSize(p) }),
    ci: { data: CI_MARK, w: 441, h: 96 },
    team,
    exportedAt: model.exportedAt || Date.now(),
    surveyor: surveyor != null ? surveyor : model.surveyor || '',
  });
  PX_PER_IN = SLIDE_W / rec.size.width;
  const slides = rec.slides.map((s, i) => ({ items: s.items, name: slideName(s, i) }));
  return { slides, master: rec.master, width: SLIDE_W, height: Math.round(rec.size.height * PX_PER_IN) };
}

/* ── HTML 로 그리기 ───────────────────────────────────── */
const PT = () => PX_PER_IN / 72;          // 1pt → px
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const px = (inch) => Math.round((Number(inch) || 0) * PX_PER_IN * 10) / 10;
const hex = (c, alt) => (/^[0-9a-f]{6}$/i.test(String(c || '')) ? '#' + c : alt);
function fillCss(f) {
  if (!f || f.type === 'none' || !f.color) return '';
  const c = hex(f.color, null);
  if (!c) return '';
  if (f.transparency) {
    const a = Math.max(0, Math.min(1, 1 - f.transparency / 100));
    const n = parseInt(c.slice(1), 16);
    return 'background:rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ');';
  }
  return 'background:' + c + ';';
}
function lineCss(l, side = 'border') {
  if (!l || l.type === 'none' || !l.color) return '';
  const w = Math.max(1, Math.round((l.width || 0.75) * PT() * 10) / 10);
  return side + ':' + w + 'px solid ' + hex(l.color, '#ccc') + ';';
}
function box(o) {
  return 'left:' + px(o.x) + 'px;top:' + px(o.y) + 'px;width:' + px(o.w) + 'px;height:' + px(o.h) + 'px;';
}
function plainText(t) {
  if (Array.isArray(t)) return t.map((r) => (r && r.text != null ? String(r.text) : '') + (r && r.options && r.options.breakLine ? '\n' : '')).join('');
  return t == null ? '' : String(t);
}

/* 빈 값 표시(미리보기 전용) */
const XM = '<span class="pv-x" aria-hidden="true">!</span>';
function markMissing(html) {
  return html.split(esc(MISSING)).join('<span class="pv-mi">' + XM + MISSING + '</span>');
}
function runsHtml(t, mark) {
  const one = (s) => (mark ? markMissing(esc(s)) : esc(s));
  if (!Array.isArray(t)) return one(t);
  return t.map((r) => {
    if (!r) return '';
    const o = r.options || {};
    let st = '';
    if (o.color) st += 'color:' + hex(o.color, 'inherit') + ';';
    if (o.bold) st += 'font-weight:700;';
    const s = st ? '<span style="' + st + '">' + one(r.text) + '</span>' : one(r.text);
    return s + (o.breakLine ? '<br>' : '');
  }).join('');
}

const VALIGN = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
const ALIGN = (a) => (a === 'center' || a === 'right' ? a : 'left');
function textHtml(it, missPhoto) {
  const o = it.o;
  const fs = Math.round((o.fontSize || 12) * PT() * 10) / 10;
  let st = box(o) + 'justify-content:' + (VALIGN[o.valign] || 'flex-start') + ';text-align:' + ALIGN(o.align) + ';'
    + 'font-size:' + fs + 'px;color:' + hex(o.color, '#222') + ';';
  if (o.bold) st += 'font-weight:700;';
  if (o.lineSpacing) st += 'line-height:' + Math.round(o.lineSpacing * PT() * 10) / 10 + 'px;';
  const m = typeof o.margin === 'number' ? Math.round(o.margin * PT() * 10) / 10 : 0;
  if (m) st += 'padding:0 ' + m + 'px;';
  st += fillCss(o.fill);
  if (o.shape === 'roundRect') st += 'border-radius:' + px(o.rectRadius || 0.1) + 'px;' + lineCss(o.line) + 'white-space:nowrap;';
  if (missPhoto) {
    return '<div class="pv-t pv-mp" style="' + box(o) + '">' + XM + '<b>' + MISSING + '</b><em>' + esc(plainText(it.text)) + '</em></div>';
  }
  return '<div class="pv-t" style="' + st + '"><div>' + runsHtml(it.text, true) + '</div></div>';
}

function shapeHtml(it, missPhoto) {
  const o = it.o;
  if (it.type === 'line') {
    return '<div class="pv-s" style="left:' + px(o.x) + 'px;top:' + px(o.y) + 'px;width:' + Math.max(px(o.w), 1) + 'px;height:0;'
      + lineCss(o.line, 'border-top') + '"></div>';
  }
  if (missPhoto) return '<div class="pv-s pv-mbox" style="' + box(o) + '"></div>';
  let st = box(o) + fillCss(o.fill) + lineCss(o.line);
  if (it.type === 'roundRect') st += 'border-radius:' + px(o.rectRadius || 0.1) + 'px;';
  if (it.type === 'ellipse' || it.type === 'oval') st += 'border-radius:50%;';
  return '<div class="pv-s" style="' + st + '"></div>';
}

function imgHtml(it, ciUrl) {
  const o = it.o;
  const d = String(o.data || '');
  if (d.startsWith(PHOTO_MARK)) return '<img class="pv-i" alt="" data-pid="' + esc(d.slice(PHOTO_MARK.length)) + '" style="' + box(o) + '">';
  if (d === CI_MARK) return ciUrl ? '<img class="pv-i" alt="CI" src="' + esc(ciUrl) + '" style="' + box(o) + '">' : '';
  return '';
}

function tableHtml(it) {
  const o = it.o;
  const fs = Math.round((o.fontSize || 10) * PT() * 10) / 10;
  const colW = Array.isArray(o.colW) ? o.colW : [];
  const rowH = Array.isArray(o.rowH) ? o.rowH : null;
  const width = colW.length ? colW.reduce((s, w) => s + px(w), 0) : px(o.w);
  let h = '<table class="pv-tb" style="left:' + px(o.x) + 'px;top:' + px(o.y) + 'px;width:' + width + 'px;font-size:' + fs + 'px;">';
  if (colW.length) h += '<colgroup>' + colW.map((w) => '<col style="width:' + px(w) + 'px">').join('') + '</colgroup>';
  it.rows.forEach((row, ri) => {
    const rh = rowH ? rowH[ri] || rowH[rowH.length - 1] : o.rowH;
    h += '<tr style="height:' + px(rh || 0.25) + 'px">';
    for (const c of row || []) {
      const cell = c && typeof c === 'object' ? c : { text: c };
      const co = cell.options || {};
      const t = cell.text == null ? '' : String(cell.text);
      const miss = t === MISSING;
      let st = 'text-align:' + (co.align ? ALIGN(co.align) : 'center') + ';color:' + hex(co.color, '#333') + ';' + fillCss(co.fill);
      if (co.bold) st += 'font-weight:700;';
      if (co.border && co.border.color) st += 'border:' + Math.max(1, Math.round((co.border.pt || 0.75) * PT() * 10) / 10) + 'px solid ' + hex(co.border.color, '#d9d9d9') + ';';
      h += '<td' + (miss ? ' class="pv-m"' : '') + ' style="' + st + '">' + (miss ? XM : '') + esc(t) + '</td>';
    }
    h += '</tr>';
  });
  return h + '</table>';
}

/** 사진 없음 칸 찾기: 회색 칸(F2F2F2) 바로 뒤 '…사진 없음' 글. 사유가 붙은 것('(…)')은 빈 값이 아니므로 뺀다. */
function missingPhotoPairs(items) {
  const out = new Set();
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1];
    const b = items[i];
    if (a.k !== 'shape' || b.k !== 'text') continue;
    if (!a.o.fill || String(a.o.fill.color).toUpperCase() !== 'F2F2F2') continue;
    const t = plainText(b.text);
    if (!/사진 없음$/.test(t.trim()) || t.includes('(')) continue;
    out.add(a);
    out.add(b);
  }
  return out;
}

function masterItems(master) {
  if (!master) return [];
  const out = [];
  for (const ob of master.objects || []) {
    if (ob.line) out.push({ k: 'shape', type: 'line', o: ob.line });
    else if (ob.rect) out.push({ k: 'shape', type: 'rect', o: ob.rect });
    else if (ob.text) out.push({ k: 'text', text: ob.text.text, o: ob.text.options || {} });
    else if (ob.image) out.push({ k: 'img', o: ob.image });
  }
  return out;
}

export function slideHtml(slide, { index = 0, deck = null, ciUrl = '' } = {}) {
  const master = deck ? deck.master : null;
  const miss = missingPhotoPairs(slide.items);
  const parts = [];
  for (const it of masterItems(master).concat(slide.items)) {
    if (it.k === 'text') parts.push(textHtml(it, miss.has(it)));
    else if (it.k === 'shape') parts.push(shapeHtml(it, miss.has(it)));
    else if (it.k === 'img') parts.push(imgHtml(it, ciUrl));
    else if (it.k === 'table') parts.push(tableHtml(it));
  }
  if (master && master.slideNumber) {
    const sn = master.slideNumber;
    parts.push(textHtml({ text: String(index + 1), o: { ...sn, valign: sn.valign || 'middle', color: sn.color } }, false));
  }
  const H = deck && deck.height ? deck.height : Math.round(SLIDE_W * 8.27 / 11.69);
  return '<div class="pv-sl" style="width:' + SLIDE_W + 'px;height:' + H + 'px">' + parts.join('') + '</div>';
}
