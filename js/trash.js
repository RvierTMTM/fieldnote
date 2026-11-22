/* trash.js — 삭제·입력 초기화·휴지통
   공개:
     moreItems(scope) → [{ label, sub, value, danger }]    더보기 메뉴에 넣을 항목(screens/more.js 가 붙인다)
     runMoreItem(value, scope, ctx) → Promise              위 항목을 눌렀을 때 (ctx = { go })
     requestDelete(scope) → Promise<boolean>               노드 지우기(경고창 포함). 지웠으면 true
     deleteBlank(nodeId) → Promise<boolean>                미작성(store.isBlankNode) 노드를 확인 창 없이 바로 지움 + "빈 항목을 지웠습니다".
                                                           현장도 30일 규칙 없이 지운다. 그새 값이 들어갔으면 지우지 않는다.
     requestDeleteProject(project) → Promise<boolean>      사업 통째 지우기(30일 규칙 + 내보낸 적 없으면 확인 한 번 더)
     projectDeleteButton(project, ctx) → HTMLElement|null  사업 카드의 "삭제" 버튼(30일 전에는 null)
     canDeleteWhole(project) → boolean, wholeDeleteBase(project) → { at, by:'period'|'input' }
     resetScope(scope, ctx) → Promise<boolean>             입력 초기화(경고창 → 휴지통 7일)
     trashPhotoCopy(photo, label) → Promise                바꾸기 전 사진을 휴지통에 7일 보관(js/photo-slot.js)
     whereOf(ownerPath) → Promise<string>                  "전산실 · R-01" 같은 위치 글
     purgeExpired() → Promise                              7일 지난 휴지통 완전 삭제(앱 시작 때 app.js 가 부른다)
     renderTrash(ctx) → 화면                                #/p/:pid/trash
   scope: { project, node|null, parentHref, whole? }  — node 가 없고 whole:true 면 사업 전체(홈 화면)

   규칙
   · 삭제(사업·현장·장소·경로·설치 지점·장비·자유 추가·사진)는 바로 지운다(복구 불가). 경고창에 사진 수,
     아직 안 내보낸 기록이면 따로 경고. 내보낸 적 없는 사업은 확인을 한 번 더 받는다.
   · 사업·현장 통째 삭제는 기준일 + 30일이 지나야 보인다.
       기준일 = 사업의 실사 기간 끝 날짜(project.to)가 끝나는 때(그 다음 날 0시).
                끝 날짜가 없으면 마지막 입력 시각(project.changedAt — 노드·사진이 바뀔 때마다 store 가 갱신).
       현장도 같은 사업 기준일을 쓴다.
   · 입력 초기화(사업 전체·현장·장소·설치 지점): 그 범위의 사진과 입력을 비운다.
       남기는 것: 범위의 맨 위 노드와 그 아래 현장·장소(이름·종류만, 빈 상태). 경로·설치 지점·장비·자유 추가는 빠진다
       (설치 지점 화면에서 초기화하면 그 설치 지점은 이름·설치 형태만 남는다).
       비운 내용은 trash 에 7일 보관 → 되살리기. 되살릴 때 그 사이 새로 넣은 값은 그대로 두고 빈 칸만 채운다.
       한 장짜리 칸(랙 전면·후면)에 그 사이 새 사진이 있으면 새 사진을 휴지통으로 옮기고 되살린 사진을 넣는다.
   trash 레코드:
     { id, projectId, kind:'reset'|'photo', label, path(범위 path 또는 사진 ownerPath), photoCount, deletedAt, expiresAt,
       payload: reset → { kept:[{ id, data }], removed:[노드 레코드…], photos:[사진 레코드…] }
                photo → { photo: 사진 레코드(바꾸기 전) } } */
import { h, confirmDialog, alertDialog, dialog, toast } from './ui.js';
import * as db from './db.js';
import { removeNodeDeep, nameOf, getProject, getNode, projectNodes, listPhotos, uid, photoKeys, isBlankNode } from './store.js';
import { dayText } from './screens/common.js';

const DAY = 86400000;
const KEEP_DAYS = 7;
const WHOLE_DAYS = 30;
const DELETABLE = ['place', 'route', 'point', 'device', 'extra'];
const RESETTABLE = ['site', 'place', 'point'];
const SINGLE_SLOTS = new Set(['front', 'rear']);      // 한 장짜리 칸(screens/point.js 의 multi:false)
const KEEP = { site: ['name'], place: ['name', 'kind'], point: ['name', 'form'] };
const TYPE = { site: '현장', place: '장소', route: '케이블 경로', point: '설치 지점', device: '장비', extra: '자유 추가' };
const P = (pid) => '#/p/' + encodeURIComponent(pid);

/* ── 30일 규칙 ────────────────────────────────────────── */
export function wholeDeleteBase(project) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(project.to || '');
  if (m) return { at: new Date(+m[1], +m[2] - 1, +m[3] + 1).getTime(), by: 'period' };
  return { at: project.changedAt || project.createdAt || Date.now(), by: 'input' };
}
export function canDeleteWhole(project) {
  return Date.now() >= wholeDeleteBase(project).at + WHOLE_DAYS * DAY;
}

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

/** 'never' = 한 번도 안 내보냄, 'since' = 마지막 내보내기 뒤에 바뀜, null = 다 보냄 */
function unexportedState(project, nodes, photos) {
  const at = project.exportedAt;
  if (!at) return (nodes.length || photos.length) ? 'never' : null;
  if (photos.some((p) => Math.max(p.createdAt || 0, p.changedAt || 0) > at)) return 'since';
  if (nodes.some((n) => (n.updatedAt || 0) > at)) return 'since';
  return null;
}

function countText(nodes, exceptId) {
  const n = (t, unit) => {
    const c = nodes.filter((x) => x.type === t && x.id !== exceptId).length;
    return c ? TYPE[t] + ' ' + c + unit : null;
  };
  return [n('site', '곳'), n('place', '곳'), n('route', '개'), n('point', '곳'), n('device', '대'), n('extra', '건')].filter(Boolean).join(' · ');
}

function unexportedNote(state) {
  if (state === 'never') return h('p', { class: 'lost' }, '! 아직 한 번도 내보내지 않았습니다.\n내보낸 적이 없으면 원본 사진도 어디에도 남지 않습니다.');
  if (state === 'since') return h('p', { class: 'lost' }, '! 마지막 내보내기 뒤에 바뀐 기록이 있습니다.\n그 부분은 내보낸 파일(zip)에도 없습니다.');
  return null;
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

/** 지운 노드 아래를 가리키는 휴지통 항목도 함께 지운다(되살릴 곳이 없으므로) */
async function dropTrashUnder(projectId, path) {
  const list = await db.byIndex('trash', 'projectId', projectId);
  const isIn = inside(path);
  await db.delMany('trash', list.filter((t) => t.path && isIn(t.path)).map((t) => t.id));
}

/* ── 더보기 메뉴 ──────────────────────────────────────── */
export function moreItems(scope) {
  const n = scope.node;
  const items = [];
  if ((n && RESETTABLE.includes(n.type)) || (!n && scope.whole)) {
    items.push({
      label: '입력 초기화',
      sub: (n ? '이 ' + TYPE[n.type] : '이 실사 전체') + '의 사진과 입력을 비웁니다 (7일 동안 휴지통에 보관)',
      value: 'trash:reset',
    });
  }
  items.push({ label: '휴지통', sub: '초기화한 내용·바꾸기 전 사진 되살리기', value: 'trash:open' });
  if (n && (DELETABLE.includes(n.type) || (n.type === 'site' && canDeleteWhole(scope.project)))) {
    items.push({ label: '"' + nameOf(n) + '" 삭제', value: 'trash:delete', danger: true });
  }
  if (!n && scope.whole && canDeleteWhole(scope.project)) {
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
    if (await requestDeleteProject(scope.project)) ctx.go('#/', { replace: true });
  }
}

/* ── 삭제 ─────────────────────────────────────────────── */
export async function requestDelete(scope) {
  const node = scope.node && (await getNode(scope.node.id));
  if (!node) return false;
  if (!DELETABLE.includes(node.type) && node.type !== 'site') return false;
  const project = await getProject(node.projectId);
  if (node.type === 'site' && !canDeleteWhole(project)) {
    await alertDialog('삭제', '현장 삭제는 실사가 끝나고 30일이 지나야 할 수 있습니다.');
    return false;
  }
  const { nodes, photos } = await gather(project, node);
  const rest = countText(nodes, node.id);
  const ok = await confirmDialog({
    title: '정말 삭제할까요?',
    body: [
      h('p', null, TYPE[node.type] + ' · ' + nameOf(node)),
      h('p', { class: 'lost' }, '! 지워지는 것\n· 앱 안의 원본 사진 ' + photos.length + '장\n· 입력한 기록 전부' + (rest ? ' (' + rest + ')' : '') + '\n복구할 수 없습니다.'),
      unexportedNote(unexportedState(project, nodes, photos)),
      project.exportedAt ? h('p', null, h('strong', null, '남는 것'), '\n· 이미 내보낸 파일(zip)') : null,
    ],
    ok: '삭제', danger: true,
  });
  if (!ok) return false;
  await removeNodeDeep(node.id);
  await dropTrashUnder(project.id, node.path);
  toast('삭제했습니다.');
  return true;
}

/** 미작성 노드 바로 지우기(목록 카드의 [지우기]) */
export async function deleteBlank(nodeId) {
  const node = await getNode(nodeId);
  if (!node) return false;
  const [nodes, keys] = await Promise.all([projectNodes(node.projectId), photoKeys(node.projectId)]);
  if (!isBlankNode(node, nodes, keys)) {
    toast('입력한 값이 있어 지우지 않았습니다. 더보기 → 삭제를 써 주세요.');
    return false;
  }
  await removeNodeDeep(node.id);
  await dropTrashUnder(node.projectId, node.path);
  toast('빈 항목을 지웠습니다');
  return true;
}

export async function requestDeleteProject(given) {
  const project = await getProject(given.id);
  if (!project) return false;
  if (!canDeleteWhole(project)) {
    await alertDialog('삭제', '실사 삭제는 실사가 끝나고 30일이 지나야 할 수 있습니다.');
    return false;
  }
  const { nodes, photos } = await gather(project, null);
  const rest = countText(nodes);
  const ok = await confirmDialog({
    title: '정말 삭제할까요?',
    body: [
      h('p', null, project.name),
      h('p', { class: 'lost' }, '! 지워지는 것\n· 앱 안의 원본 사진 ' + photos.length + '장\n· 입력한 기록 전부' + (rest ? ' (' + rest + ')' : '') + '\n· 휴지통에 있는 것\n복구할 수 없습니다.'),
      unexportedNote(unexportedState(project, nodes, photos)),
      project.exportedAt ? h('p', null, h('strong', null, '남는 것'), '\n· 이미 내보낸 파일(zip)') : null,
    ],
    ok: '삭제', danger: true,
  });
  if (!ok) return false;
  if (!project.exportedAt) {
    const again = await confirmDialog({
      title: '한 번 더 확인합니다',
      body: [
        h('p', null, project.name),
        h('p', { class: 'lost' }, '! 이 실사는 한 번도 내보낸 적이 없습니다.\n지우면 사진 ' + photos.length + '장과 기록이 어디에도 남지 않습니다.'),
      ],
      ok: '그래도 삭제', danger: true,
    });
    if (!again) return false;
  }
  const [nk, pk, tk] = await Promise.all([
    db.keysByIndex('nodes', 'projectId', IDBKeyRange.only(project.id)),
    db.keysByIndex('photos', 'projectId', IDBKeyRange.only(project.id)),
    db.keysByIndex('trash', 'projectId', IDBKeyRange.only(project.id)),
  ]);
  await tx(['nodes', 'photos', 'trash', 'projects', 'kv'], (s) => {
    nk.forEach((k) => s.nodes.delete(k.primaryKey));
    pk.forEach((k) => s.photos.delete(k.primaryKey));
    tk.forEach((k) => s.trash.delete(k.primaryKey));
    s.projects.delete(project.id);
    s.kv.delete('exportAsked:' + project.id);
  });
  toast('실사를 삭제했습니다.');
  return true;
}

export function projectDeleteButton(project, ctx) {
  if (!canDeleteWhole(project)) return null;
  return h('button', {
    type: 'button', class: 'lnk',
    onclick: async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (await requestDeleteProject(project)) ctx.refresh();
    },
  }, '삭제');
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
      h('p', null, h('strong', null, '7일 동안 휴지통에 보관됩니다.'), '\n그 안에는 되살릴 수 있고, 7일이 지나면 완전히 지워집니다.'),
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
  toast('초기화했습니다. 휴지통에서 7일 동안 되살릴 수 있습니다.', 4500);
  return true;
}

/* ── 사진 바꾸기 전 보관 ──────────────────────────────── */
function photoTrashRec(photo, label, now) {
  return {
    id: uid(), projectId: photo.projectId, kind: 'photo', label: label || '', path: photo.ownerPath, photoCount: 1,
    payload: { photo: { ...photo } }, deletedAt: now, expiresAt: now + KEEP_DAYS * DAY,
  };
}

export async function trashPhotoCopy(photo, label) {
  await db.put('trash', photoTrashRec(photo, label, Date.now()));
}

export async function purgeExpired() {
  const keys = await db.keysByIndex('trash', 'expiresAt', IDBKeyRange.upperBound(Date.now()));
  await db.delMany('trash', keys.map((k) => k.primaryKey));
}

/* ── 되살리기 ─────────────────────────────────────────── */
async function restore(id) {
  const rec = await db.get('trash', id);
  if (!rec) return null;
  const project = await getProject(rec.projectId);
  if (!project) return null;
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
        cur.forEach((c) => { trashPuts.push(photoTrashRec(c, where + ' (되살리기로 밀려난 사진)', now)); photoDels.push(c.id); });
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
  return { skipped, bumped: trashPuts.length };
}

/* ── 휴지통 화면 ──────────────────────────────────────── */
let trashUrls = [];

export async function renderTrash(ctx) {
  trashUrls.forEach((u) => URL.revokeObjectURL(u));
  trashUrls = [];
  await purgeExpired().catch((e) => console.error(e));
  const pid = ctx.project.id;
  const list = (await db.byIndex('trash', 'projectId', pid)).sort((a, b) => b.deletedAt - a.deletedAt);
  const now = Date.now();
  const left = (t) => Math.max(1, Math.ceil((t.expiresAt - now) / DAY)) + '일 남음';

  const rows = list.map((t) => {
    const back = h('button', {
      type: 'button', class: 'go',
      onclick: async () => {
        const ok = await confirmDialog({
          title: '되살릴까요?',
          body: t.kind === 'reset'
            ? [h('p', null, t.label + ' · 사진 ' + t.photoCount + '장'), h('p', null, '그 사이 새로 넣은 값은 그대로 두고, 비어 있는 칸만 채웁니다.')]
            : [h('p', null, t.label), h('p', null, '사진이 원래 칸에 다시 들어갑니다. 지금 사진은 그대로 둡니다(한 장짜리 칸이면 지금 사진을 휴지통으로 옮깁니다).')],
          ok: '되살리기',
        });
        if (!ok) return;
        try {
          const r = await restore(t.id);
          if (!r) { toast('이미 없는 항목입니다.'); }
          else {
            const bits = ['되살렸습니다.'];
            if (r.skipped) bits.push('되살릴 곳이 지워져 빠진 것 ' + r.skipped + '개');
            if (r.bumped) bits.push('밀려난 사진 ' + r.bumped + '장은 휴지통에');
            toast(bits.join(' '), 4500);
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
        h('div', { class: 't' }, h('b', null, '바꾸기 전 사진'), h('i', null, [t.label, dayText(ymd(t.deletedAt)) + ' 바꿈', left(t)].filter(Boolean).join(' · '))),
        back);
    }
    return h('div', { class: 'card' },
      h('div', { class: 't' }, h('b', null, t.label), h('i', null, dayText(ymd(t.deletedAt)) + ' 초기화 · 사진 ' + t.photoCount + '장 · ' + left(t))),
      back);
  });

  return {
    title: '휴지통',
    sub: ctx.project.name,
    crumbs: [{ label: '홈', href: P(pid) }, { label: '더보기' }, { label: '휴지통' }],
    menu: 'home',
    body: [
      rows.length ? rows : h('p', { class: 'empty' }, '휴지통이 비어 있습니다.'),
      h('p', { class: 'sec' }, '7일이 지나면 완전히 지워집니다.'),
    ],
  };
}

function ymd(ms) {
  const d = new Date(ms);
  const z = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}
