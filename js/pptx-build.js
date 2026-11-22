/* pptx-build.js — 실사 PPT(A4 가로) 장표 만들기 (PptxGenJS 를 받아서 쓴다. 저장소·화면을 건드리지 않아 node 에서도 돈다)
   공개:
     buildPptx({ PptxGenJS, outline, names, image, ci, team, exportedAt, surveyor, onPhoto, outputType }) → Promise<Blob|Buffer>
       outline  zipname.buildOutline(model)      names  zipname.assignNames(outline)
       image(photo) → Promise<{ data:'image/jpeg;base64,…', w, h } | null>   사진 한 장을 PPT용으로 줄여 준다(한 장씩 부른다)
       ci       { data, w, h } | null            하단 오른쪽 CI
       onPhoto(done, total)                      진행률
     TEAM_NAME                                    하단 왼쪽 팀명
   장표 순서: 표지 → 현장마다 [장소마다 (전경 → 공사 조건 → 설치 지점마다(랙 장표 또는 설치 지점 장표 → 장비 목록(계속)
             → FDF 행선지 → 장비 근접·라벨) → 자유 추가)] → 그 현장의 케이블 경로마다 1장 → (어디에도 안 붙은 사진)
   케이블 경로 장표: 표에 출발·도착·케이블(종류·코어/가닥 수)·거리·지나는 방식·층간(수직경로)·타공·방화구획·문제,
             완료 표시가 없으면 제목 아래 작은 글에 "완료 표시 전".
   양식은 설계 폴더의 PPT 장표 견본(900×636 기준)을 인치로 옮겼다. 빈 항목 규칙은 docs/ARCH.md 7절. */
import { val, nameOf, pickLabel, cableText } from './store.js';
import { CABINET_FORMS, PLACE_ENV_ITEMS, NONE, UNKNOWN, CHASSIS } from './options.js';
import { devicePos } from './zipname.js';

export const TEAM_NAME = '스마트인프라팀/인프라Biz담당';

const FONT = 'Malgun Gothic';
const LANG = 'ko-KR';
const SW = 11.69;                 // A4 가로(인치)
const SH = 8.27;
const S = SW / 900;               // 견본 1px → 인치
const X = (p) => Math.round(p * S * 10000) / 10000;
const F = (p) => Math.round(p * 0.935 * 2) / 2;   // 견본 글자 px → pt

const C = {
  red: 'ED1C24', dred: 'BD161C', ink: '222222', ink2: '444444', ink3: '333333', gray: '777777', lgray: '999999',
  line: 'DCDCDC', ph: '3A3F46', phLine: 'CFCFCF', yel: 'FFF4C2', yelLine: 'E2C14A', yelInk: '6B5200', yelCell: '8A6A00',
};
// 견본 화면 칸
const L = 34;                      // 왼쪽 여백
const CW = 832;                    // 본문 폭
const TOP = 71;                    // 제목 줄 아래 본문 시작
const BH = 514;                    // 본문 높이(바닥줄 위까지)
const ROW = 22;                    // 표 한 줄 높이
const MISSING = '미입력';

/* ── 글자 폭 어림 ───────────────────────────────────── */
function charEm(ch) {
  const c = ch.codePointAt(0);
  if ((c >= 0x1100 && c <= 0x11FF) || (c >= 0x2E80 && c <= 0xA4CF) || (c >= 0xAC00 && c <= 0xD7A3) || (c >= 0xF900 && c <= 0xFAFF) || (c >= 0xFF00 && c <= 0xFFEF)) return 0.95;
  if (c === 32) return 0.3;
  if (c < 128) return /[A-Z0-9@#%&mwMW]/.test(ch) ? 0.64 : 0.52;
  return 0.9;
}
function textW(s, fpx) {
  let w = 0;
  for (const ch of String(s)) w += charEm(ch);
  return w * fpx;
}
function fit(s, maxPx, fpx) {
  s = String(s == null ? '' : s).replace(/\s*\n\s*/g, ' ');
  if (textW(s, fpx) <= maxPx) return s;
  let out = '';
  let w = textW('…', fpx);
  for (const ch of s) {
    w += charEm(ch) * fpx;
    if (w > maxPx) break;
    out += ch;
  }
  return out.replace(/\s+$/, '') + '…';
}
function lineCount(s, maxPx, fpx) {
  return String(s).split('\n').reduce((n, p) => n + Math.max(1, Math.ceil(textW(p, fpx) / maxPx)), 0);
}

/* ── 값 글자로 ──────────────────────────────────────── */
function txt(v, unit) {
  if (v == null || v === '') return null;
  if (Array.isArray(v)) { const a = v.map((x) => pickLabel(x)).filter(Boolean); return a.length ? a.join(', ') : null; }
  if (typeof v === 'object') return pickLabel(v) || null;
  if (v === true) return '예';
  const s = String(v);
  return unit && typeof v === 'number' ? s + unit : s;
}
const has = (node, key) => txt(val(node, key)) != null;
const plain = (v) => v != null && v !== NONE && v !== UNKNOWN && v !== '';

const NET_KINDS = ['스위치', '방화벽', '라우터', '무선컨트롤러', '무선 AP', 'NAC', '서버'];
const heightOf = (d) => Math.max(1, Math.floor(Number(val(d, 'h')) || 1));

function devKind(d) {
  const kind = val(d, 'kind') || '장비';
  const layer = val(d, 'layer');
  return kind === '스위치' && plain(layer) && layer !== '모름' ? layer + ' 스위치' : kind;
}
function devSpec(d) {
  const kind = val(d, 'kind');
  const short = (p) => (plain(p) ? String(p).replace(/포트$/, 'P') : '');
  if (kind === '스위치') {
    const ports = val(d, 'ports');
    if (ports === CHASSIS) return '샤시형' + (typeof val(d, 'slots') === 'number' ? ' ' + val(d, 'slots') + '슬롯' : '');
    return short(ports);
  }
  if (kind === 'FDF') return typeof val(d, 'cores') === 'number' ? val(d, 'cores') + 'C' : '';
  if (kind === '패치판넬') return short(val(d, 'ports'));
  if (kind === '통신사장비') return [val(d, 'carrier'), val(d, 'carrierKind')].filter(plain).join(' ');
  if (kind === '서버' || kind === 'UPS') return heightOf(d) + 'U';
  return '';
}
const devShort = (d) => [devKind(d), devSpec(d)].filter(Boolean).join(' ');

/** 표 칸: 비었으면 need 에 따라 노란 '미입력' 또는 '—'. '확인 못 함'도 노랗게. */
function cell(v, need, unit) {
  const t = txt(v, unit);
  if (t == null) return need ? { t: MISSING, warn: true } : { t: '—' };
  if (v === UNKNOWN) return { t, warn: true };
  return { t };
}

/* ── 그리는 도구 ────────────────────────────────────── */
class Deck {
  constructor(pptx, { image, onPhoto, total }) {
    this.pptx = pptx;
    this.image = image;
    this.onPhoto = onPhoto || (() => {});
    this.total = total;
    this.done = 0;
  }

  slide() { return this.pptx.addSlide({ masterName: 'FN' }); }

  text(sl, t, x, y, w, h, o = {}) {
    sl.addText(t, { x: X(x), y: X(y), w: X(w), h: X(h), fontFace: FONT, lang: LANG, margin: 0, color: C.ink, valign: 'top', ...o });
  }

  rect(sl, x, y, w, h, fill, line, lineW = 0.75) {
    sl.addShape('rect', {
      x: X(x), y: X(y), w: X(w), h: X(h),
      fill: fill ? { color: fill } : { type: 'none' },
      line: line ? { color: line, width: lineW } : { type: 'none' },
    });
  }

  title(sl, main, small) {
    const sw = small ? Math.min(CW * 0.45, textW(small, 12.5) + 8) : 0;
    this.text(sl, fit(main, CW - sw - 12, 21), L, 24, CW - sw - 8, 30, { fontSize: F(21), bold: true, valign: 'bottom' });
    if (small) this.text(sl, fit(small, sw, 12.5), L + CW - sw, 24, sw, 30, { fontSize: F(12.5), color: C.gray, align: 'right', valign: 'bottom' });
    sl.addShape('line', { x: X(L), y: X(57), w: X(CW), h: 0, line: { color: C.red, width: 1.5 } });
  }

  async loadImg(p) {
    let img = null;
    try { img = await this.image(p); } catch (e) { img = null; }
    this.done++;
    this.onPhoto(this.done, this.total);
    return img;
  }

  /** 사진 한 칸(어두운 바탕 + 비율 유지 + 아래 이름 띠). p 가 없으면 '사진 없음' 칸. */
  async photo(sl, p, x, y, w, h, caption, emptyText = '사진 없음') {
    if (!p) {
      this.rect(sl, x, y, w, h, 'F2F2F2', C.line);
      this.text(sl, emptyText, x + 6, y, w - 12, h - (caption ? 18 : 0), { fontSize: F(12), color: C.lgray, align: 'center', valign: 'middle' });
    } else {
      this.rect(sl, x, y, w, h, C.ph, C.phLine);
      const img = await this.loadImg(p);
      if (img && img.w > 0 && img.h > 0) {
        const r = Math.min((w - 2) / img.w, (h - 2) / img.h);
        const iw = img.w * r;
        const ih = img.h * r;
        sl.addImage({ data: img.data, x: X(x + (w - iw) / 2), y: X(y + (h - ih) / 2), w: X(iw), h: X(ih) });
      } else {
        this.text(sl, '사진을 읽지 못했습니다', x + 6, y, w - 12, h - 18, { fontSize: F(11), color: 'DDDDDD', align: 'center', valign: 'middle' });
      }
    }
    if (caption) {
      sl.addText(fit(caption, w - 14, 11), {
        x: X(x), y: X(y + h - 18), w: X(w), h: X(18), fontFace: FONT, lang: LANG, fontSize: F(11),
        color: p ? 'FFFFFF' : C.ink2, fill: p ? { color: '000000', transparency: 38 } : { color: 'E6E6E6' },
        margin: 4, valign: 'middle',
      });
    }
  }

  /** 견본 .pg: 큰 사진 1 + 작은 사진 2. 3장까지 그리고 그린 수를 돌려준다. */
  async lead(sl, items, x, y, w, h) {
    const n = Math.min(items.length, 3);
    const g = 8;
    if (!n) { await this.photo(sl, null, x, y, w, h, null); return 0; }
    if (n === 1) { await this.photo(sl, items[0].p, x, y, w, h, items[0].cap); return 1; }
    if (n === 2) {
      const hh = (h - g) / 2;
      await this.photo(sl, items[0].p, x, y, w, hh, items[0].cap);
      await this.photo(sl, items[1].p, x, y + hh + g, w, hh, items[1].cap);
      return 2;
    }
    const bigH = Math.round(h * 0.56);
    const sw = (w - g) / 2;
    const shh = h - bigH - g;
    await this.photo(sl, items[0].p, x, y, w, bigH, items[0].cap);
    await this.photo(sl, items[1].p, x, y + bigH + g, sw, shh, items[1].cap);
    await this.photo(sl, items[2].p, x + sw + g, y + bigH + g, sw, shh, items[2].cap);
    return 3;
  }

  async grid(sl, items, x, y, w, h, cols, rows) {
    const g = 8;
    const cw = (w - g * (cols - 1)) / cols;
    const ch = (h - g * (rows - 1)) / rows;
    for (let i = 0; i < items.length && i < cols * rows; i++) {
      const it = items[i];
      await this.photo(sl, it.p, x + (i % cols) * (cw + g), y + Math.floor(i / cols) * (ch + g), cw, ch, it.cap, it.empty);
    }
  }

  /** 사진이 남으면 3×2 칸 '계속' 장표로 넘긴다 */
  async rest(items, title, small) {
    for (let i = 0; i < items.length; i += 6) {
      const sl = this.slide();
      this.title(sl, title + ' (계속)', small);
      await this.grid(sl, items.slice(i, i + 6), L, TOP, CW, BH, 3, 2);
    }
  }

  /** 견본 .bx 상자. lines: 글자 줄(앞에 · 를 붙인다) 또는 chips. 그린 높이를 돌려준다. */
  box(sl, x, y, w, head, body, maxH) {
    const inner = w - 24;
    let h = 28;
    if (body.chips) {
      const rows = this.chipRows(body.chips, inner);
      h += Math.max(1, rows.length) * 22 + 4;
      if (maxH && h > maxH) h = maxH;
      this.rect(sl, x, y, w, h, null, C.line);
      this.text(sl, head, x + 12, y + 8, inner, 16, { fontSize: F(13), bold: true, color: C.dred });
      if (!rows.length) this.text(sl, body.empty || '입력 없음', x + 12, y + 28, inner, 20, { fontSize: F(12.5), color: C.lgray });
      rows.forEach((row, ri) => {
        if (y + 28 + ri * 22 + 18 > y + h) return;
        let cx = x + 12;
        for (const c of row) {
          sl.addText(c.t, {
            shape: 'roundRect', rectRadius: X(9), x: X(cx), y: X(y + 28 + ri * 22), w: X(c.w), h: X(18),
            fontFace: FONT, lang: LANG, fontSize: F(11.5), color: c.warn ? C.yelInk : C.ink2, align: 'center', valign: 'middle', margin: 0,
            fill: { color: c.warn ? C.yel : 'FFFFFF' }, line: { color: c.warn ? C.yelLine : 'C9C9C9', width: 0.75 },
          });
          cx += c.w + 4;
        }
      });
      return h;
    }
    const lines = body.lines && body.lines.length ? body.lines : null;
    const fpx = 12.5;
    const lh = 20;
    let n = lines ? lines.reduce((s, l) => s + lineCount(l, inner - 10, fpx), 0) : 1;
    if (maxH) n = Math.max(1, Math.min(n, Math.floor((maxH - 36) / lh)));
    h = 28 + n * lh + 8;
    this.rect(sl, x, y, w, h, null, C.line);
    this.text(sl, head, x + 12, y + 8, inner, 16, { fontSize: F(13), bold: true, color: C.dred });
    if (!lines) {
      this.text(sl, body.empty || '입력 없음', x + 12, y + 28, inner, lh, { fontSize: F(fpx), color: C.lgray });
      return h;
    }
    const bullet = body.bullet !== false;
    const runs = [];
    let used = 0;
    for (const l of lines) {
      const k = lineCount(l, inner - 10, fpx);
      if (used + k > n) {
        const room = Math.max(0, n - used);
        if (room > 0) {
          if (bullet) runs.push({ text: '· ', options: { color: C.lgray } });
          runs.push({ text: fit(l, room * (inner - 14), fpx), options: { breakLine: true } });
        }
        break;
      }
      if (bullet) runs.push({ text: '· ', options: { color: C.lgray } });
      runs.push({ text: l, options: { breakLine: true } });
      used += k;
    }
    this.text(sl, runs, x + 12, y + 28, inner, n * lh, { fontSize: F(fpx), color: C.ink3, lineSpacing: F(lh) });
    return h;
  }

  chipRows(chips, width) {
    const rows = [];
    let row = [];
    let w = 0;
    for (const c of chips) {
      const cw = Math.min(width, textW(c.t, 11.5) + 18);
      const t = cw < textW(c.t, 11.5) + 18 ? fit(c.t, width - 18, 11.5) : c.t;
      if (row.length && w + cw > width) { rows.push(row); row = []; w = 0; }
      row.push({ ...c, t, w: cw });
      w += cw + 4;
    }
    if (row.length) rows.push(row);
    return rows;
  }

  /** 표. cols: [{ h, w }], rows: [[{ t, warn }]]. 한 줄로 그리게 칸 글자를 자른다. */
  table(sl, x, y, cols, rows, o = {}) {
    const fpx = o.fpx || 10.5;
    const head = cols.map((c) => ({
      text: c.h,
      options: { bold: true, fill: { color: 'F1F1F1' }, color: C.ink2, align: 'center', border: { type: 'solid', pt: 0.75, color: 'D0D0D0' } },
    }));
    const body = rows.map((r) => r.map((c, i) => ({
      text: o.wrap && o.wrap.includes(i) ? String(c.t) : fit(c.t, cols[i].w - 8, fpx),
      options: {
        align: cols[i].align || 'center',
        border: { type: 'solid', pt: 0.75, color: 'D9D9D9' },
        ...(c.warn ? { fill: { color: C.yel }, color: C.yelCell } : { color: C.ink3 }),
        ...(c.bold ? { bold: true } : {}),
      },
    })));
    sl.addTable(o.noHead ? body : [head, ...body], {
      x: X(x), y: X(y), w: X(cols.reduce((s, c) => s + c.w, 0)), colW: cols.map((c) => X(c.w)),
      rowH: X(o.rowH || ROW), fontFace: FONT, lang: LANG, fontSize: F(fpx), valign: 'middle',
      margin: [0.02, 0.04, 0.02, 0.04], autoPage: false,
    });
  }

  /** 견본 .mm: 왼쪽 빨간 줄 + 작은 글. 그린 높이 */
  note(sl, x, y, w, lines, maxH) {
    if (!lines.length) return 0;
    const fpx = 12;
    const lh = 19;
    let n = lines.reduce((s, l) => s + lineCount(l, w - 14, fpx), 0);
    if (maxH) n = Math.min(n, Math.floor(maxH / lh));
    if (n < 1) return 0;
    const runs = [];
    let used = 0;
    for (const l of lines) {
      const k = lineCount(l, w - 14, fpx);
      if (used + k > n) { if (n - used > 0) runs.push({ text: fit(l, (n - used) * (w - 18), fpx), options: { breakLine: true } }); break; }
      runs.push({ text: l, options: { breakLine: true } });
      used += k;
    }
    sl.addShape('rect', { x: X(x), y: X(y), w: X(3), h: X(n * lh), fill: { color: C.red }, line: { type: 'none' } });
    this.text(sl, runs, x + 12, y, w - 12, n * lh, { fontSize: F(fpx), color: C.ink3, lineSpacing: F(lh) });
    return n * lh;
  }
}

/* ── 장비 표 ─────────────────────────────────────────── */
function uText(d, inRack) {
  if (!inRack) return '';
  const pos = devicePos(d, true);
  if (!pos.endsWith('U')) return pos || '—';
  const u = val(d, 'u');
  const h = heightOf(d);
  return h > 1 ? (u + h - 1) + '~' + u : String(u);
}

function deviceRow(d, inRack) {
  const kind = val(d, 'kind');
  const net = NET_KINDS.includes(kind);
  const model = val(d, 'model');
  const spec = devSpec(d);
  const specCell = plain(model) ? { t: String(model) } : spec ? { t: spec } : model === UNKNOWN ? { t: UNKNOWN, warn: true } : net ? { t: MISSING, warn: true } : { t: '—' };
  return {
    d, kind, spec, model,
    cells: [
      ...(inRack ? [{ t: uText(d, true) }] : []),
      { t: devKind(d) },
      specCell,
      cell(val(d, 'hostname'), net),
      cell(val(d, 'mgmtIp'), net),
      cell(val(d, 'vlan'), kind === '스위치'),
      cell(val(d, 'zone'), net),
      cell(val(d, 'state'), false),
    ],
  };
}

/** 같은 규격의 FDF·패치판넬이 위아래로 붙어 있으면 한 줄로(견본 '42~41 · 24C × 2') */
function mergePassive(rows, inRack) {
  if (!inRack) return rows;
  const out = [];
  for (const r of rows) {
    const prev = out[out.length - 1];
    const passive = (x) => ['FDF', '패치판넬'].includes(x.kind) && !plain(x.model) && !has(x.d, 'hostname') && !has(x.d, 'memo') && x.spec;
    const pos = (x) => (val(x.d, 'pos') || 'U 위치') === 'U 위치' && typeof val(x.d, 'u') === 'number';
    if (prev && passive(prev) && passive(r) && pos(prev) && pos(r) && prev.kind === r.kind && prev.spec === r.spec
      && txt(val(prev.d, 'zone')) === txt(val(r.d, 'zone')) && txt(val(prev.d, 'state')) === txt(val(r.d, 'state'))
      && prev.bottom === val(r.d, 'u') + heightOf(r.d)) {
      prev.n++;
      prev.bottom = val(r.d, 'u');
      prev.cells[0] = { t: prev.topU + '~' + prev.bottom };
      prev.cells[2] = { t: prev.spec + ' × ' + prev.n };
      continue;
    }
    if (pos(r)) { r.topU = val(r.d, 'u') + heightOf(r.d) - 1; r.bottom = val(r.d, 'u'); }
    r.n = 1;
    out.push(r);
  }
  return out;
}

const RACK_COLS = [
  { h: 'U', w: 40 }, { h: '종류', w: 66 }, { h: '규격·모델', w: 80 }, { h: 'Hostname', w: 80 },
  { h: '관리 IP', w: 76 }, { h: 'VLAN', w: 44 }, { h: '망', w: 48 }, { h: '상태', w: 50 },
];
function devCols(inRack, width) {
  const cols = inRack ? RACK_COLS : RACK_COLS.slice(1);
  const sum = cols.reduce((s, c) => s + c.w, 0);
  return cols.map((c) => ({ ...c, w: (c.w * width) / sum }));
}

/* ── 가상 랙(실장도) ─────────────────────────────────── */
const KIND_FILL = {
  FDF: 'FDE3E4', 패치판넬: 'E3F3E0', 방화벽: 'FFE7C7', NAC: 'FFE7C7', UPS: 'E7E2F5', 서버: 'E7E2F5',
  스위치: 'DFEAFC', 라우터: 'DFEAFC', 무선컨트롤러: 'DFEAFC', '무선 AP': 'DFEAFC', 허브: 'DFEAFC', '광 컨버터': 'DFEAFC', 'PoE 인젝터': 'DFEAFC',
};

function rackSegments(point, devices) {
  const N = Math.min(60, Math.floor(Number(val(point, 'height')) || 0));
  if (N < 1) return null;
  const occ = Array.from({ length: N + 1 }, () => []);
  const shelf = [];
  const floor = [];
  for (const d of devices) {
    const pos = val(d, 'pos') || 'U 위치';
    if (pos === '선반') { shelf.push(d); continue; }
    if (pos === '랙 바닥') { floor.push(d); continue; }
    const u = val(d, 'u');
    if (typeof u !== 'number' || u < 1 || u > N) continue;
    for (let x = u; x <= Math.min(N, u + heightOf(d) - 1); x++) occ[x].push(d);
  }
  const segs = [];
  const key = (list) => list.map((d) => d.id).join(',');
  let u = N;
  while (u >= 1) {
    const k = key(occ[u]);
    let v = u;
    while (v - 1 >= 1 && key(occ[v - 1]) === k) v--;
    segs.push({ from: u, to: v, devs: occ[u] });
    u = v - 1;
  }
  const free = occ.slice(1).filter((l) => !l.length).length;
  return { N, segs, shelf, floor, free };
}

function drawRack(deck, sl, rk, x, y, w, maxH) {
  const head = 16;
  deck.rect(sl, x, y, w, maxH, 'F6F6F6', '555555', 1.5);
  if (!rk) {
    deck.text(sl, '랙 실장', x, y + 4, w, 14, { fontSize: F(11), color: '555555', align: 'center' });
    deck.text(sl, '랙 높이(U)가 입력되지 않아\n실장도를 그리지 못했습니다.', x + 6, y + 30, w - 12, 60, { fontSize: F(11), color: C.lgray, align: 'center' });
    return;
  }
  deck.text(sl, '랙 실장 (위가 ' + rk.N + 'U)', x, y + 4, w, 14, { fontSize: F(11), color: '555555', align: 'center' });
  const rows = rk.segs.map((s) => {
    const span = s.from - s.to + 1;
    if (!s.devs.length) return { label: span > 1 ? '빈 칸' : '', num: span > 1 ? s.from + '~' + s.to : String(s.from), units: span > 1 ? 1 + Math.min(span - 1, 12) * 0.5 : 1, empty: true, span };
    const d = s.devs[0];
    return {
      label: s.devs.map(devShort).join(' / ') + (s.devs.length > 1 ? ' (겹침)' : ''),
      num: span > 1 ? s.from + '~' + s.to : String(s.from),
      units: Math.min(3, 1 + (span - 1) * 0.5), fill: KIND_FILL[val(d, 'kind')] || 'EEEEEE', span,
    };
  });
  if (rk.shelf.length) rows.push({ label: rk.shelf.map(devShort).join(' / '), num: '선반', units: 1, fill: 'EEEEEE', sp: true });
  if (rk.floor.length) rows.push({ label: rk.floor.map(devShort).join(' / '), num: '바닥', units: 1, fill: 'EEEEEE', sp: true });
  const avail = maxH - head - 6;
  let total = rows.reduce((s, r) => s + r.units, 0);
  let unit = Math.min(17, avail / total);
  if (unit < 9) {                       // 너무 빽빽하면 빈 칸·긴 장비도 한 줄로
    rows.forEach((r) => { r.units = 1; });
    total = rows.length;
    unit = avail / total;
  }
  const fpx = Math.max(5.5, Math.min(10.5, unit * 0.62));
  let cy = y + head + 3;
  const nw = 34;
  for (const r of rows) {
    const rh = r.units * unit;
    deck.rect(sl, x + 3, cy, nw, rh - 1, 'ECECEC', null);
    deck.text(sl, r.num, x + 3, cy, nw, rh - 1, { fontSize: F(fpx), color: C.lgray, align: 'center', valign: 'middle' });
    deck.rect(sl, x + 3 + nw, cy, w - 6 - nw, rh - 1, r.empty ? 'FFFFFF' : r.fill, null);
    if (r.label) {
      deck.text(sl, fit(r.label, w - 6 - nw - 8, fpx), x + 3 + nw + 4, cy, w - 6 - nw - 6, rh - 1,
        { fontSize: F(fpx), color: r.empty ? 'BBBBBB' : C.ink, valign: 'middle', align: r.empty ? 'center' : 'left' });
    }
    cy += rh;
  }
}

/* ── 장표 묶음 ───────────────────────────────────────── */
const fmtDay = (ms) => { const d = new Date(ms); return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate(); };
function fmtPeriod(from, to) {
  const p = (s) => /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  const a = p(from);
  const b = p(to);
  if (a && b) return a[1] + '. ' + Number(a[2]) + '. ' + Number(a[3]) + ' ~ ' + (a[1] === b[1] ? '' : b[1] + '. ') + Number(b[2]) + '. ' + Number(b[3]);
  if (a) return a[1] + '. ' + Number(a[2]) + '. ' + Number(a[3]) + ' ~';
  if (b) return '~ ' + b[1] + '. ' + Number(b[2]) + '. ' + Number(b[3]);
  return null;
}

function allPhotos(outline) {
  let n = outline.orphans.length;
  for (const s of outline.sites) {
    for (const pl of s.places) {
      for (const l of Object.values(pl.slots)) n += l.length;
      for (const pt of pl.points) {
        for (const l of Object.values(pt.slots)) n += l.length;
        for (const dv of pt.devices) {
          for (const l of Object.values(dv.slots)) n += l.length;
          for (const f of dv.fdf) n += f.photos.length;
        }
      }
      for (const e of pl.extras) n += e.photos.length;
    }
    for (const r of s.routes) n += r.photos.length;
  }
  return n;
}

async function cover(deck, outline, { surveyor, exportedAt }) {
  const { project, model } = outline;
  const sl = deck.slide();
  deck.rect(sl, L, 36, 6, 548, C.red, null);
  const nodes = model.nodes;
  const sites = outline.sites.map((s) => nameOf(s.node));
  const siteDates = outline.sites.map((s) => val(s.node, 'date')).filter((d) => typeof d === 'string' && d).sort();
  const people = new Set(surveyor ? [surveyor] : []);
  for (const n of nodes) for (const f of Object.values(n.data || {})) if (f && f.by && f.stage !== 0 && f.by !== '사업 링크' && f.by !== '실사 링크') people.add(f.by);
  const rows = [
    ['현장', sites.length ? (sites.length > 4 ? sites.slice(0, 4).join(' · ') + ' 외 ' + (sites.length - 4) + '곳' : sites.join(' · ')) : '—'],
    ['실사 기간', fmtPeriod(project.from, project.to) || fmtPeriod(siteDates[0], siteDates[siteDates.length - 1]) || '—'],
    ['실사자', people.size ? [...people].join(', ') : '—'],
    ['기록 범위', '장소 ' + nodes.filter((n) => n.type === 'place').length + '곳 · 설치 지점 ' + nodes.filter((n) => n.type === 'point').length
      + '개 · 케이블 경로 ' + nodes.filter((n) => n.type === 'route').length + '개 · 사진 ' + model.photos.length + '장'],
    ['내보낸 날', fmtDay(exportedAt)],
  ];
  const tx = L + 6 + 30;
  const tw = CW - 6 - 30 - 20;
  const tLines = Math.min(3, lineCount(project.name, tw, 38));
  const blockH = 18 + 12 + tLines * 48 + 26 + rows.length * 27;
  let y = 36 + (548 - blockH) / 2;
  deck.text(sl, '현장 실사 기록', tx, y, tw, 18, { fontSize: F(15), bold: true, color: C.dred });
  y += 30;
  deck.text(sl, project.name, tx, y, tw, tLines * 48, { fontSize: F(38), bold: true, fit: 'shrink', valign: 'middle' });
  y += tLines * 48 + 26;
  for (const [k, v] of rows) {
    deck.text(sl, k, tx, y, 90, 27, { fontSize: F(15), color: C.lgray, valign: 'middle' });
    deck.text(sl, fit(v, tw - 108, 15), tx + 108, y, tw - 108, 27, { fontSize: F(15), color: C.ink2, valign: 'middle' });
    y += 27;
  }
}

const cap = (names, p) => ({ p, cap: (names.get(p.id) || {}).caption || '' });

function placeTitle(pl) {
  const where = [val(pl.node, 'bldg'), val(pl.node, 'floor')].filter(plain).join(' ');
  return nameOf(pl.node) + (where ? ' (' + where + ')' : '');
}

function countForms(points) {
  const m = new Map();
  for (const pt of points) {
    const f = val(pt.node, 'form') || '설치 형태 미입력';
    m.set(f, (m.get(f) || 0) + 1);
  }
  return [...m].map(([f, n]) => f + ' ' + n + (f === '랙' || f === '소형 함체' ? '대' : '개')).join(', ');
}

/** 오른쪽 칸 상자들(위에서부터 쌓고, 넘치면 마지막 상자를 줄인다) */
function stackBoxes(deck, sl, x, y, w, boxes) {
  let cy = y;
  const end = y + BH;
  for (const b of boxes) {
    if (!b) continue;
    const room = end - cy;
    if (room < 50) break;
    const h = deck.box(sl, x, cy, w, b.head, b.body, room);
    cy += h + 10;
  }
  return cy;
}

async function placeSlides(deck, site, pl, names, condEmpty) {
  const sl = deck.slide();
  const items = [...pl.slots.overview, ...pl.slots.nameplate, ...pl.slots.handnote].map((p) => cap(names, p));
  const title = placeTitle(pl);
  const small = nameOf(site.node) + ' › ' + nameOf(pl.node) + ' · 사진 ' + items.length + '장';
  deck.title(sl, title, small);
  const lw = (CW - 16) * 1.25 / 2.25;
  const rw = CW - 16 - lw;
  const used = await deck.lead(sl, items, L, TOP, lw, BH);

  const n = pl.node;
  const devices = pl.points.flatMap((pt) => pt.devices);
  const zones = [...new Set(devices.map((d) => val(d.node, 'zone')).filter(plain))];
  const vlans = (Array.isArray(val(n, 'vlans')) ? val(n, 'vlans') : []).filter((r) => r.no || r.name || r.cidr);
  const info = [];
  if (plain(val(n, 'kind')) && val(n, 'kind') !== val(n, 'name')) info.push('종류: ' + val(n, 'kind'));
  const loc = [val(n, 'bldg'), val(n, 'floor'), val(n, 'room'), val(n, 'where')].filter(plain).join(' · ');
  if (loc) info.push('위치: ' + loc);
  if (pl.points.length) info.push('설치 지점: ' + countForms(pl.points));
  if (devices.length) info.push('장비: ' + devices.length + '대');
  if (zones.length) info.push('망 구분: ' + zones.join(' · '));
  vlans.slice(0, 4).forEach((r) => info.push('VLAN ' + [r.no, r.name, r.cidr, r.gw ? 'GW ' + r.gw : ''].filter(Boolean).join(' ')));
  if (vlans.length > 4) info.push('VLAN 외 ' + (vlans.length - 4) + '개');
  if (condEmpty) info.push('공사 조건: 입력 없음');
  if (val(n, 'done') !== true) info.push('완료 표시 전');

  const chips = [];
  for (const [k, label] of PLACE_ENV_ITEMS) {
    const v = val(n, k);
    if (v === UNKNOWN) chips.push({ t: label + ': 확인 못 함' });
    else if (plain(v)) chips.push({ t: label + ' ' + v });
  }
  for (const k of ['problems', 'envTags']) {
    const v = val(n, k);
    if (Array.isArray(v)) v.filter((x) => x !== NONE).forEach((x) => chips.push(x === UNKNOWN ? { t: (k === 'problems' ? '문제' : '환경') + ': 확인 못 함' } : { t: '! ' + x, warn: true }));
  }
  const memo = txt(val(n, 'memo'));
  stackBoxes(deck, sl, L + lw + 16, TOP, rw, [
    { head: '장소 정보', body: { lines: info } },
    { head: '환경 확인', body: { chips } },
    memo ? { head: '실사자 메모', body: { lines: [memo], bullet: false } } : null,
  ]);
  await deck.rest(items.slice(used), title, small);
}

const COND_ROWS = [
  ['층고', 'cond_ceilH', 'm'], ['보 하단 높이', 'cond_beamH', 'm'], ['천장 형태', 'cond_ceilType'],
  ['기존 트레이', 'cond_tray'], ['트레이 폭', 'cond_trayW', 'mm'], ['트레이 여유', 'cond_trayRoom'],
  ['랙·함체 놓을 자리', 'cond_spot'], ['분전반', 'cond_panel'], ['여유 차단기', 'cond_breaker'],
  ['콘센트', 'cond_outlet'], ['접지', 'cond_ground'], ['작업 조건', 'cond_work'],
];
const condFilled = (pl) => Object.keys(pl.node.data || {}).some((k) => k.startsWith('cond_') && txt(pl.node.data[k].v) != null) || pl.slots.cond.length > 0;

async function condSlides(deck, site, pl, names) {
  const sl = deck.slide();
  const items = pl.slots.cond.map((p) => cap(names, p));
  const title = nameOf(pl.node) + ' · 공사 조건';
  const small = nameOf(site.node) + ' › ' + nameOf(pl.node) + ' · 사진 ' + items.length + '장';
  deck.title(sl, title, small);
  const lw = (CW - 16) * 1.25 / 2.25;
  const rw = CW - 16 - lw;
  const used = await deck.lead(sl, items, L, TOP, lw, BH);
  const n = pl.node;
  const noTray = val(n, 'cond_tray') === NONE;
  const rows = COND_ROWS.map(([label, k, unit]) => [
    { t: label, bold: true },
    noTray && (k === 'cond_trayW' || k === 'cond_trayRoom') && !has(n, k) ? { t: '—' } : cell(val(n, k), true, unit),
  ]);
  const cols = [{ h: '항목', w: 110, align: 'left' }, { h: '값', w: rw - 110, align: 'left' }];
  // 값이 길면(여러 개 고르기) 두 줄까지
  const rowH = rows.map((r) => (lineCount(r[1].t, rw - 118, 10.5) > 1 ? ROW * 1.6 : ROW));
  const tableH = ROW + rowH.reduce((s, h) => s + h, 0);
  deck.table(sl, L + lw + 16, TOP, cols, rows, { wrap: [1] });
  const memo = txt(val(n, 'cond_memo'));
  if (memo) stackBoxes(deck, sl, L + lw + 16, TOP + tableH + 12, rw, [{ head: '메모', body: { lines: [memo], bullet: false } }]);
  await deck.rest(items.slice(used), title, small);
}

/** 설치 지점 확인 항목 → 짧은 줄 몇 개 */
function pointNotes(pt, rk, hasRear) {
  const n = pt.node;
  const out = [];
  const join = (pairs) => pairs.filter(([, v]) => v != null).map(([k, v]) => k + ' ' + v).join(' · ');
  const freeU = rk ? rk.free + 'U' : txt(val(n, 'freeU'), 'U');
  const pdu = txt(val(n, 'pduCount'), '개');
  const pduSys = txt(val(n, 'pduSystem'));
  const a = join([['빈 공간', freeU], ['케이블 인입', txt(val(n, 'cableIn'))], ['PDU', pdu ? pdu + (pduSys ? '(' + pduSys + ')' : '') : pduSys]]);
  if (a) out.push('확인: ' + a);
  const b = join([['PDU 위치', txt(val(n, 'rearPduPos'))], ['PDU 계통', txt(val(n, 'rearPduSystem'))], ['전원', txt(val(n, 'rearPower'))],
    ['빈 콘센트', txt(val(n, 'rearFreeOutlets'), '개')], ['인입', txt(val(n, 'rearCableIn'))], ['정리', txt(val(n, 'rearTidy'))],
    ['라벨', txt(val(n, 'rearLabel'))], ['FDF 인입', txt(val(n, 'rearFdfIn'))]]);
  if (b) out.push('후면: ' + b);
  if (pt.isRack && !hasRear) out.push('후면 사진 없음' + (has(n, 'rearReason') ? ' · 사유: ' + txt(val(n, 'rearReason')) : ' · 사유 미입력'));
  if (CABINET_FORMS.includes(val(n, 'form'))) {
    const c = join([['크기', txt(val(n, 'cabSize'))], ['설치', txt(val(n, 'cabMount'))], ['19인치', txt(val(n, 'cab19'))],
      ['콘센트', txt(val(n, 'cabOutlets'), '개')], ['소유', txt(val(n, 'cabOwner'))], ['잠금', txt(val(n, 'cabLocked'))]]);
    if (c) out.push('함체: ' + c);
  }
  for (const dv of pt.devices) {
    const m = txt(val(dv.node, 'memo'));
    if (m) out.push((devicePos(dv.node, pt.isRack) ? devicePos(dv.node, pt.isRack) + ' ' : '') + devShort(dv.node) + ': ' + m);
  }
  const memo = txt(val(n, 'memo'));
  if (memo) out.push('메모: ' + memo);
  return out;
}

async function tableRest(deck, rows, inRack, title, small) {
  const cols = devCols(inRack, CW);
  const per = Math.floor(BH / ROW) - 1;
  for (let i = 0; i < rows.length; i += per) {
    const sl = deck.slide();
    deck.title(sl, title + ' · 장비 목록 (계속)', small);
    deck.table(sl, L, TOP, cols, rows.slice(i, i + per).map((r) => r.cells));
  }
}

async function fdfSlides(deck, pt, title, small) {
  const rows = [];
  for (const dv of pt.devices) {
    for (const f of dv.fdf) {
      const r = f.row;
      rows.push([
        { t: [devicePos(dv.node, pt.isRack), devShort(dv.node)].filter(Boolean).join(' ') },
        cell(r.dest, true), cell(r.range, true), cell(r.used, false, '코어'), cell(r.fiber, false), cell(r.conn, false),
        cell(r.labelText, false), { t: r.unused ? '미사용' : '' },
      ]);
    }
  }
  if (!rows.length) return;
  const cols = [
    { h: 'FDF', w: 120 }, { h: '행선지', w: 160 }, { h: '코어 구간', w: 80 }, { h: '사용 코어', w: 70 },
    { h: '광 종류', w: 60 }, { h: '커넥터', w: 60 }, { h: '라벨 원문', w: 222 }, { h: '미사용', w: 60 },
  ];
  const per = Math.floor(BH / ROW) - 1;
  for (let i = 0; i < rows.length; i += per) {
    const sl = deck.slide();
    deck.title(sl, title + ' · FDF 행선지' + (i ? ' (계속)' : ''), small);
    deck.table(sl, L, TOP, cols, rows.slice(i, i + per));
  }
}

async function closeupSlides(deck, pt, items, title, small) {
  for (let i = 0; i < items.length; i += 6) {
    const sl = deck.slide();
    deck.title(sl, title + ' · 장비 근접·라벨' + (i ? ' (계속)' : ''), small);
    await deck.grid(sl, items.slice(i, i + 6), L, TOP, CW, BH, 3, 2);
  }
}

function devicePhotoItems(pt, names) {
  const out = [];
  for (const dv of pt.devices) {
    for (const list of Object.values(dv.slots)) list.forEach((p) => out.push(cap(names, p)));
    for (const f of dv.fdf) f.photos.forEach((p) => out.push(cap(names, p)));
  }
  return out;
}

async function rackSlides(deck, site, pl, pt, names) {
  const sl = deck.slide();
  const n = pt.node;
  const rk = rackSegments(n, pt.devices.map((d) => d.node));
  const front = pt.slots.front[0] || null;
  const rear = pt.slots.rear[0] || null;
  const photoCount = Object.values(pt.slots).reduce((s, l) => s + l.length, 0) + devicePhotoItems(pt, names).length;
  const hgt = typeof val(n, 'height') === 'number' ? ' (' + val(n, 'height') + 'U)' : '';
  const title = nameOf(pl.node) + ' › ' + nameOf(n);
  const sub = [val(n, 'form') !== '랙' ? val(n, 'form') : '', plain(val(n, 'system')) ? val(n, 'system') + '계통' : '', '사진 ' + photoCount + '장'].filter(Boolean).join(' · ');
  deck.title(sl, title + hgt, sub);

  const ph = (BH - 8) / 2;
  await deck.photo(sl, front, L, TOP, 150, ph, front ? names.get(front.id).caption : '전면 전체', front ? undefined : '전면 사진 없음');
  await deck.photo(sl, rear, L, TOP + ph + 8, 150, ph, rear ? names.get(rear.id).caption : '후면 전체',
    rear ? undefined : '후면 사진 없음' + (has(n, 'rearReason') ? '\n(' + txt(val(n, 'rearReason')) + ')' : ''));
  drawRack(deck, sl, rk, L + 164, TOP, 170, BH);

  const tx = L + 164 + 170 + 14;
  const tw = CW - (tx - L);
  const rows = mergePassive(pt.devices.map((d) => deviceRow(d.node, true)), true);
  const notes = pointNotes(pt, rk, !!rear);
  const anyWarn = rows.some((r) => r.cells.some((c) => c.warn));
  const lines = [...(anyWarn ? ['노란 칸은 현장에서 못 채운 값입니다. 나중에 사진을 보고 채웁니다.'] : []), ...notes];
  const noteH = Math.min(200, lines.reduce((s, l) => s + lineCount(l, tw - 14, 12), 0) * 19);
  const per = Math.max(3, Math.floor((BH - (noteH ? noteH + 12 : 0)) / ROW) - 1);
  const first = rows.slice(0, per);
  let y = TOP;
  if (first.length) {
    deck.table(sl, tx, y, devCols(true, tw), first.map((r) => r.cells));
    y += (first.length + 1) * ROW + 12;
  } else {
    deck.text(sl, '등록된 장비가 없습니다.', tx, y, tw, 20, { fontSize: F(12), color: C.lgray });
    y += 30;
  }
  if (rows.length > per) lines.unshift('장비 ' + rows.length + '줄 중 ' + per + '줄까지 보임 → 다음 장에 이어짐');
  deck.note(sl, tx, y, tw, lines, TOP + BH - y);
  const small = sub;
  await tableRest(deck, rows.slice(per), true, title, small);
  await fdfSlides(deck, pt, title, small);
  const items = [
    ...pt.slots.front.slice(1), ...pt.slots.rear.slice(1), ...pt.slots.outer, ...pt.slots.inner, ...pt.slots.closeup, ...pt.slots.label,
  ].map((p) => cap(names, p)).concat(devicePhotoItems(pt, names));
  await closeupSlides(deck, pt, items, title, small);
}

async function pointSlides(deck, site, pl, pt, names) {
  const sl = deck.slide();
  const n = pt.node;
  const own = [...pt.slots.outer, ...pt.slots.inner, ...pt.slots.closeup, ...pt.slots.label, ...pt.slots.front, ...pt.slots.rear].map((p) => cap(names, p));
  const devItems = devicePhotoItems(pt, names);
  const title = nameOf(pl.node) + ' › ' + nameOf(n);
  const small = [val(n, 'form') || '설치 형태 미입력', '사진 ' + (own.length + devItems.length) + '장'].join(' · ');
  deck.title(sl, title, small);
  const lw = (CW - 16) * 1.25 / 2.25;
  const rw = CW - 16 - lw;
  const used = await deck.lead(sl, own, L, TOP, lw, BH);

  const info = ['설치 형태: ' + (val(n, 'form') || MISSING), ...pointNotes(pt, null, true)];
  const x = L + lw + 16;
  let y = stackBoxes(deck, sl, x, TOP, rw, [{ head: '설치 정보', body: { lines: info } }]);
  const rows = pt.devices.map((d) => deviceRow(d.node, false));
  const cols = devCols(false, rw).filter((c, i) => i !== 4 && i !== 5).map((c) => ({ ...c }));
  const sum = cols.reduce((s, c) => s + c.w, 0);
  cols.forEach((c) => { c.w = (c.w * rw) / sum; });
  const pick = (r) => r.cells.filter((c, i) => i !== 4 && i !== 5);
  const per = Math.max(0, Math.floor((TOP + BH - y) / ROW) - 1);
  if (!rows.length) {
    deck.text(sl, '등록된 장비가 없습니다.', x, y, rw, 20, { fontSize: F(12), color: C.lgray });
  } else if (per > 0) {
    deck.table(sl, x, y, cols, rows.slice(0, per).map(pick));
  }
  await tableRest(deck, rows.slice(per), false, title, small);
  await fdfSlides(deck, pt, title, small);
  await closeupSlides(deck, pt, own.slice(used).concat(devItems), title, small);
}

async function extraSlides(deck, site, pl, names) {
  if (!pl.extras.length) return;
  const items = [];
  for (const e of pl.extras) {
    const memo = txt(val(e.node, 'memo'));
    if (!e.photos.length) items.push({ p: null, cap: [txt(val(e.node, 'tag')) || '자유 추가', memo].filter(Boolean).join(' · '), empty: '사진 없음' });
    e.photos.forEach((p, i) => items.push({ p, cap: names.get(p.id).caption + (memo && i === 0 ? ' · ' + memo : '') }));
  }
  const title = nameOf(pl.node) + ' · 자유 추가';
  const small = nameOf(site.node) + ' › ' + nameOf(pl.node) + ' · ' + pl.extras.length + '건';
  for (let i = 0; i < items.length; i += 6) {
    const sl = deck.slide();
    deck.title(sl, title + (i ? ' (계속)' : ''), small);
    await deck.grid(sl, items.slice(i, i + 6), L, TOP, CW, BH, 3, 2);
  }
}

/** 케이블 종류 칸: "광 SM 12코어 · UTP 24가닥". 비었으면 노란 "미입력", 확인 못 함·수 빠짐은 노랗게 */
function cableCell(n) {
  const t = cableText(n);
  if (!t) return { t: MISSING, warn: true };
  const kinds = val(n, 'cable');
  if (kinds.includes(UNKNOWN)) return { t: UNKNOWN, warn: true };
  return t.split(' · ').some((x) => !/\d/.test(x)) ? { t, warn: true } : { t };   // 코어·가닥 수가 빠진 종류가 있음
}

async function routeSlides(deck, site, r, names) {
  const sl = deck.slide();
  const n = r.node;
  const items = r.photos.map((p, i) => ({ p, cap: (i + 1) + '. ' + names.get(p.id).caption }));
  const from = pickLabel(val(n, 'from')) || MISSING;
  const to = pickLabel(val(n, 'to')) || MISSING;
  const title = '케이블 경로 ' + String(r.no).padStart(2, '0') + ' · ' + from + ' → ' + to;
  const dist = val(n, 'dist');
  const small = [nameOf(site.node), dist != null && dist !== '' ? '약 ' + dist + 'm' : '', '사진 ' + items.length + '장',
    val(n, 'done') === true ? '' : '완료 표시 전'].filter(Boolean).join(' · ');
  deck.title(sl, title, small);
  const rw = 300;
  const lw = CW - 16 - rw;
  const first = items.slice(0, 4);
  if (!first.length) await deck.photo(sl, null, L, TOP, lw, BH, null, '케이블 경로 사진 없음');
  else if (first.length === 1) await deck.photo(sl, first[0].p, L, TOP, lw, BH, first[0].cap);
  else await deck.grid(sl, first, L, TOP, lw, BH, first.length === 2 ? 1 : 2, 2);
  const rows = [
    ['출발', cell(val(n, 'from'), true)], ['도착', cell(val(n, 'to'), true)], ['케이블', cableCell(n)],
    ['거리 (대략)', cell(val(n, 'dist'), true, 'm')],
    ['지나는 방식', cell(val(n, 'ways'), true)], ['층간(수직경로)', cell(val(n, 'rise'), true)],
    ['벽 타공', cell(val(n, 'wallHoles'), false, '곳')], ['슬래브 타공', cell(val(n, 'slabHoles'), false, '곳')],
    ['방화구획', cell(val(n, 'fire'), false)], ['문제', cell(val(n, 'problems'), false)],
  ].map(([k, c]) => [{ t: k, bold: true }, c]);
  const cols = [{ h: '항목', w: 90, align: 'left' }, { h: '값', w: rw - 90, align: 'left' }];
  const rowH = rows.map((rr) => (lineCount(rr[1].t, rw - 98, 10.5) > 1 ? ROW * 1.6 : ROW));
  const tableH = ROW + rowH.reduce((s, h) => s + h, 0);
  deck.table(sl, L + lw + 16, TOP, cols, rows, { wrap: [1] });
  const memo = txt(val(n, 'memo'));
  if (memo) stackBoxes(deck, sl, L + lw + 16, TOP + tableH + 12, rw, [{ head: '메모', body: { lines: [memo], bullet: false } }]);
  await deck.rest(items.slice(4), title, small);
}

/* ── 전체 ────────────────────────────────────────────── */
export async function buildPptx({ PptxGenJS, outline, names, image, ci, team = TEAM_NAME, exportedAt = Date.now(), surveyor = '', onPhoto, outputType }) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'A4L', width: SW, height: SH });
  pptx.layout = 'A4L';
  pptx.author = surveyor || '';
  pptx.company = team;
  pptx.title = outline.project.name;
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT, lang: LANG };
  const ciH = 20;
  const ciW = ci && ci.h ? (ci.w / ci.h) * ciH : 0;
  pptx.defineSlideMaster({
    title: 'FN',
    background: { color: 'FFFFFF' },
    objects: [
      { line: { x: X(L), y: X(594), w: X(CW), h: 0, line: { color: 'E3E3E3', width: 0.75 } } },
      { text: { text: team, options: { x: X(L), y: X(598), w: X(420), h: X(28), fontFace: FONT, lang: LANG, fontSize: F(11), color: 'A8A8A8', valign: 'middle', margin: 0 } } },
      ...(ci ? [{ image: { x: X(L + CW - ciW), y: X(602), w: X(ciW), h: X(ciH), data: ci.data } }] : []),
    ],
    slideNumber: { x: X(L + CW / 2 - 40), y: X(598), w: X(80), h: X(28), fontFace: FONT, fontSize: F(11), color: 'A8A8A8', align: 'center' },
  });

  const deck = new Deck(pptx, { image, onPhoto, total: allPhotos(outline) });
  await cover(deck, outline, { surveyor, exportedAt });
  for (const site of outline.sites) {
    for (const pl of site.places) {
      const filled = condFilled(pl);
      await placeSlides(deck, site, pl, names, !filled);
      if (filled) await condSlides(deck, site, pl, names);
      for (const pt of pl.points) {
        if (pt.isRack) await rackSlides(deck, site, pl, pt, names);
        else await pointSlides(deck, site, pl, pt, names);
      }
      await extraSlides(deck, site, pl, names);
    }
    for (const r of site.routes) await routeSlides(deck, site, r, names);
  }
  if (outline.orphans.length) {
    const items = outline.orphans.map((p) => cap(names, p));
    for (let i = 0; i < items.length; i += 6) {
      const sl = deck.slide();
      deck.title(sl, '기타 사진' + (i ? ' (계속)' : ''), '어느 장소에도 달리지 않은 사진 · ' + items.length + '장');
      await deck.grid(sl, items.slice(i, i + 6), L, TOP, CW, BH, 3, 2);
    }
  }
  // 사진(JPEG)은 더 줄지 않으므로 압축 없이 묶는다(폰에서 빠르게)
  return pptx.write({ outputType: outputType || 'blob' });
}
