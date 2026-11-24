/* trash.js — 삭제·입력 초기화·휴지통
   공개:
     moreItems(scope) → [{ label, sub, value, danger }]    더보기 메뉴에 넣을 항목(screens/more.js 가 붙인다)
     runMoreItem(value, scope, ctx) → Promise              위 항목을 눌렀을 때 (ctx = { go })
     deleteNode(nodeId) → Promise<boolean>                 노드 삭제(목록 카드 [삭제]·더보기 삭제·장비 화면 버튼이 같이 쓴다). 지웠으면 true
     requestDelete(scope) → Promise<boolean>               deleteNode(scope.node.id)
     deleteProject(project) → Promise<boolean>             실사 통째 삭제(실사 카드 [삭제]·홈 더보기 삭제)
     isBlankProject(nodes, keys) → boolean                 실사 미작성 판단(아래 규칙)
     resetScope(scope, ctx) → Promise<boolean>             입력 초기화(경고창 → 휴지통 14일)
     trashPhotoCopy(photo, label, suffix) → Promise        바꾸기 전 사진을 휴지통에 14일 보관(js/photo-slot.js). suffix = label 끝에 붙은 칸 이름(" · 전면 전체") — 위치 글을 다시 만들 때 쓴다
     whereOf(ownerPath) → Promise<string>                  "전산실 · R-01" 같은 위치 글
     purgeExpired() → Promise                              14일 지난 휴지통 완전 삭제(앱 시작 때 app.js 가 부른다)
     renderTrash(ctx) → 화면                                #/p/:pid/trash (ctx.project 있음) · #/trash (ctx.project 없음 = 삭제한 실사)
   scope: { project, node|null, parentHref, whole? }  — node 가 없고 whole:true 면 실사 전체(홈 화면)

   규칙
   · 삭제(실사·현장·장소·경로·설치 지점·장비·자유 추가)는 휴지통에 14일 보관한 뒤 완전히 지운다(아래 딸린 노드·사진 포함).
     확인 창·안내 글에는 "휴지통"이라는 말을 쓰지 않는다.
       미작성(store.isBlankNode, 실사는 isBlankProject)이면 확인 창 없이 바로 지우고 "삭제했습니다".
       그 밖에는 확인 창 한 번: "<이름>을 삭제할까요?" / "설치 지점 2개, 사진 5장이 같이 삭제됩니다."(0인 종류는 뺌)
       [취소] / [삭제](빨강).
     실사 미작성 = 현장·장소 말고는 노드가 없고, 현장·장소에 이름·종류 말고 입력이 없고, 사진이 없다.
     기한 규칙(예전 30일 규칙)은 없다. 언제든 지울 수 있다.
     노드를 지워도 그 아래를 가리키는 휴지통 항목(초기화·바꾸기 전 사진)은 남겨 둔다(그 노드를 되살리면 다시 쓸 수 있다).
     실사를 지워도 그 실사의 휴지통 항목은 남는다(실사를 되살리면 다시 보인다).
   · 입력 초기화(실사 전체·현장·장소·설치 지점): 그 범위의 사진과 입력을 비운다.
       남기는 것: 범위의 맨 위 노드와 그 아래 현장·장소(이름·종류만, 빈 상태). 경로·설치 지점·장비·자유 추가는 빠진다
       (설치 지점 화면에서 초기화하면 그 설치 지점은 이름·설치 형태만 남는다).
       비운 내용은 trash 에 14일 보관 → 되살리기. 되살릴 때 그 사이 새로 넣은 값은 그대로 두고 빈 칸만 채운다.
       한 장짜리 칸(랙 전면·후면)에 그 사이 새 사진이 있으면 새 사진을 휴지통으로 옮기고 되살린 사진을 넣는다.
   trash 레코드:
     { id, projectId, kind:'reset'|'photo'|'node'|'project', label, path, photoCount, deletedAt, expiresAt,
       payload: reset   → { kept:[{ id, data }], removed:[노드 레코드…], photos:[사진 레코드…] }
                photo   → { photo: 사진 레코드(바꾸기 전) }
                node    → { type, nodes:[지운 노드와 그 아래 노드…], photos:[사진 레코드…] }   path = 지운 노드의 path
                project → { project, nodes:[…], photos:[…], kv:[{k,v}] }                     path = null
     node 되살리기: 위 노드(부모)가 있어야 한다. 없으면 "위 항목을 먼저 되살려 주세요".
                    같은 id 노드가 이미 있으면 덮어쓰지 않고 "이미 같은 항목이 있어 되살리지 않았습니다"(휴지통 항목은 그대로).
                    아래 노드·사진도 같은 id 가 이미 있으면 건너뛴다(덮어쓰지 않음).
     path 를 가진 값(rec.path, payload 노드 path, 사진 ownerPath)은 노드를 옮기면(store.moveNode) 같이 바뀐다.
     위치 글(label)은 지운 때의 글자라 그 뒤 이름을 바꾸면 달라진다 → 휴지통 화면은 path 로 지금 이름을 다시 만들어 보여 준다(liveLabel).
       path 의 노드가 하나라도 없으면(상위가 지워졌으면) 저장된 label 을 그대로 쓴다. 사진 항목은 rec.suffix 가 있을 때만 다시 만든다(없던 옛 항목은 저장된 글).
     되살린 장비가 같은 설치 지점의 다른 장비와 U 위치가 겹치면 되살린 뒤 안내 한 줄.
     project 되살리기: 같은 ID 실사가 이미 있으면(그새 실사 링크로 다시 받음 등) 되살리지 않는다. */
import { h, confirmDialog, alertDialog, dialog, toast, nwText } from './ui.js';
import * as db from './db.js';
import { nameOf, val, getProject, getNode, projectNodes, listPhotos, uid, photoKeys, isBlankNode } from './store.js';
import { dayText } from './screens/common.js';

const DAY = 86400000;
const KEEP_DAYS = 14;
const DELETABLE = ['site', 'place', 'route', 'point', 'device', 'extra'];
const RESETTABLE = ['site', 'place', 'point'];
const SINGLE_SLOTS = new Set(['front', 'rear']);      // 한 장짜리 칸(screens/point.js 의 multi:false)
const KEEP = { site: ['name'], place: ['name', 'kind'], point: ['name', 'form'] };
const TYPE = { site: '현장', place: '장소', route: '케이블 경로', point: '설치 지점', device: '장비', extra: '자유 추가' };
const UNIT = { site: '곳', place: '곳', route: '개', point: '개', device: '대', extra: '건' };
const P = (pid) => '#/p/' + encodeURIComponent(pid);
const PUSHED = ' (되살리기로 밀려난 사진)';

/* ── 저장소 도구 ──────────────────────────────────────── */
async function tx(names, fn) {
  const d = await db.openDb();
  return new Promise((resolve, reject) => {
    const t = d.transaction(names, 'readwrite');
    const s = {};
    names.forEach((n) => { s[n] = t.objectStore(n); });
    fn(s);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('저장이 취소되었습니다.'));
  });
}

const inside = (prefix) => (path) => path === prefix || path.startsWith(prefix + '/');

async function gather(project, node) {
  const prefix = node ? node.path : project.id;
  const isIn = inside(prefix);
  const [nodes, photos] = await Promise.all([projectNodes(project.id), db.byIndex('photos', 'projectId', project.id)]);
  return { prefix, nodes: nodes.filter((n) => isIn(n.path)), photos: photos.filter((p) => isIn(p.ownerPath)) };
}

export async function whereOf(ownerPath) {
  const ids = ownerPath.split('/').slice(1);
  const names = [];
  for (const id of ids) {
    const n = await getNode(id);
    if (n) names.push(nameOf(n));
  }
  return names.join(' · ');
}

async function scopeLabel(node) {
  if (!node) return '이 실사 전체';
  const names = [];
  for (const id of node.path.split('/').slice(1, -1)) {
    const n = await getNode(id);
    if (n && n.type !== 'site') names.push(nameOf(n));
  }
  names.push(nameOf(node) + (node.type === 'site' || node.type === 'place' ? ' 전체' : ''));
  return names.join(' · ');
}

/* ── 글 도구 ──────────────────────────────────────────── */
/** 마지막 글자에 받침이 있나(한글·숫자·영문 대략) */
function hasFinal(word) {
  const t = String(word || '').replace(/[\s)\]"'』」.,·]+$/, '');
  const ch = t.slice(-1);
  if (!ch) return false;
  const c = ch.charCodeAt(0) - 0xac00;
  if (c >= 0 && c < 11172) return c % 28 !== 0;
  if (/[0-9]/.test(ch)) return '013678'.includes(ch);
  if (/[a-z]/i.test(ch)) return 'lmnr'.includes(ch.toLowerCase());
  return false;
}
const eul = (w) => w + (hasFinal(w) ? '을' : '를');
const iga = (w) => w + (hasFinal(w) ? '이' : '가');

/** "설치 지점 2개, 사진 5장이 같이 삭제됩니다." (0인 종류는 뺀다. 미작성 항목(store.isBlankNode)은 카드와 같게 세지 않는다)
    allNodes·keys: 사업 안 노드 전부와 photoKeys(사업) — 미작성 판단용 */
function withText(nodes, exceptId, photoCount, allNodes, keys) {
  const parts = [];
  for (const t of ['site', 'place', 'route', 'point', 'device', 'extra']) {
    const c = nodes.filter((x) => x.type === t && x.id !== exceptId && !isBlankNode(x, allNodes, keys)).length;
    if (c) parts.push(TYPE[t] + ' ' + c + UNIT[t]);
  }
  if (photoCount) parts.push('사진 ' + photoCount + '장');
  if (!parts.length) return '입력한 값이 같이 삭제됩니다.';
  const last = parts.pop();
  return parts.concat(iga(last)).join(', ') + ' 같이 삭제됩니다.';
}

/** 삭제 저장이 실패했을 때 안내(데이터는 그대로) */
function failDelete(e) {
  console.error(e);
  return alertDialog('삭제', ['삭제하지 못했습니다. 저장 공간이 부족할 수 있습니다.', '오류: ' + ((e && (e.name ? e.name + ' ' : '') + (e.message || '')) || '알 수 없음').trim()]);
}

function askDelete(name, text) {
  return dialog({
    title: eul(name) + ' 삭제할까요?',
    body: h('p', null, text),
    buttons: [{ label: '취소', cls: 'sub', value: false }, { label: '삭제', cls: 'delred', value: true }],
  }).then((v) => v === true);
}

/* ── 더보기 메뉴 ──────────────────────────────────────── */
export function moreItems(scope) {
  const n = scope.node;
  const items = [];
  if ((n && RESETTABLE.includes(n.type)) || (!n && scope.whole)) {
    items.push({
      label: '입력 초기화',
      sub: (n ? '이 ' + TYPE[n.type] : '이 실사 전체') + '의 사진과 입력을 비웁니다 (14일 동안 휴지통에 보관)',
      value: 'trash:reset',
    });
  }
  items.push({ label: '휴지통', sub: '삭제·초기화한 내용, 바꾸기 전 사진 되살리기', value: 'trash:open' });
  if (n && DELETABLE.includes(n.type)) {
    items.push({ label: '"' + nameOf(n) + '" 삭제', value: 'trash:delete', danger: true });
  }
  if (!n && scope.whole) {
    items.push({ label: '실사 "' + scope.project.name + '" 삭제', value: 'trash:deleteProject', danger: true });
  }
  return items;
}

export async function runMoreItem(value, scope, ctx) {
  if (value === 'trash:reset') {
    if (await resetScope(scope)) ctx.go(location.hash || P(scope.project.id), { replace: true });
  } else if (value === 'trash:open') {
    ctx.go(P(scope.project.id) + '/trash');
  } else if (value === 'trash:delete') {
    if (await requestDelete(scope)) ctx.go(scope.parentHref || P(scope.project.id), { replace: true });
  } else if (value === 'trash:deleteProject') {
    if (await deleteProject(scope.project)) ctx.go('#/', { replace: true });
  }
}

/* ── 삭제 (휴지통 14일) ───────────────────────────────── */
export function requestDelete(scope) {
  return scope.node ? deleteNode(scope.node.id) : Promise.resolve(false);
}

/** 노드 삭제: 미작성이면 바로, 아니면 확인 창 한 번. 지운 것은 휴지통(kind:'node')에 14일. */
export async function deleteNode(nodeId) {
  const node = await getNode(nodeId);
  if (!node || !DELETABLE.includes(node.type)) return false;
  const project = await getProject(node.projectId);
  if (!project) return false;
  const [all, keys] = await Promise.all([projectNodes(project.id), photoKeys(project.id)]);
  if (!isBlankNode(node, all, keys)) {
    const { nodes, photos } = await gather(project, node);
    if (!(await askDelete(nameOf(node), withText(nodes, node.id, photos.length, all, keys)))) return false;
  }
  const cur = await getNode(nodeId);          // 창이 열린 사이 바뀌었을 수 있어 다시 읽는다
  if (!cur) return false;
  const { nodes, photos } = await gather(project, cur);
  const now = Date.now();
  const rec = {
    id: uid(), projectId: project.id, kind: 'node', label: (await whereOf(cur.path)) || nameOf(cur), path: cur.path,
    photoCount: photos.length, deletedAt: now, expiresAt: now + KEEP_DAYS * DAY,
    payload: { type: cur.type, nodes, photos },
  };
  try {
    await tx(['trash', 'photos', 'nodes', 'projects'], (s) => {
      s.trash.put(rec);
      photos.forEach((p) => s.photos.delete(p.id));
      nodes.forEach((n) => s.nodes.delete(n.id));
      s.projects.put({ ...project, changedAt: now });
    });
  } catch (e) {
    await failDelete(e);
    return false;
  }
  toast('삭제했습니다');
  return true;
}

/** 실사 미작성: 현장·장소 말고는 노드가 없고, 현장·장소에 이름·종류 말고 입력이 없고, 사진이 없다 */
export function isBlankProject(nodes, keys) {
  if (keys.length) return false;
  return nodes.every((n) => (n.type === 'site' || n.type === 'place')
    && Object.entries(n.data || {}).every(([k, f]) => KEEP[n.type].includes(k) || !f || f.v == null || (Array.isArray(f.v) && !f.v.length)));
}

/** 실사 통째 삭제: 미작성이면 바로, 아니면 확인 창 한 번. 휴지통(kind:'project')에 14일. */
export async function deleteProject(given) {
  const project = await getProject(given.id);
  if (!project) return false;
  const [nodes0, keys] = await Promise.all([projectNodes(project.id), photoKeys(project.id)]);
  if (!isBlankProject(nodes0, keys)) {
    if (!(await askDelete(project.name, withText(nodes0, null, keys.length, nodes0, keys)))) return false;
  }
  const { nodes, photos } = await gather(project, null);
  const asked = await db.get('kv', 'exportAsked:' + project.id);
  const now = Date.now();
  const rec = {
    id: uid(), projectId: project.id, kind: 'project', label: project.name, path: null,
    photoCount: photos.length, deletedAt: now, expiresAt: now + KEEP_DAYS * DAY,
    payload: { project, nodes, photos, kv: asked ? [asked] : [] },
  };
  try {
    await tx(['nodes', 'photos', 'trash', 'projects', 'kv'], (s) => {
      s.trash.put(rec);
      nodes.forEach((n) => s.nodes.delete(n.id));
      photos.forEach((p) => s.photos.delete(p.id));
      s.projects.delete(project.id);
      s.kv.delete('exportAsked:' + project.id);
    });
  } catch (e) {
    await failDelete(e);
    return false;
  }
  toast('삭제했습니다');
  return true;
}

/* ── 입력 초기화 ──────────────────────────────────────── */
const keepKeys = (n) => KEEP[n.type] || [];

export async function resetScope(scope) {
  const project = await getProject(scope.project.id);
  const node = scope.node ? await getNode(scope.node.id) : null;
  if (!project || (scope.node && !node)) return false;
  if (node && !RESETTABLE.includes(node.type)) return false;
  const { prefix, nodes, photos } = await gather(project, node);
  const rootId = node ? node.id : null;
  const kept = [];
  const removed = [];
  for (const n of nodes) {
    if (n.id === rootId || n.type === 'site' || n.type === 'place') kept.push(n);
    else removed.push(n);
  }
  const hasData = kept.some((n) => Object.keys(n.data).some((k) => !keepKeys(n).includes(k) && n.data[k] && n.data[k].v != null));
  if (!hasData && !removed.length && !photos.length) {
    await alertDialog('입력 초기화', '비울 사진이나 입력이 없습니다.');
    return false;
  }
  const label = await scopeLabel(node);
  const places = nodes.filter((n) => n.type === 'place').length;
  const what = places && (!node || node.type !== 'place')
    ? '장소 ' + places + '곳에 입력한 기록 전부'
    : (node ? '이 ' + TYPE[node.type] + '에 입력한 기록 전부' : '입력한 기록 전부');
  const keepText = !node ? '실사 이름과 현장·장소 목록 (빈 상태로 다시 시작)'
    : node.type === 'site' ? '현장 이름과 장소 목록 (빈 상태로 다시 시작)'
      : node.type === 'place' ? '장소 이름과 종류 (빈 상태로 다시 시작)'
        : '이름과 설치 형태 (빈 상태로 다시 시작)';
  const v = await dialog({
    title: '입력을 초기화할까요?',
    body: [
      h('p', null, node ? label : project.name),
      h('p', { class: 'lost' }, '! 비워지는 것\n· 앱 안의 사진 ' + photos.length + '장\n· ' + what),
      h('p', null, h('strong', null, '14일 동안 휴지통에 보관됩니다.'), '\n그 안에는 되살릴 수 있고, 14일이 지나면 완전히 지워집니다.'),
      h('p', null, h('strong', null, '남는 것'), '\n· ' + keepText + (project.exportedAt ? '\n· 이미 내보낸 파일(zip)' : '')),
    ],
    buttons: [{ label: '취소', cls: 'sub', value: false }, { label: '초기화', cls: 'kill', value: true }],
  });
  if (v !== true) return false;

  const now = Date.now();
  const rec = {
    id: uid(), projectId: project.id, kind: 'reset', label, path: prefix, photoCount: photos.length,
    payload: { kept: kept.map((n) => ({ id: n.id, data: n.data })), removed, photos },
    deletedAt: now, expiresAt: now + KEEP_DAYS * DAY,
  };
  await tx(['trash', 'photos', 'nodes', 'projects'], (s) => {
    s.trash.put(rec);
    photos.forEach((p) => s.photos.delete(p.id));
    removed.forEach((n) => s.nodes.delete(n.id));
    kept.forEach((n) => {
      const data = {};
      for (const k of keepKeys(n)) if (n.data[k]) data[k] = n.data[k];
      s.nodes.put({ ...n, data, updatedAt: now });
    });
    s.projects.put({ ...project, changedAt: now });
  });
  toast('초기화했습니다. 휴지통에서 14일 동안 되살릴 수 있습니다.', 4500);
  return true;
}

/* ── 사진 바꾸기 전 보관 ──────────────────────────────── */
function photoTrashRec(photo, label, now, suffix) {
  const rec = {
    id: uid(), projectId: photo.projectId, kind: 'photo', label: label || '', path: photo.ownerPath, photoCount: 1,
    payload: { photo: { ...photo } }, deletedAt: now, expiresAt: now + KEEP_DAYS * DAY,
  };
  if (typeof suffix === 'string') rec.suffix = suffix;
  return rec;
}

export async function trashPhotoCopy(photo, label, suffix) {
  await db.put('trash', photoTrashRec(photo, label, Date.now(), suffix));
}

export async function purgeExpired() {
  const keys = await db.keysByIndex('trash', 'expiresAt', IDBKeyRange.upperBound(Date.now()));
  await db.delMany('trash', keys.map((k) => k.primaryKey));
}

/* ── 되살리기 ─────────────────────────────────────────── */
/** 삭제한 실사 되살리기. 돌려주는 값: { skipped:0, bumped:0 } 또는 { blocked: 글 } */
async function restoreProject(rec) {
  if (await getProject(rec.projectId)) return { blocked: '같은 실사가 이미 목록에 있어 되살릴 수 없습니다.' };
  const { project, nodes, photos, kv } = rec.payload;
  await tx(['trash', 'photos', 'nodes', 'projects', 'kv'], (s) => {
    s.trash.delete(rec.id);
    s.projects.put({ ...project, changedAt: Date.now() });
    nodes.forEach((n) => s.nodes.put(n));
    photos.forEach((p) => s.photos.put(p));
    (kv || []).forEach((r) => s.kv.put(r));
  });
  return { skipped: 0, bumped: 0 };
}

/** 삭제한 노드 되살리기(아래 노드·사진 그대로). 위 노드가 없으면 되살리지 않는다.
    같은 id 노드가 이미 있으면 덮어쓰지 않고 되살리지 않는다(휴지통 항목 그대로). 아래 노드·사진도 같은 id 가 있으면 건너뛴다. */
async function restoreNode(rec, project) {
  const { nodes, photos } = rec.payload;
  const root = nodes.find((n) => n.path === rec.path);
  if (!root) return null;
  if (await getNode(root.id)) return { blocked: '이미 같은 항목이 있어 되살리지 않았습니다.' };
  if (root.parentId !== project.id && !(await getNode(root.parentId))) {
    return { blocked: '위 항목이 삭제되어 있어 되살릴 수 없습니다.\n위 항목을 먼저 되살려 주세요.' };
  }
  const haveNodes = new Set((await projectNodes(project.id)).map((n) => n.id));
  const havePhotos = new Set((await db.keysByIndex('photos', 'projectId', IDBKeyRange.only(project.id))).map((k) => k.primaryKey));
  const nodePuts = nodes.filter((n) => !haveNodes.has(n.id));
  const photoPuts = photos.filter((p) => !havePhotos.has(p.id));
  const dup = nodes.length - nodePuts.length + photos.length - photoPuts.length;
  const now = Date.now();
  await tx(['trash', 'photos', 'nodes', 'projects'], (s) => {
    s.trash.delete(rec.id);
    nodePuts.forEach((n) => s.nodes.put(n));
    photoPuts.forEach((p) => s.photos.put(p));
    s.projects.put({ ...project, changedAt: now });
  });
  return { skipped: 0, bumped: 0, dup, put: nodePuts.map((n) => n.id) };
}

async function restore(id) {
  const rec = await db.get('trash', id);
  if (!rec) return null;
  if (rec.kind === 'project') return restoreProject(rec);
  const project = await getProject(rec.projectId);
  if (!project) return null;
  if (rec.kind === 'node') return restoreNode(rec, project);
  const now = Date.now();
  const nodesNow = await projectNodes(project.id);
  const byId = new Map(nodesNow.map((n) => [n.id, n]));
  const alive = new Set(byId.keys());
  const nodePuts = [];
  let skipped = 0;

  if (rec.kind === 'reset') {
    for (const k of rec.payload.kept) {
      const cur = byId.get(k.id);
      if (!cur) { skipped++; continue; }
      const data = { ...cur.data };
      let changed = false;
      for (const [key, f] of Object.entries(k.data || {})) {
        if (!data[key] || data[key].v == null) { data[key] = f; changed = true; }
      }
      if (changed) nodePuts.push({ ...cur, data, updatedAt: now });
    }
    const removed = rec.payload.removed.slice().sort((a, b) => a.path.split('/').length - b.path.split('/').length);
    for (const n of removed) {
      if (alive.has(n.id)) continue;
      if (n.parentId === project.id || alive.has(n.parentId)) { nodePuts.push(n); alive.add(n.id); } else skipped++;
    }
  }

  const list = rec.kind === 'reset' ? rec.payload.photos : [rec.payload.photo];
  const groups = new Map();
  for (const p of list) {
    const key = p.ownerPath + '\u0000' + p.slot;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const photoPuts = [];
  const photoDels = [];
  const trashPuts = [];
  for (const g of groups.values()) {
    const ownerId = g[0].ownerPath.split('/').pop();
    if (!alive.has(ownerId)) { skipped += g.length; continue; }
    const cur = await listPhotos(g[0].ownerPath, g[0].slot);
    const back = g.slice().sort((a, b) => a.order - b.order).map((p) => ({
      ...p, id: rec.kind === 'photo' || cur.some((c) => c.id === p.id) ? uid() : p.id, changedAt: now,
    }));
    let rest = cur;
    if (SINGLE_SLOTS.has(g[0].slot)) {
      if (cur.length) {
        const where = await whereOf(g[0].ownerPath);
        cur.forEach((c) => { trashPuts.push(photoTrashRec(c, where + PUSHED, now, PUSHED)); photoDels.push(c.id); });
      }
      rest = [];
      back.splice(1);
    }
    const ordered = rec.kind === 'photo' ? rest.concat(back) : back.concat(rest);
    ordered.forEach((p, i) => {
      if (back.includes(p)) photoPuts.push({ ...p, order: i });
      else if (p.order !== i) photoPuts.push({ ...p, order: i });
    });
  }

  await tx(['trash', 'photos', 'nodes', 'projects'], (s) => {
    s.trash.delete(rec.id);
    trashPuts.forEach((t) => s.trash.put(t));
    photoDels.forEach((pid) => s.photos.delete(pid));
    photoPuts.forEach((p) => s.photos.put(p));
    nodePuts.forEach((n) => s.nodes.put(n));
    s.projects.put({ ...project, changedAt: now });
  });
  return { skipped, bumped: trashPuts.length, put: nodePuts.map((n) => n.id) };
}

/** 되살린 장비(ids)가 같은 설치 지점의 다른 장비와 U 위치(랙 높이 안)가 겹치는지. 화면의 가상 랙(screens/point.js)과 같은 기준 */
async function overlapsAfter(projectId, ids) {
  const nodes = await projectNodes(projectId);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const spans = new Map();      // 설치 지점 id → [{ id, lo, hi }]
  for (const d of nodes) {
    if (d.type !== 'device' || (val(d, 'pos') || 'U 위치') !== 'U 위치') continue;
    const u = val(d, 'u');
    const pt = byId.get(d.parentId);
    const H = pt ? val(pt, 'height') : null;
    if (typeof u !== 'number' || typeof H !== 'number' || H < 1) continue;
    const N = Math.min(Math.floor(H), 60);
    if (u < 1 || u > N) continue;
    if (!spans.has(pt.id)) spans.set(pt.id, []);
    spans.get(pt.id).push({ id: d.id, lo: u, hi: Math.min(N, u + Math.max(1, Math.floor(Number(val(d, 'h')) || 1)) - 1) });
  }
  const mine = new Set(ids);
  for (const list of spans.values()) {
    for (const a of list) {
      if (mine.has(a.id) && list.some((b) => b.id !== a.id && a.lo <= b.hi && b.lo <= a.hi)) return true;
    }
  }
  return false;
}

/** 위치 글을 지금 이름으로 다시 만든다. path 의 노드가 하나라도 없으면 저장된 label 그대로 */
function liveLabel(t, byId) {
  if (!t.path || t.kind === 'project') return t.label;
  const pl = t.payload || {};
  const gone = new Map((pl.nodes || []).concat(pl.removed || []).map((n) => [n.id, n]));     // 지운 노드 자신·그 아래
  const list = [];
  for (const id of t.path.split('/').slice(1)) {
    const n = byId.get(id) || gone.get(id);
    if (!n) return t.label;
    list.push(n);
  }
  if (!list.length) return t.label;
  if (t.kind === 'node') return list.map(nameOf).join(' · ');
  if (t.kind === 'photo') return typeof t.suffix === 'string' ? list.map(nameOf).join(' · ') + t.suffix : t.label;
  if (t.kind === 'reset') {                       // scopeLabel 과 같은 모양: 현장은 맨 끝일 때만, 현장·장소가 맨 끝이면 " 전체"
    return list.map((n, i) => {
      const last = i === list.length - 1;
      if (n.type === 'site' && !last) return null;
      return nameOf(n) + (last && (n.type === 'site' || n.type === 'place') ? ' 전체' : '');
    }).filter(Boolean).join(' · ');
  }
  return t.label;
}

/* ── 휴지통 화면 ──────────────────────────────────────── */
let trashUrls = [];

export async function renderTrash(ctx) {
  trashUrls.forEach((u) => URL.revokeObjectURL(u));
  trashUrls = [];
  await purgeExpired().catch((e) => console.error(e));
  const pid = ctx.project ? ctx.project.id : null;
  const all = pid ? await db.byIndex('trash', 'projectId', pid) : await db.getAll('trash');
  const list = all.filter((t) => (pid ? t.kind !== 'project' : t.kind === 'project')).sort((a, b) => b.deletedAt - a.deletedAt);
  const byId = new Map((pid ? await projectNodes(pid) : []).map((n) => [n.id, n]));
  const lbl = (t) => liveLabel(t, byId);
  const now = Date.now();
  const left = (t) => Math.max(1, Math.ceil((t.expiresAt - now) / DAY)) + '일 남음';
  /** 부제 한 줄: 조각들을 ' · ' 로 잇고, 마지막 "N일 남음"은 줄바꿈 없이 한 덩어리로 */
  const meta = (bits, t) => h('i', null, nwText(bits.filter(Boolean).join(' · ')), ' · ', h('span', { class: 'nw' }, left(t)));
  const askBody = (t) => {
    if (t.kind === 'reset') return [h('p', null, lbl(t) + ' · 사진 ' + t.photoCount + '장'), h('p', null, '그 사이 새로 넣은 값은 그대로 두고, 비어 있는 칸만 채웁니다.')];
    if (t.kind === 'photo') return [h('p', null, lbl(t)), h('p', null, '사진이 원래 칸에 다시 들어갑니다. 지금 사진은 그대로 둡니다(한 장짜리 칸이면 지금 사진을 휴지통으로 옮깁니다).')];
    if (t.kind === 'project') return [h('p', null, t.label + ' · 사진 ' + t.photoCount + '장'), h('p', null, '실사 목록에 다시 나옵니다.')];
    return [h('p', null, lbl(t) + ' · 사진 ' + t.photoCount + '장'), h('p', null, '아래 딸린 항목과 사진도 같이 되살립니다.')];
  };

  const rows = list.map((t) => {
    const back = h('button', {
      type: 'button', class: 'go',
      onclick: async () => {
        const ok = await confirmDialog({ title: '되살릴까요?', body: askBody(t), ok: '되살리기' });
        if (!ok) return;
        try {
          const r = await restore(t.id);
          if (!r) { toast('이미 없는 항목입니다.'); }
          else if (r.blocked) { await alertDialog('되살리기', r.blocked); }
          else {
            const bits = ['되살렸습니다.'];
            if (r.skipped) bits.push('되살릴 곳이 지워져 되살리지 못한 것 ' + r.skipped + '개');
            if (r.dup) bits.push('이미 있어 건너뛴 것 ' + r.dup + '개');
            if (r.bumped) bits.push('밀려난 사진 ' + r.bumped + '장은 휴지통에');
            const lap = r.put && r.put.length && await overlapsAfter(t.projectId, r.put);
            if (lap) bits.push('같은 U 위치에 다른 장비가 있어 겹쳐 있습니다.');
            toast(bits.join(' '), lap ? 7000 : 4500);
          }
        } catch (e) {
          console.error(e);
          await alertDialog('되살리기', '되살리지 못했습니다.\n' + ((e && e.message) || ''));
        }
        ctx.refresh();
      },
    }, '되살리기');
    if (t.kind === 'photo') {
      const p = t.payload && t.payload.photo;
      const src = p && (p.thumb || p.blob);
      let img = null;
      if (src) { const u = URL.createObjectURL(src); trashUrls.push(u); img = h('img', { class: 'tr-img', src: u, alt: '' }); }
      return h('div', { class: 'card' }, img,
        h('div', { class: 't' }, h('b', null, '바꾸기 전 사진'), meta([lbl(t), dayText(ymd(t.deletedAt)) + ' 바꿈'], t)),
        back);
    }
    const what = t.kind === 'reset' ? ' 초기화' : ' 삭제';
    const head = t.kind === 'node' ? (TYPE[t.payload && t.payload.type] || '') : t.kind === 'project' ? '실사' : '';
    return h('div', { class: 'card' },
      h('div', { class: 't' }, h('b', null, nwText(lbl(t))), meta([head, dayText(ymd(t.deletedAt)) + what, '사진 ' + t.photoCount + '장'], t)),
      back);
  });

  return {
    title: '휴지통',
    sub: pid ? ctx.project.name : '삭제한 실사',
    crumbs: pid
      ? [{ label: '홈', href: P(pid) }, { label: '더보기' }, { label: '휴지통' }]
      : [{ label: '‹ 실사 목록', href: '#/' }, { label: '휴지통' }],
    menu: pid ? 'home' : null,
    body: [
      rows.length ? rows : h('p', { class: 'empty' }, pid ? '휴지통이 비어 있습니다.' : '삭제한 실사가 없습니다.'),
      h('p', { class: 'sec' }, '14일이 지나면 완전히 지워집니다.'),
    ],
  };
}

function ymd(ms) {
  const d = new Date(ms);
  const z = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}
