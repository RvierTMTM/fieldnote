/* warp.js — 원근 보정 계산(순수 함수. DOM 없음 → 워커·node 검사에서도 그대로 쓴다)
   공개:
     homography(src4, dst4) → H[9]        src 점을 dst 점으로 보내는 3×3 행렬(행 우선, H[8]=1)
     invert3(H) → H⁻¹[9]
     mapPoint(H, x, y) → [x, y]
     quadSize(pts, maxSide) → {w, h}      네 변 길이로 결과 크기 추정(비율 유지, 긴 변 maxSide 이하)
     rectToQuad(pts, w, h) → H            결과 사각형(0,0)-(w,h) 의 점 → 원본 사진 좌표
     warpRGBA(src, dst, Hinv, y0, y1, fill)   역매핑 + 쌍선형 보간. dst 의 y0~y1 줄만 채운다(조각 처리용)
     isConvexQuad(pts), quadArea(pts), inscribedScale(w, h, rad)
   좌표: 점 [x,y] 는 사진 픽셀 좌표(왼쪽 위 0,0, 픽셀 i 는 i~i+1 구간). 점 순서는 결과의 좌상→우상→우하→좌하. */

/** 4점 → 4점 호모그래피. 8×8 연립방정식을 부분 피벗 가우스 소거로 푼다. */
export function homography(src, dst) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) throw new Error('점 네 개가 사각형을 이루지 않습니다');
    if (p !== c) { const t = A[p]; A[p] = A[c]; A[c] = t; }
    const pc = A[c][c];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / pc;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  const h = new Array(9);
  for (let i = 0; i < n; i++) h[i] = A[i][n] / A[i][i];
  h[8] = 1;
  return h;
}

export function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-18) throw new Error('역행렬 없음');
  const r = [
    A, -(b * i - c * h), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * h - b * g), a * e - b * d,
  ];
  const s = r[8] !== 0 ? r[8] : det;
  return r.map((v) => v / s);
}

export function mapPoint(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/** 네 변 길이로 결과 크기 추정. 비율 = (위+아래)/(왼+오), 크기는 가장 긴 변이 줄지 않게, 긴 변은 maxSide 이하. */
export function quadSize(pts, maxSide = 2560) {
  const top = dist(pts[0], pts[1]), bottom = dist(pts[3], pts[2]);
  const left = dist(pts[0], pts[3]), right = dist(pts[1], pts[2]);
  let w = (top + bottom) / 2, h = (left + right) / 2;
  if (!(w > 0 && h > 0)) return { w: 1, h: 1 };
  const k = Math.max(Math.max(top, bottom) / w, Math.max(left, right) / h);
  w *= k; h *= k;
  const cap = maxSide / Math.max(w, h);
  if (cap < 1) { w *= cap; h *= cap; }
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

/** 결과 사각형 좌표 → 원본 좌표 행렬(역매핑에 바로 쓴다). */
export function rectToQuad(pts, w, h) {
  return homography([[0, 0], [w, 0], [w, h], [0, h]], pts);
}

/** 역매핑 + 쌍선형 보간. src/dst = { data: Uint8ClampedArray(RGBA), width, height }.
    Hinv: 결과 좌표 → 원본 좌표. 원본 밖은 fill(기본 흰색). */
export function warpRGBA(src, dst, Hinv, y0 = 0, y1 = dst.height, fill = [255, 255, 255]) {
  const sw = src.width, sh = src.height, s = src.data;
  const dw = dst.width, d = dst.data;
  const [a, b, c, e, f, g, p, q, r] = Hinv;
  const fr = fill[0], fg = fill[1], fb = fill[2];
  const maxX = sw - 1, maxY = sh - 1;
  for (let y = y0; y < y1; y++) {
    const yc = y + 0.5;
    let X = a * 0.5 + b * yc + c;
    let Y = e * 0.5 + f * yc + g;
    let W = p * 0.5 + q * yc + r;
    let o = y * dw * 4;
    for (let x = 0; x < dw; x++, o += 4, X += a, Y += e, W += p) {
      const u = X / W - 0.5, v = Y / W - 0.5;
      if (!(u > -1 && v > -1 && u < sw && v < sh)) {
        d[o] = fr; d[o + 1] = fg; d[o + 2] = fb; d[o + 3] = 255;
        continue;
      }
      let x0 = Math.floor(u), y0i = Math.floor(v);
      const fx = u - x0, fy = v - y0i;
      let x1 = x0 + 1, y1i = y0i + 1;
      if (x0 < 0) x0 = 0; if (x1 > maxX) x1 = maxX; if (x0 > maxX) x0 = maxX; if (x1 < 0) x1 = 0;
      if (y0i < 0) y0i = 0; if (y1i > maxY) y1i = maxY; if (y0i > maxY) y0i = maxY; if (y1i < 0) y1i = 0;
      const r0 = y0i * sw, r1 = y1i * sw;
      const i00 = (r0 + x0) * 4, i01 = (r0 + x1) * 4, i10 = (r1 + x0) * 4, i11 = (r1 + x1) * 4;
      for (let k = 0; k < 3; k++) {
        const t = s[i00 + k] + (s[i01 + k] - s[i00 + k]) * fx;
        const bo = s[i10 + k] + (s[i11 + k] - s[i10 + k]) * fx;
        d[o + k] = t + (bo - t) * fy;
      }
      d[o + 3] = 255;
    }
  }
  return dst;
}

/** 볼록 사각형인지(꼬이거나 오목하면 false). 방향은 상관없음. */
export function isConvexQuad(pts) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], c = pts[(i + 2) % 4];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(z) < 1e-9) return false;
    const s = Math.sign(z);
    if (!sign) sign = s; else if (s !== sign) return false;
  }
  return true;
}

export function quadArea(pts) {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

/** w×h 사각형을 rad 만큼 돌렸을 때 그 안에 들어가는 같은 비율 사각형의 배율(0~1). */
export function inscribedScale(w, h, rad) {
  const c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
  return Math.min(w / (w * c + h * s), h / (w * s + h * c));
}
