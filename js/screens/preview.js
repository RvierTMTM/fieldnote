/* screens/preview.js — 장표 미리보기(미리보기 B)   라우트: #/p/:pid/preview
   공개: render(ctx)
   · 실제 내보내기와 같은 장표(js/slide-preview.js → js/pptx-build.js)를 HTML 썸네일로 세로 목록.
   · 화면 근처에 온 장표만 그린다(IntersectionObserver). 멀어지면 비운다.
   · 사진은 photo.thumb(보정본 기준, 없으면 보정본·원본). 이 화면을 떠나면 사진 주소를 모두 놓는다(router.onBeforeRender).
   · 장표를 누르면 크게 보기(ui.openOverlay 'full'): ✕·뒤로 가기로 닫힘, ‹ 이전 / 다음 ›, 좌우로 밀기, 키보드 ←·→·Esc. */
import { h, openOverlay, closeOverlay } from '../ui.js';
import { onBeforeRender } from '../router.js';
import { getSettings } from '../settings.js';
import { exportModel, getPhotoBlob } from '../export.js';
import { buildPreviewDeck, slideHtml, SLIDE_W } from '../slide-preview.js';
import { P, load } from './common.js';

const CI_URL = new URL('../../assets/ci.png', import.meta.url).href;

/* 지금 화면에서 쓰는 것(떠날 때 정리) */
let live = null;
function release() {
  if (!live) return;
  const l = live;
  live = null;
  l.io.disconnect();
  l.ro.disconnect();
  for (const p of l.urls.values()) p.then((u) => { if (u) URL.revokeObjectURL(u); });
}
onBeforeRender(release);

function photoUrl(l, pid) {
  if (!l.urls.has(pid)) {
    l.urls.set(pid, (async () => {
      const b = (await getPhotoBlob(pid, 'thumb')) || (await getPhotoBlob(pid, 'corrected')) || (await getPhotoBlob(pid, 'blob'));
      return b ? URL.createObjectURL(b) : null;
    })().catch(() => null));
  }
  return l.urls.get(pid);
}

function fitScale(fit) {
  const s = fit.firstElementChild;
  if (s) s.style.transform = 'scale(' + (fit.clientWidth / SLIDE_W) + ')';
}

function mount(l, fit, i) {
  fit.innerHTML = slideHtml(l.deck.slides[i], { index: i, deck: l.deck, ciUrl: CI_URL });
  fit.dataset.on = '1';
  fitScale(fit);
  fit.querySelectorAll('img[data-pid]').forEach((img) => {
    photoUrl(l, img.dataset.pid).then((u) => { if (u && img.isConnected) img.src = u; });
  });
}
function unmount(fit) {
  fit.replaceChildren();
  delete fit.dataset.on;
}

/* ── 크게 보기 ─────────────────────────────────────────── */
function openBig(l, start) {
  const N = l.deck.slides.length;
  let cur = start;
  const num = h('span');
  const name = h('b');
  const fit = h('div', { class: 'pv-fit' });
  const prev = h('button', { type: 'button', onclick: () => show(cur - 1) }, '‹ 이전');
  const next = h('button', { type: 'button', onclick: () => show(cur + 1) }, '다음 ›');
  function show(i) {
    cur = Math.max(0, Math.min(N - 1, i));
    mount(l, fit, cur);
    num.textContent = (cur + 1) + ' / ' + N;
    name.textContent = l.deck.slides[cur].name;
    prev.disabled = cur === 0;
    next.disabled = cur === N - 1;
  }
  let sx = null;
  let sy = 0;
  fit.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  fit.addEventListener('pointercancel', () => { sx = null; });
  fit.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(cur + (dx < 0 ? 1 : -1));
  });
  const onKey = (e) => {
    if (e.key === 'ArrowLeft') show(cur - 1);
    else if (e.key === 'ArrowRight') show(cur + 1);
    else if (e.key === 'Escape') closeOverlay();
  };
  const ro = new ResizeObserver(() => fitScale(fit));
  const box = h('div', { class: 'pv-lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': '장표 크게 보기' },
    h('div', { class: 'pv-lb-t' }, num, name),
    h('button', { type: 'button', class: 'pv-lb-x', 'aria-label': '닫기', onclick: () => closeOverlay() }, '✕'),
    fit,
    h('div', { class: 'pv-lb-nav' }, prev, next));
  box.addEventListener('click', (e) => { if (e.target === box) closeOverlay(); });
  openOverlay(box, {
    kind: 'full',
    onClose: () => { ro.disconnect(); document.removeEventListener('keydown', onKey); },
  });
  document.addEventListener('keydown', onKey);
  ro.observe(fit);
  show(cur);
}

export async function render(ctx) {
  const { project } = await load(ctx.params.pid);
  const model = await exportModel(project.id);
  const deck = await buildPreviewDeck(model, { surveyor: getSettings().surveyor || '' });
  const N = deck.slides.length;

  release();
  const l = { deck, urls: new Map(), io: null, ro: null };
  l.io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const fit = e.target;
      if (e.isIntersecting) { if (!fit.dataset.on) mount(l, fit, Number(fit.dataset.i)); }
      else if (fit.dataset.on) unmount(fit);
    }
  }, { rootMargin: '600px 0px' });
  l.ro = new ResizeObserver(() => list.querySelectorAll('.pv-fit[data-on]').forEach(fitScale));
  live = l;

  const list = h('div', { class: 'pv-list' }, deck.slides.map((s, i) => {
    const fit = h('div', { class: 'pv-fit', 'data-i': String(i) });
    l.io.observe(fit);
    return h('button', { type: 'button', class: 'pv-th', onclick: () => openBig(l, i) },
      h('div', { class: 'pv-th-h' }, h('span', { class: 'n' }, (i + 1) + ' / ' + N), h('span', { class: 'nm' }, s.name)),
      fit);
  }));
  l.ro.observe(list);

  return {
    title: '장표 미리보기', sub: project.name + ' · ' + N + '장',
    menu: 'export', projectId: project.id,
    scope: { project, node: null },
    crumbs: [{ label: '홈', href: P(project.id) }, { label: '내보내기', href: P(project.id) + '/export' }, { label: '장표 미리보기' }],
    body: [
      h('p', { class: 'hint' }, '장표를 누르면 크게 봅니다. 노란 칸·빨간 !는 미작성 항목입니다.'),
      list,
    ],
  };
}
