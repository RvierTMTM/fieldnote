/* pptx-build.js — 실사 PPT(A4 가로) 장표 만들기 (PptxGenJS 를 받아서 쓴다. 저장소·화면을 건드리지 않아 node 에서도 돈다)
   공개:
     buildPptx({ PptxGenJS, outline, names, image, ci, team, exportedAt, surveyor, onPhoto, outputType }) → Promise<Blob|Buffer>
       outline  zipname.buildOutline(model)      names  zipname.assignNames(outline)
       image(photo) → Promise<{ data:'image/jpeg;base64,…', w, h } | null>   사진 한 장을 PPT용으로 줄여 준다(한 장씩 부른다)
       ci       { data, w, h } | null            하단 오른쪽 CI
       onPhoto(done, total)                      진행률
     TEAM_NAME                                    하단 왼쪽 팀명
   장표 순서: 표지 → 현장마다 [장소마다 (전경(짧은 NW공사는 여기 같이) → NW공사(긴 것만) → 설치 지점마다(랙 장표 또는 설치 지점 장표
             → 장비 목록(계속) → 장비 근접·라벨) → 선번장(장소 안 FDF·UTP 를 이어 채움) → 자유 추가(장소마다 한 장))]
             → 그 현장의 케이블 경로(사진 2장 이하가 이어지면 2~4개씩 한 장 표, 나머지는 1장씩) → (어디에도 안 붙은 사진)
   글자 폭·줄 수 어림·칸 높이(실제 줄 수)·넘치면 "(계속)" 장·제목 한 줄: docs/ARCH.md 12절 (v0.25).
   장 수 줄이기(v0.24): 합친 장표도 정보는 빼지 않는다(표 칸 글은 자르지 않고 접음, 표 글자 10pt). 들어가지 않으면 다음 장 "(계속)".
   케이블 경로 장표: 표에 출발·도착·케이블(종류·코어/가닥 수)·거리·지나는 방식·층간(수직경로)·타공·방화구획·문제,
             완료 표시가 없으면 제목 아래 작은 글에 "완료 표시 전"(묶음 장표는 표의 "완료 표시" 줄).
   NW공사 장표: 기존 트레이가 "없음"이면 트레이 폭·여유 줄을 뺀다. 장소 장표 제목의 "(동 층)"은 이름에 이미 있는 조각을 뺀다. 경로 거리는 store.distText.
   양식은 설계 폴더의 PPT 장표 견본(900×636 기준)을 인치로 옮겼다. 빈 항목 규칙은 docs/ARCH.md 7절. */
import { val, nameOf, pickLabel, cableText, distText, locParts, condHiddenKeys } from './store.js';
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

/* ── 글자 폭 어림·줄바꿈 계산 ─────────────────────────
   맑은 고딕(Malgun Gothic) 실측 폭(1em = 1)을 쓴다: 한글·전각 1.0, 영문·숫자·기호는 아래 표(보통·굵게), 그 밖은 1.0.
   실제 그리는 글꼴·창이 조금씩 달라 SAFE(3%)만큼 넉넉히 잡는다 → 칸 높이를 모자라지 않게 잡는다(남으면 조금 비는 쪽). */
const ASCII_EM = [352, 289, 395, 606, 551, 836, 818, 232, 305, 305, 425, 701, 219, 410, 219, 396, 551, 551, 551, 551, 551, 551, 551, 551, 551, 551, 219, 219, 701, 701, 701, 460,
  979, 658, 583, 635, 717, 517, 499, 702, 725, 270, 360, 590, 480, 917, 765, 773, 571, 773, 610, 543, 534, 703, 634, 954, 601, 563, 583, 305, 764, 305, 701, 426,
  272, 520, 601, 473, 602, 535, 316, 602, 579, 246, 246, 506, 246, 880, 578, 599, 601, 602, 354, 433, 345, 578, 487, 736, 465, 493, 462, 305, 239, 305, 701];   // 0x20~0x7E
const ASCII_EM_B = [352, 323, 476, 608, 580, 875, 857, 282, 358, 358, 456, 719, 262, 414, 262, 439, 580, 580, 580, 580, 580, 580, 580, 580, 580, 580, 262, 262, 719, 719, 719, 452,
  979, 704, 637, 639, 746, 539, 524, 722, 770, 310, 431, 645, 512, 964, 798, 776, 615, 776, 654, 566, 583, 731, 671, 1010, 653, 606, 611, 358, 764, 358, 719, 426,
  309, 543, 626, 487, 626, 550, 373, 626, 607, 274, 279, 555, 274, 923, 608, 620, 626, 626, 394, 462, 384, 608, 537, 795, 539, 536, 483, 358, 309, 358, 719];
const WIDE_EM = { 0xB7: 0.22, 0x203A: 0.33, 0x2026: 0.74, 0xD7: 0.7, 0x2014: 1.03, 0x2013: 0.52, 0x2018: 0.23, 0x2019: 0.23, 0x201C: 0.38, 0x201D: 0.38, 0xB0: 0.39, 0xB1: 0.7, 0x2192: 0.95 };
const SAFE = 1.03;
function charEm(ch, bold) {
  const c = ch.codePointAt(0);
  if (c >= 32 && c < 127) return (bold ? ASCII_EM_B : ASCII_EM)[c - 32] / 1000;
  if (c < 32 || (c >= 0x200B && c <= 0x200F) || (c >= 0xFE00 && c <= 0xFE0F)) return 0;
  if (WIDE_EM[c] != null) return WIDE_EM[c];
  return c >= 0x1F000 ? 1.2 : 1;
}
function textW(s, fpx, bold) {
  let w = 0;
  for (const ch of String(s)) w += charEm(ch, bold);
  return w * fpx;
}
/** 한 줄 칸(maxPx)에 글자를 넣는다. 넘치면 "…" 로 자른다(maxPx 는 SAFE 만큼 줄여서 잰다). */
function fit(s, maxPx, fpx, bold) {
  s = String(s == null ? '' : s).replace(/\s*\n\s*/g, ' ');
  const max = maxPx / SAFE;
  if (textW(s, fpx, bold) <= max) return s;
  let out = '';
  let w = textW('…', fpx, bold);
  for (const ch of s) {
    w += charEm(ch, bold) * fpx;
    if (w > max) break;
    out += ch;
  }
  return out.replace(/\s+$/, '') + '…';
}
/** 한 문단을 maxPx 폭 칸에 줄바꿈해 줄 글자들로 가른다. 공백 단위로 채우고, 한 줄보다 긴 낱말은 글자 단위로 끊는다
    (한글을 글자마다 끊는 화면보다 같거나 줄이 많게 나온다 = 높이를 모자라지 않게 잡는다). */
function wrapPara(p, maxPx, fpx) {
  const max = Math.max(fpx, maxPx / SAFE);
  const lines = [];
  let cur = '';
  let cw = 0;
  const spW = charEm(' ') * fpx;
  for (const tok of String(p).split(/( +)/)) {
    if (!tok) continue;
    if (tok[0] === ' ') { if (cw > 0) { cur += tok; cw += spW * tok.length; } continue; }
    const tw = textW(tok, fpx);
    if (cw + tw <= max) { cur += tok; cw += tw; continue; }
    if (cw > 0) { lines.push(cur.replace(/ +$/, '')); cur = ''; cw = 0; }
    if (tw <= max) { cur = tok; cw = tw; continue; }
    for (const ch of tok) {                              // 한 줄보다 긴 낱말
      const c = charEm(ch) * fpx;
      if (cw + c > max && cur) { lines.push(cur); cur = ''; cw = 0; }
      cur += ch;
      cw += c;
    }
  }
  lines.push(cur.replace(/ +$/, ''));
  return lines;
}
function lineCount(s, maxPx, fpx) {
  return String(s).split('\n').reduce((n, p) => n + wrapPara(p, maxPx, fpx).length, 0);
}
/** 줄 목록 items([{ t, cont? }])을 maxPx 폭으로 maxN 줄까지만 담고 [앞, 나머지]로 가른다.
    문단이 한 줄씩 안 들어가면 통째로 다음으로 넘기되, 길어서(4줄 이상) 2줄 넘게 남는 자리가 있으면 줄 중간에서 끊어 이어 쓴다(나머지 맨 앞 cont). */
function takeLines(items, maxPx, fpx, maxN) {
  const head = [];
  let used = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const ls = String(it.t).split('\n').flatMap((p) => wrapPara(p, maxPx, fpx));
    if (used + ls.length <= maxN) { head.push(it); used += ls.length; continue; }
    const room = maxN - used;
    if (room >= 1 && ls.length > room && (used === 0 || (ls.length >= 4 && room >= 2))) {
      head.push({ ...it, t: ls.slice(0, room).join(' ') });
      return { head, used: used + room, rest: [{ t: ls.slice(room).join(' '), cont: true }, ...items.slice(i + 1)] };
    }
    return { head, used, rest: items.slice(i) };
  }
  return { head, used, rest: [] };
}
/** 칸 글을 접는 표의 줄 높이 [머리 줄, …줄]. 한 줄이면 ROW, 칸 글이 여러 줄이 되면 한 줄당 TLH 씩 늘린다 */
const TFPX = 10.5;                 // 표 글자(견본 px) → 10pt
const TLH = 14;
function wrapHeights(cols, rows, fpx = TFPX) {
  const one = (texts) => Math.max(ROW, 8 + Math.max(1, ...texts.map((t, i) => lineCount(String(t == null ? '' : t), Math.max(10, cols[i].w - 12), fpx))) * TLH);
  return [one(cols.map((c) => c.h)), ...rows.map((r) => one(r.map((c) => c.t)))];
}
const sum = (a) => a.reduce((s, v) => s + v, 0);
/** 줄 간격(pt): 견본 px 줄 높이 lh 와 장표에서 정확히 같게(반올림하지 않는다 — 줄이 많을 때 어긋나지 않게) */
const LS = (lh) => Math.round(lh * 0.935 * 100) / 100;

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

  /** 장표 제목: 항상 한 줄. 부제(작은 글)와 겹치지 않는 폭 안에서 글자 크기를 21px → 14px 까지 줄이고, 그래도 넘치면 "…". */
  title(sl, main, small) {
    const sw = small ? Math.min(CW * 0.45, textW(small, 12.5) * SAFE + 8) : 0;
    const avail = CW - sw - 12;
    main = String(main == null ? '' : main).replace(/\s*\n\s*/g, ' ');
    let fpx = 21;
    while (fpx > 14 && textW(main, fpx, true) * SAFE > avail) fpx -= 0.5;
    this.text(sl, fit(main, avail, fpx, true), L, 24, CW - sw - 8, 30, { fontSize: F(fpx), bold: true, valign: 'bottom', wrap: false });
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

  /** 상자 한 칸을 maxH 안에서 어디까지 담을지 잰다(그리지 않는다) → { h, rows|n, head, rest }
      글이 maxH 에 안 들어가면 들어가는 만큼만 담고 나머지는 rest(다음 장으로)로 돌려준다. maxH 가 없으면 전부 담는다. */
  boxLayout(w, body, maxH) {
    const inner = w - 24;
    if (body.chips) {
      const rows = this.chipRows(body.chips, inner);
      const cap = maxH ? Math.max(1, Math.floor((maxH - 32) / 22)) : Infinity;
      const shown = rows.slice(0, cap);
      return { h: 28 + Math.max(1, shown.length) * 22 + 4, rows: shown, rest: rows.length > cap ? { ...body, chips: rows.slice(cap).flat().map(({ t, warn }) => ({ t, warn })) } : null };
    }
    const lines = body.lines && body.lines.length ? body.lines : null;
    if (!lines) return { h: 28 + BOX_LH + 8, n: 1, head: [], rest: null };
    const maxN = maxH ? Math.max(1, Math.floor((maxH - 36) / BOX_LH)) : Infinity;
    const t = takeLines(lines.map((x) => (typeof x === 'string' ? { t: x } : x)), inner - 10, BOX_FPX, maxN);
    return { h: 28 + t.used * BOX_LH + 8, n: t.used, head: t.head, rest: t.rest.length ? { ...body, lines: t.rest } : null };
  }

  /** 견본 .bx 상자. lines: 글자 줄(앞에 · 를 붙인다) 또는 chips. 그린 높이와, 안 들어가 남은 것(rest: body 모양, 없으면 null)을 돌려준다. */
  box(sl, x, y, w, head, body, maxH) {
    const inner = w - 24;
    const r = this.boxLayout(w, body, maxH);
    this.rect(sl, x, y, w, r.h, null, C.line);
    this.text(sl, head, x + 12, y + 8, inner, 16, { fontSize: F(13), bold: true, color: C.dred });
    if (body.chips) {
      if (!r.rows.length) this.text(sl, body.empty || '입력 없음', x + 12, y + 28, inner, 20, { fontSize: F(12.5), color: C.lgray });
      r.rows.forEach((row, ri) => {
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
      return { h: r.h, rest: r.rest };
    }
    if (!r.head.length) {
      this.text(sl, body.empty || '입력 없음', x + 12, y + 28, inner, BOX_LH, { fontSize: F(BOX_FPX), color: C.lgray });
      return { h: r.h, rest: null };
    }
    const bullet = body.bullet !== false;
    const runs = [];
    for (const it of r.head) {
      if (bullet && !it.cont) runs.push({ text: '· ', options: { color: C.lgray } });
      runs.push({ text: it.t, options: { breakLine: true } });
    }
    this.text(sl, runs, x + 12, y + 28, inner, r.n * BOX_LH, { fontSize: F(BOX_FPX), color: C.ink3, lineSpacing: LS(BOX_LH) });
    return { h: r.h, rest: r.rest };
  }

  chipRows(chips, width) {
    const rows = [];
    let row = [];
    let w = 0;
    for (const c of chips) {
      const want = textW(c.t, 11.5) * SAFE + 18;
      const cw = Math.min(width, want);
      const t = cw < want ? fit(c.t, width - 18, 11.5) : c.t;
      if (row.length && w + cw > width) { rows.push(row); row = []; w = 0; }
      row.push({ ...c, t, w: cw });
      w += cw + 4;
    }
    if (row.length) rows.push(row);
    return rows;
  }

  /** 표. cols: [{ h, w }], rows: [[{ t, warn }]]. 한 줄로 그리게 칸 글자를 자른다.
      o.heights(wrapHeights 결과, 그리는 줄과 같은 순서)를 주면 칸 글을 자르지 않고 접어서 그 높이로 그린다. */
  table(sl, x, y, cols, rows, o = {}) {
    const fpx = o.fpx || TFPX;
    const head = cols.map((c) => ({
      text: c.h,
      options: { bold: true, fill: { color: 'F1F1F1' }, color: C.ink2, align: 'center', border: { type: 'solid', pt: 0.75, color: 'D0D0D0' } },
    }));
    const body = rows.map((r) => r.map((c, i) => ({
      text: o.heights || (o.wrap && o.wrap.includes(i)) ? String(c.t) : fit(c.t, cols[i].w - 8, fpx),
      options: {
        align: cols[i].align || 'center',
        border: { type: 'solid', pt: 0.75, color: 'D9D9D9' },
        ...(c.warn ? { fill: { color: C.yel }, color: C.yelCell } : { color: C.ink3 }),
        ...(c.bold ? { bold: true } : {}),
      },
    })));
    sl.addTable(o.noHead ? body : [head, ...body], {
      x: X(x), y: X(y), w: X(cols.reduce((s, c) => s + c.w, 0)), colW: cols.map((c) => X(c.w)),
      rowH: o.heights ? o.heights.map(X) : X(o.rowH || ROW), fontFace: FONT, lang: LANG, fontSize: F(fpx), valign: 'middle',
      margin: [0.02, 0.04, 0.02, 0.04], autoPage: false,
    });
  }

  /** 견본 .mm: 왼쪽 빨간 줄 + 작은 글. maxH 에 다 안 들어가면 들어가는 만큼만 그리고 나머지(rest)를 돌려준다.
      lines: 글자 줄 또는 { t, cont } → { h, rest: 줄 목록(없으면 빈 배열) } */
  note(sl, x, y, w, lines, maxH) {
    if (!lines.length) return { h: 0, rest: [] };
    const fpx = 12;
    const lh = NOTE_LH;
    const maxN = maxH ? Math.floor(maxH / lh) : Infinity;
    if (maxN < 1) return { h: 0, rest: lines };
    const t = takeLines(lines.map((l) => (typeof l === 'string' ? { t: l } : l)), w - 14, fpx, maxN);
    if (t.used < 1) return { h: 0, rest: lines };
    sl.addShape('rect', { x: X(x), y: X(y), w: X(3), h: X(t.used * lh), fill: { color: C.red }, line: { type: 'none' } });
    this.text(sl, t.head.map((it) => ({ text: it.t, options: { breakLine: true } })), x + 12, y, w - 12, t.used * lh, { fontSize: F(fpx), color: C.ink3, lineSpacing: LS(lh) });
    return { h: t.used * lh, rest: t.rest };
  }

  /** 안 들어가 남은 상자들을 "(계속)" 장표(넓은 폭)로 이어 그린다 */
  restBoxes(title, small, rest) {
    let list = rest;
    for (let g = 0; list.length && g < 40; g++) {
      const sl = this.slide();
      this.title(sl, title + ' (계속)', small);
      list = stackBoxes(this, sl, L, TOP, CW, list).rest;
    }
  }

  /** 안 들어가 남은 글 줄(note 의 rest)을 "(계속)" 장표(넓은 폭)로 이어 그린다 */
  restNotes(title, small, rest) {
    let list = rest;
    for (let g = 0; list.length && g < 40; g++) {
      const sl = this.slide();
      this.title(sl, title + ' (계속)', small);
      list = this.note(sl, L, TOP, CW, list, BH).rest;
    }
  }
}

const BOX_FPX = 12.5;              // 상자 글자(견본 px)
const BOX_LH = 20;                 // 상자 글 줄 높이
const NOTE_LH = 18;                // 노트 글(왼쪽 빨간 줄) 줄 높이
const RACK_ROW = 20;               // 랙 장표 장비 표 줄 높이(한 줄 글 — 아래 확인·메모 글이 한 장에 더 들어가게 22 대신 20)

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

// U 칸은 "42~39"(여러 U 장비)가 잘리지 않게 52(글자 폭 어림 33px + 여백 8). 합계 484 는 그대로.
const RACK_COLS = [
  { h: 'U', w: 52 }, { h: '종류', w: 66 }, { h: '규격·모델', w: 76 }, { h: 'Hostname', w: 76 },
  { h: '관리 IP', w: 72 }, { h: 'VLAN', w: 44 }, { h: '망', w: 48 }, { h: '상태', w: 50 },
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
  let tpx = 38;                       // 사업명: 3줄에 안 들어가면 글자를 줄인다(굵은 글자 폭은 5% 넉넉히)
  while (tpx > 24 && lineCount(project.name, tw * 0.95, tpx) > 3) tpx -= 2;
  const tLines = Math.min(3, lineCount(project.name, tw * 0.95, tpx));
  const blockH = 18 + 12 + tLines * 48 + 26 + rows.length * 27;
  let y = 36 + (548 - blockH) / 2;
  deck.text(sl, '현장 실사 기록', tx, y, tw, 18, { fontSize: F(15), bold: true, color: C.dred });
  y += 30;
  deck.text(sl, project.name, tx, y, tw, tLines * 48, { fontSize: F(tpx), bold: true, fit: 'shrink', valign: 'middle' });
  y += tLines * 48 + 26;
  for (const [k, v] of rows) {
    deck.text(sl, k, tx, y, 90, 27, { fontSize: F(15), color: C.lgray, valign: 'middle' });
    deck.text(sl, fit(v, tw - 108, 15), tx + 108, y, tw - 108, 27, { fontSize: F(15), color: C.ink2, valign: 'middle' });
    y += 27;
  }
}

const cap = (names, p) => ({ p, cap: (names.get(p.id) || {}).caption || '' });

/** 장소 장표 제목: "이름 (동 층)". 장소 이름에 이미 동·층이 들어 있으면 그 조각은 괄호에서 뺀다(store.locParts) */
function placeTitle(pl) {
  const where = locParts(pl.node).join(' ');
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

/** 칸 상자들을 위에서부터 쌓는다(칸 높이는 글 줄 수대로). 이 장 끝(y + BH)에 안 들어가는 글은 거기서 끊어 rest(다음 장에 이어 쓸 상자들)로 돌려준다.
    dry 면 그리지 않고 끝 y(cy)와 rest 만 잰다. → { cy, rest } */
function stackBoxes(deck, sl, x, y, w, boxes, dry) {
  let cy = y;
  const end = TOP + BH;
  const list = boxes.filter(Boolean);
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const room = end - cy;
    if (room < (b.body.chips ? 54 : 56)) return { cy, rest: list.slice(i) };     // 머리 + 한 줄도 안 들어간다
    const r = dry ? deck.boxLayout(w, b.body, room) : deck.box(sl, x, cy, w, b.head, b.body, room);
    cy += r.h + 10;
    if (r.rest) return { cy, rest: [{ head: b.head, body: r.rest }, ...list.slice(i + 1)] };
  }
  return { cy, rest: [] };
}

/** 장소 장표. NW공사(condFilled)가 짧으면 오른쪽 상자 밑 남는 칸에 같이 넣고 true 를 돌려준다(따로 장표를 만들지 않음).
    짧다 = NW공사 사진이 없거나 장소 사진과 합쳐 3장 이하(왼쪽 사진 칸에 같이 들어감) + 두 쌍 표·메모가 오른쪽 상자 밑 남는 높이에 들어감.
    오른쪽에 안 들어가면 왼쪽 사진 칸 아래에 넣는다(사진 칸 높이가 사진 1장 이하면 180, 2~3장이면 260 이상 남을 때만). 둘 다 안 되면 따로 한 장. */
async function placeSlides(deck, site, pl, names, condEmpty) {
  const sl = deck.slide();
  const own = [...pl.slots.overview, ...pl.slots.nameplate, ...pl.slots.handnote].map((p) => cap(names, p));
  const condItems = pl.slots.cond.map((p) => cap(names, p));
  const title = placeTitle(pl);
  const lw = (CW - 16) * 1.25 / 2.25;
  const rw = CW - 16 - lw;

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
  if (condEmpty) info.push('NW공사: 입력 없음');
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
  const boxes = [
    { head: '장소 정보', body: { lines: info } },
    { head: '환경 확인', body: { chips } },
    memo ? { head: '실사자 메모', body: { lines: [memo], bullet: false } } : null,
  ];
  const stack = stackBoxes(deck, sl, L + lw + 16, TOP, rw, boxes, true);       // 오른쪽 상자 쌓기(끝 y·안 들어가 남는 상자)
  const cy = stack.cy;
  // NW공사를 같이 넣을 자리: ① 오른쪽 상자 밑 ② (안 들어가면) 왼쪽 사진 칸 아래(사진 칸을 줄여도 사진 높이가 남을 때)
  let inl = null;
  let at = null;
  let leadH = BH;
  const photosOk = !condItems.length || own.length + condItems.length <= 3;
  if (!condEmpty && photosOk) {
    const r = condInline(pl, rw);
    if (!stack.rest.length && cy + r.h <= TOP + BH) { inl = r; at = [L + lw + 16, cy]; }
    else {
      const l = condInline(pl, lw);
      const room = BH - l.h - 10;
      if (room >= (own.length + condItems.length <= 1 ? 180 : 260)) { inl = l; leadH = room; at = [L, TOP + room + 10]; }
    }
  }
  const inline = !!inl;
  const items = inline ? own.concat(condItems) : own;
  const small = nameOf(site.node) + ' › ' + nameOf(pl.node) + ' · 사진 ' + items.length + '장';
  deck.title(sl, title, small);
  const used = await deck.lead(sl, items, L, TOP, lw, leadH);
  stackBoxes(deck, sl, L + lw + 16, TOP, rw, boxes);
  if (inline) inl.draw(deck, sl, at[0], at[1]);
  deck.restBoxes(title, small, stack.rest);
  await deck.rest(items.slice(used), title, small);
  return inline;
}

/** NW공사를 장소 장표 오른쪽에 넣는 상자: 항목·값 두 쌍씩 한 줄 표(값은 접음) + 메모. { h, draw } */
function condInline(pl, w) {
  const n = pl.node;
  const pairs = condRows(n);
  const inner = w - 16;
  const lab = 78;
  const vw = inner / 2 - lab;
  const cols = [{ h: '', w: lab, align: 'left' }, { h: '', w: vw, align: 'left' }, { h: '', w: lab, align: 'left' }, { h: '', w: vw, align: 'left' }];
  const rows = [];
  for (let i = 0; i < pairs.length; i += 2) rows.push([...pairs[i], ...(pairs[i + 1] || [{ t: '' }, { t: '' }])]);
  const hs = wrapHeights(cols, rows).slice(1);
  const tableH = sum(hs);
  const memo = txt(val(n, 'cond_memo'));
  const mline = memo ? '메모: ' + memo : null;
  const mh = mline ? 6 + lineCount(mline, inner - 4, 12.5) * 20 : 0;
  const h = 28 + tableH + mh + 8;
  return {
    h,
    draw(deck, sl, x, y) {
      deck.rect(sl, x, y, w, h, null, C.line);
      deck.text(sl, 'NW공사', x + 12, y + 8, inner, 16, { fontSize: F(13), bold: true, color: C.dred });
      deck.table(sl, x + 8, y + 28, cols, rows, { noHead: true, heights: hs });
      if (mline) deck.text(sl, mline, x + 12, y + 28 + tableH + 6, inner - 4, mh - 6, { fontSize: F(12.5), color: C.ink3, lineSpacing: LS(20) });
    },
  };
}

const COND_ROWS = [
  ['층고', 'cond_ceilH', 'm'], ['보 하단 높이', 'cond_beamH', 'm'], ['천장 형태', 'cond_ceilType'],
  ['기존 트레이', 'cond_tray'], ['트레이 폭', 'cond_trayW', 'mm'], ['트레이 여유', 'cond_trayRoom'],
  ['랙·함체 놓을 자리', 'cond_spot'], ['분전반', 'cond_panel'], ['여유 차단기', 'cond_breaker'],
  ['콘센트', 'cond_outlet'], ['접지', 'cond_ground'], ['작업 조건', 'cond_work'],
];
/** NW공사 표 줄 [항목, 값]. 기존 트레이 "없음"이면 트레이 폭·여유 줄은 빼고 그린다(입력해 둔 값은 기록 파일에만 남음) */
function condRows(n) {
  const hidden = condHiddenKeys(n);
  return COND_ROWS.filter(([, k]) => !hidden.includes(k)).map(([label, k, unit]) => [{ t: label, bold: true }, cell(val(n, k), true, unit)]);
}
const condFilled = (pl) => {
  const hidden = condHiddenKeys(pl.node);
  return Object.keys(pl.node.data || {}).some((k) => k.startsWith('cond_') && !hidden.includes(k) && txt(pl.node.data[k].v) != null) || pl.slots.cond.length > 0;
};

async function condSlides(deck, site, pl, names) {
  const sl = deck.slide();
  const items = pl.slots.cond.map((p) => cap(names, p));
  const title = nameOf(pl.node) + ' · NW공사';
  const small = nameOf(site.node) + ' › ' + nameOf(pl.node) + ' · 사진 ' + items.length + '장';
  deck.title(sl, title, small);
  const lw = (CW - 16) * 1.25 / 2.25;
  const rw = CW - 16 - lw;
  const used = await deck.lead(sl, items, L, TOP, lw, BH);
  const n = pl.node;
  const rows = condRows(n);
  const cols = [{ h: '항목', w: 110, align: 'left' }, { h: '값', w: rw - 110, align: 'left' }];
  const hs = wrapHeights(cols, rows);                    // 칸 글이 길면(여러 개 고르기) 줄 수만큼 칸을 키운다
  const tableH = sum(hs);
  deck.table(sl, L + lw + 16, TOP, cols, rows, { heights: hs });
  const memo = txt(val(n, 'cond_memo'));
  const stack = memo ? stackBoxes(deck, sl, L + lw + 16, TOP + tableH + 12, rw, [{ head: '메모', body: { lines: [memo], bullet: false } }]) : { rest: [] };
  deck.restBoxes(title, small, stack.rest);
  await deck.rest(items.slice(used), title, small);
}

/** 노트에 쓰는 장비 자리 글: 표의 U 칸과 같게 여러 U 장비는 범위로("34~33U"), 한 칸이면 "34U", 선반·바닥은 그대로 */
function posRange(d, inRack) {
  const pos = devicePos(d, inRack);
  if (!pos.endsWith('U')) return pos;
  const u = val(d, 'u');
  const hh = heightOf(d);
  return hh > 1 ? (u + hh - 1) + '~' + u + 'U' : pos;
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
    if (m) out.push((posRange(dv.node, pt.isRack) ? posRange(dv.node, pt.isRack) + ' ' : '') + devShort(dv.node) + ': ' + m);
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

/** FDF 선번장 줄(설치 지점 하나) */
function fdfRows(pt) {
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
  return rows;
}
const FDF_COLS = [
  { h: 'FDF', w: 120 }, { h: '행선지', w: 160 }, { h: '코어 구간', w: 80 }, { h: '사용 코어', w: 70 },
  { h: '광 종류', w: 60 }, { h: '커넥터', w: 60 }, { h: '라벨 원문', w: 222 }, { h: '미사용', w: 60 },
];

/** UTP 선번장 줄(패치판넬 장비의 utpLines): 포트 구간·연결처·라벨 원문·미사용·메모 */
function utpRows(pt) {
  const rows = [];
  for (const dv of pt.devices) {
    if (val(dv.node, 'kind') !== '패치판넬') continue;
    for (const r of dv.utp) {
      rows.push([
        { t: [devicePos(dv.node, pt.isRack), devShort(dv.node)].filter(Boolean).join(' ') },
        cell(r.range, true), cell(r.dest, true), cell(r.labelText, false), { t: r.unused ? '미사용' : '' }, cell(r.memo, false),
      ]);
    }
  }
  return rows;
}
const UTP_COLS = [
  { h: '패치판넬', w: 120 }, { h: '포트 구간', w: 90 }, { h: '연결처', w: 170 }, { h: '라벨 원문', w: 190 },
  { h: '미사용', w: 60 }, { h: '메모', w: 202 },
];

/** 선번장: 장소 안 설치 지점들의 FDF·UTP 선번장을 순서대로(지점마다 FDF → UTP) 이어서 채운다.
    표마다 위에 작은 소제목(설치 지점 · FDF/UTP 선번장 · 줄 수). 남는 높이에 소제목 + 머리 줄 + 몇 줄(최소 3줄, 표가 더 짧으면 전부)이
    안 들어가면 다음 장. 표가 넘치면 그 자리에서 끊어 다음 장에 "(계속)" 소제목·머리 줄을 다시 그린다. 칸 글은 자르지 않고 접는다.
    제목: 한 장에 설치 지점이 하나면 "장소 › 지점 · 선번장(FDF·UTP)"(한 종류면 "· FDF 선번장"), 여럿이면 "장소 · 선번장(…)". */
async function lineSlides(deck, site, pl) {
  const blocks = [];
  for (const pt of pl.points) {
    const f = fdfRows(pt);
    if (f.length) blocks.push({ pt, kind: 'FDF', cols: FDF_COLS, rows: f });
    const u = utpRows(pt);
    if (u.length) blocks.push({ pt, kind: 'UTP', cols: UTP_COLS, rows: u });
  }
  if (!blocks.length) return;
  const CAP = 20;
  const GAP = 12;
  const END = TOP + BH;
  const pages = [];
  let pg = null;
  const open = () => { pg = { y: TOP, segs: [] }; pages.push(pg); };
  for (const b of blocks) {
    b.hs = wrapHeights(b.cols, b.rows);
    let i = 0;
    while (i < b.rows.length) {
      const need = CAP + b.hs[0] + sum(b.hs.slice(1 + i, 1 + i + Math.min(3, b.rows.length - i)));
      if (!pg || (pg.segs.length && pg.y + need > END)) open();
      let j = i;
      let h = CAP + b.hs[0];
      while (j < b.rows.length && pg.y + h + b.hs[1 + j] <= END) { h += b.hs[1 + j]; j++; }
      if (j === i) { h += b.hs[1 + i]; j = i + 1; }        // 한 줄이 장 높이를 넘어도 그 줄은 넣는다
      pg.segs.push({ b, from: i, to: j, y: pg.y });
      pg.y += h + GAP;
      i = j;
    }
  }
  const kindName = (ks) => (ks.length > 1 ? '선번장(FDF·UTP)' : ks[0] + ' 선번장');
  for (const p of pages) {
    const pts = [...new Set(p.segs.map((sg) => sg.b.pt))];
    const kinds = ['FDF', 'UTP'].filter((k) => p.segs.some((sg) => sg.b.kind === k));
    const sl = deck.slide();
    const head = pts.length === 1 ? nameOf(pl.node) + ' › ' + nameOf(pts[0].node) : nameOf(pl.node);
    const small = nameOf(site.node) + ' › ' + nameOf(pl.node) + (pts.length > 1 ? ' · 설치 지점 ' + pts.length + '곳' : '');
    deck.title(sl, head + ' · ' + kindName(kinds) + (p.segs[0].from > 0 ? ' (계속)' : ''), small);
    for (const sg of p.segs) {
      const { b } = sg;
      const capT = nameOf(b.pt.node) + ' · ' + b.kind + ' 선번장 · ' + b.rows.length + '줄' + (sg.from > 0 ? ' (계속 ' + (sg.from + 1) + '~' + sg.to + '줄)' : '');
      sl.addShape('rect', { x: X(L), y: X(sg.y + 3), w: X(3), h: X(13), fill: { color: C.red }, line: { type: 'none' } });
      deck.text(sl, fit(capT, CW - 12, 12), L + 9, sg.y + 1, CW - 9, 17, { fontSize: F(12), bold: true, color: C.dred, valign: 'middle' });
      deck.table(sl, L, sg.y + CAP, b.cols, b.rows.slice(sg.from, sg.to), { heights: [b.hs[0], ...b.hs.slice(1 + sg.from, 1 + sg.to)] });
    }
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
  const lines = [...(anyWarn ? ['노란 칸은 현장에서 못 채운 미작성 항목입니다. 나중에 사진을 보고 채웁니다.'] : []), ...notes];
  const noteH = Math.min(200, lines.reduce((s, l) => s + lineCount(l, tw - 14, 12), 0) * NOTE_LH);     // 장비 표 줄 수를 정할 때 남겨 둘 글 높이(더 길면 아래 "(계속)" 장으로 넘어간다)
  const per = Math.max(3, Math.floor((BH - (noteH ? noteH + 8 : 0)) / RACK_ROW) - 1);
  const first = rows.slice(0, per);
  let y = TOP;
  if (first.length) {
    deck.table(sl, tx, y, devCols(true, tw), first.map((r) => r.cells), { rowH: RACK_ROW });
    y += (first.length + 1) * RACK_ROW + 8;
  } else {
    deck.text(sl, '등록된 장비가 없습니다.', tx, y, tw, 20, { fontSize: F(12), color: C.lgray });
    y += 30;
  }
  if (rows.length > per) lines.unshift('장비 ' + rows.length + '줄 중 ' + per + '줄까지 보임 → 다음 장에 이어짐');
  const nr = deck.note(sl, tx, y, tw, lines, TOP + BH - y);
  const small = sub;
  deck.restNotes(title + ' · 확인·메모', small, nr.rest);
  await tableRest(deck, rows.slice(per), true, title, small);
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
  const stack = stackBoxes(deck, sl, x, TOP, rw, [{ head: '설치 정보', body: { lines: info } }]);
  const y = stack.cy;
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
  deck.restBoxes(title, small, stack.rest);
  await tableRest(deck, rows.slice(per), false, title, small);
  await closeupSlides(deck, pt, own.slice(used).concat(devItems), title, small);
}

/** 자유 추가: 장소마다 한 장에 모은다. 사진 칸 격자(수에 따라 2×1 · 3×1 · 3×2 · 4×2 · 4×3, 한 장 12칸까지) + 아래에 번호별 꼬리표·메모 전체.
    칸 밑 이름 띠는 "번호. 사진 이름"(사진 없는 건은 "번호. 꼬리표"). 메모 줄이 본문 높이의 45%를 넘으면 그 장의 칸 수를 줄여 다음 장으로 넘긴다. */
async function extraSlides(deck, site, pl, names) {
  if (!pl.extras.length) return;
  const items = [];
  pl.extras.forEach((e, k) => {
    const no = (k + 1) + '. ';
    const tag = txt(val(e.node, 'tag')) || '자유 추가';
    const memo = txt(val(e.node, 'memo'));
    const note = memo ? no + tag + ' — ' + memo : null;
    if (!e.photos.length) items.push({ p: null, cap: no + tag, empty: '사진 없음', note });
    e.photos.forEach((p, i) => items.push({ p, cap: no + names.get(p.id).caption, note: i === 0 ? note : null }));
  });
  const title = nameOf(pl.node) + ' · 자유 추가';
  const small = nameOf(site.node) + ' › ' + nameOf(pl.node) + ' · ' + pl.extras.length + '건';
  const noteH = (list) => list.filter((it) => it.note).reduce((s, it) => s + lineCount(it.note, CW - 14, 12), 0) * NOTE_LH;
  let i = 0;
  while (i < items.length) {
    let n = Math.min(12, items.length - i);
    while (n > 1 && noteH(items.slice(i, i + n)) > BH * 0.45) n--;
    const page = items.slice(i, i + n);
    const [cols, rows] = n <= 2 ? [2, 1] : n <= 3 ? [3, 1] : n <= 6 ? [3, 2] : n <= 8 ? [4, 2] : [4, 3];
    const nh = Math.min(noteH(page), BH - 140);
    const sl = deck.slide();
    deck.title(sl, title + (i ? ' (계속)' : ''), small);
    const gh = BH - (nh ? nh + 10 : 0);
    await deck.grid(sl, page, L, TOP, CW, gh, cols, rows);
    if (nh) deck.restNotes(title, small, deck.note(sl, L, TOP + gh + 10, CW, page.filter((it) => it.note).map((it) => it.note), nh).rest);
    i += n;
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

/** 경로 표 줄 [항목, 값] */
function routeRows(n) {
  return [
    ['출발', cell(val(n, 'from'), true)], ['도착', cell(val(n, 'to'), true)], ['케이블', cableCell(n)],
    ['거리 (대략)', cell(val(n, 'dist'), true, 'm')],
    ['지나는 방식', cell(val(n, 'ways'), true)], ['층간(수직경로)', cell(val(n, 'rise'), true)],
    ['벽 타공', cell(val(n, 'wallHoles'), false, '곳')], ['슬래브 타공', cell(val(n, 'slabHoles'), false, '곳')],
    ['방화구획', cell(val(n, 'fire'), false)], ['문제', cell(val(n, 'problems'), false)],
  ];
}
const pad2 = (no) => String(no).padStart(2, '0');
const ROUTE_FEW = 2;               // 사진이 이 수 이하인 경로는 여러 개를 한 장 표로 묶는다
const ROUTE_GROUP = 4;             // 한 장에 묶는 경로 수 상한
const ROUTE_PHOTO_MIN = 120;       // 묶음 장표 아래 사진 칸 최소 높이

/** 사진이 적은 경로 묶음(2~4개) 한 장: 항목 × 경로 표(칸 글은 접는다) + 경로 칸 아래에 그 경로 사진(있을 때만). */
function routeGroupPlan(group) {
  const lab = 96;
  const cw = (CW - lab) / group.length;
  const cols = [{ h: '항목', w: lab, align: 'left' }, ...group.map((r) => ({ h: '경로 ' + pad2(r.no), w: cw, align: 'left' }))];
  const per = group.map((r) => [
    ...routeRows(r.node).map(([, c]) => c),
    r.photos.length ? { t: r.photos.length + '장(아래)' } : { t: '사진 없음', warn: true },
    cell(val(r.node, 'memo'), false),
    val(r.node, 'done') === true ? { t: '완료' } : { t: '완료 표시 전' },
  ]);
  const labels = [...routeRows(group[0].node).map(([k]) => k), '사진', '메모', '완료 표시'];
  const rows = labels.map((k, i) => [{ t: k, bold: true }, ...per.map((cs) => cs[i])]);
  const hs = wrapHeights(cols, rows);
  const tableH = sum(hs);
  const photos = group.some((r) => r.photos.length);
  return { cols, rows, hs, tableH, photos, lab, cw, fits: tableH + (photos ? 10 + ROUTE_PHOTO_MIN : 0) <= BH };
}

async function routeGroupSlide(deck, site, group, names) {
  const g = routeGroupPlan(group);
  const sl = deck.slide();
  const nPh = group.reduce((s, r) => s + r.photos.length, 0);
  deck.title(sl, '케이블 경로 ' + pad2(group[0].no) + '~' + pad2(group[group.length - 1].no),
    [nameOf(site.node), '경로 ' + group.length + '개', '사진 ' + nPh + '장'].join(' · '));
  deck.table(sl, L, TOP, g.cols, g.rows, { heights: g.hs });
  if (!g.photos) return;
  const y = TOP + g.tableH + 10;
  const ph = TOP + BH - y;
  deck.text(sl, '사진', L + 6, y, g.lab - 12, 20, { fontSize: F(11.5), bold: true, color: C.ink2 });
  for (let j = 0; j < group.length; j++) {
    const r = group[j];
    const x = L + g.lab + j * g.cw + 4;
    const w = g.cw - 8;
    const its = r.photos.map((p, i) => ({ p, cap: (i + 1) + '. ' + names.get(p.id).caption }));
    if (!its.length) continue;                 // 사진 없음은 표 "사진" 줄에 노랗게 표시했다
    if (its.length === 1) await deck.photo(sl, its[0].p, x, y, w, ph, its[0].cap);
    else if (ph >= 180) await deck.grid(sl, its, x, y, w, ph, 1, 2);
    else await deck.grid(sl, its, x, y, w, ph, 2, 1);
  }
}

/** 현장의 경로: 사진 ROUTE_FEW 장 이하인 경로가 이어지면 ROUTE_GROUP 개까지(표·사진 칸이 들어가는 만큼) 한 장에 묶는다.
    사진이 많은 경로와 혼자 남은 경로는 지금처럼 한 장(routeSlides). 순서는 경로 번호 그대로. */
async function siteRoutes(deck, site, names) {
  let group = [];
  const flush = async () => {
    if (group.length === 1) await routeSlides(deck, site, group[0], names);
    else if (group.length) await routeGroupSlide(deck, site, group, names);
    group = [];
  };
  for (const r of site.routes) {
    if (r.photos.length > ROUTE_FEW) { await flush(); await routeSlides(deck, site, r, names); continue; }
    if (group.length && (group.length >= ROUTE_GROUP || !routeGroupPlan([...group, r]).fits)) await flush();
    group.push(r);
  }
  await flush();
}

async function routeSlides(deck, site, r, names) {
  const sl = deck.slide();
  const n = r.node;
  const items = r.photos.map((p, i) => ({ p, cap: (i + 1) + '. ' + names.get(p.id).caption }));
  const from = pickLabel(val(n, 'from')) || MISSING;
  const to = pickLabel(val(n, 'to')) || MISSING;
  const title = '케이블 경로 ' + String(r.no).padStart(2, '0') + ' · ' + from + ' → ' + to;
  const dist = val(n, 'dist');
  const small = [nameOf(site.node), distText(dist), '사진 ' + items.length + '장',
    val(n, 'done') === true ? '' : '완료 표시 전'].filter(Boolean).join(' · ');
  deck.title(sl, title, small);
  const rw = 300;
  const lw = CW - 16 - rw;
  const first = items.slice(0, 4);
  if (!first.length) await deck.photo(sl, null, L, TOP, lw, BH, null, '케이블 경로 사진 없음');
  else if (first.length === 1) await deck.photo(sl, first[0].p, L, TOP, lw, BH, first[0].cap);
  else await deck.grid(sl, first, L, TOP, lw, BH, first.length === 2 ? 1 : 2, 2);
  const rows = routeRows(n).map(([k, c]) => [{ t: k, bold: true }, c]);
  const cols = [{ h: '항목', w: 90, align: 'left' }, { h: '값', w: rw - 90, align: 'left' }];
  const hs = wrapHeights(cols, rows);                    // 칸 글이 길면 줄 수만큼 칸을 키운다
  const tableH = sum(hs);
  deck.table(sl, L + lw + 16, TOP, cols, rows, { heights: hs });
  const memo = txt(val(n, 'memo'));
  const stack = memo ? stackBoxes(deck, sl, L + lw + 16, TOP + tableH + 12, rw, [{ head: '메모', body: { lines: [memo], bullet: false } }]) : { rest: [] };
  deck.restBoxes(title, small, stack.rest);
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
      const inline = await placeSlides(deck, site, pl, names, !filled);
      if (filled && !inline) await condSlides(deck, site, pl, names);
      for (const pt of pl.points) {
        if (pt.isRack) await rackSlides(deck, site, pl, pt, names);
        else await pointSlides(deck, site, pl, pt, names);
      }
      await lineSlides(deck, site, pl);
      await extraSlides(deck, site, pl, names);
    }
    await siteRoutes(deck, site, names);
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
