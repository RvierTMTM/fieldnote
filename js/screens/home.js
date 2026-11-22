/* screens/home.js — 홈: 실사를 열면 나오는 현장 카드 목록   라우트: #/p/:pid
   공개: render(ctx)
   · 현장 배지: 미작성이 아닌 장소가 없으면 "장소 없음", 장소에 빠진 값이 있으면 "! 빠진 값 N",
     장소가 모두 완료(사용자가 누름)면 "완료", 아니면 "완료 전". 미작성 현장은 [지우기](30일 규칙 없이 바로).
   · 맨 위 내보내기 안내 줄은 js/notice.js(SA-B)가 그린다(data-slot="home-notice") */
import { h, promptText } from '../ui.js';
import { projectSummary, missingItems, photoCounter, addNode, nameOf, val } from '../store.js';
import { getSettings } from '../settings.js';
import { renderExportNotice } from '../notice.js';
import { P, load, hrefOf, card, badge, addButton, dayText, today, blankCard } from './common.js';

export async function render(ctx) {
  const { project } = await load(ctx.params.pid);
  const sum = await projectSummary(project.id);
  const count = photoCounter(sum.keys);
  const sites = sum.nodes.filter((n) => n.type === 'site').sort((a, b) => a.order - b.order);
  const miss = await missingItems(project.id, sum);

  const notice = h('div', { 'data-slot': 'home-notice' });
  renderExportNotice(notice, project.id).catch((e) => console.error(e));

  const blank = sum.blankIds;
  const cards = sites.map((s) => {
    if (blank.has(s.id)) return blankCard({ href: hrefOf(s), title: nameOf(s), sub: '아직 입력 없음', node: s, ctx });
    const places = sum.nodes.filter((n) => n.type === 'place' && n.parentId === s.id && !blank.has(n.id));
    const routes = sum.nodes.filter((n) => n.type === 'route' && n.parentId === s.id && !blank.has(n.id));
    const ids = new Set(places.map((p) => p.id));
    const lacks = miss.filter((m) => ids.has(m.placeId) && m.text !== '완료 표시 전').length;
    let right;
    if (!places.length) right = badge('plain', '장소 없음');
    else if (lacks) right = badge('no', '! 빠진 값 ' + lacks);
    else if (places.every((p) => val(p, 'done') === true)) right = badge('ok', '완료');
    else right = badge('plain', '완료 전');
    return card({
      href: hrefOf(s),
      title: nameOf(s),
      sub: '장소 ' + places.length + ' · 경로 ' + routes.length + ' · 사진 ' + count(s.path),
      right,
    });
  });

  const body = [
    notice,
    h('p', { class: 'sec' }, '현장'),
    cards.length ? cards : h('p', { class: 'empty' }, '현장이 없습니다. 아래에서 추가해 주세요.'),
    addButton('+ 현장 추가', async () => {
      const name = await promptText({ title: '현장 추가', label: '현장(공장·법인) 이름을 넣어 주세요.', placeholder: '예: A동', ok: '추가' });
      if (!name) return;
      const s = await addNode(project, 'site', { name });
      ctx.go(hrefOf(s));
    }),
    h('div', { class: 'foot' },
      h('p', null, (() => { const live = sum.nodes.filter((n) => !sum.blankIds.has(n.id)); const c = (t) => live.filter((n) => n.type === t).length;
        return '현장 ' + c('site') + ' · 장소 ' + c('place') + ' · 경로 ' + c('route') + ' · 랙 ' + live.filter((n) => n.type === 'point' && val(n, 'form') === '랙').length + ' · 사진 ' + sum.photos; })()),
      h('a', { class: 'btn pri', href: P(project.id) + '/export' }, '저장 후 내보내기')),
  ];

  return {
    title: project.name,
    sub: [getSettings().surveyor, dayText(today())].filter(Boolean).join(' · '),
    brand: true, menu: 'home', projectId: project.id,
    scope: { project, node: null, parentHref: '#/', whole: true },   // whole: 더보기에 이 실사 전체 초기화·삭제(js/trash.js)
    crumbs: [{ label: '‹ 실사 목록', href: '#/' }, { label: '홈' }],
    body,
  };
}
