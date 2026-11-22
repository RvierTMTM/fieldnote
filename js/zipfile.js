/* zipfile.js — zip 쓰기·읽기, JPEG 촬영 시각 EXIF 넣기 (라이브러리 없이. 브라우저와 node 둘 다 동작)
   공개:
     crc32(bytes, crc?) → number                       이어서 계산하려면 앞 결과를 crc 로 넘긴다
     class ZipWriter
       addBlob(name, blob, { crc, date })              이미 CRC 를 아는 파일(사진). 압축하지 않는다(STORE).
                                                       blob 은 복사하지 않고 참조만 한다 → 메모리를 아낀다.
       addBytes(name, bytes, { deflate, date })        작은 파일(기록 파일). deflate:true 면 압축(가능할 때만)
       finish() → Blob                                  zip 한 개(application/zip)
     readZip(blob) → Promise<ZipReader>                중앙 목록만 읽는다(사진 자체는 꺼낼 때 한 장씩)
       reader.entries: [{ name, size, method, … }]
       reader.find(path) → entry|null                  정확히 같거나, 맨 앞 폴더가 하나 더 붙은 경로도 찾는다
       reader.blob(entry) → Promise<Blob>              STORE 는 잘라 오기만, DEFLATE 는 풀어서
       reader.text(entry) → Promise<string>
     jpegWithTime(blob, ms, exif?) → Promise<{ blob, crc, size, wrote }>
        JPEG 에 EXIF(촬영 시각)가 없으면 넣는다. 이미 있으면 그대로. JPEG 가 아니면 그대로.
        exif.dateTimeOriginal·offsetTime(photo-proc.js 가 읽어 둔 값)이 있으면 그 값을, 없으면 ms 를 이 기기 시간대로 쓴다.
        한 번만 읽어 CRC 도 같이 계산한다(zip 에 바로 넣을 수 있게).
     blobCrc(blob) → Promise<number>
   한계: Zip64(4GB 넘는 zip, 파일 65535개 넘음)는 만들지도 읽지도 않는다. 암호 zip 은 못 읽는다. */

/* ── CRC32 ─────────────────────────────────────────── */
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes, crc = 0) {
  let c = (crc ^ 0xFFFFFFFF) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export async function blobCrc(blob) {
  return crc32(new Uint8Array(await blob.arrayBuffer()));
}

const enc = new TextEncoder();

function dosTime(d) {
  const t = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const y = Math.max(1980, d.getFullYear());
  const dt = ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { t, dt };
}

/* ── zip 쓰기 ──────────────────────────────────────── */
export class ZipWriter {
  constructor() {
    this.parts = [];      // Blob 조각(머리글 + 내용) — 내용 Blob 은 참조만
    this.central = [];
    this.offset = 0;
    this.count = 0;
    this.names = new Set();
  }

  _add(name, data, size, csize, crc, method, date) {
    if (this.names.has(name)) throw new Error('zip 안 파일 이름이 겹칩니다: ' + name);
    this.names.add(name);
    const nameBytes = enc.encode(name);
    // Info-ZIP 유니코드 경로(0x7075): UTF-8 표시를 모르는 프로그램용. 영문 이름(PPT 안 파일)에는 붙이지 않는다.
    const ascii = nameBytes.every((b) => b < 0x80);
    const up = new Uint8Array(ascii ? 0 : 4 + 5 + nameBytes.length);
    if (!ascii) {
      const uv = new DataView(up.buffer);
      uv.setUint16(0, 0x7075, true);
      uv.setUint16(2, 5 + nameBytes.length, true);
      up[4] = 1;
      uv.setUint32(5, crc32(nameBytes), true);
      up.set(nameBytes, 9);
    }
    const { t, dt } = dosTime(date || new Date());

    const lh = new Uint8Array(30 + nameBytes.length + up.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);          // 이름은 UTF-8
    lv.setUint16(8, method, true);
    lv.setUint16(10, t, true);
    lv.setUint16(12, dt, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, csize, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, up.length, true);
    lh.set(nameBytes, 30);
    lh.set(up, 30 + nameBytes.length);

    const ch = new Uint8Array(46 + nameBytes.length + up.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 0x031E, true);          // 만든 곳: UNIX, 3.0
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, t, true);
    cv.setUint16(14, dt, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, csize, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, up.length, true);
    cv.setUint32(38, (0o100644 << 16) >>> 0, true);
    cv.setUint32(42, this.offset, true);
    ch.set(nameBytes, 46);
    ch.set(up, 46 + nameBytes.length);

    this.parts.push(lh, data);
    this.central.push(ch);
    this.offset += lh.length + csize;
    this.count++;
    if (this.offset > 0xFFFFFFF0 || this.count > 0xFFF0) throw new Error('내보낼 파일이 너무 큽니다(4GB 또는 6만 개 초과).');
  }

  addBlob(name, blob, { crc, date } = {}) {
    if (typeof crc !== 'number') throw new Error('addBlob 에는 crc 가 필요합니다.');
    this._add(name, blob, blob.size, blob.size, crc, 0, date);
  }

  async addBytes(name, bytes, { deflate = false, date } = {}) {
    const crc = crc32(bytes);
    if (deflate && typeof CompressionStream === 'function') {
      try {
        const comp = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
        if (comp.length < bytes.length) { this._add(name, comp, bytes.length, comp.length, crc, 8, date); return; }
      } catch (e) { /* 압축 못 하면 그대로 */ }
    }
    this._add(name, bytes, bytes.length, bytes.length, crc, 0, date);
  }

  finish() {
    let cdSize = 0;
    for (const c of this.central) cdSize += c.length;
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, this.count, true);
    ev.setUint16(10, this.count, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, this.offset, true);
    return new Blob([...this.parts, ...this.central, end], { type: 'application/zip' });
  }
}

/* ── zip 읽기 ──────────────────────────────────────── */
function decodeName(bytes, utf8) {
  if (utf8) return new TextDecoder().decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { /* 아래로 */ }
  try { return new TextDecoder('euc-kr').decode(bytes); } catch (e) { return new TextDecoder().decode(bytes); }
}

async function bytesOf(blob, start, end) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

export async function readZip(blob) {
  const tailLen = Math.min(blob.size, 22 + 0xFFFF);
  const tail = await bytesOf(blob, blob.size - tailLen, blob.size);
  const tv = new DataView(tail.buffer);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === 0x06054b50) { at = i; break; }
  }
  if (at < 0) throw new Error('zip 파일이 아니거나 깨져 있습니다.');
  const count = tv.getUint16(at + 10, true);
  const cdSize = tv.getUint32(at + 12, true);
  const cdOff = tv.getUint32(at + 16, true);
  if (count === 0xFFFF || cdOff === 0xFFFFFFFF) throw new Error('너무 큰 zip(Zip64)은 불러올 수 없습니다.');
  const cd = await bytesOf(blob, cdOff, cdOff + cdSize);
  const v = new DataView(cd.buffer);
  const entries = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('zip 목록이 깨져 있습니다.');
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const csize = v.getUint32(p + 20, true);
    const size = v.getUint32(p + 24, true);
    const nl = v.getUint16(p + 28, true);
    const xl = v.getUint16(p + 30, true);
    const cl = v.getUint16(p + 32, true);
    const off = v.getUint32(p + 42, true);
    const name = decodeName(cd.subarray(p + 46, p + 46 + nl), (flags & 0x0800) !== 0).replace(/\\/g, '/');
    if (!name.endsWith('/')) entries.push({ name, flags, method, crc, csize, size, off });
    p += 46 + nl + xl + cl;
  }
  return new ZipReader(blob, entries);
}

class ZipReader {
  constructor(blob, entries) {
    this.src = blob;
    this.entries = entries;
    this.byName = new Map(entries.map((e) => [e.name.normalize('NFC'), e]));
  }

  find(path) {
    const want = String(path || '').replace(/\\/g, '/').normalize('NFC');
    if (!want) return null;
    if (this.byName.has(want)) return this.byName.get(want);
    // 압축을 풀었다가 다시 묶으면 맨 앞에 폴더가 하나 더 붙는 경우가 많다
    for (const [n, e] of this.byName) if (n.endsWith('/' + want)) return e;
    return null;
  }

  async blob(e, type = '') {
    if (e.flags & 1) throw new Error('암호가 걸린 zip 은 불러올 수 없습니다.');
    const lh = await bytesOf(this.src, e.off, e.off + 30);
    const lv = new DataView(lh.buffer);
    if (lv.getUint32(0, true) !== 0x04034b50) throw new Error('zip 내용이 깨져 있습니다: ' + e.name);
    const start = e.off + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
    const raw = this.src.slice(start, start + e.csize, type);
    if (e.method === 0) return raw;
    if (e.method === 8) {
      if (typeof DecompressionStream !== 'function') throw new Error('이 브라우저는 압축된 zip 을 풀 수 없습니다.');
      const out = await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      return type ? new Blob([out], { type }) : out;
    }
    throw new Error('지원하지 않는 압축 방식입니다: ' + e.name);
  }

  async text(e) {
    return (await this.blob(e)).text();
  }
}

/* ── JPEG 촬영 시각 EXIF ─────────────────────────────── */
const z2 = (n) => String(n).padStart(2, '0');
function exifDate(d) {
  return d.getFullYear() + ':' + z2(d.getMonth() + 1) + ':' + z2(d.getDate()) + ' ' + z2(d.getHours()) + ':' + z2(d.getMinutes()) + ':' + z2(d.getSeconds());
}
function exifOffset(d) {
  const m = -d.getTimezoneOffset();
  const s = m >= 0 ? '+' : '-';
  return s + z2(Math.floor(Math.abs(m) / 60)) + ':' + z2(Math.abs(m) % 60);
}

/** 최소 EXIF(APP1): IFD0 DateTime + Exif IFD(ExifVersion, DateTimeOriginal, DateTimeDigitized, OffsetTime, OffsetTimeOriginal) */
export function buildExifApp1(ms, given = {}) {
  const d = new Date(ms);
  // 사진에서 미리 읽어 둔 원래 값(카메라 시각·시간대)이 있으면 그것을 쓴다
  const g = /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(given.dateTimeOriginal || '') ? given.dateTimeOriginal : exifDate(d);
  const go = /^[+-]\d{2}:\d{2}$/.test(given.offsetTime || '') ? given.offsetTime : exifOffset(d);
  const dt = g + '\0';                   // 20바이트
  const off = go + '\0';                 // 7바이트
  const ifd0 = [[0x0132, 2, dt], [0x8769, 4, null]];
  const exif = [[0x9000, 7, '0232'], [0x9003, 2, dt], [0x9004, 2, dt], [0x9010, 2, off], [0x9011, 2, off]];
  const size = (list) => 2 + list.length * 12 + 4;
  const extra = (list) => list.reduce((n, [, , v]) => n + (v && v.length > 4 ? v.length + (v.length & 1) : 0), 0);
  const ifd0At = 8;
  const ifd0Data = ifd0At + size(ifd0);
  const exifAt = ifd0Data + extra(ifd0);
  const exifData = exifAt + size(exif);
  const total = exifData + extra(exif);
  const tiff = new Uint8Array(total);
  const v = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 0x2A, 0x00]);
  v.setUint32(4, ifd0At, true);
  const write = (list, at, dataAt) => {
    v.setUint16(at, list.length, true);
    let p = at + 2;
    let q = dataAt;
    for (const [tag, type, val] of list) {
      v.setUint16(p, tag, true);
      v.setUint16(p + 2, type, true);
      if (val == null) { v.setUint32(p + 4, 1, true); v.setUint32(p + 8, exifAt, true); }
      else {
        v.setUint32(p + 4, val.length, true);
        const bytes = enc.encode(val);
        if (bytes.length <= 4) tiff.set(bytes, p + 8);
        else { v.setUint32(p + 8, q, true); tiff.set(bytes, q); q += bytes.length + (bytes.length & 1); }
      }
      p += 12;
    }
    v.setUint32(p, 0, true);
  };
  write(ifd0, ifd0At, ifd0Data);
  write(exif, exifAt, exifData);
  const seg = new Uint8Array(4 + 6 + total);
  seg[0] = 0xFF; seg[1] = 0xE1;
  new DataView(seg.buffer).setUint16(2, 2 + 6 + total);
  seg.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4);
  seg.set(tiff, 10);
  return seg;
}

/** JPEG 머리 훑기 → { isJpeg, hasExif, insertAt } */
function scanJpeg(b) {
  if (b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8) return { isJpeg: false };
  let p = 2;
  let insertAt = 2;
  let first = true;
  while (p + 4 <= b.length && b[p] === 0xFF) {
    const m = b[p + 1];
    if (m === 0xDA || m === 0xD9) break;
    const len = (b[p + 2] << 8) | b[p + 3];
    if (m === 0xE1 && b[p + 4] === 0x45 && b[p + 5] === 0x78 && b[p + 6] === 0x69 && b[p + 7] === 0x66) return { isJpeg: true, hasExif: true };
    if (first && m === 0xE0) insertAt = p + 2 + len;      // JFIF 뒤에 넣는다
    first = false;
    p += 2 + len;
  }
  return { isJpeg: true, hasExif: false, insertAt };
}

export async function jpegWithTime(blob, ms, exif) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const info = scanJpeg(bytes);
  if (!info.isJpeg || info.hasExif || !ms) return { blob, crc: crc32(bytes), size: bytes.length, wrote: false };
  const app1 = buildExifApp1(ms, exif || {});
  let crc = crc32(bytes.subarray(0, info.insertAt));
  crc = crc32(app1, crc);
  crc = crc32(bytes.subarray(info.insertAt), crc);
  // 원본 Blob 을 잘라 붙인다(읽은 바이트를 들고 있지 않게)
  const out = new Blob([blob.slice(0, info.insertAt), app1, blob.slice(info.insertAt)], { type: 'image/jpeg' });
  return { blob: out, crc, size: out.size, wrote: true };
}
