/* screens/site.js — 현장: 장소 목록과 케이블 경로 목록   라우트: #/p/:pid/s/:id
   공개: render(ctx), addPlaceFlow(site, ctx), addRouteFlow(site, ctx, from?), pickRouteEnd(projectId, title, opts),
         routeCard(route, count, miss, blankIds, ctx)
   · 장소·경로 카드마다 [삭제](common.nodeDel / 미작성 카드는 common.blankCard — 미작성이면 바로, 아니면 확인 창 한 번).
   · 장소 카드는 [옮기기] [삭제] 한 묶음(common.nodeDel → js/node-edit.js 옮기기 흐름을 바로 시작).
   · 배지: 미작성 항목이 있으면 노란 "! 미작성 항목 N", 완료를 눌렀으면 초록 "완료", 아니면 회색 "완료 전".
   · 경로 카드 거리: 숫자면 "약 12m", "확인 못 함"이면 "거리 확인 못 함", 비었으면 생략(store.distText). */
import { h, sheet, promptText, savedMark } from '../ui.js';
import { children, projectSummary, missingItems, photoCounter, addNode, nameOf, val, cableText, usable, distText } from '../store.js';
import { renderForm } from '../form.js';
import { PLACE_KINDS } from '../options.js';
import { P, load, hrefOf, crumbsOf, card, addButton, blankCard, doneBadge, placeChoices, nodeDel } from './common.js';

export async function addPlaceFlow(site, ctx) {
  let kind = await sheet({
    title: '어떤 장소인가요?',
    items: PLACE_KINDS.map((k) => ({ label: k, value: k })).concat({ label: '+ 직접 입력', value: '\u0000custom' }),
  });
  if (kind === undefined) return;
  if (kind === '\u0000custom') kind = null;
  const name = await promptText({ title: '장소 이름', label: '이 장소를 부르는 이름을 넣어 주세요.', value: kind || '', placeholder: '예: 2층 전산실', ok: '추가' });
  if (!name) return;
  const place = await addNode(site, 'place', { name, kind: kind || name });
  ctx.go(hrefOf(place));
}

/** 케이블 경로의 한쪽 끝 고르기(장소 목록 창). 닫으면 undefined. 값은 { ref, label } */
export async function pickRouteEnd(projectId, title, { except, note } = {}) {
  const list = await placeChoices(projectId);
  const items = list.filter((c) => !except || c.ref !== except).map((c) => ({ label: c.label, sub: c.sub, value: { ref: c.ref, label: c.label } }));
  items.push({ label: '+ 직접 입력', sub: '목록에 없거나 사업장 밖일 때', value: '\u0000custom' });
  const v = await sheet({ title, note, items });
  if (v === undefined) return undefined;
  if (v === '\u0000custom') {
    const t = await promptText({ title, placeholder: '직접 입력' });
    return t ? { ref: null, label: t } : undefined;
  }
  return v;
}

/** "+ 경로 추가": 출발·도착을 먼저 고르고, 다 고르면 그때 만든다(창을 닫으면 아무것도 안 생김).
    from 을 주면 출발은 묻지 않는다(완료하고 다음 구간 입력). 만든 경로를 돌려준다. */
export async function addRouteFlow(site, ctx, from) {
  const a = from || await pickRouteEnd(site.projectId, '케이블 경로 추가 · 출발', { note: '케이블이 나가는 장소를 고르세요.' });
  if (!a) return null;
  const b = await pickRouteEnd(site.projectId, '케이블 경로 추가 · 도착', { except: a.ref, note: '출발: ' + a.label });
  if (!b) return null;
  const route = await addNode(site, 'route', { from: a, to: b });
  ctx.go(hrefOf(route));
  return route;
}

export function routeCard(route, count, miss, blankIds, ctx) {
  if (blankIds && blankIds.has(route.id)) return blankCard({ href: hrefOf(route), title: nameOf(route), node: route, ctx });
  const lack = miss.find((m) => m.node.id === route.id);
  const bits = [];
  if (distText(val(route, 'dist'))) bits.push(distText(val(route, 'dist')));
  bits.push('사진 ' + count(route.path));
  return card({
    href: hrefOf(route),
    title: nameOf(route),
    sub: [cableText(route), bits.join(' · ')],
    right: doneBadge(lack && lack.text, val(route, 'done') === true),
    del: nodeDel(route, nameOf(route), ctx),
  });
}

export async function render(ctx) {
  const { project, node: site } = await load(ctx.params.pid, ctx.params.id, 'site');
  const sum = await projectSummary(project.id);
  const count = photoCounter(sum.keys);
  const miss = await missingItems(project.id, sum);
  const blank = sum.blankIds;
  const places = await children(site.id, 'place');
  const routes = await children(site.id, 'route');

  const placeCards = places.map((p) => {
    if (blank.has(p.id)) return blankCard({ href: hrefOf(p), title: nameOf(p), node: p, ctx });
    const points = sum.nodes.filter((n) => n.type === 'point' && n.parentId === p.id && !blank.has(n.id)).length;
    const lacks = miss.filter((m) => m.placeId === p.id && m.text !== '완료 표시 전').length;
    const where = [usable(val(p, 'bldg')), usable(val(p, 'floor'))].filter(Boolean).join(' ');   // "확인 못 함"·"없음"은 붙이지 않는다
    return card({
      href: hrefOf(p),
      title: nameOf(p),
      sub: [where, '설치 지점 ' + points, '사진 ' + count(p.path)].filter(Boolean).join(' · '),
      right: doneBadge(lacks ? '미작성 항목 ' + lacks : null, val(p, 'done') === true),
      del: nodeDel(p, nameOf(p), ctx),
    });
  });

  const info = renderForm(site, [
    {
      t: 'fold', label: '현장 정보 (이름 · 실사일 · VLAN 표 · 메모)', items: [
        { t: 'text', k: 'name', label: '현장 이름', rerender: true },
        { t: 'text', k: 'date', label: '실사일', inputType: 'date' },
        {
          t: 'rows', k: 'vlans', label: 'VLAN 표', rowTitle: 'VLAN', addLabel: '+ VLAN 줄 추가', cols: [
            { t: 'text', k: 'no', label: 'VLAN 번호', inputmode: 'numeric' },
            { t: 'text', k: 'name', label: '이름' },
            { t: 'text', k: 'cidr', label: 'IP 대역', ph: '예: 10.0.0.0/24', inputmode: 'url' },
            { t: 'text', k: 'gw', label: '게이트웨이', inputmode: 'url' },
          ],
        },
        { t: 'memo', k: 'memo', label: '메모', ph: '출입 조건, 담당자 등 (안 써도 됨)' },
      ],
    },
  ], ctx);

  const body = [
    h('p', { class: 'sec' }, '장소'),
    placeCards.length ? placeCards : h('p', { class: 'empty' }, '장소가 없습니다.'),
    addButton('+ 장소 추가', () => addPlaceFlow(site, ctx)),
    h('p', { class: 'sec' }, '케이블 경로'),
    routes.map((r) => routeCard(r, count, miss, blank, ctx)),
    addButton('+ 경로 추가', () => addRouteFlow(site, ctx)),
    h('p', { class: 'sec' }, '현장 정보'),
    savedMark(),
    info,
  ];

  return {
    title: nameOf(site), sub: project.name,
    menu: 'home', projectId: project.id,
    scope: { project, node: site, parentHref: P(project.id) },
    crumbs: crumbsOf(project, [], site),
    body,
  };
}
