/* app.js — 앱 시작점: 화면 주소(라우트) 등록, 화면 틀(제목·현재 위치 줄·아래 큰 메뉴) 채우기,
   사업 링크 받기, 첫 실행 안내, 서비스 워커 등록·새 버전 알림 줄
   · 새 버전: 서비스 워커가 새 파일을 받아 기다리는 상태(waiting)가 되면 화면 위에 "새 버전이 있습니다 · 새로 고침" 줄.
     누르면 입력 중인 글자를 먼저 저장하고 waiting 워커에 { type:'SKIP_WAITING' } → controllerchange 뒤 새로 고침.
     누르기 전에는 절대 스스로 새로 고치지 않는다(입력 중 끊김 방지). sw.js 는 이 메시지를 받아 skipWaiting() 해야 한다.
   · 화면 위 묶음(#top) 높이를 CSS 변수 --toph 에 넣는다(.saved-top 이 그 아래에 붙어 있게).
   라우트 목록은 아래 addRoute 줄과 docs/ARCH.md 를 본다. */
import { h, alertDialog, promptText } from './ui.js';
import { addRoute, setApply, setLinkHandler, onBeforeRender, startRouter, go } from './router.js';
import { applySettings, getSettings, setSetting } from './settings.js';
import { flushPending } from './form.js';
import { releaseUrls } from './photo-slot.js';
import { decodeProjectLink } from './link.js';
import { receiveProject, getProject } from './store.js';
import { initInstall } from './install.js';
import { showGuide } from './guide.js';
import { openMore } from './screens/more.js';
import { renderTrash, purgeExpired } from './trash.js';
import { P } from './screens/common.js';
import * as projects from './screens/projects.js';
import * as home from './screens/home.js';
import * as site from './screens/site.js';
import * as place from './screens/place.js';
import * as cond from './screens/cond.js';
import * as point from './screens/point.js';
import * as device from './screens/device.js';
import * as extra from './screens/extra.js';
import * as routes from './screens/routes.js';
import * as exportScreen from './screens/export.js';
import * as preview from './screens/preview.js';
import * as settingsScreen from './screens/settings.js';
import { updateSideNav } from './sidenav.js';

const $ = (id) => document.getElementById(id);
let current = null;        // 지금 화면 객체
let booted = false;
let pendingNotice = null;  // 사업 링크를 받은 결과 알림

/* ── 라우트 ───────────────────────────────────────────── */
addRoute('/', projects.render);                    // 사업 목록
addRoute('/settings', settingsScreen.render);      // 화면 설정
addRoute('/p/:pid', home.render);                  // 홈(현장 카드)
addRoute('/p/:pid/s/:id', site.render);            // 현장(장소·경로 목록)
addRoute('/p/:pid/pl/:id', place.render);          // 장소
addRoute('/p/:pid/cd/:id', cond.render);           // 공사 조건(장소마다)
addRoute('/p/:pid/pt/:id', point.render);          // 설치 지점(랙·함체 등)
addRoute('/p/:pid/dv/:id', device.render);         // 장비
addRoute('/p/:pid/ex/:id', extra.render);          // 자유 추가
addRoute('/p/:pid/routes', routes.renderList);     // 경로 목록(아래 큰 메뉴 "경로")
addRoute('/p/:pid/rt/:id', routes.render);         // 경로 하나
addRoute('/p/:pid/export', exportScreen.render);   // 저장 후 내보내기
addRoute('/p/:pid/preview', preview.render);       // 장표 미리보기
addRoute('/p/:pid/trash', async (ctx) => {         // 휴지통(SA-B)
  const project = await getProject(ctx.params.pid);
  if (!project) throw new Error('실사를 찾을 수 없습니다.');
  const s = await renderTrash({ ...ctx, project });
  return { projectId: project.id, scope: { project, node: null }, ...s };
});

/* ── 화면 틀 채우기 ───────────────────────────────────── */
function errorScreen(err) {
  return {
    title: '열 수 없습니다',
    body: [
      h('p', { class: 'empty' }, (err && err.message) || '화면을 여는 중 문제가 생겼습니다.'),
      h('a', { class: 'btn sub', href: '#/' }, '실사 목록으로'),
    ],
  };
}

function drawCrumbs(crumbs) {
  const el = $('crumb');
  if (!crumbs || !crumbs.length) { el.hidden = true; el.replaceChildren(); return; }
  const parts = [];
  crumbs.forEach((c, i) => {
    if (i) parts.push(h('span', { 'aria-hidden': 'true' }, '›'));
    const last = i === crumbs.length - 1;
    if (c.back) parts.push(h('a', { href: '#/', onclick: (e) => { if (history.length > 1) { e.preventDefault(); history.back(); } } }, c.label));
    else if (c.href && !last) parts.push(h('a', { href: c.href }, c.label));
    else if (last) parts.push(h('b', { 'aria-current': 'page' }, c.label));
    else parts.push(h('span', null, c.label));
  });
  el.replaceChildren(...parts);
  el.hidden = false;
}

function applyScreen(screen, { keepScroll }) {
  const s = screen.error ? errorScreen(screen.error) : screen;
  current = s;
  const y = window.scrollY;
  $('title').textContent = s.title || '현장실사';
  $('sub').textContent = s.sub || '';
  document.title = (s.title ? s.title + ' · ' : '') + '현장실사';
  $('brand').hidden = !s.brand;
  drawCrumbs(s.crumbs);
  const menu = $('amenu');
  const hasMenu = !!(s.menu && s.projectId);
  menu.hidden = !hasMenu;
  $('app').classList.toggle('has-menu', hasMenu);
  if (hasMenu) {
    $('m-home').href = P(s.projectId);
    $('m-routes').href = P(s.projectId) + '/routes';
    $('m-export').href = P(s.projectId) + '/export';
    $('m-home').classList.toggle('on', s.menu === 'home');
    $('m-routes').classList.toggle('on', s.menu === 'routes');
    $('m-export').classList.toggle('on', s.menu === 'export');
  }
  const view = $('view');
  const body = Array.isArray(s.body) ? s.body.flat(Infinity).filter(Boolean) : [s.body].filter(Boolean);
  view.replaceChildren(...body);
  window.scrollTo(0, keepScroll ? y : 0);
  updateSideNav(s);                                  // 넓은 화면 왼쪽 메뉴(js/sidenav.js)
  if (booted) showPendingNotice();
}

function showPendingNotice() {
  if (!pendingNotice) return;
  const text = pendingNotice;
  pendingNotice = null;
  alertDialog('실사 링크', text);
}

/* ── 사업 링크(#p=…) 받기 ─────────────────────────────── */
async function handleLink(code) {
  try {
    const payload = await decodeProjectLink(code);
    const r = await receiveProject(payload);
    if (r.isNew) {
      pendingNotice = '새 실사가 추가되었습니다.\n' + r.name + '\n현장 ' + r.addedSites + '곳 · 장소 ' + r.addedPlaces + '곳';
    } else if (r.addedSites || r.addedPlaces) {
      const parts = [];
      if (r.addedSites) parts.push('새 현장 ' + r.addedSites + '곳');
      if (r.addedPlaces) parts.push('새 장소 ' + r.addedPlaces + '곳');
      pendingNotice = r.name + '\n' + parts.join(', ') + ' 추가됨\n이미 입력한 내용은 그대로입니다.';
    } else {
      pendingNotice = r.name + '\n이미 받은 실사입니다. 새로 추가된 곳이 없습니다.';
    }
    return P(r.projectId);
  } catch (e) {
    console.error(e);
    pendingNotice = '실사 링크를 읽지 못했습니다.\n링크가 중간에 잘리지 않았는지 확인해 주세요.';
    return '#/';
  }
}

/* ── 새 버전 알림 줄 ──────────────────────────────────── */
let reloading = false;

function showUpdateBar() {
  if (document.getElementById('upd')) return;
  const bar = h('button', { type: 'button', id: 'upd', class: 'upd', onclick: applyUpdate }, '새 버전이 있습니다 · 새로 고침');
  $('top').prepend(bar);
}

async function applyUpdate() {
  await flushPending().catch((e) => console.error(e));
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  reloading = true;
  if (reg && reg.waiting) {
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(() => location.reload(), 4000);     // 워커가 답하지 않을 때(옛 sw.js) 그래도 새로 고침
  } else {
    location.reload();
  }
}

function watchUpdates(reg) {
  // 처음 설치(이전 워커가 없음)는 알리지 않는다
  const ready = (w) => { if (w && navigator.serviceWorker.controller) showUpdateBar(); };
  if (reg.waiting) ready(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener('statechange', () => { if (w.state === 'installed') ready(w); });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) location.reload(); });
  // 앱으로 돌아올 때마다 새 버전이 있는지 확인(화면 이동은 해시라 브라우저가 따로 확인하지 않는다)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
}

/* ── 시작 ─────────────────────────────────────────────── */
async function boot() {
  applySettings();
  initInstall();
  setApply(applyScreen);
  setLinkHandler(handleLink);
  onBeforeRender(flushPending);
  onBeforeRender(releaseUrls);
  $('more').addEventListener('click', () => openMore(current, { go }));
  $('m-routes').textContent = '케이블 경로';
  const top = $('top');
  const setTopH = () => document.documentElement.style.setProperty('--toph', top.offsetHeight + 'px');
  if (window.ResizeObserver) new ResizeObserver(setTopH).observe(top);
  setTopH();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js')
      .then(watchUpdates)
      .catch((e) => console.warn('오프라인 저장 등록 실패', e));
  }
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});     // 저장 공간이 모자라도 자동으로 지워지지 않게 요청
  }

  purgeExpired().catch((e) => console.warn('휴지통 정리 실패', e));   // 7일 지난 휴지통 완전 삭제

  await startRouter();

  if (!getSettings().guideSeen) await showGuide();
  if (!getSettings().surveyor) {
    const name = await promptText({
      title: '실사자 이름',
      label: '기록에 남길 이름을 넣어 주세요. 나중에 더보기 → 화면 설정에서 바꿀 수 있습니다.',
      placeholder: '이름',
    });
    if (name) { setSetting('surveyor', name); await go(location.hash || '#/'); }
  }
  booted = true;
  showPendingNotice();
}

boot().catch((e) => {
  console.error(e);
  $('view').replaceChildren(h('p', { class: 'empty' }, '앱을 시작하지 못했습니다. 화면을 새로 고쳐 주세요.'));
});
