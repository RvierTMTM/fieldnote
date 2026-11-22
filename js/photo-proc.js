/* photo-proc.js — 사진 줄이기·작은 그림·EXIF 읽기 (외부 라이브러리 없음)
   공개:
     processImage(file) → Promise<{ blob, thumb, takenAt, exif }>
        · blob  : 긴 변 2560px 이하로 줄인 JPEG(품질 0.85). 원본이 더 작으면 키우지 않는다. EXIF 방향을 반영해 바로 세운다.
        · thumb : 긴 변 320px JPEG(품질 0.7)
        · exif  : 줄이면 사라지는 메타를 미리 읽어 둔 것(아래 모양). 못 읽으면 file·크기만.
        · 열 수 없는 형식이면 Error(message 는 화면에 그대로 보여 줄 글)
     makeThumb(blob) → Promise<Blob>   보정본 등으로 작은 그림을 다시 만들 때
     readExif(file) → Promise<object|null>   JPEG APP1(Exif) 직접 파싱
   exif 모양:
     { file:{ name, type, size, lastModified }, width, height,        // 바로 세운 원본 크기
       orientation, make, model, dateTimeOriginal, offsetTime,       // EXIF 글자 그대로
       gps:{ lat, lon, alt }|null, saved:{ width, height, maxSide, quality }, manualRotate } */

export const MAX_SIDE = 2560;
export const QUALITY = 0.85;
export const THUMB_SIDE = 320;
const THUMB_QUALITY = 0.7;

/* ── EXIF ─────────────────────────────────────────────── */
export async function readExif(file) {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off + 4 <= v.byteLength) {
      const marker = v.getUint16(off);
      if ((marker & 0xff00) !== 0xff00) break;
      if (marker === 0xffda || marker === 0xffd9) break;          // 그림 본체 시작 → EXIF 없음
      const len = v.getUint16(off + 2);
      if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966 && v.getUint16(off + 8) === 0) {
        return parseTiff(v, off + 10, Math.min(v.byteLength, off + 2 + len));
      }
      off += 2 + len;
    }
  } catch (e) {
    console.warn('EXIF 읽기 실패', e);
  }
  return null;
}

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function parseTiff(v, t, end) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o) => v.getUint16(o, le);
  const u32 = (o) => v.getUint32(o, le);
  const s32 = (o) => v.getInt32(o, le);
  if (u16(t + 2) !== 42) return null;

  const readVal = (type, cnt, o) => {
    if (type === 2) {
      let s = '';
      for (let i = 0; i < cnt; i++) { const c = v.getUint8(o + i); if (!c) break; s += String.fromCharCode(c); }
      return s.trim();
    }
    const arr = [];
    for (let i = 0; i < Math.min(cnt, 16); i++) {
      if (type === 3) arr.push(u16(o + i * 2));
      else if (type === 4) arr.push(u32(o + i * 4));
      else if (type === 9) arr.push(s32(o + i * 4));
      else if (type === 5) { const d = u32(o + i * 8 + 4); arr.push(d ? u32(o + i * 8) / d : 0); }
      else if (type === 10) { const d = s32(o + i * 8 + 4); arr.push(d ? s32(o + i * 8) / d : 0); }
      else arr.push(v.getUint8(o + i));
    }
    return cnt === 1 ? arr[0] : arr;
  };
  const readIfd = (ifdOff) => {
    const out = {};
    const p = t + ifdOff;
    if (!ifdOff || p + 2 > end) return out;
    const n = u16(p);
    for (let i = 0; i < n; i++) {
      const e = p + 2 + i * 12;
      if (e + 12 > end) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const cnt = u32(e + 4);
      const size = (TYPE_SIZE[type] || 0) * cnt;
      if (!size) continue;
      const vo = size <= 4 ? e + 8 : t + u32(e + 8);
      if (vo + size > end) continue;
      out[tag] = readVal(type, cnt, vo);
    }
    return out;
  };

  const ifd0 = readIfd(u32(t + 4));
  const ex = ifd0[0x8769] ? readIfd(ifd0[0x8769]) : {};
  const g = ifd0[0x8825] ? readIfd(ifd0[0x8825]) : {};
  const dms = (a) => (Array.isArray(a) ? a[0] + (a[1] || 0) / 60 + (a[2] || 0) / 3600 : typeof a === 'number' ? a : null);
  let gps = null;
  const lat = dms(g[2]);
  const lon = dms(g[4]);
  if (lat != null && lon != null && (lat || lon)) {
    gps = {
      lat: Math.round(lat * (g[1] === 'S' ? -1 : 1) * 1e7) / 1e7,
      lon: Math.round(lon * (g[3] === 'W' ? -1 : 1) * 1e7) / 1e7,
      alt: typeof g[6] === 'number' ? Math.round(g[6] * (g[5] === 1 ? -1 : 1) * 10) / 10 : null,
    };
  }
  return {
    orientation: typeof ifd0[0x0112] === 'number' ? ifd0[0x0112] : 1,
    make: ifd0[0x010f] || null,
    model: ifd0[0x0110] || null,
    dateTime: ifd0[0x0132] || null,
    dateTimeOriginal: ex[0x9003] || null,
    offsetTime: ex[0x9011] || null,
    pixelW: typeof ex[0xa002] === 'number' ? ex[0xa002] : null,
    pixelH: typeof ex[0xa003] === 'number' ? ex[0xa003] : null,
    gps,
  };
}

/** 'YYYY:MM:DD HH:MM:SS' (+ '+09:00') → ms. 못 읽으면 null */
function exifTime(s, offset) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s || '');
  if (!m) return null;
  if (offset && /^[+-]\d{2}:\d{2}$/.test(offset)) {
    const t = Date.parse(m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + m[6] + offset);
    if (!Number.isNaN(t)) return t;
  }
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/* ── 그리기 ───────────────────────────────────────────── */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });   // EXIF 방향 반영
      return { src: bmp, w: bmp.width, h: bmp.height, free: () => bmp.close && bmp.close() };
    } catch (e) { /* 아래 img 로 */ }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    return null;
  }
  return { src: img, w: img.naturalWidth, h: img.naturalHeight, free: () => URL.revokeObjectURL(url) };
}

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toBlob(canvas, q) {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('사진을 만들지 못했습니다.'))), 'image/jpeg', q));
}

function fit(w, h, max) {
  const s = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

/** 브라우저가 방향을 반영하지 못했을 때만 직접 돌린다(o: EXIF 방향 1~8). cw·ch 는 바로 세운 뒤 크기 */
function drawOriented(ctx, src, o, cw, ch) {
  const sw = o >= 5 ? ch : cw;
  const sh = o >= 5 ? cw : ch;
  switch (o) {
    case 2: ctx.setTransform(-1, 0, 0, 1, cw, 0); break;
    case 3: ctx.setTransform(-1, 0, 0, -1, cw, ch); break;
    case 4: ctx.setTransform(1, 0, 0, -1, 0, ch); break;
    case 5: ctx.setTransform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.setTransform(0, 1, -1, 0, cw, 0); break;
    case 7: ctx.setTransform(0, -1, -1, 0, cw, ch); break;
    case 8: ctx.setTransform(0, -1, 1, 0, 0, ch); break;
    default: break;
  }
  ctx.drawImage(src, 0, 0, sw, sh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function smooth(ctx) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}

async function thumbFrom(src, w, h) {
  const [tw, th] = fit(w, h, THUMB_SIDE);
  const c = canvasOf(tw, th);
  const ctx = c.getContext('2d');
  smooth(ctx);
  ctx.drawImage(src, 0, 0, tw, th);
  const b = await toBlob(c, THUMB_QUALITY);
  c.width = 0; c.height = 0;
  return b;
}

export async function makeThumb(blob) {
  const d = await decode(blob);
  if (!d) throw new Error('사진을 열지 못했습니다.');
  try { return await thumbFrom(d.src, d.w, d.h); } finally { d.free(); }
}

export async function processImage(file) {
  const ex = (/jpe?g/i.test(file.type) || !file.type) ? await readExif(file) : null;
  const d = await decode(file);
  if (!d) throw new Error('이 사진은 열 수 없는 형식입니다(HEIC 등).\n카메라 설정에서 JPEG로 바꾸거나 다른 사진을 골라 주세요.');
  try {
    const o = ex && ex.orientation >= 2 && ex.orientation <= 8 ? ex.orientation : 1;
    // 방향 5~8(옆으로 누움)인데 가로·세로가 EXIF 크기와 같으면 브라우저가 돌리지 않은 것 → 직접 돌린다
    const manual = o >= 5 && ex.pixelW && ex.pixelH && ex.pixelW !== ex.pixelH && d.w === ex.pixelW && d.h === ex.pixelH;
    const W = manual ? d.h : d.w;
    const H = manual ? d.w : d.h;
    const [w, h] = fit(W, H, MAX_SIDE);
    const c = canvasOf(w, h);
    const ctx = c.getContext('2d');
    smooth(ctx);
    if (manual) drawOriented(ctx, d.src, o, w, h);
    else ctx.drawImage(d.src, 0, 0, w, h);
    const blob = await toBlob(c, QUALITY);
    const thumb = await thumbFrom(c, w, h);
    c.width = 0; c.height = 0;

    const exif = {
      file: { name: file.name || '', type: file.type || '', size: file.size || 0, lastModified: file.lastModified || null },
      width: W, height: H,
      orientation: ex ? ex.orientation : null,
      make: ex ? ex.make : null,
      model: ex ? ex.model : null,
      dateTimeOriginal: ex ? (ex.dateTimeOriginal || ex.dateTime) : null,
      offsetTime: ex ? ex.offsetTime : null,
      gps: ex ? ex.gps : null,
      saved: { width: w, height: h, maxSide: MAX_SIDE, quality: QUALITY },
      manualRotate: !!manual,
    };
    const takenAt = (ex && exifTime(ex.dateTimeOriginal || ex.dateTime, ex.offsetTime)) || file.lastModified || Date.now();
    return { blob, thumb, takenAt, exif };
  } finally {
    d.free();
  }
}
