/* screens/extra.js — 자유 추가(사진 + 꼬리표 + 메모)   라우트: #/p/:pid/ex/:id
   공개: render(ctx) */
import { h } from '../ui.js';
import { addNode, nameOf, val } from '../store.js';
import { renderForm } from '../form.js';
import { EXTRA_TAGS } from '../options.js';
import { load, hrefOf, crumbsOf, savedTop } from './common.js';

export async function render(ctx) {
  const { project, node: extra, chain } = await load(ctx.params.pid, ctx.params.id, 'extra');
  const place = chain[chain.length - 1];
  const tag = val(extra, 'tag');

  const form = renderForm(extra, [
    { t: 'photo', slot: 'photo', label: '사진' },
    { t: 'sec', label: '꼬리표' },
    { t: 'one', k: 'tag', opts: EXTRA_TAGS, custom: true, none: false, unknown: false, rerender: true },
    { t: 'memo', k: 'memo', label: '메모', ph: '한 줄 메모 (안 써도 됨)' },
  ], ctx);

  const again = h('button', {
    type: 'button', class: 'btn sub',
    onclick: async () => {
      const next = await addNode(place, 'extra', { tag });
      ctx.go(hrefOf(next), { replace: true });
    },
  }, tag ? '같은 꼬리표(' + tag + ')로 하나 더 추가' : '하나 더 추가');

  return {
    title: '자유 추가', sub: [nameOf(place), tag].filter(Boolean).join(' · '),
    menu: 'home', projectId: project.id,
    scope: { project, node: extra, parentHref: place ? hrefOf(place) : null },
    crumbs: crumbsOf(project, chain, null, '자유 추가' + (tag ? ' · ' + tag : '')),
    body: [savedTop(), form, place ? again : null],
  };
}
