/* screens/common.js — 화면들이 같이 쓰는 작은 도구
   공개: P(pid), hrefOf(node), load(pid, nodeId, type), crumbsOf(project, chain, node, tail),
         periodText(project), dayText(ymd), today(), card(opts), badge(kind, text), addButton(label, onclick),
         blankCard({ href, title, sub, node, ctx }), doneBadge(lackText, done), savedTop(),
         placeChoices(projectId), deviceChoices(projectId, exceptId) */
import { h, savedMark } from '../ui.js';
import { deleteBlank } from '../trash.js';
import { getProject, getNode, chainOf, nameOf, projectNodes, deviceLabel } from '../store.js';

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

/** 완료 배지: 빠진 값이 있으면 노란 "! …", 사용자가 완료를 눌렀으면 초록 "완료", 아니면 회색 "완료 전" */
export function doneBadge(lackText, done) {
  if (lackText) return badge('no', '! ' + lackText);
  return done ? badge('ok', '완료') : badge('plain', '완료 전');
}

/** 목록 카드. href 가 있으면 누르면 이동한다. sub 는 글 한 줄 또는 여러 줄(배열). */
export function card({ href, title, sub, right, onclick }) {
  const subs = (Array.isArray(sub) ? sub : [sub]).filter(Boolean).map((x) => h('i', null, x));
  const inner = [h('div', { class: 't' }, h('b', null, title), subs), right || null];
  if (href) return h('a', { class: 'card', href }, inner);
  if (onclick) return h('button', { type: 'button', class: 'card', onclick }, inner);
  return h('div', { class: 'card' }, inner);
}

/** 미작성(store.isBlankNode) 항목 카드: 오른쪽 [지우기]를 누르면 확인 창 없이 바로 지운다(js/trash.js deleteBlank). */
export function blankCard({ href, title, sub = '아직 입력 없음 · 사진 0', node, ctx }) {
  return h('div', { class: 'card blank' },
    h('a', { class: 't', href }, h('b', null, title), sub ? h('i', null, sub) : null),
    h('button', {
      type: 'button', class: 'delb', 'aria-label': title + ' 지우기',
      onclick: async (e) => {
        e.preventDefault();
        const btn = e.currentTarget;
        btn.disabled = true;
        if (await deleteBlank(node.id)) await ctx.refresh();
        else btn.disabled = false;
      },
    }, '지우기'));
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
