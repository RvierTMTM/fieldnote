/* store.js — 사업·현장·장소·설치 지점·장비·경로·사진을 다루는 업무 함수 (저장은 js/db.js)
   공개:
     uid(), stamp(), val(node,key), nameOf(node), deviceLabel(node), deviceRowLabel(node), pickLabel(value), cableText(route),
     distText(dist), locParts(place), condHiddenKeys(place)
     사업: listProjects(), getProject(id), createProject({name,from,to}), markExported(id), updateProjectInfo(id,{name,from,to})(v0.50), receiveProject(payload)(v0.50: 다시 받으면 실사명·기간도 맞춤)
     노드: getNode(id), children(parentId,type), projectNodes(pid), addNode(parent,type,fields,extra),
           setField(nodeId,key,value), removeNodeDeep(id), chainOf(node),
           renameNode(nodeId,name), moveNode(nodeId,newParentId), MOVE_PARENT, usable(v)
     사진: addPhoto(rec), listPhotos(ownerPath,slot), getPhoto(id), putPhoto(rec,{changed}), reorderPhotos(ids), deletePhoto(id),
           deletePhotosOfSlot(ownerPath,slot), photoKeys(pid), photoCounter(keys), countUnexportedPhotos(pid)
     집계: projectSummary(pid), missingItems(pid), lackItems(miss), isBlankNode(node, nodes, keys)
     작은 값: kvGet(k), kvSet(k,v)
   값 기록: 노드의 모든 항목은 data[key] = { v, by, at } 로 저장한다(누가·언제).
            setField 만 쓰면 자동으로 붙는다. 지운 값도 { v:null, … } 로 남긴다. */
import * as db from './db.js';
import { getSettings } from './settings.js';
import { CABLE_KINDS, NONE, UNKNOWN } from './options.js';

let seq = 0;

export function uid(len = 10) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => (b % 36).toString(36)).join('');
}

/** 지금 입력자·시각 */
export function stamp() {
  const s = getSettings();
  return { by: s.surveyor || '', at: Date.now() };
}

export function val(node, key) {
  const f = node && node.data && node.data[key];
  return f ? f.v : undefined;
}

/** 다른 글자 옆에 붙여 쓸 수 있는 값이면 글자로, 비었거나 "없음"·"확인 못 함"이면 '' (카드 부제·머리말 조각용) */
export function usable(v) {
  if (v == null || v === '' || v === NONE || v === UNKNOWN) return '';
  const t = typeof v === 'object' ? pickLabel(v) : String(v);
  return t === NONE || t === UNKNOWN ? '' : t.trim();
}

/** 목록에서 고른 값({ ref, label }) 또는 글자를 화면 글자로 */
export function pickLabel(v) {
  if (v == null) return '';
  return typeof v === 'object' ? String(v.label || '') : String(v);
}

const TYPE_NAMES = { site: '현장', place: '장소', route: '케이블 경로', point: '설치 지점', device: '장비', extra: '자유 추가' };

export function nameOf(node) {
  if (!node) return '';
  if (node.type === 'device') return deviceLabel(node);
  if (node.type === 'extra') return val(node, 'tag') || '자유 추가';
  if (node.type === 'route') return (pickLabel(val(node, 'from')) || '출발') + ' → ' + (pickLabel(val(node, 'to')) || '도착');
  return val(node, 'name') || val(node, 'kind') || val(node, 'form') || TYPE_NAMES[node.type] || '';
}

/** 케이블 경로의 케이블 종류를 한 줄로: "광 SM 12코어 · UTP 24가닥" / "케이블 종류 확인 못 함" / '' */
export function cableText(node) {
  const v = val(node, 'cable');
  if (!Array.isArray(v) || !v.length) return '';
  if (v.includes(UNKNOWN)) return '케이블 종류 확인 못 함';
  return CABLE_KINDS.filter(([label]) => v.includes(label)).map(([label, key, unit]) => {
    const n = val(node, key);
    return label + (typeof n === 'number' ? ' ' + n + unit : '');
  }).join(' · ');
}

/** 장비를 한 줄로: "스위치 L3 24포트 · FA-BB-01"
    이름 조각 = Hostname, 비었거나 "확인 못 함"이면 모델명, 그것도 없으면 종류만. 규격에도 "확인 못 함"은 붙이지 않는다. */
export function deviceLabel(node) {
  const kind = val(node, 'kind') || '장비';
  const parts = [kind];
  if (kind === '스위치') {
    const layer = usable(val(node, 'layer'));
    if (layer && layer !== '모름') parts.push(layer);
    if (usable(val(node, 'ports'))) parts.push(usable(val(node, 'ports')));
  } else if (kind === 'FDF') {
    if (typeof val(node, 'cores') === 'number') parts.push(val(node, 'cores') + '코어');
  } else if (kind === '패치판넬') {
    if (usable(val(node, 'ports'))) parts.push(usable(val(node, 'ports')));
  } else if (kind === '통신사장비') {
    if (usable(val(node, 'carrier'))) parts.push(usable(val(node, 'carrier')));
  }
  const host = usable(val(node, 'hostname')) || usable(val(node, 'model'));
  return parts.join(' ') + (host ? ' · ' + host : '');
}

/** 가상 랙 줄·장비 카드에 쓰는 이름. FDF·패치판넬은 이름 조각을 Hostname → 첫 선번 줄의 라벨 원문 또는 행선지(연결처) → 모델명 순으로 고르고,
    그 밖의 장비는 deviceLabel 과 같다. 예: "FDF 24코어 · BD-6블럭1~16", "패치판넬 48포트 · OA 01-24" */
export function deviceRowLabel(node) {
  const kind = val(node, 'kind');
  if (kind !== 'FDF' && kind !== '패치판넬') return deviceLabel(node);
  const rows = val(node, kind === 'FDF' ? 'fdfLines' : 'utpLines');
  let line = '';
  if (Array.isArray(rows)) {
    for (const r of rows) {
      const t = (r && (usable(r.labelText) || usable(r.dest))) || '';
      if (t) { line = t; break; }
    }
  }
  if (!line || usable(val(node, 'hostname'))) return deviceLabel(node);
  const head = [kind];
  if (kind === 'FDF' && typeof val(node, 'cores') === 'number') head.push(val(node, 'cores') + '코어');
  if (kind === '패치판넬' && usable(val(node, 'ports'))) head.push(usable(val(node, 'ports')));
  return head.join(' ') + ' · ' + line;
}

/** 경로 거리를 한 줄 글로: 숫자면 "약 12m", "확인 못 함"이면 "거리 확인 못 함", 비었거나 그 밖의 글이면 '' (생략) */
export function distText(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return '약 ' + v + 'm';
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === UNKNOWN) return '거리 확인 못 함';
    if (/^\d+(\.\d+)?$/.test(t)) return '약 ' + t + 'm';
  }
  return '';
}

/** 장소의 동·층 조각들. 장소 이름에 이미 들어 있는 조각은 뺀다(예: 이름 "A동 2F 전산실"이면 "(A동 2F)"를 또 붙이지 않는다).
    조각 안에 괄호가 있으면("1.5F(중층)", "폐수처리장(옥외 별동)") 괄호 앞뒤를 따로 보아 이름에 이미 있는 말은 빼고, 남은 말만 "·"로 잇는다
    — 덧붙인 글에 괄호가 또 생겨 "(…(…))" 로 겹치지 않게. 예: 이름 "건과공장 1.5F 정비반" + 층 "1.5F(중층)" → ["중층"] */
export function locParts(place) {
  const name = nameOf(place);
  const out = [];
  for (const raw of [usable(val(place, 'bldg')), usable(val(place, 'floor'))]) {
    if (!raw || name.includes(raw)) continue;
    const segs = raw.split(/\s*[()（）]\s*/).map((x) => x.trim()).filter(Boolean).filter((x) => !name.includes(x));
    const t = segs.join('·');
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** NW공사 "기존 트레이"가 "없음"이면 숨기는 항목(값은 지우지 않고 표시만 뺀다) */
export function condHiddenKeys(place) {
  return val(place, 'cond_tray') === NONE ? ['cond_trayW', 'cond_trayRoom'] : [];
}

/* ── 사업 ─────────────────────────────────────────────── */
/** 실사 목록: 만든 때와 링크로 받은(다시 받은) 때(receivedAt, v0.30) 중 나중 것이 최근인 순서 */
export async function listProjects() {
  const list = await db.getAll('projects');
  const at = (p) => Math.max(p.createdAt || 0, p.receivedAt || 0);
  return list.sort((a, b) => at(b) - at(a));
}
export function getProject(id) { return db.get('projects', id); }

export async function createProject({ id, name, from = null, to = null, source = 'manual' }) {
  const now = Date.now();
  const p = { id: id || 'm' + uid(), name, from, to, source, createdAt: now, changedAt: now, exportedAt: null, meta: stamp() };
  await db.put('projects', p);
  return p;
}

/** 실사 정보 바꾸기(v0.50): 실사명·기간. from·to 는 'YYYY-MM-DD' 또는 null */
export function updateProjectInfo(projectId, { name, from = null, to = null }) {
  return db.update('projects', projectId, (p) => { p.name = name; p.from = from || null; p.to = to || null; p.changedAt = Date.now(); });
}

async function touch(projectId) {
  await db.update('projects', projectId, (p) => { p.changedAt = Date.now(); });
}

/** 내보내기가 끝났을 때 부른다(SA-C). 사업 카드가 "내보냄"으로 바뀐다. */
export function markExported(projectId) {
  return db.update('projects', projectId, (p) => { p.exportedAt = Date.now(); });
}

/* ── 노드(현장·장소·경로·설치 지점·장비·자유 추가) ──────── */
export function getNode(id) { return db.get('nodes', id); }

export async function children(parentId, type) {
  const list = await db.byIndex('nodes', 'parentId', parentId);
  return list.filter((n) => !type || n.type === type).sort((a, b) => a.order - b.order);
}

export function projectNodes(projectId) { return db.byIndex('nodes', 'projectId', projectId); }

/** parent: 사업 레코드 또는 노드. fields: { 항목: 값 } → 입력 기록을 붙여 저장한다. */
export async function addNode(parent, type, fields = {}, extra = {}) {
  const isProject = !parent.path;
  const id = uid();
  const now = Date.now();
  const m = extra.meta || stamp();
  const data = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v != null && v !== '') data[k] = { v, by: m.by, at: m.at };
  }
  const node = {
    id,
    projectId: isProject ? parent.id : parent.projectId,
    parentId: parent.id,
    path: (isProject ? parent.id : parent.path) + '/' + id,
    type,
    order: now * 1000 + (seq++ % 1000),
    data,
    createdAt: now,
    updatedAt: now,
  };
  if (extra.linkId) node.linkId = extra.linkId;
  await db.put('nodes', node);
  await touch(node.projectId);
  return node;
}

/** 항목 하나 저장(입력자·차수·시각 자동 기록). 고친 노드를 돌려준다. */
export async function setField(nodeId, key, value) {
  const empty = value == null || value === '' || (Array.isArray(value) && !value.length);
  const node = await db.update('nodes', nodeId, (n) => {
    n.data[key] = { v: empty ? null : value, ...stamp() };
    n.updatedAt = Date.now();
  });
  if (!node) throw new Error('저장할 대상을 찾지 못했습니다.');
  await touch(node.projectId);
  if (key === 'name' && node.type === 'place') await syncPlaceLabels(node);
  if (node.type === 'device' && DEVICE_LABEL_KEYS.includes(key)) await syncDeviceLabels(node);
  return node;
}

/** 장소 이름이 바뀌면 그 장소를 id 로 가리키는 값의 글자(label)도 같이 바꾼다:
    케이블 경로 출발·도착, FDF 선번장·UTP 선번장 줄의 행선지·연결처. (id 참조라 옮겨도 그대로 유효하고, 이름만 따라 바뀐다) */
async function syncPlaceLabels(place) {
  const label = nameOf(place);
  const same = (v) => v && typeof v === 'object' && !Array.isArray(v) && v.ref === place.id;
  for (const n of await projectNodes(place.projectId)) {
    let changed = false;
    const data = n.data || {};
    if (n.type === 'route') {
      for (const k of ['from', 'to']) {
        const f = data[k];
        if (f && same(f.v) && f.v.label !== label) { f.v = { ...f.v, label }; changed = true; }
      }
    } else if (n.type === 'device') {
      for (const k of ['fdfLines', 'utpLines']) {
        const f = data[k];
        if (!f || !Array.isArray(f.v)) continue;
        for (const r of f.v) if (r && same(r.dest) && r.dest.label !== label) { r.dest = { ...r.dest, label }; changed = true; }
      }
    }
    if (changed) await db.put('nodes', n);
  }
}

/* 장비 표시 이름(deviceLabel)을 이루는 항목 — 이 값이 바뀌면 그 장비를 가리키는 업링크 글자도 따라 바꾼다 */
const DEVICE_LABEL_KEYS = ['hostname', 'model', 'kind', 'layer', 'ports', 'cores', 'carrier'];

/** 장비 이름(Hostname → 모델명 → 종류)이 바뀌면 그 장비를 id 로 가리키는 값의 글자(label)도 같이 바꾼다:
    다른 장비의 업링크 { ref, label }. (syncPlaceLabels 의 장비용) */
async function syncDeviceLabels(device) {
  const label = deviceLabel(device);
  for (const n of await projectNodes(device.projectId)) {
    if (n.type !== 'device' || n.id === device.id) continue;
    const f = n.data && n.data.uplink;
    const v = f && f.v;
    if (v && typeof v === 'object' && !Array.isArray(v) && v.ref === device.id && v.label !== label) {
      f.v = { ...v, label };
      await db.put('nodes', n);
    }
  }
}

/** 이름 바꾸기: 현장·장소·설치 지점은 name, 장비는 Hostname(hostname). 고친 노드를 돌려준다. */
export async function renameNode(nodeId, name) {
  const node = await getNode(nodeId);
  if (!node || !['site', 'place', 'point', 'device'].includes(node.type)) throw new Error('이름을 바꿀 수 없는 항목입니다.');
  return setField(nodeId, node.type === 'device' ? 'hostname' : 'name', name);
}

/** 사업부터 이 노드의 부모까지: [현장, 장소, …] (자기 자신 제외) */
export async function chainOf(node) {
  const ids = node.path.split('/').slice(1, -1);
  const out = [];
  for (const id of ids) {
    const n = await getNode(id);
    if (n) out.push(n);
  }
  return out;
}

/** 노드와 그 아래 노드·사진을 바로 지운다(되살릴 수 없음).
    화면의 삭제는 이 함수를 쓰지 않는다 — js/trash.js deleteNode 가 휴지통(14일)에 넣고 지운다. */
export async function removeNodeDeep(nodeId) {
  const node = await getNode(nodeId);
  if (!node) return { nodes: 0, photos: 0 };
  const sub = await db.keysByIndex('nodes', 'path', db.under(node.path));
  const own = await db.keysByIndex('photos', 'ownerPath', IDBKeyRange.only(node.path));
  const deep = await db.keysByIndex('photos', 'ownerPath', db.under(node.path));
  const photoIds = own.concat(deep).map((k) => k.primaryKey);
  await db.delMany('photos', photoIds);
  await db.delMany('nodes', sub.map((k) => k.primaryKey).concat(node.id));
  await touch(node.projectId);
  return { nodes: sub.length + 1, photos: photoIds.length };
}

/* ── 상위 옮기기 ──────────────────────────────────────── */
/** 옮길 수 있는 노드 종류 → 새 상위의 종류. 장소 → 다른 현장, 설치 지점 → 다른 장소, 장비 → 다른 설치 지점 */
export const MOVE_PARENT = { place: 'site', point: 'place', device: 'point' };

/** 노드를 다른 상위 아래로 옮긴다(같은 실사 안). 한 트랜잭션으로 아래 것을 전부 따라 바꾼다:
    · nodes   옮긴 노드 parentId·order(새 상위 형제들의 최대 order + 1 = 맨 끝), 옮긴 노드와 그 아래 모든 노드의 path(앞부분 교체)
    · photos  옮긴 노드와 그 아래 노드에 달린 사진의 ownerPath(같은 앞부분 교체)
    · trash   휴지통 항목(node·reset·photo)의 path, payload 안 노드 path·사진 ownerPath, 위치 글(label)의 앞부분
    · 장비를 옮기면 U 위치(u)·놓인 자리(pos) 값을 비운다(새 설치 지점이 랙이면 "위치가 정해지지 않은 장비"로 나온다)
    id 로 가리키는 값(케이블 경로 출발·도착, FDF·UTP 선번장 연결처, 업링크)과 사진 칸 이름(slot)은 path 를 쓰지 않아 그대로 유효하다.
    돌려주는 값: 옮긴 노드 */
export async function moveNode(nodeId, newParentId) {
  const node = await getNode(nodeId);
  if (!node || !MOVE_PARENT[node.type]) throw new Error('옮길 수 없는 항목입니다.');
  const parent = await getNode(newParentId);
  if (!parent || parent.projectId !== node.projectId || parent.type !== MOVE_PARENT[node.type]) throw new Error('옮길 곳이 올바르지 않습니다.');
  if (parent.id === node.parentId) return node;
  const oldPath = node.path;
  const newPath = parent.path + '/' + node.id;
  const now = Date.now();
  const byId = new Map((await projectNodes(node.projectId)).map((n) => [n.id, n]));
  const sibs = [...byId.values()].filter((n) => n.parentId === parent.id && n.id !== node.id);
  const newOrder = sibs.length ? Math.max(...sibs.map((n) => n.order || 0)) + 1 : node.order;   // 새 상위 아래 맨 끝에 놓는다
  const chain = (path, skipSites) => path.split('/').slice(1).map((id) => byId.get(id))
    .filter((n) => n && !(skipSites && n.type === 'site')).map(nameOf).join(' · ');
  const labelFix = [[chain(oldPath), chain(newPath)], [chain(oldPath, true), chain(newPath, true)]];   // [전체 위치 글, 현장 뺀 위치 글]
  const remap = (p) => (typeof p === 'string' && (p === oldPath || p.startsWith(oldPath + '/')) ? newPath + p.slice(oldPath.length) : p);

  const d = await db.openDb();
  await new Promise((resolve, reject) => {
    const t = d.transaction(['nodes', 'photos', 'trash', 'projects'], 'readwrite');
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('저장이 취소되었습니다.'));
    const ns = t.objectStore('nodes');
    const ps = t.objectStore('photos');
    const ts = t.objectStore('trash');

    const rootReq = ns.get(node.id);
    rootReq.onsuccess = () => {
      const v = rootReq.result;
      if (!v) return;
      v.parentId = parent.id;
      v.path = newPath;
      v.order = newOrder;
      v.updatedAt = now;
      if (v.type === 'device') {
        for (const k of ['u', 'pos']) if (v.data && v.data[k] && v.data[k].v != null) v.data[k] = { v: null, ...stamp() };
      }
      ns.put(v);
    };
    const subReq = ns.index('path').getAll(db.under(oldPath));
    subReq.onsuccess = () => subReq.result.forEach((v) => { v.path = remap(v.path); ns.put(v); });

    for (const range of [IDBKeyRange.only(oldPath), db.under(oldPath)]) {
      const cur = ps.index('ownerPath').openCursor(range);
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return;
        const v = c.value;
        v.ownerPath = remap(v.ownerPath);
        c.update(v);
        c.continue();
      };
    }

    const trReq = ts.index('projectId').getAll(IDBKeyRange.only(node.projectId));
    trReq.onsuccess = () => {
      for (const rec of trReq.result) {
        if (rec.kind === 'project') continue;
        let hit = false;
        const re = (p) => { const q = remap(p); if (q !== p) hit = true; return q; };
        if (rec.path) rec.path = re(rec.path);
        const pl = rec.payload || {};
        for (const n of pl.nodes || []) n.path = re(n.path);
        for (const n of pl.removed || []) n.path = re(n.path);
        for (const p of pl.photos || []) p.ownerPath = re(p.ownerPath);
        if (pl.photo) pl.photo.ownerPath = re(pl.photo.ownerPath);
        if (!hit) continue;
        const [from, to] = labelFix[rec.kind === 'reset' ? 1 : 0];
        if (from && typeof rec.label === 'string' && rec.label.startsWith(from)) rec.label = to + rec.label.slice(from.length);
        ts.put(rec);
      }
    };

    const prReq = t.objectStore('projects').get(node.projectId);
    prReq.onsuccess = () => { if (prReq.result) { prReq.result.changedAt = now; t.objectStore('projects').put(prReq.result); } };
  });
  return getNode(node.id);
}

/* ── 사진 ─────────────────────────────────────────────── */
/** 사진 한 장 추가. rec: { projectId, ownerPath, slot, blob, source, takenAt?, exif?, thumb? } */
export async function addPhoto(rec) {
  const list = await db.keysByIndex('photos', 'owner_slot', IDBKeyRange.only([rec.ownerPath, rec.slot]));
  let order = 0;
  if (list.length) {
    const cur = await listPhotos(rec.ownerPath, rec.slot);
    order = Math.max(...cur.map((p) => p.order)) + 1;
  }
  const now = Date.now();
  const photo = {
    id: uid(),
    projectId: rec.projectId,
    ownerPath: rec.ownerPath,
    slot: rec.slot,
    order,
    blob: rec.blob,
    thumb: rec.thumb || null,
    source: rec.source === 'gallery' ? 'gallery' : 'camera',
    takenAt: rec.takenAt || now,
    exif: rec.exif || null,
    corrected: null,
    createdAt: now,
    meta: stamp(),
  };
  await db.put('photos', photo);
  await touch(photo.projectId);
  return photo;
}

export async function listPhotos(ownerPath, slot) {
  const list = await db.byIndex('photos', 'owner_slot', IDBKeyRange.only([ownerPath, slot]));
  return list.sort((a, b) => a.order - b.order);
}
export function getPhoto(id) { return db.get('photos', id); }
/** 사진 레코드 저장(바꾸기·보정 결과 등). changed 면 changedAt 을 찍어 "안 보낸 사진"에 다시 셈한다. */
export async function putPhoto(rec, { changed = true } = {}) {
  if (changed) rec.changedAt = Date.now();
  await db.put('photos', rec);
  await touch(rec.projectId);
  return rec;
}

/** 같은 칸 안 사진 순서 저장: ids 순서대로 order = 0,1,2… (changedAt 은 건드리지 않는다) */
export async function reorderPhotos(ids) {
  let pid = null;
  for (let i = 0; i < ids.length; i++) {
    const r = await db.update('photos', ids[i], (p) => { p.order = i; });
    if (r) pid = r.projectId;
  }
  if (pid) await touch(pid);
}

export async function deletePhoto(id) {
  const p = await getPhoto(id);
  if (!p) return;
  await db.del('photos', id);
  await touch(p.projectId);
}

export async function deletePhotosOfSlot(ownerPath, slot) {
  const keys = await db.keysByIndex('photos', 'owner_slot', IDBKeyRange.only([ownerPath, slot]));
  await db.delMany('photos', keys.map((k) => k.primaryKey));
}

/** 사업 안 모든 사진의 [{ ownerPath, slot, id }] (사진 자체는 읽지 않는다) */
export async function photoKeys(projectId) {
  const range = IDBKeyRange.bound([projectId + '/', ''], [projectId + '/￿', '￿']);
  const keys = await db.keysByIndex('photos', 'owner_slot', range);
  return keys.map((k) => ({ ownerPath: k.key[0], slot: k.key[1], id: k.primaryKey }));
}

/** photoKeys 결과로 "이 path 아래 사진 수"를 세는 함수를 만든다. */
export function photoCounter(keys) {
  return (path) => {
    const pre = path + '/';
    let n = 0;
    for (const k of keys) if (k.ownerPath === path || k.ownerPath.startsWith(pre)) n++;
    return n;
  };
}

/** 마지막으로 내보낸 뒤에 생기거나 바뀐(다시 찍기·갤러리에서 바꾸기·보정) 사진 수. 내보낸 적 없으면 전체.
    바뀐 때는 photo.changedAt(putPhoto 가 찍음). 순서만 바꾼 것은 세지 않는다. */
export async function countUnexportedPhotos(projectId) {
  const p = await getProject(projectId);
  if (!p) return 0;
  if (!p.exportedAt) return db.countByIndex('photos', 'projectId', IDBKeyRange.only(projectId));
  const list = await db.byIndex('photos', 'projectId', projectId);
  return list.filter((x) => Math.max(x.createdAt || 0, x.changedAt || 0) > p.exportedAt).length;
}

/* ── 집계 ─────────────────────────────────────────────── */
export async function projectSummary(projectId) {
  const [nodes, keys, unexported] = await Promise.all([projectNodes(projectId), photoKeys(projectId), countUnexportedPhotos(projectId)]);
  const n = (type) => nodes.filter((x) => x.type === type).length;
  const points = nodes.filter((x) => x.type === 'point');
  return {
    sites: n('site'), places: n('place'), routes: n('route'), devices: n('device'),
    points: points.length,
    racks: points.filter((x) => val(x, 'form') === '랙').length,
    photos: keys.length,
    unexported,
    nodes, keys,
    blankIds: new Set(nodes.filter((x) => isBlankNode(x, nodes, keys)).map((x) => x.id)),   // 미작성 노드(isBlankNode)
  };
}

/* 미작성(빈 항목) 판단: 아래 "만들 때 들어가는 값" 말고는 입력값이 하나도 없고, 사진도 없고, 아래 노드도 없는 노드.
   · 늘 입력으로 보지 않는 값 = 이름·종류(현장 이름 / 장소 이름·종류 / 설치 지점 이름·설치 형태 / 경로 출발·도착 / 장비 종류 / 자유 추가 꼬리표).
     실사 링크로 받은 현장·장소도 이 값만 있으면 미작성이다.
   · 만들 때 자동으로 들어가고 그 뒤 손대지 않았을 때만 입력으로 보지 않는 값 = 장비의 높이(h)·놓인 자리(pos)·U 위치(u).
   · 지운 값(v:null)·빈 배열은 값이 없는 것으로 본다. 완료 표시(done)는 입력이다. */
const BLANK_KEEP = { site: ['name'], place: ['name', 'kind'], point: ['name', 'form'], route: ['from', 'to'], device: ['kind'], extra: ['tag'] };
const BLANK_INIT = { device: ['h', 'pos', 'u'] };
const INIT_MS = 2000;

/** nodes: 사업 안 노드 전부, keys: photoKeys(사업) 결과 */
export function isBlankNode(node, nodes, keys) {
  if (!node) return false;
  if (node.linkId) return false;   // 실사 링크로 받은 현장·장소는 미작성으로 보지 않는다(+로 막 만든 것만 미작성)
  const keep = BLANK_KEEP[node.type] || [];
  const init = BLANK_INIT[node.type] || [];
  for (const [k, f] of Object.entries(node.data || {})) {
    if (!f || f.v == null || (Array.isArray(f.v) && !f.v.length)) continue;
    if (keep.includes(k)) continue;
    if (init.includes(k) && Math.abs((f.at || 0) - (node.createdAt || 0)) < INIT_MS) continue;
    return false;
  }
  if (nodes.some((n) => n.parentId === node.id)) return false;
  const pre = node.path + '/';
  return !keys.some((k) => k.ownerPath === node.path || k.ownerPath.startsWith(pre));
}

/** 배지·요약에 세는 미작성 항목: 완료 표시 전은 뺀다. 홈 현장 카드 배지·입력 현황 요약·장소 카드 배지·좌측 메뉴 상태가 모두 이 기준
    (장소 + 설치 지점 + 케이블 경로 전부 포함)으로 센다. miss = missingItems 결과 */
export const NOT_DONE_TEXT = '완료 표시 전';
export const lackItems = (miss) => miss.filter((m) => m.text !== NOT_DONE_TEXT);

/** 미작성 항목 목록 → [{ node, placeId, text }]  (화면 글자는 "미작성 항목", 코드 이름은 missingItems 그대로)
    기준(최소): 장소에 완료 표시가 없음 / 랙 전면 전체 없음 / 랙 후면 전체도 없고 못 찍은 사유도 없음 /
                경로에 출발 없음 · 도착 없음 · 거리 없음 (이 순서)
    미작성 노드(isBlankNode)도 빼지 않는다 — 필요하면 projectSummary 의 blankIds 로 거른다. */
export async function missingItems(projectId, given) {
  const nodes = given ? given.nodes : await projectNodes(projectId);
  const keys = given ? given.keys : await photoKeys(projectId);
  const has = new Set(keys.map((k) => k.ownerPath + '|' + k.slot));
  const out = [];
  for (const n of nodes) {
    if (n.type === 'place' && !val(n, 'done')) out.push({ node: n, placeId: n.id, text: '완료 표시 전' });
    if (n.type === 'point' && val(n, 'form') === '랙') {
      if (!has.has(n.path + '|front')) out.push({ node: n, placeId: n.parentId, text: '전면 없음' });
      if (!has.has(n.path + '|rear') && !val(n, 'rearReason')) out.push({ node: n, placeId: n.parentId, text: '후면 없음' });
    }
    if (n.type === 'route') {
      if (val(n, 'from') == null) out.push({ node: n, placeId: null, text: '출발 없음' });
      if (val(n, 'to') == null) out.push({ node: n, placeId: null, text: '도착 없음' });
      if (typeof val(n, 'dist') !== 'number' && typeof val(n, 'dist') !== 'string') out.push({ node: n, placeId: null, text: '거리 없음' });
    }
  }
  return out;
}

/* ── 사업 링크 받기 ───────────────────────────────────── */
const same = (a, b) => String(a || '').trim() === String(b || '').trim();

/** 사업 링크 내용(js/link.js 의 project 모양)을 저장소에 반영한다.
    · 처음 보는 사업 ID → 새 사업으로 추가
    · 이미 있는 사업 ID → 기존 입력은 그대로 두고, 새 현장·장소만 추가
        같은 것으로 보는 기준: 링크 ID가 같거나, (같은 현장 안에서) 이름이 같으면 이미 있는 것으로 본다.
        새 링크에 없는 현장·장소도 지우지 않는다. 사업명·기간도 바꾸지 않는다.
    돌려주는 값: { projectId, name, isNew, addedSites, addedPlaces } */
export async function receiveProject(payload) {
  const meta = { by: '실사 링크', at: Date.now() };
  let project = await getProject(payload.id);
  let isNew = false;
  let renamedFrom = null;
  let periodChanged = false;
  if (project) {
    // v0.50: 다시 받은 링크의 실사명·기간이 다르면 링크 쪽으로 맞춘다. 링크에 기간이 없으면(앱에서 만든 실사) 기간은 그대로 둔다.
    const hasPeriod = !!(payload.from || payload.to);
    if (payload.name && !same(project.name, payload.name)) renamedFrom = project.name;
    if (hasPeriod && ((project.from || null) !== (payload.from || null) || (project.to || null) !== (payload.to || null))) periodChanged = true;
    if (renamedFrom != null || periodChanged) {
      await db.update('projects', project.id, (p) => {
        if (renamedFrom != null) p.name = payload.name;
        if (periodChanged) { p.from = payload.from || null; p.to = payload.to || null; }
      });
      project = await getProject(project.id);
    }
  }
  if (!project) {
    project = await createProject({ id: payload.id, name: payload.name, from: payload.from, to: payload.to, source: 'link' });
    isNew = true;
  }
  let addedSites = 0;
  let addedPlaces = 0;
  const sites = await children(project.id, 'site');
  const allPlaces = (await projectNodes(project.id)).filter((n) => n.type === 'place');   // 다른 현장으로 옮긴 장소도 같은 것으로 본다
  for (const s of payload.sites) {
    let site = (s.id && sites.find((x) => x.linkId === s.id)) || sites.find((x) => same(val(x, 'name'), s.name));
    if (!site) {
      site = await addNode(project, 'site', { name: s.name }, { linkId: s.id || undefined, meta });
      sites.push(site);
      addedSites++;
    }
    const places = await children(site.id, 'place');
    for (const q of s.places) {
      const found = (q.id && (places.find((x) => x.linkId === q.id) || allPlaces.find((x) => x.linkId === q.id))) || places.find((x) => same(val(x, 'name'), q.name));
      if (!found) {
        const place = await addNode(site, 'place', { name: q.name, kind: q.kind }, { linkId: q.id || undefined, meta });
        places.push(place);
        addedPlaces++;
      }
    }
  }
  // receivedAt(v0.30): 링크로 받거나 다시 받은 때 — 실사 목록 순서와 "방금 받음" 표시에 쓴다(DB 버전은 그대로, 필드만 더함)
  await db.update('projects', project.id, (p) => { const now = Date.now(); p.linkAt = now; p.receivedAt = now; });
  return { projectId: project.id, name: project.name, isNew, addedSites, addedPlaces, renamedFrom, periodChanged };
}

/* ── 작은 값 ──────────────────────────────────────────── */
export async function kvGet(k) { const r = await db.get('kv', k); return r ? r.v : undefined; }
export function kvSet(k, v) { return db.put('kv', { k, v }); }
