/* corner-detect.js — 사각 대상(랙 전면·문패·명판·라벨·함체) 모서리 자동 찾기. 외부 라이브러리 없음.
   공개:
     detectQuad(img, opts) → { ok, points, score, minSupport, meanSupport, areaFrac } | null
       img: { data: Uint8ClampedArray(RGBA), width, height } (작게 줄인 사진이면 충분, 긴 변 480 안팎)
       points: img 좌표, 순서 좌상→우상→우하→좌하. ok=false 면 신뢰도가 낮아 쓰지 않는다.
   방법: 그레이 → 가우시안 블러 → 소벨 → 캐니(비최대 억제 + 이력 임계) → 기울기 방향 허프 직선
         → 가로·세로 직선 둘씩 골라 사각형 후보 → 네 변이 실제 엣지로 얼마나 덮이는지(지지율)로 점수
         → 고른 네 변을 엣지 점으로 다시 맞춤(최소제곱, 부분 픽셀) → 모서리 = 변의 교점. */

const DEG = Math.PI / 180;

/* 자동값을 쓰는 기준(합성 이미지 검사로 정함 — docs/ARCH.md SA-D 참고)
   minSupport: 네 변 중 가장 약한 변의 엣지 지지율, meanSupport: 네 변 평균,
   minArea: 사진 면적 대비, maxExt: 모서리 바깥으로 엣지가 이어지는 정도(평균, 0~1),
   maxGap: 한 변에서 엣지가 끊긴 가장 긴 구간(변 길이 대비) — 옆의 평행한 다른 선을 변으로 잘못 고른 경우를 거른다,
   maxEnd: 그중 모서리에 붙은 끊긴 구간 — 변이 진짜 모서리를 지나 더 멀리 있는 선까지 늘어난 경우,
   polarity 가 안 맞으면(안쪽 밝기 방향이 변마다 다름) minSupport 대신 polarMin 을 넘어야 한다. */
export const AUTO_RULE = { minSupport: 0.6, meanSupport: 0.72, minArea: 0.04, maxExt: 0.22, maxGap: 0.2, maxEnd: 0.1, polarMin: 0.8 };

export function detectQuad(img, opts = {}) {
  const maxSide = opts.maxSide || 480;
  const rule = Object.assign({}, AUTO_RULE, opts.rule || {});
  const sc = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(16, Math.round(img.width * sc));
  const h = Math.max(16, Math.round(img.height * sc));
  const kx = img.width / w, ky = img.height / h;

  const gray = grayScaled(img, w, h);
  blur5(gray, w, h);
  blur5(gray, w, h);
  const { mag, gx, gy } = sobel(gray, w, h);
  const { edge, ori } = canny(mag, gx, gy, w, h);

  const lines = polishLines(hough(edge, ori, w, h), edge, ori, w, h);
  // 직선 위치(가로선은 가운데 x 에서의 y, 세로선은 가운데 y 에서의 x)
  const allH = lines.filter((l) => l.theta >= 45 && l.theta < 135);
  const allV = lines.filter((l) => l.theta < 45 || l.theta >= 135);
  allH.forEach((l) => { l.pos = (l.rho - (w / 2) * l.c) / l.s; });
  allV.forEach((l) => { l.pos = (l.rho - (h / 2) * l.s) / l.c; });
  // 후보 직선: 표가 많은 18개 + 양 끝(바깥쪽) 3개씩. 랙처럼 안쪽에 센 가로줄이 많아도 바깥 틀이 빠지지 않게.
  const pick = (arr) => {
    const top = arr.slice(0, 18);
    const byPos = arr.slice().sort((a, b) => a.pos - b.pos);
    for (const l of byPos.slice(0, 3).concat(byPos.slice(-3))) if (!top.includes(l)) top.push(l);
    return top;
  };
  const H = pick(allH), V = pick(allV);
  if (H.length < 2 || V.length < 2) return null;

  const cache = new Map();
  const side = (L, A, B, key) => {
    let v = cache.get(key);
    if (v === undefined) {
      const p = cross(L, A), q = cross(L, B);
      v = p && q ? supportGap(edge, ori, w, h, p, q, L.theta, 0.03) : { s: 0, gap: 1, end: 1 };
      cache.set(key, v);
    }
    return v;
  };

  const minSide = 0.1 * Math.min(w, h);
  const mx = 0.02 * w, my = 0.02 * h;
  const top = [];
  for (let i = 0; i < H.length; i++) for (let j = 0; j < H.length; j++) {
    if (i === j) continue;
    const T = H[i], Bt = H[j];
    if (Bt.pos - T.pos < 0.1 * h) continue;
    for (let a = 0; a < V.length; a++) for (let b = 0; b < V.length; b++) {
      if (a === b) continue;
      const Lf = V[a], R = V[b];
      if (R.pos - Lf.pos < 0.1 * w) continue;
      const tl = cross(T, Lf), tr = cross(T, R), br = cross(Bt, R), bl = cross(Bt, Lf);
      if (!tl || !tr || !br || !bl) continue;
      const q = [tl, tr, br, bl];
      if (q.some((p) => p[0] < -mx || p[1] < -my || p[0] > w + mx || p[1] > h + my)) continue;
      if (!convexCW(q)) continue;
      const area = polyArea(q) / (w * h);
      if (area < rule.minArea) continue;
      if (!anglesOk(q, 40, 140)) continue;
      if (Math.min(len(tl, tr), len(tr, br), len(br, bl), len(bl, tl)) < minSide) continue;
      const r1 = side(T, Lf, R, `h${i}|${a}|${b}`);
      if (r1.s < 0.45) continue;
      const r3 = side(Bt, Lf, R, `h${j}|${a}|${b}`);
      if (r3.s < 0.45) continue;
      const r4 = side(Lf, T, Bt, `v${a}|${i}|${j}`);
      if (r4.s < 0.45) continue;
      const r2 = side(R, T, Bt, `v${b}|${i}|${j}`);
      if (r2.s < 0.45) continue;
      const mean = (r1.s + r2.s + r3.s + r4.s) / 4;
      const mn = Math.min(r1.s, r2.s, r3.s, r4.s);
      const gap = Math.max(r1.gap, r2.gap, r3.gap, r4.gap);
      const end = Math.max(r1.end, r2.end, r3.end, r4.end);
      const score = Math.sqrt(area) * mean * mean * mean * (1 - gap) * (1 - gap);
      pushTop(top, { score, mean, mn, gap, end, area, q, lines: [T, R, Bt, Lf] }, 12);
    }
  }
  if (!top.length) return null;
  // 상위 후보만 더 따진다: ① 모서리에서 엣지가 끝나는가(직선 두 개가 그냥 엇갈린 곳이 아닌가)
  //                       ② 네 변의 밝기 방향(안쪽이 더 밝은지 어두운지)이 같은가
  let best = null;
  for (const c of top) {
    const ext = c.q.map((p, k) => extension(edge, ori, w, h, c.q, k));
    c.ext = ext.reduce((a, b) => a + b, 0) / 8;
    c.extMax = Math.max(...ext);
    c.pol = polarity(edge, ori, gx, gy, w, h, c.q);
    c.final = c.score * (1 - 0.6 * c.ext) * (c.pol ? 1 : 0.6);
    if (!best || c.final > best.final) best = c;
  }

  // 네 변 다시 맞추기(엣지 점 최소제곱, 부분 픽셀)
  const [T, R, Bt, Lf] = best.lines;
  const fit = [
    refine(T, Lf, R, edge, ori, mag, gx, gy, w, h),
    refine(R, T, Bt, edge, ori, mag, gx, gy, w, h),
    refine(Bt, Lf, R, edge, ori, mag, gx, gy, w, h),
    refine(Lf, T, Bt, edge, ori, mag, gx, gy, w, h),
  ];
  let q = [cross(fit[0], fit[3]), cross(fit[0], fit[1]), cross(fit[2], fit[1]), cross(fit[2], fit[3])];
  if (q.some((p) => !p) || !convexCW(q)) q = [cross(T, Lf), cross(T, R), cross(Bt, R), cross(Bt, Lf)];
  const points = q.map(([x, y]) => [clamp(x * kx, 0, img.width), clamp(y * ky, 0, img.height)]);
  const ok = best.mn >= rule.minSupport && best.mean >= rule.meanSupport && best.area >= rule.minArea
    && best.ext <= rule.maxExt && best.gap <= rule.maxGap && best.end <= rule.maxEnd
    && (best.pol || best.mn >= rule.polarMin);
  return { ok, points, score: best.final, minSupport: best.mn, meanSupport: best.mean, areaFrac: best.area,
    ext: best.ext, extMax: best.extMax, gap: best.gap, endGap: best.end, polarity: best.pol };
}

/* ── 단계별 ─────────────────────────────────────────── */

function grayScaled(img, w, h) {
  const { data, width: W, height: Hh } = img;
  const out = new Float32Array(w * h);
  const fx = W / w, fy = Hh / h;
  for (let y = 0; y < h; y++) {
    const ya = Math.floor(y * fy), yb = Math.max(ya + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < w; x++) {
      const xa = Math.floor(x * fx), xb = Math.max(xa + 1, Math.floor((x + 1) * fx));
      let s = 0, n = 0;
      for (let yy = ya; yy < yb && yy < Hh; yy++) {
        let o = (yy * W + xa) * 4;
        for (let xx = xa; xx < xb && xx < W; xx++, o += 4) {
          s += 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
          n++;
        }
      }
      out[y * w + x] = n ? s / n : 0;
    }
  }
  return out;
}

/** [1 4 6 4 1]/16 가로·세로(가장자리는 끝값 반복) */
function blur5(a, w, h) {
  const t = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) {
      const x1 = x > 0 ? x - 1 : 0, x2 = x > 1 ? x - 2 : 0;
      const x3 = x < w - 1 ? x + 1 : w - 1, x4 = x < w - 2 ? x + 2 : w - 1;
      t[r + x] = (a[r + x2] + 4 * a[r + x1] + 6 * a[r + x] + 4 * a[r + x3] + a[r + x4]) / 16;
    }
  }
  for (let y = 0; y < h; y++) {
    const y1 = y > 0 ? y - 1 : 0, y2 = y > 1 ? y - 2 : 0;
    const y3 = y < h - 1 ? y + 1 : h - 1, y4 = y < h - 2 ? y + 2 : h - 1;
    for (let x = 0; x < w; x++) {
      a[y * w + x] = (t[y2 * w + x] + 4 * t[y1 * w + x] + 6 * t[y * w + x] + 4 * t[y3 * w + x] + t[y4 * w + x]) / 16;
    }
  }
}

function sobel(a, w, h) {
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h), mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = a[i - w - 1], t = a[i - w], tr = a[i - w + 1];
      const l = a[i - 1], r = a[i + 1];
      const bl = a[i + w - 1], b = a[i + w], br = a[i + w + 1];
      const X = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const Y = (bl + 2 * b + br) - (tl + 2 * t + tr);
      gx[i] = X; gy[i] = Y; mag[i] = Math.hypot(X, Y);
    }
  }
  return { gx, gy, mag };
}

/** 기울기 방향 4갈래로 이웃 고르기: 0 가로, 1 대각(↘), 2 세로, 3 대각(↙) */
function dirOf(X, Y) {
  let t = Math.atan2(Y, X) / DEG;
  if (t < 0) t += 180;
  if (t < 22.5 || t >= 157.5) return 0;
  if (t < 67.5) return 1;
  if (t < 112.5) return 2;
  return 3;
}
const NB = [[1, 0], [1, 1], [0, 1], [-1, 1]];

function canny(mag, gx, gy, w, h) {
  // 임계값은 잡음 수준(전체 기울기 크기의 중앙값)에 맞춘다. 글자처럼 아주 센 엣지가 많아도
  // 대상 테두리(약한 대비)가 빠지지 않게, 센 엣지 분포는 쓰지 않는다.
  const sample = [];
  for (let i = 0; i < w * h; i += 7) sample.push(mag[i]);
  sample.sort((p, q) => p - q);
  const med = sample[sample.length >> 1] || 0;
  const hi = Math.max(30, 4 * med);
  const lo = Math.max(12, hi * 0.4);
  const nms = new Float32Array(w * h);
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m < lo) continue;
      const [dx, dy] = NB[dirOf(gx[i], gy[i])];
      if (m >= mag[i + dy * w + dx] && m > mag[i - dy * w - dx]) nms[i] = m;
    }
  }
  const edge = new Uint8Array(w * h);
  const ori = new Int16Array(w * h).fill(-1);
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (nms[i] >= hi && !edge[i]) {
      edge[i] = 1; stack.push(i);
      while (stack.length) {
        const k = stack.pop();
        const kx = k % w, ky = (k - kx) / w;
        for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
          const n = (ky + yy) * w + kx + xx;
          if (n >= 0 && n < w * h && !edge[n] && nms[n] >= lo) { edge[n] = 1; stack.push(n); }
        }
      }
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (!edge[i]) continue;
    let t = Math.round(Math.atan2(gy[i], gx[i]) / DEG);
    if (t < 0) t += 180;
    if (t >= 180) t -= 180;
    ori[i] = t;
  }
  return { edge, ori };
}

/** 기울기 방향 ±2° 만 투표하는 허프. 직선: x·cosθ + y·sinθ = ρ (θ 는 법선 각도, 0~179°) */
function hough(edge, ori, w, h) {
  const D = Math.ceil(Math.hypot(w, h));
  const NR = 2 * D + 1;
  const acc = new Int32Array(180 * NR);
  const cs = new Float64Array(180), sn = new Float64Array(180);
  for (let t = 0; t < 180; t++) { cs[t] = Math.cos(t * DEG); sn[t] = Math.sin(t * DEG); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!edge[i]) continue;
    const t0 = ori[i];
    for (let d = -2; d <= 2; d++) {
      let t = t0 + d, flip = 1;
      if (t < 0) { t += 180; flip = -1; } else if (t >= 180) { t -= 180; flip = -1; }
      const rho = Math.round(flip * ((x + 0.5) * cs[t] + (y + 0.5) * sn[t]));
      acc[t * NR + rho + D]++;
    }
  }
  const minVotes = Math.max(15, Math.round(0.06 * Math.min(w, h)));
  const peaks = [];
  for (let t = 0; t < 180; t++) {
    for (let r = 0; r < NR; r++) {
      const v = acc[t * NR + r];
      if (v < minVotes) continue;
      let isMax = true;
      for (let dt = -2; dt <= 2 && isMax; dt++) {
        const tt = t + dt;
        if (tt < 0 || tt >= 180) continue;
        for (let dr = -3; dr <= 3; dr++) {
          const rr = r + dr;
          if (rr < 0 || rr >= NR || (dt === 0 && dr === 0)) continue;
          const u = acc[tt * NR + rr];
          if (u > v || (u === v && (dt < 0 || (dt === 0 && dr < 0)))) { isMax = false; break; }
        }
      }
      if (isMax) peaks.push({ theta: t, rho: r - D, votes: v });
    }
  }
  peaks.sort((a, b) => b.votes - a.votes);
  const out = [];
  for (const p of peaks) {
    if (out.length >= 48) break;
    const dup = out.some((q) => {
      let dt = Math.abs(q.theta - p.theta), dr = Math.abs(q.rho - p.rho);
      if (dt > 90) { dt = 180 - dt; dr = Math.abs(q.rho + p.rho); }
      return dt < 4 && dr < 6;
    });
    if (!dup) out.push(p);
  }
  out.forEach((l) => { l.c = Math.cos(l.theta * DEG); l.s = Math.sin(l.theta * DEG); });
  return out;
}

/** 허프 직선(1° 눈금)을 그 위 엣지 점으로 다시 맞춘다(총 최소제곱 두 번). 긴 변에서 0.5° 차이도 끝에서 몇 px 벌어지므로. */
function polishLines(lines, edge, ori, w, h) {
  const px = [], py = [], po = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (edge[i]) { px.push(x + 0.5); py.push(y + 0.5); po.push(ori[i]); }
  }
  for (const l of lines) {
    let c = l.c, s = l.s, rho = l.rho;
    for (const band of [2.5, 1.5]) {
      let n = 0, mx = 0, my = 0;
      const ix = [];
      for (let k = 0; k < px.length; k++) {
        if (Math.abs(px[k] * c + py[k] * s - rho) > band) continue;
        let dt = Math.abs(po[k] - l.theta);
        if (dt > 90) dt = 180 - dt;
        if (dt > 10) continue;
        ix.push(k); mx += px[k]; my += py[k]; n++;
      }
      if (n < 10) break;
      mx /= n; my /= n;
      let sxx = 0, syy = 0, sxy = 0;
      for (const k of ix) { const u = px[k] - mx, v = py[k] - my; sxx += u * u; syy += v * v; sxy += u * v; }
      const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      let nc = -Math.sin(ang), ns = Math.cos(ang);
      if (nc * c + ns * s < 0) { nc = -nc; ns = -ns; }
      if (nc * l.c + ns * l.s < Math.cos(3 * DEG)) break;     // 3° 넘게 돌면 다른 선에 끌린 것 → 그만
      c = nc; s = ns; rho = mx * c + my * s;
    }
    l.c = c; l.s = s; l.rho = rho;
  }
  return lines;
}

/** 두 직선 교점 */
function cross(A, B) {
  const det = A.c * B.s - A.s * B.c;
  if (Math.abs(det) < 1e-6) return null;
  return [(A.rho * B.s - A.s * B.rho) / det, (A.c * B.rho - A.rho * B.c) / det];
}

/** 선분 p→q 를 따라 1.5px 마다, 법선 ±2px 안에 방향 맞는(±15°) 엣지가 있는 비율 */
function support(edge, ori, w, h, p, q, theta, trim = 0.03) {
  return supportGap(edge, ori, w, h, p, q, theta, trim).s;
}

/** support + 엣지가 끊긴 가장 긴 구간(변 길이 대비) */
function supportGap(edge, ori, w, h, p, q, theta, trim) {
  const L = len(p, q);
  let run = 0, gapMax = 0, first = -1, last = -1;
  const n = Math.max(4, Math.floor(L / 1.5));
  const nx = Math.cos(theta * DEG), ny = Math.sin(theta * DEG);
  let hit = 0, cnt = 0;
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    if (f < trim || f > 1 - trim) continue;       // 모서리 근처는 빼고 본다
    const x = p[0] + (q[0] - p[0]) * f, y = p[1] + (q[1] - p[1]) * f;
    cnt++;
    let got = false;
    for (let d = -2; d <= 2; d++) {
      const xi = Math.floor(x + d * nx), yi = Math.floor(y + d * ny);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue;
      const i = yi * w + xi;
      if (!edge[i]) continue;
      let dt = Math.abs(ori[i] - theta);
      if (dt > 90) dt = 180 - dt;
      if (dt <= 15) { got = true; break; }
    }
    if (got) { hit++; run = 0; if (first < 0) first = cnt - 1; last = cnt - 1; } else if (++run > gapMax) gapMax = run;
  }
  if (!cnt || first < 0) return { s: 0, gap: 1, end: 1 };
  return { s: hit / cnt, gap: gapMax / cnt, end: Math.max(first, cnt - 1 - last) / cnt };
}

function pushTop(arr, c, n) {
  if (arr.length < n) { arr.push(c); arr.sort((a, b) => b.score - a.score); return; }
  if (c.score <= arr[n - 1].score) return;
  arr[n - 1] = c;
  arr.sort((a, b) => b.score - a.score);
}

/** 모서리 k 에서 두 변을 바깥으로 늘린 짧은 구간(변 길이의 12%)에 엣지가 이어지는 비율의 합(0~2).
    물체의 진짜 모서리면 엣지가 거기서 끝나 0 에 가깝고, 긴 직선 둘이 엇갈린 곳이면 2 에 가깝다. */
function extension(edge, ori, w, h, q, k) {
  const p = q[k];
  let s = 0;
  for (const j of [(k + 1) % 4, (k + 3) % 4]) {
    const o = q[j];
    const dx = p[0] - o[0], dy = p[1] - o[1], L = Math.hypot(dx, dy);
    const ext = Math.max(6, 0.12 * L);
    const a = [p[0] + dx / L * 2, p[1] + dy / L * 2], b = [p[0] + dx / L * (2 + ext), p[1] + dy / L * (2 + ext)];
    let theta = Math.round(Math.atan2(dx, -dy) / DEG);   // 변의 법선 각도
    theta = ((theta % 180) + 180) % 180;
    s += support(edge, ori, w, h, a, b, theta, 0);
  }
  return s;
}

/** 네 변 모두 같은 쪽이 밝은가(안쪽이 바깥보다 다 밝거나 다 어두운가) */
function polarity(edge, ori, gx, gy, w, h, q) {
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
  const signs = [];
  for (let k = 0; k < 4; k++) {
    const p = q[k], r = q[(k + 1) % 4];
    let nx = -(r[1] - p[1]), ny = r[0] - p[0];
    const L = Math.hypot(nx, ny); nx /= L; ny /= L;
    const mx = (p[0] + r[0]) / 2, my = (p[1] + r[1]) / 2;
    if ((cx - mx) * nx + (cy - my) * ny < 0) { nx = -nx; ny = -ny; }   // 안쪽을 보게
    let pos = 0, neg = 0;
    const n = Math.max(4, Math.floor(L / 2));
    for (let t = 1; t < n; t++) {
      const x = p[0] + (r[0] - p[0]) * t / n, y = p[1] + (r[1] - p[1]) * t / n;
      for (let d = -2; d <= 2; d++) {
        const xi = Math.floor(x + d * nx), yi = Math.floor(y + d * ny);
        if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue;
        const i = yi * w + xi;
        if (!edge[i]) continue;
        const dot = gx[i] * nx + gy[i] * ny;
        if (dot > 0) pos++; else neg++;
        break;
      }
    }
    signs.push(pos >= neg ? 1 : -1);
    if (Math.max(pos, neg) < 0.7 * (pos + neg)) return false;   // 한 변 안에서도 섞이면 아님
  }
  return signs.every((v) => v === signs[0]);
}

/** 변 L(양끝은 A, B 와의 교점) 근처 엣지 점을 모아 직선을 다시 맞춘다(주성분 = 총 최소제곱). */
function refine(L, A, B, edge, ori, mag, gx, gy, w, h) {
  const p = cross(L, A), q = cross(L, B);
  if (!p || !q) return L;
  const xs = [], ys = [];
  const minX = Math.max(2, Math.floor(Math.min(p[0], q[0]) - 3)), maxX = Math.min(w - 3, Math.ceil(Math.max(p[0], q[0]) + 3));
  const minY = Math.max(2, Math.floor(Math.min(p[1], q[1]) - 3)), maxY = Math.min(h - 3, Math.ceil(Math.max(p[1], q[1]) + 3));
  const dx = q[0] - p[0], dy = q[1] - p[1], LL = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const i = y * w + x;
    if (!edge[i]) continue;
    let dt = Math.abs(ori[i] - L.theta);
    if (dt > 90) dt = 180 - dt;
    if (dt > 12) continue;
    const cx = x + 0.5, cy = y + 0.5;
    if (Math.abs(cx * L.c + cy * L.s - L.rho) > 2.5) continue;
    const f = ((cx - p[0]) * dx + (cy - p[1]) * dy) / LL;
    if (f < 0.05 || f > 0.95) continue;
    // 부분 픽셀: 기울기 방향 이웃 세 값으로 포물선 꼭짓점
    const [ox, oy] = NB[dirOf(gx[i], gy[i])];
    const m0 = mag[i - oy * w - ox], m1 = mag[i], m2 = mag[i + oy * w + ox];
    const den = m0 - 2 * m1 + m2;
    const off = den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (m0 - m2) / den)) : 0;
    xs.push(cx + off * ox); ys.push(cy + off * oy);
  }
  if (xs.length < 8) return L;
  let mx = 0, my = 0;
  for (let k = 0; k < xs.length; k++) { mx += xs[k]; my += ys[k]; }
  mx /= xs.length; my /= xs.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (let k = 0; k < xs.length; k++) {
    const u = xs[k] - mx, v = ys[k] - my;
    sxx += u * u; syy += v * v; sxy += u * v;
  }
  // 가장 작은 고유값의 고유벡터 = 법선
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);   // 주축(직선 방향)
  let c = -Math.sin(ang), s = Math.cos(ang);
  if (c * L.c + s * L.s < 0) { c = -c; s = -s; }
  const theta = ((Math.atan2(s, c) / DEG) + 360) % 180;
  let dt = Math.abs(theta - L.theta);
  if (dt > 90) dt = 180 - dt;
  if (dt > 6) return L;                                // 크게 틀어지면 처음 직선 유지
  return { theta: L.theta, c, s, rho: mx * c + my * s };
}

/* ── 기하 ───────────────────────────────────────────── */
const len = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** 화면 좌표(y 아래)에서 시계 방향 볼록 */
function convexCW(q) {
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (z <= 0) return false;
  }
  return true;
}
function polyArea(q) {
  let s = 0;
  for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; s += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(s) / 2;
}
function anglesOk(q, lo, hi) {
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4];
    const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const cosv = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2));
    const ang = Math.acos(Math.max(-1, Math.min(1, cosv))) / DEG;
    if (ang < lo || ang > hi) return false;
  }
  return true;
}
