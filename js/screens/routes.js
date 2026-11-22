/* screens/routes.js — 케이블 경로(장소와 장소 사이 케이블 길)
   공개: renderList(ctx)  라우트: #/p/:pid/routes   아래 큰 메뉴 "케이블 경로" — 현장별 경로 목록
         render(ctx)      라우트: #/p/:pid/rt/:id   경로(구간) 하나
   경로는 장소와 같은 단계(현장 아래)에 저장된다.
   · 케이블 종류: cable(배열: 광 SM / 광 MM / UTP / 확인 못 함) + 수(cableSm·cableMm 코어, cableUtp 가닥) — options.CABLE_KINDS
   · 완료 표시: done(true). 맨 아래 [이 구간 완료](목록으로) / [완료하고 다음 구간 입력](출발 = 이 구간 도착) */
import { h } from '../ui.js';
import { projectSummary, missingItems, photoCounter, nameOf, val, setField } from '../store.js';
import { renderForm } from '../form.js';
import { ROUTE_WAYS, ROUTE_RISE, ROUTE_FIRE, ROUTE_PROBLEMS, CABLE_KINDS, CABLE_CORES } from '../options.js';
import { P, load, addButton, placeChoices, savedTop } from './common.js';
import { routeCard, addRouteFlow } from './site.js';

const TITLE = '케이블 경로';

export async function renderList(ctx) {
  const { project } = await load(ctx.params.pid);
  const sum = await projectSummary(project.id);
  const count = photoCounter(sum.keys);
  const miss = await missingItems(project.id, sum);
  const sites = sum.nodes.filter((n) => n.type === 'site').sort((a, b) => a.order - b.order);

  const body = [h('p', { class: 'hint' }, '장소와 장소 사이, 케이블이 지나갈 길을 기록합니다.')];
  if (!sites.length) body.push(h('p', { class: 'empty' }, '먼저 홈에서 현장을 추가해 주세요.'));
  for (const s of sites) {
    const routes = sum.nodes.filter((n) => n.type === 'route' && n.parentId === s.id).sort((a, b) => a.order - b.order);
    body.push(
      h('p', { class: 'sec' }, nameOf(s)),
      routes.map((r) => routeCard(r, count, miss, sum.blankIds, ctx)),
      addButton('+ 경로 추가', () => addRouteFlow(s, ctx)));
  }

  return {
    title: TITLE, sub: project.name,
    menu: 'routes', projectId: project.id,
    scope: { project, node: null },
    crumbs: [{ label: '홈', href: P(project.id) }, { label: TITLE }],
    body,
  };
}

export async function render(ctx) {
  const { project, node: route, chain } = await load(ctx.params.pid, ctx.params.id, 'route');
  const site = chain[chain.length - 1];
  const places = () => placeChoices(project.id);
  const listHref = P(project.id) + '/routes';
  const picked = Array.isArray(val(route, 'cable')) ? val(route, 'cable') : [];
  const counts = CABLE_KINDS.filter(([label]) => picked.includes(label)).map(([label, k, unit]) => ({
    t: 'num', k, label: label + (unit === '코어' ? ' 코어 수' : ' 가닥 수'), unit,
    quick: unit === '코어' ? CABLE_CORES : undefined, unknown: false,
  }));

  const form = renderForm(route, [
    { t: 'pick', k: 'from', label: '출발', choices: places, none: false, rerender: true },
    { t: 'pick', k: 'to', label: '도착', choices: places, none: false, rerender: true },
    { t: 'sec', label: '케이블 종류 (여러 개 선택)' },
    { t: 'multi', k: 'cable', opts: CABLE_KINDS.map(([label]) => label), none: false, rerender: true },
    ...counts,
    { t: 'num', k: 'dist', label: '거리 (대략)', unit: 'm' },
    { t: 'photo', slot: 'path', label: '사진 (지나는 순서대로)' },
    { t: 'sec', label: '지나는 방식 (여러 개 선택)' },
    { t: 'multi', k: 'ways', opts: ROUTE_WAYS, none: false },
    { t: 'sec', label: '층간(수직경로)' },
    { t: 'multi', k: 'rise', opts: ROUTE_RISE, none: false, exclusive: ['상승 없음'] },
    { t: 'sec', label: '타공' },
    { t: 'num', k: 'wallHoles', label: '벽 타공', unit: '곳', none: true },
    { t: 'num', k: 'slabHoles', label: '슬래브 타공', unit: '곳', none: true },
    { t: 'one', k: 'fire', opts: ROUTE_FIRE },
    { t: 'sec', label: '문제' },
    { t: 'multi', k: 'problems', opts: ROUTE_PROBLEMS, custom: true },
    { t: 'memo', k: 'memo', label: '메모', ph: '우회 구간, 주의할 점 (안 써도 됨)' },
  ], ctx);

  const done = val(route, 'done') === true;
  const doneBtn = h('button', {
    type: 'button', class: 'btn ' + (done ? 'done-on' : 'pri'), 'aria-pressed': String(done),
    onclick: async () => {
      if (done) { await setField(route.id, 'done', null); await ctx.refresh(); return; }
      await setField(route.id, 'done', true);
      ctx.go(listHref);
    },
  }, done ? '✓ 완료로 표시함 (누르면 풀림)' : '이 구간 완료');
  const nextBtn = h('button', {
    type: 'button', class: 'btn sub',
    onclick: async () => {
      if (!done) await setField(route.id, 'done', true);
      const to = val(route, 'to');
      const from = to && typeof to === 'object' ? { ref: to.ref, label: to.label } : null;
      const made = site ? await addRouteFlow(site, ctx, from) : null;
      if (!made) await ctx.refresh();          // 도착을 안 고르고 닫으면 새 구간은 안 생기고 이 구간만 완료로 남는다
    },
  }, '완료하고 다음 구간 입력');

  return {
    title: TITLE, sub: nameOf(route),
    menu: 'routes', projectId: project.id,
    scope: { project, node: route, parentHref: listHref },
    crumbs: [
      { label: '홈', href: P(project.id) },
      { label: TITLE, href: listHref },
      { label: nameOf(route) },
    ],
    body: [savedTop(), form, doneBtn, nextBtn],
  };
}
