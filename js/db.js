/* db.js — IndexedDB 낮은 단계 (DB 이름 'fieldnote', 버전 1)
   공개: openDb(), get(store,key), getAll(store), put(store,value), del(store,key),
         update(store,key,fn), byIndex(store,index,query), keysByIndex(store,index,range),
         countByIndex(store,index,range), delMany(store,keys), under(path), STORES
   업무 규칙(사업·장소·사진 다루기)은 js/store.js 에 있다. 다른 모듈은 되도록 store.js 를 쓴다.

   ── 저장소와 레코드 모양 ─────────────────────────────────────────
   projects  (key: id)
     { id, name, from, to,            // 실사 기간 'YYYY-MM-DD' 또는 null
       source: 'link'|'manual', createdAt, changedAt, exportedAt|null, linkAt?, meta }

   nodes     (key: id)  index: projectId, parentId, path
     { id, projectId, parentId,       // 현장의 parentId 는 사업 id
       path,                          // '사업id/현장id/장소id/…' — 만든 뒤 바뀌지 않는다
       type: 'site'|'place'|'route'|'point'|'device'|'extra',
       order, linkId?,                // linkId: 사업 링크에 들어 있던 ID(재수신 때 맞춰 보는 값)
       data: { [항목]: { v, by, at } },   // 값마다 입력자·시각 (예전 기록의 stage 는 무시)
       createdAt, updatedAt }
     · 여러 줄 항목(VLAN 표, FDF 행선지)은 v 가 배열: [{ id, …칸, _m:{by,at} }]
     · 공사 조건은 장소(place) 노드의 'cond_' 로 시작하는 항목에 들어간다.

   photos    (key: id)  index: projectId, ownerPath, owner_slot[ownerPath+slot], project_created[projectId+createdAt]
     { id, projectId,
       ownerPath,                     // 사진이 달린 노드의 path
       slot,                          // 칸 이름: 'overview'|'front'|'rear'|'closeup'|'label'|… (docs/ARCH.md 표)
       order,                         // 같은 칸 안의 순서(0부터)
       blob,                          // 원본(SA-B가 줄인 사진으로 바꿀 수 있음)
       thumb,                         // 작은 그림 Blob 또는 null
       source: 'camera'|'gallery',    // 바로 찍기 / 갤러리
       takenAt, exif,                 // 촬영 시각(ms), 메타정보(없으면 null)
       corrected,                     // 보정 결과(SA-D). 없으면 null
       createdAt, changedAt?,         // changedAt: 다시 찍기·바꾸기·보정으로 바뀐 때(store.putPhoto 가 찍음)
       meta:{by,at} }
     · blob 은 줄인 사진(긴 변 2560px, JPEG 0.85), thumb 는 긴 변 320px. exif 모양은 js/photo-proc.js 주석

   trash     (key: id)  index: projectId, expiresAt     — SA-B가 쓴다(초기화·사진 바꾸기 7일 보관)
     { id, projectId, kind:'reset'|'photo', label, path, payload, photoCount, deletedAt, expiresAt }   (모양은 js/trash.js 주석)

   kv        (key: k)   { k, v }                         — 그 밖의 작은 값(알림을 띄웠는지 등)
*/
const DB_NAME = 'fieldnote';
const DB_VERSION = 1;
export const STORES = ['projects', 'nodes', 'photos', 'trash', 'kv'];

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('nodes')) {
        const s = db.createObjectStore('nodes', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId');
        s.createIndex('parentId', 'parentId');
        s.createIndex('path', 'path', { unique: true });
      }
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId');
        s.createIndex('ownerPath', 'ownerPath');
        s.createIndex('owner_slot', ['ownerPath', 'slot']);
        s.createIndex('project_created', ['projectId', 'createdAt']);
      }
      if (!db.objectStoreNames.contains('trash')) {
        const s = db.createObjectStore('trash', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId');
        s.createIndex('expiresAt', 'expiresAt');
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => console.warn('다른 탭이 열려 있어 저장소를 올리지 못했습니다.');
  });
  return dbPromise;
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

async function store(name, mode = 'readonly') {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(name, key) { return wrap((await store(name)).get(key)); }
export async function getAll(name) { return wrap((await store(name)).getAll()); }
export async function put(name, value) { await wrap((await store(name, 'readwrite')).put(value)); return value; }
export async function del(name, key) { return wrap((await store(name, 'readwrite')).delete(key)); }

/** 읽고-고치고-쓰기를 한 트랜잭션에서 한다. fn(record) 가 record 를 직접 고친다. 없는 키면 null. */
export async function update(name, key, fn) {
  const s = await store(name, 'readwrite');
  return new Promise((resolve, reject) => {
    const g = s.get(key);
    g.onerror = () => reject(g.error);
    g.onsuccess = () => {
      const rec = g.result;
      if (!rec) { resolve(null); return; }
      fn(rec);
      const p = s.put(rec);
      p.onerror = () => reject(p.error);
      p.onsuccess = () => resolve(rec);
    };
  });
}

export async function byIndex(name, index, query) {
  return wrap((await store(name)).index(index).getAll(query));
}

/** 값(사진 Blob 등)을 읽지 않고 색인 키만 훑는다 → [{ key, primaryKey }] */
export async function keysByIndex(name, index, range) {
  const s = await store(name);
  return new Promise((resolve, reject) => {
    const out = [];
    const req = s.index(index).openKeyCursor(range);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const c = req.result;
      if (!c) { resolve(out); return; }
      out.push({ key: c.key, primaryKey: c.primaryKey });
      c.continue();
    };
  });
}

export async function countByIndex(name, index, range) {
  return wrap((await store(name)).index(index).count(range));
}

export async function delMany(name, keys) {
  if (!keys.length) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    const s = tx.objectStore(name);
    keys.forEach((k) => s.delete(k));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** path 아래(자기 자신 제외)를 가리키는 범위. 자기 자신은 IDBKeyRange.only(path) 로 따로 읽는다. */
export function under(path) {
  return IDBKeyRange.bound(path + '/', path + '/￿');
}
