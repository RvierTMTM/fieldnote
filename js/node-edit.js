/* node-edit.js — 이름 바꾸기 · 다른 곳으로 옮기기 (화면 위 제목을 누르거나 더보기에서)
   공개:
     canRename(node) → boolean                      현장·장소·설치 지점·장비만 (케이블 경로는 출발·도착이 곧 이름이라 뺀다)
     renameFlow(node, ctx) → Promise<boolean>       이름 고치기 창(promptText) → store.renameNode → ctx.refresh(). 바꿨으면 true
     moveFlow(node, ctx) → Promise<boolean>         옮길 곳 고르기 시트 → store.moveNode → ctx.refresh(). 옮겼으면 true
     editItems(scope) → [{ label, sub, value }]     더보기 항목(screens/more.js 가 붙인다)
     runEditItem(value, scope, ctx) → Promise
   카드의 [옮기기] 버튼(screens/common.js moveButton)도 moveFlow(node, ctx) 를 바로 부른다.
   ctx: { refresh }
   · 이름 바꾸기 창 안내(설치 지점): 형태가 랙이면 "랙 번호나 이름을…"·예 R-01, 그 밖의 형태는 "설치 지점 이름을 넣어 주세요."·형태에 맞는 예시(POINT_NAME_EX) [v0.25]
   · 이름: 현장·장소·설치 지점 = name 항목, 장비 = Hostname(hostname) 항목(장비 표시 이름이 Hostname → 모델명 → 종류 순이라서).
   · 옮기기: 장소 → 다른 현장, 설치 지점 → 다른 장소, 장비 → 다른 설치 지점(같은 실사 안). 목록 맨 아래 "+ 새로 만들기":
       이름(장소·설치 지점은 종류·설치 형태도 먼저) 물어 새 상위를 만들고 그 아래로 옮긴다.
       새 장소는 지금 있는 현장에, 새 설치 지점은 지금 있는 장소에 만든다.
       새 설치 지점이 랙이면 이름 다음에 높이(U)도 고른다(42U 가 미리 골라져 있음). 높이를 못 고르면 옮긴 장비가 U 줄에 안 놓인다.
     옮긴 노드는 새 상위의 맨 끝에 놓인다(store.moveNode 가 order 를 새 형제들의 최대 + 1 로).
     path·사진·휴지통 갱신은 store.moveNode 가 한 트랜잭션으로 한다. 장비는 U 위치·놓인 자리를 비운다. */
import { h, fill, sheet, promptText, toast, alertDialog, dialog } from './ui.js';
import {
  getNode, getProject, projectNodes, renameNode, moveNode, addNode, removeNodeDeep, nameOf, val, usable, MOVE_PARENT,
} from './store.js';
import { PLACE_KINDS, POINT_FORMS, RACK_FORMS, RACK_HEIGHTS } from './options.js';

const RENAMABLE = ['site', 'place', 'point', 'device'];
const NEW = '\u0000new';
const CUSTOM = '\u0000custom';

export const canRename = (node) => !!node && RENAMABLE.includes(node.type);

const RENAME = {
  site: { title: '현장 이름 바꾸기', label: '현장(공장·법인) 이름을 넣어 주세요.', ph: '예: 여수1공장' },
  place: { title: '장소 이름 바꾸기', label: '이 장소를 부르는 이름을 넣어 주세요.', ph: '예: 2층 전산실' },
  point: { title: '설치 지점 이름 바꾸기' },      // 안내 글·예시는 설치 형태마다 다르다(pointRename)
  device: { title: '장비 이름(Hostname) 바꾸기', label: '장비 이름으로 쓰는 Hostname을 넣어 주세요.', ph: '예: FA-BB-SW01' },
};
/** 설치 지점 이름 안내: 랙이면 랙 번호 안내, 그 밖의 형태는 "설치 지점 이름" 안내 + 형태에 맞는 예시 */
const POINT_NAME_EX = {
  '소형 함체': '예: 1층 사무실 소형 함체',
  '벽부 분배함': '예: 1층 복도 분배함',
  '책상·바닥': '예: 사무실 책상 아래',
  '천장': '예: 2층 복도 천장',
  '배관·기둥': '예: 1층 계단 옆 기둥',
  '벽면': '예: 1층 로비 벽면',
};
function pointRename(form) {
  if (form === '랙') return { label: '랙 번호나 이름을 넣어 주세요. 문패·라벨에 적힌 대로 쓰면 좋습니다.', ph: '예: R-01' };
  return { label: '설치 지점 이름을 넣어 주세요.', ph: POINT_NAME_EX[form] || '예: 1층 복도 분배함' };
}
const MOVE_SUB = { place: '다른 현장으로 옮깁니다', point: '다른 장소로 옮깁니다', device: '다른 설치 지점으로 옮깁니다' };

async function fail(title, e) {
  console.error(e);
  await alertDialog(title, ['실패했습니다.', (e && e.message) || '']);
}

/* ── 이름 바꾸기 ──────────────────────────────────────── */
export async function renameFlow(node, ctx) {
  const cur = node && (await getNode(node.id));
  if (!cur || !canRename(cur)) return false;
  const isDev = cur.type === 'device';
  const old = isDev ? usable(val(cur, 'hostname')) : (typeof val(cur, 'name') === 'string' && val(cur, 'name')) || nameOf(cur);
  const t = cur.type === 'point' ? { ...RENAME.point, ...pointRename(val(cur, 'form')) } : RENAME[cur.type];
  const name = await promptText({ title: t.title, label: t.label, value: old, placeholder: t.ph, ok: '바꾸기' });
  if (!name || name === old) return false;
  try {
    await renameNode(cur.id, name);
  } catch (e) {
    await fail('이름 바꾸기', e);
    return false;
  }
  toast('이름을 바꿨습니다');
  await ctx.refresh();
  return true;
}

/* ── 옮기기 ───────────────────────────────────────────── */
function orderKey(byId, n) {
  return n.path.split('/').slice(1).map((id) => (byId.get(id) ? byId.get(id).order : 0));
}
function byKey(byId) {
  return (a, b) => {
    const x = orderKey(byId, a);
    const y = orderKey(byId, b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
    return 0;
  };
}

/** 옮길 곳 후보 → [{ label, sub, value: 노드 id }] (지금 상위는 뺀다) */
function candidates(cur, nodes, byId) {
  const parentType = MOVE_PARENT[cur.type];
  const sorted = nodes.filter((n) => n.type === parentType && n.id !== cur.parentId).sort(byKey(byId));
  const name = (id) => nameOf(byId.get(id));
  const multiSite = nodes.filter((n) => n.type === 'site').length > 1;
  return sorted.map((n) => {
    if (parentType === 'site') {
      const c = nodes.filter((x) => x.type === 'place' && x.parentId === n.id).length;
      return { label: nameOf(n), sub: '장소 ' + c + '곳', value: n.id };
    }
    const ids = n.path.split('/').slice(1, -1);          // 사업 다음 ~ 바로 위
    if (parentType === 'place') return { label: nameOf(n), sub: name(ids[0]), value: n.id };
    return { label: nameOf(n) + (val(n, 'form') ? ' · ' + val(n, 'form') : ''), sub: (multiSite ? ids.map(name) : ids.slice(1).map(name)).join(' › '), value: n.id };
  });
}

/** 새 랙의 높이(U) 고르기. 42U 가 미리 골라져 있다. 취소하면 undefined */
async function pickRackHeight(name) {
  let sel = 42;
  const chips = h('div', { class: 'chips' });
  const draw = () => fill(chips, RACK_HEIGHTS.map((x) => h('button', {
    type: 'button', class: 'chip' + (x === sel ? ' on' : ''), 'aria-pressed': String(x === sel),
    onclick: () => { sel = x; draw(); },
  }, x + 'U')));
  draw();
  const v = await dialog({
    title: '랙 높이',
    body: [h('p', null, '"' + name + '" 높이(U)를 골라 주세요.'), chips],
    buttons: [{ label: '취소', cls: 'sub', value: false }, { label: '만들고 옮기기', cls: 'pri', value: true }],
  });
  return v === true ? sel : undefined;
}

/** 새 상위 만들기(이름 등을 물어서). 취소하면 null */
async function createParent(cur, project, nodes) {
  const parentType = MOVE_PARENT[cur.type];
  const seg = cur.path.split('/');                       // [사업, 현장, 장소, 설치 지점, 장비]
  if (parentType === 'site') {
    const name = await promptText({ title: '새 현장 만들기', label: '"' + nameOf(cur) + '"을 옮길 새 현장(공장·법인) 이름을 넣어 주세요.', placeholder: '예: 여수1공장', ok: '만들고 옮기기' });
    return name ? addNode(project, 'site', { name }) : null;
  }
  if (parentType === 'place') {
    const site = await getNode(seg[1]);
    if (!site) return null;
    let kind = await sheet({
      title: '어떤 장소인가요?',
      note: '"' + nameOf(site) + '"에 새 장소를 만들어 옮깁니다.',
      items: PLACE_KINDS.map((k) => ({ label: k, value: k })).concat({ label: '+ 직접 입력', value: CUSTOM }),
    });
    if (kind === undefined) return null;
    if (kind === CUSTOM) kind = null;
    const name = await promptText({ title: '새 장소 이름', label: '이 장소를 부르는 이름을 넣어 주세요.', value: kind || '', placeholder: '예: 2층 전산실', ok: '만들고 옮기기' });
    return name ? addNode(site, 'place', { name, kind: kind || name }) : null;
  }
  const place = await getNode(seg[2]);
  if (!place) return null;
  const form = await sheet({
    title: '어떻게 설치되어 있나요?',
    note: '"' + nameOf(place) + '"에 새 설치 지점을 만들어 옮깁니다.',
    items: POINT_FORMS.map((f) => ({ label: f, value: f })),
  });
  if (form === undefined) return null;
  const racks = nodes.filter((n) => n.type === 'point' && n.parentId === place.id && val(n, 'form') === '랙').length;
  const suggest = form === '랙' ? 'R-' + String(racks + 1).padStart(2, '0') : form;
  const name = await promptText({ title: '새 설치 지점 이름', label: form === '랙' ? '랙 번호나 이름을 넣어 주세요. 문패·라벨에 적힌 대로 쓰면 좋습니다.' : '설치 지점 이름을 넣어 주세요.', value: suggest, ok: form === '랙' ? '다음' : '만들고 옮기기' });
  if (!name) return null;
  let height;
  if (form === '랙') {
    height = await pickRackHeight(name);
    if (height === undefined) return null;
  }
  return addNode(place, 'point', height ? { name, form, height } : { name, form });
}

export async function moveFlow(node, ctx) {
  const cur = node && (await getNode(node.id));
  if (!cur || !MOVE_PARENT[cur.type]) return false;
  const project = await getProject(cur.projectId);
  if (!project) return false;
  const nodes = await projectNodes(cur.projectId);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const items = candidates(cur, nodes, byId);
  items.push({ label: '+ 새로 만들기', sub: { place: '새 현장을 만들어 옮깁니다', point: '새 장소를 만들어 옮깁니다', device: '새 설치 지점을 만들어 옮깁니다' }[cur.type], value: NEW });
  const pick = await sheet({
    title: '"' + nameOf(cur) + '" 옮길 곳',
    note: cur.type === 'device' ? '옮기면 U 위치는 비워집니다. 랙이면 "위치가 정해지지 않은 장비"로 나옵니다.' : '아래에 있는 항목과 사진이 모두 같이 옮겨집니다.',
    items,
  });
  if (pick === undefined) return false;

  let target = null;
  let created = null;
  try {
    if (pick === NEW) {
      created = await createParent(cur, project, nodes);
      if (!created) return false;
      target = created;
    } else {
      target = byId.get(pick);
    }
    if (!target) return false;
    await moveNode(cur.id, target.id);
  } catch (e) {
    if (created) await removeNodeDeep(created.id).catch(() => {});      // 옮기지 못했으니 방금 만든 상위는 지운다
    await fail('옮기기', e);
    return false;
  }
  const rack = cur.type === 'device' && RACK_FORMS.includes(val(target, 'form'));
  toast('옮겼습니다 · ' + nameOf(target) + (rack ? ' (U 위치를 정해 주세요)' : ''), 4000);
  await ctx.refresh();
  return true;
}

/* ── 더보기 ───────────────────────────────────────────── */
export function editItems(scope) {
  const n = scope && scope.node;
  if (!n) return [];
  const items = [];
  if (canRename(n)) items.push({ label: '이름 바꾸기', sub: '이 화면 위 제목을 눌러도 됩니다', value: 'edit:rename' });
  if (MOVE_PARENT[n.type]) items.push({ label: '다른 곳으로 옮기기', sub: MOVE_SUB[n.type], value: 'edit:move' });
  return items;
}

export async function runEditItem(value, scope, ctx) {
  if (value === 'edit:rename') await renameFlow(scope.node, ctx);
  else if (value === 'edit:move') await moveFlow(scope.node, ctx);
}
