/* link.js — 사업 링크 만들기·읽기 (저장소를 건드리지 않는 순수 변환. tools/link.html 도 같이 쓴다)
   공개:
     encodeProjectLink(project) → Promise<string>    '#p=' 뒤에 붙일 글자
     decodeProjectLink(code)    → Promise<project>   잘못된 링크면 Error
     buildLinkUrl(appUrl, code) → string
     newId()                                        짧은 ID 만들기
   project 모양(앱 안에서 쓰는 모양):
     { id, name, from, to, sites: [ { id, name, places: [ { id, name, kind } ] } ] }
   링크 형식: JSON(짧은 키) → UTF-8 → deflate-raw(CompressionStream) → base64url
     { v:1, i:사업ID, n:사업명, f:시작일, t:종료일, s:[ { i, n, p:[ { i, n, k } ] } ] }
   사업 정보는 주소의 # 뒤에만 들어가므로 서버(깃허브)로 전송되지 않는다. */

const MAX_BYTES = 512 * 1024;       // 압축을 푼 크기 한도
const ID_RE = /^[A-Za-z0-9_]{1,40}$/;

export function newId(len = 8) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => (b % 36).toString(36)).join('');
}

function toB64u(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64u(text) {
  const clean = String(text).replace(/[^A-Za-z0-9_-]/g, '');
  const b64 = clean.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((clean.length + 3) % 4);
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function pump(bytes, transform, limit) {
  const reader = new Blob([bytes]).stream().pipeThrough(transform).getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (limit && n > limit) { await reader.cancel(); throw new Error('링크 내용이 너무 큽니다.'); }
    chunks.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** 앱 안 모양으로 정리하면서 검사한다. 문제가 있으면 Error. */
function normalize(p) {
  const id = str(p.id, 40);
  if (!ID_RE.test(id)) throw new Error('실사 ID가 올바르지 않습니다.');
  const name = str(p.name, 100);
  if (!name) throw new Error('실사명이 없습니다.');
  const sites = (Array.isArray(p.sites) ? p.sites : []).slice(0, 100).map((s) => ({
    id: str(s && s.id, 40),
    name: str(s && s.name, 100),
    places: (Array.isArray(s && s.places) ? s.places : []).slice(0, 300).map((q) => ({
      id: str(q && q.id, 40), name: str(q && q.name, 100), kind: str(q && q.kind, 40) || null,
    })).filter((q) => q.name),
  })).filter((s) => s.name);
  return { id, name, from: day(p.from), to: day(p.to), sites };
}

export async function encodeProjectLink(project) {
  const p = normalize(project);
  const wire = {
    v: 1, i: p.id, n: p.name, f: p.from || undefined, t: p.to || undefined,
    s: p.sites.map((s) => ({ i: s.id, n: s.name, p: s.places.map((q) => ({ i: q.id, n: q.name, k: q.kind || undefined })) })),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(wire));
  return toB64u(await pump(bytes, new CompressionStream('deflate-raw')));
}

export async function decodeProjectLink(code) {
  const raw = await pump(fromB64u(code), new DecompressionStream('deflate-raw'), MAX_BYTES);
  const w = JSON.parse(new TextDecoder().decode(raw));
  if (!w || typeof w !== 'object' || w.v !== 1) throw new Error('알 수 없는 링크 형식입니다.');
  return normalize({
    id: w.i, name: w.n, from: w.f, to: w.t,
    sites: (Array.isArray(w.s) ? w.s : []).map((s) => ({
      id: s && s.i, name: s && s.n,
      places: (Array.isArray(s && s.p) ? s.p : []).map((q) => ({ id: q && q.i, name: q && q.n, kind: q && q.k })),
    })),
  });
}

export function buildLinkUrl(appUrl, code) {
  return String(appUrl).replace(/#.*$/, '') + '#p=' + code;
}
