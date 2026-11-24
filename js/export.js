/* export.js — 저장 후 내보내기(zip) · PC에서 이어서 하기(불러오기)
   공개:
     exportModel(projectId) → Promise<model>     사업 하나의 전체 자료를 한 객체로 꺼낸다(사진 Blob 은 빼고)
     getPhotoBlob(photoId, which) → Promise<Blob|null>   which: 'blob'(기본)|'thumb'|'corrected'
     runExport(projectId) → Promise<boolean>     "저장 후 내보내기" 버튼. zip 1개를 만들어 내려받게 한다. 끝났으면 true
     estimateExportSize(projectId) → Promise<number|null>   내보낼 zip 크기 어림(바이트)
     importModel(input, opts) → Promise<result>  zip 또는 기록 파일(File/Blob) 또는 model 객체를 불러와 합친다
     openImport(ctx) → Promise                   파일 고르기 → 불러오기 → 그 실사 홈으로
     RECORD_NAME, FORMAT, FORMAT_VERSION
   zip 구조·기록 파일 형식·이름 규칙: docs/ARCH.md 7절.
   메모리: 사진은 한 장씩 읽어 PPT용으로 줄이고, 원본은 zip 에 Blob 참조로만 붙인다(js/zipfile.js).
   라이브러리: vendor/pptxgen.bundle.min.js (PptxGenJS 4.0.1 + JSZip 3.10.1) 를 내보낼 때만 읽는다. */
import * as db from './db.js';
import { getProject, projectNodes, nameOf, markExported } from './store.js';
import { getSettings, setSetting } from './settings.js';
import { h, alertDialog, confirmDialog, promptText, openOverlay, closeOverlay, closeAllOverlays, dialog, toast, sheet } from './ui.js';
import { ZipWriter, readZip, jpegWithTime, blobCrc } from './zipfile.js';
import { buildOutline, assignNames, zipBaseName } from './zipname.js';
import { buildPptx, TEAM_NAME } from './pptx-build.js';

export const FORMAT = 'fieldnote-record';
export const FORMAT_VERSION = 1;
export const RECORD_NAME = '기록_fieldnote.json';

const PPT_LONG = 1280;        // PPT용 사진 긴 변(px)
const PPT_QUALITY = 0.72;
/* 크기 어림용 값(예시 실사 3건을 실제로 내보낸 크기와 맞춰 정함: 오차 ±5% 안) */
const PPT_BASE = 40 * 1024;         // PPT 뼈대(마스터·테마·CI)
const PPT_PER_SLIDE = 4 * 1024;     // 장표 한 장의 글·표(xml 압축 뒤)
const PPT_PHOTO_MAX = 260 * 1024;   // PPT 안 사진 한 장 상한(긴 변 1280px, 품질 0.72)
const REC_PER_NODE = 300;           // 기록 파일(압축) 노드 하나
const REC_PER_PHOTO = 250;          // 기록 파일(압축) 사진 하나(EXIF 포함)

/* ── 자료 꺼내기 ─────────────────────────────────────── */
function correctedMeta(c) {
  if (!c) return null;
  const out = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === 'blob' || k === 'thumb') continue;
    if (v instanceof Blob || ArrayBuffer.isView(v) || v instanceof ArrayBuffer) continue;
    out[k] = v;
  }
  out.type = c.blob ? c.blob.type : '';
  out.size = c.blob ? c.blob.size : 0;
  return out;
}

export async function exportModel(projectId) {
  const project = await getProject(projectId);
  if (!project) throw new Error('실사를 찾지 못했습니다.');
  const nodes = (await projectNodes(projectId)).sort((a, b) => a.order - b.order);
  const photosRaw = await db.byIndex('photos', 'projectId', projectId);
  const photos = photosRaw
    .sort((a, b) => (a.ownerPath === b.ownerPath ? (a.slot === b.slot ? a.order - b.order : a.slot < b.slot ? -1 : 1) : a.ownerPath < b.ownerPath ? -1 : 1))
    .map((p) => ({
      id: p.id, ownerPath: p.ownerPath, slot: p.slot, order: p.order, source: p.source,
      takenAt: p.takenAt, exif: p.exif, hasCorrected: !!(p.corrected && p.corrected.blob), createdAt: p.createdAt, changedAt: p.changedAt || null, meta: p.meta,
      size: p.blob ? p.blob.size : 0, type: p.blob ? p.blob.type : '',
      corrected: correctedMeta(p.corrected), correctedType: p.corrected && p.corrected.blob ? p.corrected.blob.type : '',
    }));
  const kids = new Map();
  for (const n of nodes) {
    if (!kids.has(n.parentId)) kids.set(n.parentId, []);
    kids.get(n.parentId).push(n);
  }
  const branch = (parentId) => (kids.get(parentId) || []).map((n) => ({ id: n.id, type: n.type, name: nameOf(n), children: branch(n.id) }));
  const s = getSettings();
  return {
    format: FORMAT, formatVersion: FORMAT_VERSION,
    schema: 1, app: 'fieldnote', exportedAt: Date.now(), surveyor: s.surveyor || '',
    project, nodes, tree: branch(projectId), photos,
  };
}

export async function getPhotoBlob(photoId, which = 'blob') {
  const p = await db.get('photos', photoId);
  if (!p) return null;
  if (which === 'thumb') return p.thumb || null;
  if (which === 'corrected') return (p.corrected && p.corrected.blob) || null;
  return p.blob || null;
}

/* ── 크기 어림 ───────────────────────────────────────── */
/** PPT 안에 들어갈 사진 한 장의 크기 어림: 보정본이 있으면 보정본을, 긴 변이 1280px 보다 크면 넓이 비율만큼(제곱) 줄여서.
    줄인 크기(exif.saved)를 모르면 400KB 넘는 사진은 2560px 로 본다. */
function pptPhotoBytes(p) {
  const src = (p.corrected && p.corrected.blob ? p.corrected.blob.size : 0) || (p.blob ? p.blob.size : 0);
  const sv = p.exif && p.exif.saved;
  const side = (sv && (sv.maxSide || Math.max(sv.width || 0, sv.height || 0))) || (src > 400 * 1024 ? 2560 : 0);
  const scale = side > PPT_LONG ? (PPT_LONG / side) ** 2 : 1;
  return Math.min(PPT_PHOTO_MAX, Math.max(6 * 1024, src * scale * 1.05));
}

/** 장표 수 어림(pptx-build.js 순서와 같은 종류): 표지 + 장소(전경) + NW공사 입력 있는 장소 + 설치 지점 + FDF·패치판넬 선번장 + 경로 + 자유 추가 + 사진 넘침(계속) */
function slideCount(nodes, photos) {
  const of = (t) => nodes.filter((n) => n.type === t);
  const places = of('place');
  const cond = places.filter((n) => Object.keys(n.data || {}).some((k) => k.startsWith('cond_') && n.data[k] && n.data[k].v != null)
    || photos.some((p) => p.ownerPath === n.path && p.slot === 'cond')).length;
  const lines = (n, k) => n.data && n.data[k] && Array.isArray(n.data[k].v) && n.data[k].v.length;
  const devs = of('device');
  const fdf = devs.filter((n) => lines(n, 'fdfLines')).length;
  const utp = devs.filter((n) => lines(n, 'utpLines')).length;
  return 1 + places.length + cond + of('point').length + fdf + utp + of('route').length + of('extra').length + Math.ceil(photos.length / 10);
}

/** 내보낼 zip 크기 어림(바이트) = 원본 사진 + 보정본 + PPT(뼈대 + 장표 글 + 사진 줄인 것) + 기록 파일 + zip 머리 */
export async function estimateExportSize(projectId) {
  try {
    const [photos, nodes] = await Promise.all([db.byIndex('photos', 'projectId', projectId), projectNodes(projectId)]);
    let n = PPT_BASE + slideCount(nodes, photos) * PPT_PER_SLIDE + nodes.length * REC_PER_NODE + photos.length * REC_PER_PHOTO;
    for (const p of photos) {
      const orig = p.blob ? p.blob.size : 0;
      const corr = p.corrected && p.corrected.blob ? p.corrected.blob.size : 0;
      n += orig + corr + 400 + pptPhotoBytes(p);
    }
    return n;
  } catch (e) {
    return null;
  }
}

/* ── 브라우저에서만 쓰는 도구 ─────────────────────────── */
let libPromise = null;
function loadLib() {
  if (globalThis.PptxGenJS) return Promise.resolve(globalThis.PptxGenJS);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/pptxgen.bundle.min.js', import.meta.url).href;
      s.onload = () => (globalThis.PptxGenJS ? resolve(globalThis.PptxGenJS) : reject(new Error('PPT 도구가 비어 있습니다.')));
      s.onerror = () => { libPromise = null; reject(new Error('PPT 도구 파일을 읽지 못했습니다. 인터넷이 될 때 앱을 한 번 열어 주세요.')); };
      document.head.append(s);
    });
  }
  return libPromise;
}

function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function blobToData(blob) {
  return (blob.type || 'image/jpeg') + ';base64,' + bytesToB64(new Uint8Array(await blob.arrayBuffer()));
}

/** 사진 하나를 긴 변 max px JPEG 로 줄인다 → { blob, w, h } (못 읽으면 null) */
async function shrink(blob, max, quality) {
  let bmp;
  try { bmp = await createImageBitmap(blob); } catch (e) { return null; }
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * r));
  const h2 = Math.max(1, Math.round(bmp.height * r));
  let out;
  if (typeof OffscreenCanvas === 'function') {
    const c = new OffscreenCanvas(w, h2);
    c.getContext('2d').drawImage(bmp, 0, 0, w, h2);
    out = await c.convertToBlob({ type: 'image/jpeg', quality });
  } else {
    const c = document.createElement('canvas');
    c.width = w; c.height = h2;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h2);
    out = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
  }
  if (bmp.close) bmp.close();
  return out ? { blob: out, w, h: h2 } : null;
}

async function pptImage(photo) {
  const src = (photo.hasCorrected && (await getPhotoBlob(photo.id, 'corrected'))) || (await getPhotoBlob(photo.id));
  if (!src) return null;
  const s = await shrink(src, PPT_LONG, PPT_QUALITY);
  if (!s) return null;
  return { data: await blobToData(s.blob), w: s.w, h: s.h };
}

async function loadCi() {
  try {
    const res = await fetch(new URL('../assets/ci.png', import.meta.url).href);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const v = new DataView(bytes.buffer);
    const w = v.getUint32(16);
    const hh = v.getUint32(20);
    return { data: 'image/png;base64,' + bytesToB64(bytes), w, h: hh };
  } catch (e) {
    return null;
  }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, style: 'display:none' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2 * 60 * 1000);
}

function sizeText(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + 'KB';
  return (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + 'MB';
}

/** 진행 창(✕·뒤로 가기로 닫으면 멈춘다) */
function progressBox(title) {
  const bar = h('progress', { max: '100', value: '0', style: 'width:100%;height:1.2rem;margin:.6rem 0' });
  const line = h('p', null, '준비 중…');
  const state = { cancelled: false, finished: false };
  const box = h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'dlg-h' }, h('b', null, title),
      h('button', { type: 'button', class: 'more', 'aria-label': '멈추기', onclick: () => closeOverlay() }, '✕')),
    line, bar,
    h('p', { class: 'hint' }, '끝날 때까지 화면을 켜 두세요. ✕를 누르면 멈춥니다.'));
  openOverlay(box, { kind: 'dialog', dismissable: false, onClose: () => { if (!state.finished) state.cancelled = true; } });
  return {
    state,
    set(pct, text) { bar.value = String(Math.max(0, Math.min(100, Math.round(pct)))); if (text) line.textContent = text; },
    check() { if (state.cancelled) throw Object.assign(new Error('멈췄습니다.'), { cancelled: true }); },
    async close() { state.finished = true; if (!state.cancelled) await closeOverlay(); },
  };
}

/* ── 저장 후 내보내기 ─────────────────────────────────── */
/** PptxGenJS 는 압축 없이(STORE) 묶는다. 글자 파일(xml)만 압축해 다시 묶고 사진은 그대로 옮긴다. */
async function repackPptx(blob, date) {
  const src = await readZip(blob);
  const out = new ZipWriter();
  for (const e of src.entries) {
    if (/\.(xml|rels)$/i.test(e.name)) await out.addBytes(e.name, new Uint8Array(await (await src.blob(e)).arrayBuffer()), { deflate: true, date });
    else out.addBlob(e.name, await src.blob(e), { crc: e.crc, date });
  }
  return new Blob([out.finish()], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

/** 브라우저와 무관한 zip 만들기(node 검사에서도 부른다).
    io: { photoBlob(id, which), pptImage(photo), PptxGenJS, ci, team, pptOutputType, onStep(pct, text), check() } */
export async function buildExportZip(model, io) {
  const step = io.onStep || (() => {});
  const check = io.check || (() => {});
  const outline = buildOutline(model);
  const names = assignNames(outline);
  const base = zipBaseName(model.project.name, model.surveyor, model.exportedAt);
  const zip = new ZipWriter();
  const now = new Date(model.exportedAt);

  // 1) PPT — 사진을 한 장씩 줄여 넣는다
  step(1, 'PPT 만드는 중…');
  const ppt = await buildPptx({
    PptxGenJS: io.PptxGenJS, outline, names, ci: io.ci, team: io.team || TEAM_NAME,
    exportedAt: model.exportedAt, surveyor: model.surveyor,
    image: async (p) => { check(); return io.pptImage(p); },
    onPhoto: (i, n) => step(2 + (60 * i) / Math.max(1, n), 'PPT 사진 ' + i + ' / ' + n),
    outputType: io.pptOutputType,
  });
  check();
  step(64, 'PPT 묶는 중…');
  const pptBlob = await repackPptx(ppt instanceof Blob ? ppt : new Blob([ppt]), now);
  zip.addBlob(base + '.pptx', pptBlob, { crc: await blobCrc(pptBlob), date: now });

  // 2) 원본 사진(보정 전) + 보정본 — 한 장씩, 촬영 시각 EXIF 넣기
  const files = [];
  const total = model.photos.length;
  const order = new Map([...names.keys()].map((id, n) => [id, n]));     // PPT 장표 순서대로 담는다
  const photos = model.photos.slice().sort((a, b) => order.get(a.id) - order.get(b.id));
  let i = 0;
  for (const p of photos) {
    check();
    i++;
    step(66 + (30 * i) / Math.max(1, total), '원본 사진 ' + i + ' / ' + total);
    const nm = names.get(p.id);
    const rec = { id: p.id, file: null, correctedFile: null, exifWritten: false };
    const blob = await io.photoBlob(p.id, 'blob');
    if (blob) {
      const r = await jpegWithTime(blob, p.takenAt || p.createdAt, p.exif);
      zip.addBlob(nm.file, r.blob, { crc: r.crc, date: new Date(p.takenAt || p.createdAt || model.exportedAt) });
      rec.file = nm.file;
      rec.exifWritten = r.wrote;
    }
    if (p.hasCorrected && nm.correctedFile) {
      const cb = await io.photoBlob(p.id, 'corrected');
      if (cb) {
        const r = await jpegWithTime(cb, p.takenAt || p.createdAt, p.exif);
        zip.addBlob(nm.correctedFile, r.blob, { crc: r.crc, date: new Date(p.takenAt || p.createdAt || model.exportedAt) });
        rec.correctedFile = nm.correctedFile;
      }
    }
    files.push(rec);
  }

  // 3) 기록 파일 — model + 사진마다 zip 안 경로
  step(97, '기록 파일 쓰는 중…');
  const byId = new Map(files.map((f) => [f.id, f]));
  const record = {
    ...model,
    files: { ppt: base + '.pptx', photosDir: '사진/' },
    photos: model.photos.map((p) => {
      const f = byId.get(p.id) || {};
      const nm = names.get(p.id) || {};
      return { ...p, name: nm.base || null, file: f.file || null, correctedFile: f.correctedFile || null, exifWritten: !!f.exifWritten };
    }),
  };
  await zip.addBytes(RECORD_NAME, new TextEncoder().encode(JSON.stringify(record, null, 1)), { deflate: true, date: now });
  step(100, '마무리…');
  return { blob: zip.finish(), name: base + '.zip', record };
}

export async function runExport(projectId) {
  const s = getSettings();
  if (!s.surveyor) {
    const name = await promptText({ title: '실사자 이름', label: '파일 이름과 PPT 표지에 들어갑니다. 비워 두면 이름 없이 내보냅니다.', placeholder: '예: 홍길동', ok: '확인' });
    if (name) setSetting('surveyor', name);
  }
  const prog = progressBox('저장 후 내보내기');
  let out;
  try {
    const [PptxGenJS, ci] = await Promise.all([loadLib(), loadCi()]);
    prog.check();
    const model = await exportModel(projectId);
    out = await buildExportZip(model, {
      PptxGenJS, ci,
      photoBlob: getPhotoBlob,
      pptImage,
      onStep: (pct, text) => prog.set(pct, text),
      check: () => prog.check(),
    });
    await prog.close();
  } catch (e) {
    const stopped = e && e.cancelled;
    await prog.close();
    if (!stopped) console.error(e);
    await alertDialog('저장 후 내보내기', stopped ? '내보내기를 멈췄습니다. 기록은 이 폰에 그대로 있습니다.'
      : [...errorLines(e, '내보내지 못했습니다.'), '기록은 이 폰에 그대로 있습니다.']);
    return false;
  }
  download(out.blob, out.name);
  await markExported(projectId);
  const again = h('button', { type: 'button', class: 'btn sub', onclick: () => download(out.blob, out.name) }, '파일 다시 받기');
  // 내려받기가 실제로 시작됐는지는 앱이 알 수 없다(아티팩트 시험판 같은 틀 안에서는 막힐 수 있음) — "내보냈다"고 단정하지 않는다
  await alertDialog('파일을 만들었습니다', [
    out.name + ' · ' + sizeText(out.blob.size),
    '내려받기를 시작했습니다. 받은 파일이 보이지 않으면 브라우저 내려받기 목록을 확인해 주세요.',
    again,
    '보낸 뒤에도 기록은 폰에 남아 있습니다.',
  ]);
  return true;
}

/* ── 불러오기(PC에서 이어서 하기) ──────────────────────── */
/** 사람이 읽을 문장(text)과 작게 붙일 자세한 내용(detail)을 가진 오류 */
function friendly(text, detail) {
  return Object.assign(new Error(text), { friendly: true, detail: detail || '' });
}

/** 오류 → 창에 보일 글: [사람이 읽을 문장, 작은 "(자세한 내용: …)"] .
    friendly 오류와 한글 문장 오류(zip 읽기·기록 검사)는 그 문장 그대로, 영어 시스템 메시지는 fallback 문장 + 자세한 내용으로 */
function errorLines(e, fallback) {
  const msg = String((e && e.message) || '');
  let text; let detail = '';
  if (e && e.friendly) { text = msg; detail = e.detail || ''; }
  else if (/[가-힣]/.test(msg)) text = msg;
  else if (e && (e.name === 'QuotaExceededError' || /quota/i.test(msg))) { text = '저장 공간이 부족합니다. 폰 저장 공간을 비운 뒤 다시 해 주세요.'; detail = (e.name ? e.name + ': ' : '') + msg; }
  else { text = fallback; detail = (e && e.name && e.name !== 'Error' ? e.name + ': ' : '') + msg; }
  return [text, detail ? h('p', { class: 'hint' }, '(자세한 내용: ' + detail + ')') : null].filter(Boolean);
}

const NOT_RECORD = 'zip 파일이나 기록 파일(.json)이 아닙니다. 내보낸 zip 파일을 골라 주세요.';
const BROKEN_RECORD = '기록 파일이 깨져서 읽을 수 없습니다. 내보낸 zip 파일을 골라 주세요.';
const MAX_JSON = 256 * 1024 * 1024;

async function readInput(input) {
  if (input && !(input instanceof Blob) && typeof input === 'object') return { model: input, zip: null };
  const head = new Uint8Array(await input.slice(0, 4).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4B) {
    const zip = await readZip(input);
    let entry = zip.find(RECORD_NAME);
    if (!entry) entry = zip.entries.find((e) => /\.json$/i.test(e.name) && e.size < 64 * 1024 * 1024 && /fieldnote/i.test(e.name));
    if (!entry) throw friendly('이 zip 에 기록 파일(' + RECORD_NAME + ')이 없습니다. 현장실사 앱에서 내보낸 zip 파일이 맞는지 확인해 주세요.');
    let model;
    try { model = JSON.parse(await zip.text(entry)); } catch (e) { console.warn('zip 안의 기록 파일 읽기 실패', e); throw friendly('zip 안의 기록 파일을 읽지 못했습니다. 파일이 깨졌을 수 있습니다.'); }   // 영어 오류 세부는 화면에 안 보이고 콘솔에만
    return { model, zip };
  }
  // zip 이 아니면 기록 파일(.json)이어야 한다.
  // · 이름이 .json 이면: 읽어서 JSON 이 깨졌으면 "기록 파일이 깨져서 …"(BROKEN_RECORD). 읽힌 것이 객체가 아니면(배열·숫자 등 형식이 다른 json) NOT_RECORD.
  // · .json 이 아니면: 앞부분이 { 로 시작하지 않으면 읽지 않고 돌려보낸다(큰 사진·영상 파일을 통째로 읽지 않게). 시작은 { 인데 JSON 이 깨졌으면 NOT_RECORD.
  // 영어 오류 세부(JSON.parse 메시지)는 화면에 안 보이고 콘솔에만 남긴다.
  if (input.size > MAX_JSON) throw friendly(NOT_RECORD);
  const isJson = /\.json$/i.test(String(input.name || ''));
  if (!isJson) {
    const first = new TextDecoder().decode(new Uint8Array(await input.slice(0, 64).arrayBuffer())).replace(/^\uFEFF/, '').trimStart()[0];
    if (first !== '{') throw friendly(NOT_RECORD);
  }
  let model;
  try { model = JSON.parse(await input.text()); } catch (e) { console.warn('기록 파일 읽기 실패', e); throw friendly(isJson ? BROKEN_RECORD : NOT_RECORD); }
  if (!model || typeof model !== 'object' || Array.isArray(model)) throw friendly(NOT_RECORD);
  return { model, zip: null };
}

function checkModel(m) {
  if (!m || typeof m !== 'object' || m.app !== 'fieldnote') throw new Error('현장실사 앱의 기록 파일이 아닙니다.');
  const v = m.formatVersion || 1;
  if (v > FORMAT_VERSION) throw new Error('더 새 버전 앱에서 만든 파일입니다. 앱을 새로 고친 뒤 다시 불러와 주세요.');
  if (!m.project || !m.project.id || !Array.isArray(m.nodes)) throw new Error('기록 파일 내용이 올바르지 않습니다.');
  if (m.nodes.some((n) => !n || !n.id || !n.path || n.projectId !== m.project.id)) throw new Error('기록 파일의 노드 정보가 올바르지 않습니다.');
}

const atOf = (f) => (f && typeof f.at === 'number' ? f.at : 0);

/** 여러 줄 항목(v 가 [{ id, …, _m }])은 줄마다 합친다(지우지 않음 규칙: 한쪽에만 있는 줄도 남긴다).
    같은 줄은 _m.at 이 나중인 쪽, 줄 순서와 항목 기록(by·at)은 항목 at 이 나중인 쪽을 따른다. */
function mergeRows(local, incoming) {
  const arr = (v) => (Array.isArray(v) ? v : []);
  const newerIsIn = atOf(incoming) > atOf(local);
  const nv = arr(newerIsIn ? incoming.v : local.v);
  const ov = arr(newerIsIn ? local.v : incoming.v);
  const oMap = new Map(ov.filter((r) => r && r.id).map((r) => [r.id, r]));
  const out = nv.map((r) => {
    const o = r && r.id ? oMap.get(r.id) : null;
    return o && atOf(o._m) > atOf(r._m) ? o : r;
  });
  const seen = new Set(out.map((r) => r && r.id));
  for (const r of ov) if (r && r.id && !seen.has(r.id)) out.push(r);
  const meta = newerIsIn ? incoming : local;
  return { field: { ...meta, v: out.length ? out : meta.v }, changed: JSON.stringify(out) !== JSON.stringify(arr(local.v)) };
}

/** 노드 data 합치기: 값마다 at 이 더 나중인 쪽을 남긴다. → 바뀐 값 수 */
function mergeData(local, incoming) {
  let changed = 0;
  for (const [k, f] of Object.entries(incoming || {})) {
    const cur = local[k];
    if (!f || typeof f !== 'object') continue;
    if (!cur) { local[k] = f; changed++; continue; }
    if (Array.isArray(f.v) && f.v.some((r) => r && typeof r === 'object' && r.id) || Array.isArray(cur.v) && cur.v.some((r) => r && typeof r === 'object' && r.id)) {
      const m = mergeRows(cur, f);
      if (m.changed || atOf(m.field) !== atOf(cur)) { local[k] = m.field; changed += m.changed ? 1 : 0; }
      continue;
    }
    if (atOf(f) > atOf(cur)) { local[k] = f; if (JSON.stringify(f.v) !== JSON.stringify(cur.v)) changed++; }
  }
  return changed;
}

async function makeThumb(blob) {
  try {
    const s = await shrink(blob, 320, 0.7);
    return s ? s.blob : null;
  } catch (e) {
    return null;
  }
}

/** zip 또는 기록 파일을 불러와 합친다.
    같은 사업 ID → 값마다 at 비교로 새 값 유지, 없는 노드·사진 추가, 아무것도 지우지 않음.
    처음 보는 사업 ID → 새 사업으로 추가.
    → { projectId, name, isNew, addedNodes, changedValues, addedPhotos, updatedPhotos, missingFiles } */
export async function importModel(input, opts = {}) {
  const step = opts.onStep || (() => {});
  const { model, zip } = await readInput(input);
  checkModel(model);
  const pid = model.project.id;
  let project = await getProject(pid);
  const isNew = !project;
  if (isNew) {
    const p = model.project;
    project = {
      id: pid, name: p.name, from: p.from || null, to: p.to || null, source: p.source || 'manual',
      createdAt: p.createdAt || Date.now(), changedAt: Date.now(), exportedAt: model.exportedAt || p.exportedAt || null,
      meta: p.meta || null, importedAt: Date.now(),
    };
    if (p.linkAt) project.linkAt = p.linkAt;
    await db.put('projects', project);
  }

  // 노드: 얕은 것부터. 사업 링크로 따로 받아 ID 가 다른 현장·장소는 linkId 로 같은 것을 찾는다.
  const locals = isNew ? [] : await projectNodes(pid);
  const byId = new Map(locals.map((n) => [n.id, n]));
  const idMap = new Map([[pid, pid]]);
  const pathMap = new Map([[pid, pid]]);
  const depth = (n) => n.path.split('/').length;
  const incoming = model.nodes.slice().sort((a, b) => depth(a) - depth(b) || a.order - b.order);
  let addedNodes = 0;
  let changedValues = 0;
  let k = 0;
  for (const mn of incoming) {
    step((40 * ++k) / incoming.length, '기록 합치는 중…');
    const oldParentPath = mn.path.split('/').slice(0, -1).join('/');
    const parentPath = pathMap.get(oldParentPath) || oldParentPath;
    const parentId = idMap.get(mn.parentId) || mn.parentId;
    let local = byId.get(mn.id);
    if (!local && mn.linkId) local = locals.find((n) => n.linkId === mn.linkId && n.type === mn.type && n.parentId === parentId);
    if (local) {
      idMap.set(mn.id, local.id);
      pathMap.set(mn.path, local.path);
      const c = mergeData(local.data, mn.data);
      if (c || (mn.updatedAt || 0) > (local.updatedAt || 0)) {
        local.updatedAt = Math.max(local.updatedAt || 0, mn.updatedAt || 0);
        await db.put('nodes', local);
        changedValues += c;
      }
    } else {
      const node = { ...mn, projectId: pid, parentId, path: parentPath + '/' + mn.id };
      idMap.set(mn.id, mn.id);
      pathMap.set(mn.path, node.path);
      await db.put('nodes', node);
      locals.push(node);
      byId.set(node.id, node);
      addedNodes++;
    }
  }

  // 사진: 없는 것만 추가(한 장씩). 있는 사진은 보정본만 더 새것이면 바꾼다.
  const mapPath = (p) => {
    if (pathMap.has(p)) return pathMap.get(p);
    const parts = p.split('/');
    for (let i = parts.length - 1; i > 0; i--) {
      const pre = parts.slice(0, i).join('/');
      if (pathMap.has(pre)) return pathMap.get(pre) + '/' + parts.slice(i).join('/');
    }
    return p;
  };
  let addedPhotos = 0;
  let updatedPhotos = 0;
  let missingFiles = 0;
  const photos = Array.isArray(model.photos) ? model.photos : [];
  k = 0;
  for (const mp of photos) {
    step(40 + (58 * ++k) / Math.max(1, photos.length), '사진 ' + k + ' / ' + photos.length);
    if (!mp || !mp.id) continue;
    const local = await db.get('photos', mp.id);
    const getFile = async (path, type) => {
      if (!zip || !path) return null;
      const e = zip.find(path);
      return e ? zip.blob(e, type || '') : null;
    };
    const corrBlob = mp.correctedFile ? await getFile(mp.correctedFile, mp.correctedType || 'image/jpeg') : null;
    const corrected = corrBlob ? { ...(mp.corrected || {}), blob: corrBlob } : null;
    if (corrected) { delete corrected.type; delete corrected.size; }
    if (local) {
      const la = (local.corrected && local.corrected.at) || 0;
      const ia = (mp.corrected && mp.corrected.at) || 0;
      if (corrected && (!local.corrected || ia > la)) {
        local.corrected = corrected;
        await db.put('photos', local);
        updatedPhotos++;
      }
      continue;
    }
    const blob = await getFile(mp.file, mp.type || 'image/jpeg');
    if (!blob) { missingFiles++; continue; }
    // IndexedDB 에 넣을 때 복사된다. 파일 조각(slice)을 그대로 넘겨 메모리를 아낀다.
    await db.put('photos', {
      id: mp.id, projectId: pid, ownerPath: mapPath(mp.ownerPath), slot: mp.slot, order: mp.order || 0,
      blob, thumb: await makeThumb(corrBlob || blob), source: mp.source === 'gallery' ? 'gallery' : 'camera',
      takenAt: mp.takenAt || null, exif: mp.exif || null, corrected, createdAt: mp.createdAt || Date.now(), ...(mp.changedAt ? { changedAt: mp.changedAt } : {}), meta: mp.meta || null,
    });
    addedPhotos++;
  }
  await db.update('projects', pid, (p) => { p.changedAt = Date.now(); p.importedAt = Date.now(); });
  step(100, '끝');
  return { projectId: pid, name: project.name, isNew, addedNodes, changedValues, addedPhotos, updatedPhotos, missingFiles };
}

/** 자료복구: 고른 zip(또는 기록 파일)을 불러와 그 실사 화면으로 간다. */
async function importFile(file, ctx) {
  if (!file) return;
  const prog = progressBox('불러오기');
  let r;
  try {
    r = await importModel(file, { onStep: (pct, text) => { prog.check(); prog.set(pct, text); } });
    await prog.close();
  } catch (e) {
    const stopped = e && e.cancelled;
    await prog.close();
    if (!stopped) console.error(e);
    await alertDialog('자료복구', stopped ? '불러오기를 멈췄습니다. 그때까지 들어온 것은 남아 있습니다.'
      : [...errorLines(e, '불러오지 못했습니다. 파일이 올바른지 확인한 뒤 다시 해 주세요.')]);
    return;
  }
  const lines = [
    r.name + (r.isNew ? ' — 새 실사로 추가했습니다.' : ' — 이 기기의 같은 실사에 합쳤습니다.'),
    '새로 들어온 곳 ' + r.addedNodes + '개 · 바뀐 값 ' + r.changedValues + '개 · 새 사진 ' + r.addedPhotos + '장' + (r.updatedPhotos ? ' · 보정본 ' + r.updatedPhotos + '장' : ''),
  ];
  if (r.missingFiles) lines.push('! 파일이 없어 못 넣은 사진 ' + r.missingFiles + '장 (기록 파일만 불러왔거나 zip 에 빠져 있음)');
  await alertDialog('불러왔습니다', lines);
  ctx.go('#/p/' + encodeURIComponent(r.projectId));
}

/** 자료복구 버튼 — 진짜 파일 칸을 버튼 위에 투명하게 덮어, 손가락이 파일 칸을 직접 누르게 한다.
    (코드로 숨은 파일 칸을 대신 누르면 아티팩트 같은 보안 틀·일부 브라우저에서 막힌다) */
/* ── 실사샘플 받기(v0.30) ─────────────────────────────────
   예시 실사 zip 은 앱(공개 깃허브)에 넣지 않고 구글 드라이브에 둔다. 버튼은 드라이브 화면을 새 창으로 열 뿐이고,
   받은 zip 은 사용자가 자료복구로 연다. 드라이브 공유 범위는 드라이브에서 정한다(링크 주소는 그대로). */
export const SAMPLES = [
  { label: '여수공장 실사샘플', sub: '사진 74장 · 9.4MB', url: 'https://drive.google.com/file/d/1CzkLQx7gUuh3JblB3G6SvmDNE8zF-GnA/view' },
  { label: '대전공장 실사샘플', sub: '사진 없음 · 0.6MB', url: 'https://drive.google.com/file/d/1BLZbT0MBDOq_RUOq42Q7AUMwLvHWjAuA/view' },
];

export async function openSamples() {
  const url = await sheet({ title: '실사샘플 받기', note: '드라이브에서 zip을 내려받은 뒤, 자료복구로 여세요.', items: SAMPLES.map((x) => ({ label: x.label, sub: x.sub, value: x.url })) });
  if (!url) return;
  window.open(url, '_blank', 'noopener');
  await alertDialog('실사샘플 받기', '드라이브에서 zip을 내려받은 뒤\n자료복구 버튼으로 그 파일을 고르세요.');
}

export function sampleButton(label = '실사샘플 받기') {
  return h('button', { type: 'button', class: 'btn sub', onclick: () => openSamples().catch((e) => console.error(e)) }, label);
}

export function importButton(ctx, label = '자료복구', cls = 'btn sub') {
  const input = h('input', { type: 'file', accept: '.zip,.json,application/zip,application/json', class: 'file-over', 'aria-label': label });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    await closeAllOverlays();
    await importFile(file, ctx);
  });
  return h('label', { class: cls + ' file-btn' }, h('span', null, label), input);
}

/** 더보기 → 자료복구: 안내 창 안에 진짜 파일 버튼을 둔다. */
export function openImport(ctx) {
  return dialog({
    title: '자료복구',
    body: [h('p', null, '내보낸 zip 파일(또는 기록 파일)을 고르면 실사 기록을 되살립니다.'), importButton(ctx, 'zip 파일 고르기', 'btn pri')],
  });
}
