/* screens/common.js — 화면들이 같이 쓰는 작은 도구
   공개: P(pid), hrefOf(node), load(pid, nodeId, type), crumbsOf(project, chain, node, tail),
         periodText(project), dayText(ymd), today(), card(opts), badge(kind, text), addButton(label, onclick),
         blankCard({ href, title, sub, node, ctx }), delButton(title, run, ctx), moveButton(node, title, ctx), nodeDel(node, title, ctx),
         doneBadge(lackText, done), savedTop(),
         placeChoices(projectId), deviceChoices(projectId, exceptId) */
import { h, savedMark, nwText, fitText } from '../ui.js';
import { deleteNode } from '../trash.js';
import { moveFlow } from '../node-edit.js';
import { getProject, getNode, chainOf, nameOf, projectNodes, deviceLabel, MOVE_PARENT } from '../store.js';

export const P = (pid) => '#/p/' + encodeURIComponent(pid);

const SEG = { site: 's', place: 'pl', point: 'pt', device: 'dv', extra: 'ex', route: 'rt' };
export function hrefOf(node) {
  return P(node.projectId) + '/' + SEG[node.type] + '/' + node.id;
}

/** 사업과 노드를 읽는다. 없으면 Error(화면에 "찾을 수 없습니다"가 나온다). */
export async function load(pid, nodeId, type) {
  const project = await getProject(pid);
  if (!project) throw new Error('실사를 찾을 수 없습니다.');
  if (!nodeId) return { project, node: null, chain: [] };
  const node = await getNode(nodeId);
  if (!node || node.projectId !== pid || (type && node.type !== type)) throw new Error('찾을 수 없습니다. 지워졌을 수 있습니다.');
  return { project, node, chain: await chainOf(node) };
}

/** 현재 위치 줄: 홈 › 현장 › 장소 › … (마지막 것은 굵게, 앞 단계는 누르면 이동) */
export function crumbsOf(project, chain, node, tail) {
  const out = [{ label: '홈', href: P(project.id) }];
  for (const n of chain) out.push({ label: nameOf(n), href: hrefOf(n) });
  if (node) out.push({ label: nameOf(node), href: tail ? hrefOf(node) : null });
  if (tail) out.push({ label: tail });
  return out;
}

export function today() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}
export function dayText(ymd) {
  if (!ymd) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? Number(m[2]) + '월 ' + Number(m[3]) + '일' : String(ymd);
}
export function periodText(project) {
  if (project.from && project.to) return dayText(project.from) + '~' + dayText(project.to);
  if (project.from) return dayText(project.from) + '부터';
  if (project.to) return dayText(project.to) + '까지';
  return '기간 없음';
}

export function badge(kind, text) { return h('span', { class: kind }, text); }

/** 완료 배지: 미작성 항목이 있으면 노란 "! 미작성 항목 N", 사용자가 완료를 눌렀으면 초록 "완료", 아니면 회색 "완료 전" */
export function doneBadge(lackText, done) {
  if (lackText) return badge('no', '! ' + lackText);
  return done ? badge('ok', '완료') : badge('plain', '완료 전');
}

/** 목록 카드. href 가 있으면 누르면 이동한다. sub 는 글 한 줄 또는 여러 줄(배열).
    del(delButton/nodeDel)을 주면 글(제목·부제) 아래 줄에 배지(왼쪽)와 [삭제](장소·설치 지점·장비는 [옮기기] [삭제], 오른쪽 끝)가 붙는다 — 카드마다 같은 배치.
    카드 어디를 눌러도 이동하고, 버튼만 따로 동작한다.
    제목은 한 줄: 길면 칸을 키우지 않고 글자 크기를 줄이고(ui.fitText), 최소 크기에서도 넘치면 "…"(전체는 title).
    글의 숫자+단위("사진 0", "14일")는 줄바꿈 없이 한 덩어리로(ui.nwText). */
export function card({ href, title, sub, right, onclick, del }) {
  const subs = (Array.isArray(sub) ? sub : [sub]).filter(Boolean).map((x) => h('i', null, nwText(x)));
  const ttl = () => fitText(h('b', null, nwText(title)));
  if (del && href) {
    const acts = !!(del.classList && del.classList.contains('acts'));
    return h('div', { class: 'card has-del' + (acts ? ' has-acts' : '') },
      h('a', { class: 't', href }, ttl(), subs),
      right || null,
      del);
  }
  const inner = [h('div', { class: 't' }, ttl(), subs), right || null];
  if (href) return h('a', { class: 'card', href }, inner);
  if (onclick) return h('button', { type: 'button', class: 'card', onclick }, inner);
  return h('div', { class: 'card' }, inner);
}

/** 카드 오른쪽 [삭제] 버튼. run() 이 true 를 돌려주면(지웠으면) 화면을 다시 그린다. 카드 이동은 일어나지 않는다. */
export function delButton(title, run, ctx) {
  return h('button', {
    type: 'button', class: 'delb', 'aria-label': title + ' 삭제',
    onclick: async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        if (await run()) { await ctx.refresh(); return; }
      } catch (err) { console.error(err); }
      btn.disabled = false;
    },
  }, '삭제');
}

/** 카드 오른쪽 [옮기기] 버튼 — 기존 옮기기 흐름(js/node-edit.js moveFlow: 옮길 곳 고르기 → 옮김 → 화면 다시 그림)을 바로 시작한다.
    카드 이동은 일어나지 않는다. 장소·설치 지점·장비만(store.MOVE_PARENT). */
export function moveButton(node, title, ctx) {
  return h('button', {
    type: 'button', class: 'delb mvb', 'aria-label': (title || nameOf(node)) + ' 옮기기',
    onclick: async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.disabled = true;
      try { await moveFlow(node, ctx); } catch (err) { console.error(err); }
      if (btn.isConnected) btn.disabled = false;
    },
  }, '옮기기');
}

/** 노드 카드의 오른쪽 버튼. 옮길 수 있는 노드(장소·설치 지점·장비)는 [옮기기] [삭제] 한 묶음(.acts),
    그 밖(현장·경로 등)은 [삭제]만. [삭제]는 js/trash.js deleteNode: 미작성이면 바로, 아니면 확인 창 한 번 */
export function nodeDel(node, title, ctx) {
  const name = title || nameOf(node);
  const del = delButton(name, () => deleteNode(node.id), ctx);
  if (!MOVE_PARENT[node.type]) return del;
  return h('span', { class: 'acts' }, moveButton(node, name, ctx), del);
}

/** 미작성(store.isBlankNode) 항목 카드: 오른쪽 [삭제]를 누르면 확인 창 없이 바로 지운다(js/trash.js deleteNode). */
export function blankCard({ href, title, sub = '아직 입력 없음 · 사진 0', node, ctx }) {
  const el = card({ href, title, sub, del: nodeDel(node, title, ctx) });
  el.classList.add('blank');
  return el;
}

/** 입력 화면 맨 위 "✓ 자동 저장됨" (위쪽에 붙어 늘 보인다) */
export function savedTop() {
  const el = savedMark();
  el.classList.add('saved-top');
  return el;
}

export function addButton(label, onclick) {
  return h('button', { type: 'button', class: 'add', onclick }, label);
}

/** 고르기 목록: 사업 안의 모든 장소 → [{ ref, label, sub }] */
export async function placeChoices(projectId) {
  const nodes = await projectNodes(projectId);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sites = nodes.filter((n) => n.type === 'site');
  return nodes.filter((n) => n.type === 'place').sort((a, b) => a.order - b.order).map((p) => ({
    ref: p.id,
    label: nameOf(p),
    sub: sites.length > 1 ? nameOf(byId.get(p.parentId)) : undefined,
  }));
}

/** 고르기 목록: 사업 안의 모든 장비(exceptId 제외) → [{ ref, label, sub }] */
export async function deviceChoices(projectId, exceptId) {
  const nodes = await projectNodes(projectId);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const where = (d) => d.path.split('/').slice(1, -1).map((id) => nameOf(byId.get(id))).filter(Boolean).join(' › ');
  return nodes.filter((n) => n.type === 'device' && n.id !== exceptId).sort((a, b) => (a.path < b.path ? -1 : 1)).map((d) => ({
    ref: d.id, label: deviceLabel(d), sub: where(d),
  }));
}
