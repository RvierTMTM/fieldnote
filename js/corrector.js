/* corrector.js — 사진 보정 창(SA-D)
   공개:
     openCorrector(photoId) → Promise<boolean>
       보정 창을 연다. 적용(저장) 또는 "원래대로"(보정 지움)를 하면 true, ✕·뒤로 가기·건너뛰기면 false.
       부르는 곳: 찍은 직후 보정 제안, 사진 메뉴의 "보정 다시 하기"(js/photo-slot.js, SA-B).
     makeThumb(source, w, h, max=320) → Promise<Blob>   그림(캔버스·ImageBitmap·img)으로 작은 그림 JPEG
     저장은 store.putPhoto(rec) — changedAt 이 찍혀 "안 보낸 사진"으로 다시 센다.
     AUTO_ON_OPEN   창을 열 때 모서리 자동 찾기를 돌릴지(신뢰도 낮으면 자동값은 어차피 안 쓴다)

   사진 데이터 약속(SA-B·C 공통):
     photo.blob      줄여 저장한 보정 전 사진. 여기서는 읽기만 한다(보정 다시 하기는 늘 이것에서 출발).
     photo.corrected = { blob, points, rotation, auto, at } 또는 null(보정 없음)
       blob      보정 결과 JPEG(긴 변 2560 이하, 품질 0.85)
       points    [[x,y]×4] photo.blob 픽셀 좌표(EXIF 방향 적용 후). 순서 = 결과 사진의 좌상→우상→우하→좌하.
                 결과 = 이 4점을 (0,0)(W,0)(W,H)(0,H) 로 펴는 호모그래피. W·H 는 warp.quadSize(points).
                 → 90° 회전·미세 기울기는 이미 4점 순서와 위치에 들어 있다.
       rotation  창 상태(다시 열 때 복원용) = 90° 단위(0/90/180/270) + 미세 각도(−15~15). 예: 90 + 2.5 = 92.5
       auto      자동으로 찾은 모서리를 사람이 손대지 않고 그대로 썼으면 true(취합 때 확인 대상)
       at        저장 시각(ms)
     photo.thumb     보정본 기준으로 다시 만든다(긴 변 320, JPEG 0.7). 원래대로 하면 photo.blob 기준으로 되돌린다.

   계산: js/warp.js(호모그래피·역매핑·쌍선형), js/corner-detect.js(자동 모서리),
         js/warp-worker.js(모듈 워커). 워커를 못 쓰면 화면 쪽에서 줄 단위로 나눠 계산하고 진행을 보여 준다. */
import { h, openOverlay, closeOverlay, alertDialog, confirmDialog, toast } from './ui.js';
import { getPhoto, putPhoto } from './store.js';
import { quadSize, rectToQuad, warpRGBA, isConvexQuad, quadArea, inscribedScale } from './warp.js';
import { detectQuad } from './corner-detect.js';

export const AUTO_ON_OPEN = true;

const DEG = Math.PI / 180;
const DISP_MAX = 1600;     // 화면·미리보기용 축소본 긴 변
const DETECT_MAX = 480;    // 자동 찾기용 축소본 긴 변
const OUT_MAX = 2560;      // 결과 긴 변 상한
const THUMB_MAX = 320;      // 작은 그림 긴 변·품질, 보정본 품질은 photo-proc.js(SA-B)와 맞춤
const THUMB_Q = 0.7;
const OUT_Q = 0.85;
const TILT_MAX = 15;
const INSET = 0.06;        // 기본 4점 위치: 사진 안쪽 여백(한쪽 6%)
const PAD = 30;            // 화면 가장자리 여백(모서리 점을 잡을 수 있게)
const HIT = 44;            // 점 잡는 반경(px)
const LOUPE = 128;         // 확대경 지름(px)
const LOUPE_ZOOM = 3;      // 화면 배율의 몇 배로 볼지

export async function openCorrector(photoId) {
  let photo = null;
  try { photo = await getPhoto(photoId); } catch (e) { console.error(e); }
  if (!photo || !photo.blob) {
    await alertDialog('사진 보정', '사진을 찾지 못했습니다.');
    return false;
  }
  return new Promise((resolve) => { new Corrector(photo, resolve).open(); });
}

/* ── 계산 엔진: 모듈 워커 1개를 같이 쓴다 ───────────────── */
const engine = {
  w: null, ready: null, broken: false, seq: 0, jobs: new Map(),
  worker() {
    if (this.broken || typeof Worker === 'undefined') return Promise.resolve(null);
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve) => {
      let w;
      try { w = new Worker(new URL('./warp-worker.js', import.meta.url), { type: 'module' }); } catch (e) {
        this.broken = true; this.ready = null; resolve(null); return;
      }
      let timer = 0;
      const fail = () => {
        clearTimeout(timer);
        this.broken = true;                       // 다음부터는 화면 쪽 계산
        try { w.terminate(); } catch (e) { /* 무시 */ }
        if (this.w === w) this.w = null;
        this.ready = null;
        this.failAll(new Error('worker'));
        resolve(null);
      };
      timer = setTimeout(fail, 5000);
      w.onerror = (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); fail(); };
      w.onmessage = (ev) => {
        const m = ev.data || {};
        if (m.type === 'ready') { clearTimeout(timer); this.w = w; resolve(w); return; }
        const job = this.jobs.get(m.id);
        if (!job) return;
        if (m.type === 'progress') { if (job.onProgress) job.onProgress(m.p); return; }
        this.jobs.delete(m.id);
        if (m.type === 'error') job.reject(new Error(m.message)); else job.resolve(m);
      };
    });
    return this.ready;
  },
  run(msg, transfer, onProgress) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.jobs.set(id, { resolve, reject, onProgress });
      try { this.w.postMessage(Object.assign({ id }, msg), transfer || []); } catch (e) { this.jobs.delete(id); reject(e); }
    });
  },
  failAll(err) {
    for (const j of this.jobs.values()) j.reject(err);
    this.jobs.clear();
  },
  /** 진행 중인 계산을 버린다(창을 닫았을 때). 워커는 다음에 새로 만든다. */
  abort() {
    if (!this.jobs.size) return;
    if (this.w) { try { this.w.terminate(); } catch (e) { /* 무시 */ } }
    this.w = null; this.ready = null;
    const e = new Error('abort'); e.abort = true;
    this.failAll(e);
  },
};

const ABORT = Object.assign(new Error('abort'), { abort: true });
const nextFrame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ── 보정 창 ─────────────────────────────────────────── */
class Corrector {
  constructor(photo, resolve) {
    this.photo = photo;
    this.resolve = resolve;
    this.closed = false;
    this.img = null;          // 원본 크기 그림(ImageBitmap 또는 img)
    this.W = 0; this.H = 0;
    this.disp = null;         // 화면용 축소 캔버스
    this.dispK = 1;
    this.rot = 0;             // 0~3 (90° 단위, 시계 방향)
    this.tilt = 0;            // 도(−15~15, 시계 방향 +)
    this.pts = null;          // [[x,y]×4] 원본 좌표, 결과의 좌상→우상→우하→좌하
    this.mode = 'default';    // default(기본 여백) | full(사진 전체) | auto(자동 찾음, 손 안 댐) | manual
    this.drag = null;
    this.busyOn = false;
    this.cssW = 0; this.cssH = 0;
    this.raf = 0;
  }

  open() {
    const b = (label, on, attrs) => h('button', Object.assign({ type: 'button', onclick: on }, attrs || {}), label);
    this.cv = h('canvas', { class: 'cr-cv', role: 'img', 'aria-label': '사진과 모서리 점 네 개' });
    this.loupe = h('canvas', { class: 'cr-loupe', hidden: true, 'aria-hidden': 'true' });
    this.busyText = h('b', null, '');
    this.busyBar = h('i');
    this.busy = h('div', { class: 'cr-busy', hidden: true }, this.busyText, h('div', { class: 'cr-bar' }, this.busyBar));
    this.stage = h('div', { class: 'cr-stage' }, this.cv, this.loupe, this.busy);
    this.hint = h('p', { class: 'cr-hint' }, '');
    this.bAuto = b('자동 찾기', () => this.autoFind());
    this.bFull = b('사진 전체', () => this.setMode('full'));
    this.range = h('input', { type: 'range', min: -TILT_MAX, max: TILT_MAX, step: 0.5, value: 0, 'aria-label': '기울기' });
    this.range.addEventListener('input', () => this.setTilt(parseFloat(this.range.value)));
    this.tiltVal = b('0.0°', () => this.setTilt(0), { class: 'val', 'aria-label': '기울기 0으로' });
    this.tiltRow = h('div', { class: 'cr-tilt' },
      h('span', null, '기울기'),
      b('−', () => this.setTilt(this.tilt - 0.5), { 'aria-label': '기울기 0.5도 왼쪽' }),
      this.range,
      b('+', () => this.setTilt(this.tilt + 0.5), { 'aria-label': '기울기 0.5도 오른쪽' }),
      this.tiltVal);
    this.bLeft = h('button', { type: 'button', class: 'btn sub', onclick: () => this.leftButton() },
      this.photo.corrected ? '원래대로' : '건너뛰기');
    this.bPreview = h('button', { type: 'button', class: 'btn pri', onclick: () => this.preview() }, '미리보기');
    this.root = h('div', { class: 'cr', role: 'dialog', 'aria-modal': 'true', 'aria-label': '사진 보정' },
      h('div', { class: 'cr-h' }, h('b', null, '사진 보정'),
        h('button', { type: 'button', class: 'x', 'aria-label': '닫기', onclick: () => closeOverlay() }, '✕')),
      this.hint,
      this.stage,
      h('div', { class: 'cr-tools' },
        b('↺ 90°', () => this.rotate(-1), { 'aria-label': '왼쪽으로 90도 돌리기' }),
        b('↻ 90°', () => this.rotate(1), { 'aria-label': '오른쪽으로 90도 돌리기' }),
        this.bAuto, this.bFull),
      this.tiltRow,
      h('div', { class: 'cr-foot two' }, this.bLeft, this.bPreview));

    this.cv.addEventListener('pointerdown', (e) => this.onDown(e));
    this.cv.addEventListener('pointermove', (e) => this.onMove(e));
    this.cv.addEventListener('pointerup', (e) => this.onUp(e));
    this.cv.addEventListener('pointercancel', (e) => this.onUp(e));
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());

    openOverlay(this.root, { kind: 'full', dismissable: false, onClose: (r) => this.finish(r) });
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.stage);
    } else {
      this.onWin = () => this.resize();
      window.addEventListener('resize', this.onWin);
    }
    this.load().catch(async (e) => {
      console.error(e);
      if (this.closed) return;
      await alertDialog('사진 보정', '사진을 열지 못했습니다.');
      if (!this.closed) closeOverlay(false);
    });
  }

  finish(r) {
    this.closed = true;
    engine.abort();
    if (this.ro) this.ro.disconnect();
    if (this.onWin) window.removeEventListener('resize', this.onWin);
    cancelAnimationFrame(this.raf);
    if (this.img && this.img.close) { try { this.img.close(); } catch (e) { /* 무시 */ } }
    if (this.imgUrl) URL.revokeObjectURL(this.imgUrl);
    if (this.disp) { this.disp.width = 0; this.disp.height = 0; }
    this.cv.width = 0; this.cv.height = 0;
    this.resolve(r === true);
  }

  /* ── 열기 ── */
  async load() {
    this.setBusy('사진을 여는 중…');
    const d = await decode(this.photo.blob);
    this.img = d.src; this.imgUrl = d.url; this.W = d.w; this.H = d.h;
    if (this.closed) return;
    this.dispK = Math.min(1, DISP_MAX / Math.max(this.W, this.H));
    this.disp = scaled(this.img, this.W, this.H, this.dispK);

    const c = this.photo.corrected;
    if (c && Array.isArray(c.points) && c.points.length === 4) {
      const r = Number(c.rotation) || 0;
      const k = Math.round(r / 90);
      this.rot = ((k % 4) + 4) % 4;
      this.tilt = clamp(r - k * 90, -TILT_MAX, TILT_MAX);
      this.pts = c.points.map((p) => [clamp(+p[0], 0, this.W), clamp(+p[1], 0, this.H)]);
      if (c.auto) this.mode = 'auto';
      else if (near(this.pts, this.framePoints(0))) this.mode = 'full';
      else if (near(this.pts, this.framePoints(INSET))) this.mode = 'default';
      else this.mode = 'manual';
    } else {
      this.mode = 'default';
      this.pts = this.framePoints(INSET);
      if (AUTO_ON_OPEN) {
        this.setBusy('모서리를 찾는 중…');
        const found = await this.detect().catch((e) => { if (!e.abort) console.warn(e); return null; });
        if (this.closed) return;
        if (found) { this.pts = found; this.mode = 'auto'; }
      }
    }
    this.setBusy(null);
    this.resize();
    this.sync();
  }

  /* ── 좌표: 원본 ↔ 화면 ── */
  view() {
    const odd = this.rot % 2 === 1;
    const iw = odd ? this.H : this.W, ih = odd ? this.W : this.H;
    const s = Math.max(1e-6, Math.min((this.cssW - 2 * PAD) / iw, (this.cssH - 2 * PAD) / ih));
    const a = (this.rot * 90 + this.tilt) * DEG;
    return { s, a, c: Math.cos(a), n: Math.sin(a), cx: this.cssW / 2, cy: this.cssH / 2 };
  }
  toScreen(p) {
    const v = this.v, dx = p[0] - this.W / 2, dy = p[1] - this.H / 2;
    return [v.cx + v.s * (v.c * dx - v.n * dy), v.cy + v.s * (v.n * dx + v.c * dy)];
  }
  toImage(q) {
    const v = this.v, dx = (q[0] - v.cx) / v.s, dy = (q[1] - v.cy) / v.s;
    return [this.W / 2 + v.c * dx + v.n * dy, this.H / 2 - v.n * dx + v.c * dy];
  }
  /** 지금 회전·기울기에서 화면에 반듯한 사각형(사진 안에 들어가는 가장 큰 같은 비율)의 네 점. inset 은 한쪽 여백 비율. */
  framePoints(inset) {
    const odd = this.rot % 2 === 1;
    const iw = odd ? this.H : this.W, ih = odd ? this.W : this.H;
    const k = inscribedScale(iw, ih, this.tilt * DEG) * (1 - 2 * inset);
    const ax = (k * iw) / 2, by = (k * ih) / 2;
    const ang = (this.rot * 90 + this.tilt) * DEG, c = Math.cos(ang), s = Math.sin(ang);
    return [[-ax, -by], [ax, -by], [ax, by], [-ax, by]].map(([x, y]) => [
      clamp(this.W / 2 + c * x + s * y, 0, this.W),
      clamp(this.H / 2 - s * x + c * y, 0, this.H)]);
  }
  /** 원본 좌표 4점을 화면에서 본 좌상→우상→우하→좌하 순서로 다시 세운다. */
  orderForView(pts) {
    const v = this.v || this.view();
    const scr = pts.map((p) => {
      const dx = p[0] - this.W / 2, dy = p[1] - this.H / 2;
      return [v.c * dx - v.n * dy, v.n * dx + v.c * dy];
    });
    const mx = scr.reduce((s, p) => s + p[0], 0) / 4, my = scr.reduce((s, p) => s + p[1], 0) / 4;
    const idx = [0, 1, 2, 3].sort((i, j) => Math.atan2(scr[i][1] - my, scr[i][0] - mx) - Math.atan2(scr[j][1] - my, scr[j][0] - mx));
    let start = 0;
    idx.forEach((i, k) => { if (scr[i][0] + scr[i][1] < scr[idx[start]][0] + scr[idx[start]][1]) start = k; });
    return [0, 1, 2, 3].map((k) => pts[idx[(start + k) % 4]]);
  }
  valid(pts = this.pts) {
    if (!isConvexQuad(pts)) return false;
    let s = 0;
    for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4]; s += a[0] * b[1] - b[0] * a[1]; }
    return s > 0 && quadArea(pts) >= 0.003 * this.W * this.H;
  }

  /* ── 조작 ── */
  setMode(m) {
    if (this.busyOn || !this.W) return;
    this.mode = m;
    if (m === 'full') this.pts = this.framePoints(0);
    else if (m === 'default') this.pts = this.framePoints(INSET);
    this.sync();
  }
  rotate(dir) {
    if (this.busyOn || !this.W) return;
    this.rot = (this.rot + dir + 4) % 4;
    this.v = this.view();
    if (this.mode === 'full' || this.mode === 'default') this.pts = this.framePoints(this.mode === 'full' ? 0 : INSET);
    else {
      const p = this.pts;
      this.pts = dir > 0 ? [p[3], p[0], p[1], p[2]] : [p[1], p[2], p[3], p[0]];
    }
    this.sync();
  }
  setTilt(t) {
    if (this.busyOn || !this.W || !this.tiltOn()) return;
    this.tilt = Math.round(clamp(t, -TILT_MAX, TILT_MAX) * 2) / 2;
    this.v = this.view();
    this.pts = this.framePoints(this.mode === 'full' ? 0 : INSET);
    this.sync();
  }
  /** 기울기는 4점을 직접 맞추지 않을 때(기본·사진 전체)만 결과에 들어간다. */
  tiltOn() { return this.mode === 'full' || this.mode === 'default'; }

  async autoFind() {
    if (this.busyOn || !this.W) return;
    this.setBusy('모서리를 찾는 중…');
    let found = null;
    try { found = await this.detect(); } catch (e) { if (e.abort) return; console.warn(e); }
    if (this.closed) return;
    this.setBusy(null);
    if (!found) { toast('모서리를 찾지 못했습니다. 점을 끌어서 맞춰 주세요.'); return; }
    this.pts = found;
    this.mode = 'auto';
    this.sync();
  }

  /** 자동 모서리 찾기 → 원본 좌표 4점(화면 순서) 또는 null(못 찾음·신뢰도 낮음) */
  async detect() {
    const k = Math.min(1, DETECT_MAX / Math.max(this.W, this.H));
    const c = scaled(this.disp, this.disp.width, this.disp.height, (this.W * k) / this.disp.width);
    const img = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    c.width = 0; c.height = 0;
    const kx = this.W / img.width, ky = this.H / img.height;
    let res;
    const wk = await engine.worker();
    if (this.closed) throw ABORT;
    if (wk) {
      try { res = (await engine.run({ type: 'detect', img: { data: img.data, width: img.width, height: img.height } })).result; } catch (e) {
        if (e.abort) throw e;
        res = undefined;
      }
    }
    if (res === undefined) res = detectQuad(img);
    if (!res || !res.ok) return null;
    const pts = res.points.map(([x, y]) => [clamp(x * kx, 0, this.W), clamp(y * ky, 0, this.H)]);
    const ordered = this.orderForView(pts);
    return this.valid(ordered) ? ordered : null;
  }

  /* ── 손가락 ── */
  local(e) {
    const r = this.cv.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  onDown(e) {
    if (this.busyOn || this.drag || !this.pts) return;
    const m = this.local(e);
    let best = -1, bd = HIT;
    this.pts.forEach((p, i) => {
      const s = this.toScreen(p), d = Math.hypot(s[0] - m[0], s[1] - m[1]);
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return;
    e.preventDefault();
    try { this.cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    const s = this.toScreen(this.pts[best]);
    this.drag = { id: e.pointerId, i: best, off: [s[0] - m[0], s[1] - m[1]] };
    this.loupe.hidden = false;
    this.schedule();
  }
  onMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    e.preventDefault();
    const m = this.local(e);
    const p = this.toImage([m[0] + d.off[0], m[1] + d.off[1]]);
    this.pts[d.i] = [clamp(p[0], 0, this.W), clamp(p[1], 0, this.H)];
    if (this.mode !== 'manual') { this.mode = 'manual'; this.syncControls(); }
    this.schedule();
  }
  onUp(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    this.loupe.hidden = true;
    if (!this.valid()) {                         // 점이 서로 넘어가 꼬였으면 순서만 바로잡아 본다
      const re = this.orderForView(this.pts);
      if (this.valid(re)) this.pts = re;
    }
    this.sync();
  }

  /* ── 미리보기 · 적용 ── */
  async preview() {
    if (this.busyOn || !this.W) return;
    if (!this.valid()) {
      await alertDialog('사진 보정', '네 점이 사각형을 이루지 않습니다. 점을 대상의 네 모서리로 옮겨 주세요.');
      return;
    }
    const pts = this.pts.map((p) => p.slice());
    const size = quadSize(pts, OUT_MAX);
    const k = this.dispK;
    const pw = Math.max(1, Math.round(size.w * k)), ph = Math.max(1, Math.round(size.h * k));
    let url = null;
    try {
      this.setBusy('미리보기 만드는 중…', 0);
      const Hinv = rectToQuad(pts.map(([x, y]) => [x * k, y * k]), pw, ph);
      const out = await this.warp(() => this.disp.getContext('2d').getImageData(0, 0, this.disp.width, this.disp.height), Hinv, pw, ph,
        (p) => this.setBusy('미리보기 만드는 중…', p));
      if (this.closed) return;
      const c = toCanvas(out);
      const blob = await canvasBlob(c, 'image/jpeg', 0.85);
      c.width = 0; c.height = 0;
      if (this.closed) return;
      url = URL.createObjectURL(blob);
      this.setBusy(null);
    } catch (e) {
      if (e.abort || this.closed) return;
      console.error(e);
      this.setBusy(null);
      await alertDialog('사진 보정', '미리보기를 만들지 못했습니다.');
      return;
    }
    const pick = await new Promise((resolve) => {
      const box = h('div', { class: 'cr crp', role: 'dialog', 'aria-modal': 'true', 'aria-label': '보정 미리보기' },
        h('div', { class: 'cr-h' }, h('b', null, '미리보기'),
          h('button', { type: 'button', class: 'x', 'aria-label': '닫기', onclick: () => closeOverlay() }, '✕')),
        h('p', { class: 'cr-hint' }, `결과 ${size.w}×${size.h}` + (this.mode === 'auto' ? ' · 자동으로 찾은 모서리' : '')),
        h('div', { class: 'crp-img' }, h('img', { src: url, alt: '보정 결과 미리보기' })),
        h('div', { class: 'cr-foot two' },
          h('button', { type: 'button', class: 'btn sub', onclick: () => closeOverlay('back') }, '다시 조정'),
          h('button', { type: 'button', class: 'btn pri', onclick: () => closeOverlay('apply') }, '적용')));
      openOverlay(box, { kind: 'full', dismissable: false, onClose: resolve });
    });
    URL.revokeObjectURL(url);
    if (pick === 'apply' && !this.closed) await this.apply(pts, size);
  }

  async apply(pts, size) {
    const auto = this.mode === 'auto';
    const rotation = this.rot * 90 + this.tilt;
    try {
      this.setBusy('보정 적용 중… 0%', 0);
      const Hinv = rectToQuad(pts, size.w, size.h);
      const out = await this.warp(() => this.fullData(), Hinv, size.w, size.h,
        (p) => this.setBusy(`보정 적용 중… ${Math.round(p * 100)}%`, p));
      if (this.closed) return;
      this.setBusy('저장 중…', 1);
      const c = toCanvas(out);
      const blob = await canvasBlob(c, 'image/jpeg', OUT_Q);
      const thumb = await makeThumb(c, c.width, c.height);
      c.width = 0; c.height = 0;
      if (this.closed) return;
      const rec = await getPhoto(this.photo.id);
      if (!rec) throw new Error('사진 없음');
      rec.corrected = {
        blob,
        points: pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]),
        rotation,
        auto,
        at: Date.now(),
      };
      rec.thumb = thumb;
      await putPhoto(rec);
      if (!this.closed) closeOverlay(true);
    } catch (e) {
      if (e.abort || this.closed) return;
      console.error(e);
      this.setBusy(null);
      await alertDialog('사진 보정', '보정을 저장하지 못했습니다. 사진이 너무 크거나 저장 공간이 부족할 수 있습니다.');
    }
  }

  async leftButton() {
    if (this.busyOn) return;
    if (!this.photo.corrected) { closeOverlay(false); return; }       // 건너뛰기
    const ok = await confirmDialog({
      title: '원래대로 되돌릴까요?',
      body: '보정한 사진을 지우고 찍은 그대로의 사진을 씁니다. 찍은 사진은 남아 있어 다시 보정할 수 있습니다.',
      ok: '원래대로',
    });
    if (!ok || this.closed) return;
    try {
      this.setBusy('되돌리는 중…');
      const thumb = await makeThumb(this.img, this.W, this.H);
      if (this.closed) return;
      const rec = await getPhoto(this.photo.id);
      if (!rec) throw new Error('사진 없음');
      rec.corrected = null;
      rec.thumb = thumb;
      await putPhoto(rec);
      if (!this.closed) closeOverlay(true);
    } catch (e) {
      if (this.closed) return;
      console.error(e);
      this.setBusy(null);
      await alertDialog('사진 보정', '되돌리지 못했습니다.');
    }
  }

  /** 원본 크기 RGBA(적용 때만 만든다 — 2560px 기준 약 20MB) */
  fullData() {
    const c = document.createElement('canvas');
    c.width = this.W; c.height = this.H;
    const ctx = c.getContext('2d');
    ctx.drawImage(this.img, 0, 0, this.W, this.H);
    const d = ctx.getImageData(0, 0, this.W, this.H);
    c.width = 0; c.height = 0;
    return d;
  }

  /** 역매핑 계산: 워커가 되면 워커, 아니면 화면 쪽에서 조금씩 나눠 계산(진행 표시) */
  async warp(getSrc, Hinv, outW, outH, onProgress) {
    const wk = await engine.worker();
    if (this.closed) throw ABORT;
    if (wk) {
      const src = getSrc();
      try {
        const m = await engine.run({ type: 'warp', src: { data: src.data, width: src.width, height: src.height }, Hinv, outW, outH },
          [src.data.buffer], onProgress);
        return { data: m.data, width: m.width, height: m.height };
      } catch (e) {
        if (e.abort || this.closed) throw ABORT;
        console.warn('워커 계산 실패, 화면 쪽에서 계산', e);
      }
    }
    const src = getSrc();
    const out = { width: outW, height: outH, data: new Uint8ClampedArray(outW * outH * 4) };
    let y = 0;
    while (y < outH) {
      const t0 = performance.now();
      while (y < outH && performance.now() - t0 < 30) {
        const y1 = Math.min(outH, y + 8);
        warpRGBA(src, out, Hinv, y, y1);
        y = y1;
      }
      if (onProgress) onProgress(y / outH);
      await nextFrame();
      if (this.closed) throw ABORT;
    }
    return out;
  }

  /* ── 그리기 ── */
  resize() {
    if (this.closed) return;
    const r = this.stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.cssW = r.width; this.cssH = r.height;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.round(r.width * this.dpr);
    this.cv.height = Math.round(r.height * this.dpr);
    const ld = Math.round(LOUPE * this.dpr);
    if (this.loupe.width !== ld) { this.loupe.width = ld; this.loupe.height = ld; }
    if (this.W) { this.v = this.view(); this.draw(); }
  }
  schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }
  /** 상태가 바뀐 뒤: 버튼·안내 갱신 + 다시 그리기 */
  sync() {
    this.syncControls();
    this.v = this.view();
    this.schedule();
  }
  syncControls() {
    const on = this.tiltOn();
    this.tiltRow.classList.toggle('off', !on);
    this.tiltRow.querySelectorAll('button,input').forEach((el) => { el.disabled = !on; });
    this.range.value = String(this.tilt);
    this.tiltVal.textContent = (this.tilt > 0 ? '+' : '') + this.tilt.toFixed(1) + '°';
    this.bFull.classList.toggle('on', this.mode === 'full');
    this.bAuto.classList.toggle('on', this.mode === 'auto');
    const t = {
      default: '네 점을 대상(랙·명판·라벨·함체)의 모서리로 끌어 맞추세요. 기울기만 고칠 때는 아래 기울기를 쓰세요.',
      full: '사진 전체를 씁니다. 90° 돌리기와 기울기만 바뀝니다.',
      auto: '자동으로 찾은 모서리입니다. 맞지 않으면 점을 끌어 고치세요.',
      manual: '점을 끌어 모서리를 맞추세요. 기울기는 4점을 맞출 때는 쓰지 않습니다.',
    }[this.mode];
    this.hint.textContent = t;
  }
  draw() {
    const ctx = this.cv.getContext('2d');
    const dpr = this.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#14181f';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    if (!this.W || !this.pts) return;
    const v = this.v || (this.v = this.view());
    ctx.save();
    ctx.translate(v.cx, v.cy);
    ctx.rotate(v.a);
    ctx.scale(v.s, v.s);
    ctx.translate(-this.W / 2, -this.H / 2);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.disp, 0, 0, this.W, this.H);
    ctx.restore();

    const q = this.pts.map((p) => this.toScreen(p));
    const ok = this.valid();
    // 사각형 바깥 어둡게
    ctx.beginPath();
    ctx.rect(0, 0, this.cssW, this.cssH);
    poly(ctx, q);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fill('evenodd');
    // 변
    ctx.beginPath(); poly(ctx, q);
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = ok ? '#ffffff' : '#ffb703'; ctx.stroke();
    // 점
    q.forEach((p, i) => {
      const on = this.drag && this.drag.i === i;
      const r = on ? 17 : 14;
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fillStyle = on ? 'rgba(31,95,191,.85)' : 'rgba(31,95,191,.45)';
      ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.beginPath(); ctx.arc(p[0], p[1], 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
    });
    if (this.drag) this.drawLoupe(q);
  }
  /** 끄는 점 주변을 확대해 손가락에 가리지 않는 위쪽 구석에 보여 준다. */
  drawLoupe(q) {
    const i = this.drag.i, p = this.pts[i], sp = q[i];
    const L = this.loupe, dpr = this.dpr || 1, size = LOUPE;
    const right = sp[0] < size + 40 && sp[1] < size + 40;
    L.classList.toggle('r', right);
    const ctx = L.getContext('2d');
    const v = this.v, z = v.s * LOUPE_ZOOM;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#14181f';
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(v.a);
    ctx.scale(z, z);
    ctx.translate(-p[0], -p[1]);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.img, 0, 0, this.W, this.H);
    // 이웃 변
    ctx.beginPath();
    const a = this.pts[(i + 3) % 4], b = this.pts[(i + 1) % 4];
    ctx.moveTo(a[0], a[1]); ctx.lineTo(p[0], p[1]); ctx.lineTo(b[0], b[1]);
    ctx.lineWidth = 2 / z; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.restore();
    // 십자선
    ctx.strokeStyle = 'rgba(255,183,3,.95)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(size / 2 - 14, size / 2); ctx.lineTo(size / 2 - 4, size / 2);
    ctx.moveTo(size / 2 + 4, size / 2); ctx.lineTo(size / 2 + 14, size / 2);
    ctx.moveTo(size / 2, size / 2 - 14); ctx.lineTo(size / 2, size / 2 - 4);
    ctx.moveTo(size / 2, size / 2 + 4); ctx.lineTo(size / 2, size / 2 + 14);
    ctx.stroke();
  }
  setBusy(text, p) {
    this.busyOn = !!text;
    this.busy.hidden = !text;
    if (!text) return;
    this.busyText.textContent = text;
    this.busyBar.parentNode.hidden = p == null;
    if (p != null) this.busyBar.style.width = Math.round(clamp(p, 0, 1) * 100) + '%';
  }
}

/* ── 도구 ─────────────────────────────────────────────── */
function poly(ctx, q) {
  ctx.moveTo(q[0][0], q[0][1]);
  for (let k = 1; k < 4; k++) ctx.lineTo(q[k][0], q[k][1]);
  ctx.closePath();
}

function near(a, b) {
  return a.every((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1]) < 1.5);
}

/** Blob → 그림. EXIF 방향은 적용(사진 칸 미리보기 img 와 같은 방향). */
async function decode(blob) {
  if (typeof createImageBitmap === 'function') {
    try { const b = await createImageBitmap(blob, { imageOrientation: 'from-image' }); return { src: b, w: b.width, h: b.height }; } catch (e) { /* 다음 방법 */ }
    try { const b = await createImageBitmap(blob); return { src: b, w: b.width, h: b.height }; } catch (e) { /* 다음 방법 */ }
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch (e) { URL.revokeObjectURL(url); throw e; }
  return { src: img, w: img.naturalWidth, h: img.naturalHeight, url };
}

/** 그림을 k 배로 줄인 캔버스(반씩 줄여 가며 계단 없이) */
function scaled(src, w, h, k) {
  const tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
  let cur = src, cw = w, ch = h;
  const temps = [];
  while (cw / 2 >= tw * 1.05 && ch / 2 >= th * 1.05) {
    const nw = Math.round(cw / 2), nh = Math.round(ch / 2);
    const c = document.createElement('canvas');
    c.width = nw; c.height = nh;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, nw, nh);
    temps.push(c);
    cur = c; cw = nw; ch = nh;
  }
  const out = document.createElement('canvas');
  out.width = tw; out.height = th;
  const x = out.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(cur, 0, 0, tw, th);
  temps.forEach((c) => { c.width = 0; c.height = 0; });
  return out;
}

function toCanvas(out) {
  const c = document.createElement('canvas');
  c.width = out.width; c.height = out.height;
  c.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
  return c;
}

function canvasBlob(c, type, q) {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 만들기 실패'))), type, q);
  });
}

export async function makeThumb(source, w, h, max = THUMB_MAX) {
  const c = scaled(source, w, h, Math.min(1, max / Math.max(w, h)));
  const b = await canvasBlob(c, 'image/jpeg', THUMB_Q);
  c.width = 0; c.height = 0;
  return b;
}
