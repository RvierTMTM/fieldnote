/* tools/qr.js — QR 코드 만들기(외부 라이브러리 없이 직접 구현)
   공개:
     qrMatrix(text) → boolean[][]            true = 검은 칸. 너무 길면 Error
     qrSvg(text, { margin=4 }) → SVGElement  화면에 붙일 그림(크기는 CSS 로 조절)
     QR_MAX_BYTES                             담을 수 있는 최대 길이(UTF-8 바이트)
   규격: QR Code Model 2, 바이트 모드, 오류 정정 L, 버전 1~40 자동 선택, 마스크 8종 중 벌점이 가장 낮은 것.
   주의: 이 구현은 아직 실제 스캐너로 확인하지 않았다(테스트 지시 전). 통합 때 폰으로 한 번 읽어 볼 것. */

// 오류 정정 L: 버전별 [블록당 오류 정정 코드워드 수], [블록 수]   (index 0 은 안 씀)
const ECC_PER_BLOCK = [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30];
const NUM_BLOCKS = [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25];
const FORMAT_ECL_L = 1;   // 형식 정보의 오류 정정 수준 비트(L = 01)

function rawModules(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const a = Math.floor(ver / 7) + 2;
    n -= (25 * a - 10) * a - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}
function dataCodewords(ver) {
  return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
}
const countBits = (ver) => (ver <= 9 ? 8 : 16);

export const QR_MAX_BYTES = Math.floor((dataCodewords(40) * 8 - 4 - 16) / 8);

/* ── GF(256) 리드-솔로몬 ── */
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}
function rsDivisor(degree) {
  const res = new Array(degree).fill(0);
  res[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      res[j] = gfMul(res[j], root);
      if (j + 1 < degree) res[j] ^= res[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return res;
}
function rsRemainder(data, divisor) {
  const res = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ res.shift();
    res.push(0);
    for (let i = 0; i < divisor.length; i++) res[i] ^= gfMul(divisor[i], factor);
  }
  return res;
}

/* ── 자료 → 코드워드 ── */
function encodeData(bytes) {
  let ver = 0;
  for (let v = 1; v <= 40; v++) {
    if (4 + countBits(v) + bytes.length * 8 <= dataCodewords(v) * 8) { ver = v; break; }
  }
  if (!ver) throw new Error('QR에 담기에는 링크가 너무 깁니다.');
  const bits = [];
  const push = (value, len) => { for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(0x4, 4);                         // 바이트 모드
  push(bytes.length, countBits(ver));
  for (const b of bytes) push(b, 8);
  const cap = dataCodewords(ver) * 8;
  push(0, Math.min(4, cap - bits.length));          // 끝 표시
  push(0, (8 - (bits.length % 8)) % 8);             // 바이트 경계 맞춤
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }
  return { ver, data };
}

function addEccAndInterleave(ver, data) {
  const numBlocks = NUM_BLOCKS[ver];
  const eccLen = ECC_PER_BLOCK[ver];
  const rawCodewords = Math.floor(rawModules(ver) / 8);
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortLen = Math.floor(rawCodewords / numBlocks);
  const div = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < numShort) dat.push(0);                 // 자리 맞춤(아래에서 건너뜀)
    blocks.push(dat.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      if (i !== shortLen - eccLen || j >= numShort) out.push(blocks[j][i]);
    }
  }
  return out;
}

/* ── 무늬 그리기 ── */
function alignPositions(ver, size) {
  if (ver === 1) return [];
  const num = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (num * 2 - 2)) * 2;
  const res = [6];
  for (let pos = size - 7; res.length < num; pos -= step) res.splice(1, 0, pos);
  return res;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

export function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  const { ver, data } = encodeData(bytes);
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));   // mod[y][x]
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));    // 기능 무늬 자리
  const setFn = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
  const bit = (v, i) => ((v >>> i) & 1) !== 0;

  const drawFormat = (mask) => {
    const d = (FORMAT_ECL_L << 3) | mask;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((d << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(bits, i));
    setFn(8, 7, bit(bits, 6));
    setFn(8, 8, bit(bits, 7));
    setFn(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(bits, i));
    setFn(8, size - 8, true);
  };

  // 타이밍 무늬
  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  // 위치 찾기 무늬(세 모서리)
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, dist !== 2 && dist !== 4);
      }
    }
  }
  // 정렬 무늬
  const ap = alignPositions(ver, size);
  const na = ap.length;
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) setFn(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  drawFormat(0);     // 자리 잡기(값은 나중에 다시 그림)
  // 버전 정보(7 이상)
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(a, b, bit(bits, i));
      setFn(b, a, bit(bits, i));
    }
  }

  // 코드워드 채우기(오른쪽 아래부터 지그재그)
  const all = addEccAndInterleave(ver, data);
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && k < all.length * 8) {
          mod[y][x] = bit(all[k >>> 3], 7 - (k & 7));
          k++;
        }
      }
    }
  }

  const applyMask = (m) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x];
    }
  };

  const penalty = () => {
    let p = 0;
    const line = (get) => {
      // 같은 색이 5칸 이상 이어짐 + 위치 찾기 무늬처럼 보이는 배열(1011101 과 양옆 흰 칸 4개)
      let run = 1;
      for (let i = 1; i < size; i++) {
        if (get(i) === get(i - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
      }
      for (let i = 0; i + 10 < size; i++) {
        const s = (o) => get(i + o);
        const core = (o) => s(o) && !s(o + 1) && s(o + 2) && s(o + 3) && s(o + 4) && !s(o + 5) && s(o + 6);
        if (core(0) && !s(7) && !s(8) && !s(9) && !s(10)) p += 40;
        if (!s(0) && !s(1) && !s(2) && !s(3) && core(4)) p += 40;
      }
    };
    for (let y = 0; y < size; y++) line((i) => mod[y][i]);
    for (let x = 0; x < size; x++) line((i) => mod[i][x]);
    let dark = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (mod[y][x]) dark++;
        if (x + 1 < size && y + 1 < size) {
          const c = mod[y][x];
          if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;   // 2×2 같은 색
        }
      }
    }
    const total = size * size;
    p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;   // 검은 칸 비율이 50%에서 벗어난 정도
    return p;
  };

  let best = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormat(m);
    const score = penalty();
    if (score < bestScore) { bestScore = score; best = m; }
    applyMask(m);                // 되돌리기(같은 마스크를 두 번 씌우면 원래대로)
  }
  applyMask(best);
  drawFormat(best);
  return mod;
}

export function qrSvg(text, { margin = 4 } = {}) {
  const m = qrMatrix(text);
  const n = m.length + margin * 2;
  let d = '';
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m.length; x++) if (m[y][x]) d += 'M' + (x + margin) + ' ' + (y + margin) + 'h1v1h-1z';
  }
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + n + ' ' + n);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '사업 링크 QR');
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', n); bg.setAttribute('height', n); bg.setAttribute('fill', '#fff');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', '#000');
  svg.append(bg, path);
  return svg;
}
