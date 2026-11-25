/* app.js — 앱 시작점: 화면 주소(라우트) 등록, 화면 틀(제목·현재 위치 줄·아래 큰 메뉴) 채우기,
   사업 링크 받기, 첫 실행 안내, 서비스 워커 등록·새 버전 알림 줄
   · 새 버전: 서비스 워커가 새 파일을 받아 기다리는 상태(waiting)가 되면 화면 위에 "새 버전이 있습니다 · 새로 고침" 줄.
     누르면 입력 중인 글자를 먼저 저장하고 waiting 워커에 { type:'SKIP_WAITING' } → controllerchange 뒤 새로 고침.
     누르기 전에는 절대 스스로 새로 고치지 않는다(입력 중 끊김 방지). sw.js 는 이 메시지를 받아 skipWaiting() 해야 한다.
   · v0.32: 실사 선택 화면 CI 오른쪽에 버전, 새 버전이 있으면 "업데이트 필요" 버튼(#verupd). 새 버전은 ① 워커가 새 파일을 받아 기다림(waiting)
     ② 배포판 js/version.js?fresh= (sw.js 가 저장본을 안 씀)의 버전이 더 높음 — 둘 중 하나. 누르면 applyUpdate(없으면 새 파일을 받을 때까지 기다림).
   · 화면 위 묶음(#top) 높이를 CSS 변수 --toph 에 넣는다(.saved-top 이 그 아래에 붙어 있게).
   · 앱 안 브라우저(카톡 등)에서 실사 링크(#p=)를 열면, 링크를 받기 전에 "크롬으로 열기" 안내 화면을 먼저 띄운다(v0.30, inAppGate).
     기록은 브라우저마다 따로 저장되므로, 카톡 안에서 받으면 홈 화면 앱(크롬)에는 새 실사가 보이지 않는다.
     v0.36: 아이폰이면 "사파리나 크롬에서 열어 주세요"(카톡 바깥 열기는 기본 브라우저로 간다 — 추측, 실기기 확인 안 됨).
     v0.35: 앱 주소만 열어도(실사 링크가 아니어도) 앱 안 브라우저면 같은 안내를 먼저 띄운다(boot). 카톡 [크롬으로 열기]는 실기기 확인됨(v0.34).
   라우트 목록은 아래 addRoute 줄과 docs/ARCH.md 를 본다. */
import { h, alertDialog, promptText, fitText, fitPending, openOverlay, closeOverlay, toast, closeX, copyText } from './ui.js';
import { addRoute, setApply, setLinkHandler, onBeforeRender, startRouter, go, refresh } from './router.js';
import { applySettings, getSettings, setSetting } from './settings.js';
import { flushPending } from './form.js';
import { releaseUrls } from './photo-slot.js';
import { decodeProjectLink } from './link.js';
import { receiveProject, getProject } from './store.js';
import { initInstall, isIOS } from './install.js';
import { showGuide } from './guide.js';
import { openMore } from './screens/more.js';
import { renderTrash, purgeExpired } from './trash.js';
import { canRename, renameFlow } from './node-edit.js';
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
import * as distribute from './screens/distribute.js';
import { updateSideNav } from './sidenav.js';
import { APP_VERSION } from './version.js';

const $ = (id) => document.getElementById(id);
let current = null;        // 지금 화면 객체
let booted = false;
let pendingNotice = null;  // 사업 링크를 받은 결과 알림

/* ── 라우트 ───────────────────────────────────────────── */
addRoute('/', projects.render);                    // 사업 목록
addRoute('/settings', settingsScreen.render);      // 화면 설정
addRoute('/distribute-app', distribute.renderApp); // 앱만 보내기(관리자, v0.35)
addRoute('/p/:pid', home.render);                  // 홈(현장 카드)
addRoute('/p/:pid/s/:id', site.render);            // 현장(장소·경로 목록)
addRoute('/p/:pid/pl/:id', place.render);          // 장소
addRoute('/p/:pid/cd/:id', cond.render);           // NW공사(장소마다, 예전 이름 공사 조건)
addRoute('/p/:pid/pt/:id', point.render);          // 설치 지점(랙·함체 등)
addRoute('/p/:pid/dv/:id', device.render);         // 장비
addRoute('/p/:pid/ex/:id', extra.render);          // 자유 추가
addRoute('/p/:pid/routes', routes.renderList);     // 경로 목록(아래 큰 메뉴 "경로")
addRoute('/p/:pid/rt/:id', routes.render);         // 경로 하나
addRoute('/p/:pid/export', exportScreen.render);   // 저장 후 내보내기
addRoute('/p/:pid/distribute', distribute.render); // 실사정보 배포(관리자, v0.30)
addRoute('/p/:pid/preview', preview.render);       // 장표 미리보기
addRoute('/p/:pid/trash', async (ctx) => {         // 휴지통(SA-B)
  const project = await getProject(ctx.params.pid);
  if (!project) throw new Error('실사를 찾을 수 없습니다.');
  const s = await renderTrash({ ...ctx, project });
  return { projectId: project.id, scope: { project, node: null }, ...s };
});
addRoute('/trash', (ctx) => renderTrash({ ...ctx, project: null }));   // 삭제한 실사 휴지통(실사 목록 더보기)

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
    let piece;
    if (c.back) piece = h('a', { href: '#/', onclick: (e) => { if (history.length > 1) { e.preventDefault(); history.back(); } } }, c.label);
    else if (c.href && !last) piece = h('a', { href: c.href }, c.label);
    else if (last) piece = h('b', { 'aria-current': 'page' }, c.label);
    else piece = h('span', null, c.label);
    parts.push(piece);
  });
  el.replaceChildren(...parts);
  el.hidden = false;
  // 조각 하나가 줄보다 길면(긴 이름) 글자를 줄이고 그래도 넘치면 "…" (조각마다 맞춤)
  for (const p of parts) if (!p.hasAttribute('aria-hidden')) fitText(p);
}

function applyScreen(screen, { keepScroll }) {
  const s = screen.error ? errorScreen(screen.error) : screen;
  current = s;
  const y = window.scrollY;
  const titleEl = $('title');
  titleEl.textContent = s.title || '현장실사';
  // 현장·장소·설치 지점·장비 화면: 위 제목을 누르면 이름 바꾸기(js/node-edit.js)
  const rn = s.scope && s.scope.node && canRename(s.scope.node) ? s.scope.node : null;
  titleEl.classList.toggle('editable', !!rn);
  if (rn) {
    titleEl.setAttribute('role', 'button');
    titleEl.tabIndex = 0;
    titleEl.setAttribute('aria-label', (s.title || '') + ' — 누르면 이름 바꾸기');
    titleEl.onclick = () => renameFlow(rn, { refresh });
    titleEl.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); renameFlow(rn, { refresh }); } };
  } else {
    titleEl.removeAttribute('role');
    titleEl.removeAttribute('tabindex');
    titleEl.removeAttribute('aria-label');
    titleEl.onclick = null;
    titleEl.onkeydown = null;
  }
  $('sub').textContent = s.sub || '';
  fitText(titleEl);                                  // 긴 제목·부제는 칸을 키우지 않고 글자를 줄인다(ui.fitText)
  fitText($('sub'));
  document.title = (s.title ? s.title + ' · ' : '') + '현장실사';
  $('brand').hidden = !s.brand;
  if (s.brand) checkNewer();
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
  fitPending();                                      // 붙기 전에 등록된 긴 글자를 첫 그림 전에 맞춘다(ui.fitText)
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

/* ── 앱 안 브라우저 안내(v0.30) ───────────────────────────
   카톡·네이버·인스타 등 앱 안 브라우저는 크롬과 저장소가 따로라, 거기서 링크를 받으면 기록이 그 앱 안에만 남는다.
   [크롬으로 열기]  카톡: kakaotalk://web/openExternal?url=…  /  안드로이드: intent://…#Intent;scheme=https;package=com.android.chrome;end
                    그 밖: 주소를 복사하고 안내(토스트).
   ※ kakaotalk://web/openExternal 은 실기기에서 바깥 브라우저로 넘어가는 것을 확인했다(v0.34). intent:// 는 확인되지 않음.
   [여기서 그냥 열기] 안내를 닫고 평소처럼 링크를 받는다. 창을 ✕·뒤로 가기로 닫아도 같다. */
const IN_APP_RE = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|\bLine\/|DaumApps|everytimeApp|\bBAND\//i;
const isKakao = () => /KAKAOTALK/i.test(navigator.userAgent || '');
const isInApp = () => IN_APP_RE.test(navigator.userAgent || '');

function openInChrome(url) {
  const ua = navigator.userAgent || '';
  if (isKakao()) { location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url); return; }   // 실기기 확인됨(v0.34, 갤럭시 폴드7 · 카톡 26.10)
  if (/Android/i.test(ua)) {
    const u = new URL(url);
    location.href = 'intent://' + u.host + u.pathname + u.search + u.hash + '#Intent;scheme=https;package=com.android.chrome;end';   // 실기기 확인 안 됨
    return;
  }
  const b = isIOS() ? '사파리나 크롬' : '크롬';
  copyText(url).then((ok) => toast(ok ? '주소를 복사했습니다. ' + b + '에 붙여 넣어 주세요' : '주소를 복사하지 못했습니다. ' + b + '에서 직접 열어 주세요'));
}

/** 앱 안 브라우저면 안내 화면을 띄우고, [여기서 그냥 열기](또는 닫기)를 누를 때까지 기다린다 */
function inAppGate() {
  if (!isInApp()) return Promise.resolve();
  const url = location.href;
  const where = isKakao() ? '카톡' : '이 앱';
  const b = isIOS() ? '사파리나 크롬' : '크롬';   // v0.36
  return new Promise((resolve) => {
    const box = h('div', { class: 'gd', role: 'dialog', 'aria-modal': 'true', 'aria-label': '크롬에서 열어 주세요' },
      h('div', { class: 'dlg-h' }, h('b', null, b + '에서 열어 주세요'), closeX()),
      h('p', null, where + ' 안에서 열면 기록이 이 화면에만 저장됩니다. ' + b + '에서 열어 주세요.'),
      h('div', { class: 'sp' }),
      h('button', { type: 'button', class: 'btn pri', onclick: () => openInChrome(url) }, isIOS() ? '사파리·크롬으로 열기' : '크롬으로 열기'),
      h('button', { type: 'button', class: 'btn sub', onclick: () => closeOverlay() }, '여기서 그냥 열기'));
    openOverlay(box, { kind: 'full', onClose: () => resolve() });
  });
}

/* ── 사업 링크(#p=…) 받기 ─────────────────────────────── */
async function handleLink(code) {
  await inAppGate();
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
  showVerUpd();
  if (document.getElementById('upd')) return;
  const bar = h('button', { type: 'button', id: 'upd', class: 'upd', onclick: applyUpdate }, '새 버전이 있습니다 · 새로 고침');
  $('top').prepend(bar);
}

/* CI 옆 "업데이트 필요" (v0.32) */
const verNum = (v) => String(v || '').replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
const newerThan = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
function showVerUpd() { const b = $('verupd'); if (b) b.hidden = false; }
let lastCheck = 0;
async function checkNewer() {
  if (!/^https?:$/.test(location.protocol) || Date.now() - lastCheck < 60000) return;
  lastCheck = Date.now();
  try {
    const t = await (await fetch('js/version.js?fresh=' + Date.now(), { cache: 'no-store' })).text();
    const m = t.match(/APP_VERSION\s*=\s*'([^']+)'/);
    if (m && newerThan(m[1], APP_VERSION)) showVerUpd();
  } catch (e) { /* 인터넷이 안 되면 건너뛴다 */ }
  const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration().catch(() => null);
  if (reg) reg.update().catch(() => {});
}
const waitWaiting = (reg, ms) => new Promise((res) => {
  const t0 = Date.now();
  const tick = () => { if (reg.waiting || Date.now() - t0 > ms) res(reg.waiting); else setTimeout(tick, 400); };
  tick();
});

async function applyUpdate() {
  await flushPending().catch((e) => console.error(e));
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  if (reg && !reg.waiting) {                            // 새 파일을 아직 안 받았으면 받을 때까지(최대 60초)
    const b = $('verupd'); if (b) { b.disabled = true; b.textContent = '받는 중…'; }
    await reg.update().catch(() => {});
    await waitWaiting(reg, 60000);
  }
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
  $('more').addEventListener('click', () => openMore(current, { go, refresh }));
  $('ver').textContent = APP_VERSION;
  $('verupd').addEventListener('click', applyUpdate);
  $('m-routes').textContent = '케이블 경로';
  const top = $('top');
  const setTopH = () => document.documentElement.style.setProperty('--toph', top.getBoundingClientRect().height + 'px');   // 소수점까지(고정 줄과 사이에 틈이 안 생기게)
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

  purgeExpired().catch((e) => console.warn('휴지통 정리 실패', e));   // 14일 지난 휴지통 완전 삭제

  if (!(location.hash || '').startsWith('#p=')) await inAppGate();   // v0.35: 앱 주소만 연 경우도 안내(실사 링크는 handleLink 에서)
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
