/* screens/distribute.js — 실사정보 배포(v0.30, 관리자 기능을 켠 폰에서만 더보기에 보임)   라우트: #/p/:pid/distribute
   공개: render(ctx)
   · 이 폰에 있는 실사의 현장·장소로 실사 링크와 QR을 바로 만든다(따로 입력하지 않음).
   · 링크에 들어가는 것: 실사 ID·실사명·기간·현장 이름·장소 이름·종류(사진·입력값은 없음). 형식은 js/link.js.
   · ID: 링크로 받은 현장·장소는 그 링크 ID(linkId)를, 이 폰에서 만든 것은 노드 ID를 쓴다
     → 장소를 더 넣고 다시 보내면 받는 쪽에서 새 장소만 추가된다(store.receiveProject).
   · 링크 주소: 배포판(github.io)·이 PC(localhost)에서는 지금 주소, 그 밖(시험판 등)에서는 배포판 주소. */
import { h, toast, copyText } from '../ui.js';
import { getProject, children, val } from '../store.js';
import { encodeProjectLink, buildLinkUrl } from '../link.js';
import { qrSvg, QR_MAX_BYTES } from '../qr.js';
import { isAdmin } from '../admin.js';
import { P } from './common.js';

const PAGES_URL = 'https://rviertmtm.github.io/fieldnote/';

function appUrl() {
  const host = location.hostname;
  if (/github\.io$/.test(host) || host === 'localhost' || host === '127.0.0.1') return location.origin + location.pathname;
  return PAGES_URL;
}

const linkIdOf = (n) => n.linkId || n.id;

export async function render(ctx) {
  const project = await getProject(ctx.params.pid);
  if (!project) throw new Error('실사를 찾을 수 없습니다.');
  const base = {
    title: '실사정보 배포', sub: project.name, menu: null,
    crumbs: [{ label: '‹ 홈', href: P(project.id) }, { label: '실사정보 배포' }],
  };
  if (!isAdmin()) {
    return { ...base, body: [h('p', { class: 'empty' }, '관리자 기능을 켠 폰에서만 쓸 수 있습니다.\n더보기 → 화면 설정에서 켜 주세요.')] };
  }

  const sites = await children(project.id, 'site');
  const data = { id: project.id, name: project.name, from: project.from || null, to: project.to || null, sites: [] };
  let placeCount = 0;
  for (const s of sites) {
    const name = val(s, 'name');
    if (!name) continue;
    const places = (await children(s.id, 'place'))
      .filter((q) => val(q, 'name'))
      .map((q) => ({ id: linkIdOf(q), name: val(q, 'name'), kind: val(q, 'kind') || null }));
    placeCount += places.length;
    data.sites.push({ id: linkIdOf(s), name, places });
  }

  if (!data.sites.length) {
    return { ...base, body: [h('p', { class: 'empty' }, '보낼 현장이 없습니다.\n홈에서 현장과 장소를 먼저 만들어 주세요.')] };
  }

  // 같은 현장 안 같은 이름 장소: 받는 쪽은 이름이 같으면 한 장소로 합친다(store.receiveProject) → 미리 알린다
  const dups = [];
  for (const s of data.sites) {
    const seen = new Set(), twice = new Set();
    for (const q of s.places) (seen.has(q.name) ? twice : seen).add(q.name);
    for (const n of twice) dups.push(s.name + ' · ' + n);
  }

  const url = buildLinkUrl(appUrl(), await encodeProjectLink(data));
  let qr = null;
  if (new TextEncoder().encode(url).length <= QR_MAX_BYTES) {
    try { qr = qrSvg(url); } catch (e) { console.warn('QR 만들기 실패', e); }
  }

  const share = async () => {
    try { await navigator.share({ title: project.name, text: project.name + ' 실사 링크입니다. 크롬에서 열어 주세요.', url }); }
    catch (e) { if (e && e.name !== 'AbortError') toast('공유 창을 열지 못했습니다. 링크 복사를 써 주세요.'); }
  };
  const copy = async () => toast((await copyText(url)) ? '링크를 복사했습니다.' : '링크를 복사하지 못했습니다.');

  const body = [
    h('p', { class: 'hint' }, '현장 ' + data.sites.length + '곳 · 장소 ' + placeCount + '곳이 들어갑니다. 사진과 입력한 값은 들어가지 않습니다.'),
    dups.length
      ? h('p', { class: 'warn' }, h('b', null, '! 같은 이름 장소: ' + dups.join(', ')), '받는 쪽에서 하나로 합쳐집니다. 이름을 다르게 해 주세요.')
      : null,
    qr
      ? h('div', { class: 'card dist-qr' }, qr)
      : h('p', { class: 'warn' }, h('b', null, '! QR에 다 담기지 않습니다'), '장소가 많아 QR을 만들 수 없습니다. 아래 링크로 보내 주세요.'),
    navigator.share ? h('button', { type: 'button', class: 'btn pri', onclick: share }, '공유하기 (카톡 등)') : null,
    h('button', { type: 'button', class: navigator.share ? 'btn sub' : 'btn pri', onclick: copy }, '링크 복사'),
    h('p', { class: 'hint' }, '받은 사람이 크롬에서 열면 이 실사가 추가됩니다. 장소를 더 넣고 다시 보내면 새 장소만 추가되고, 이미 입력한 내용은 그대로입니다.'),
    h('p', { class: 'sec' }, '들어가는 현장·장소'),
    data.sites.map((s) => h('div', { class: 'card' },
      h('b', null, s.name),
      h('p', { class: 'hint' }, s.places.length ? s.places.map((q) => q.name).join(' · ') : '장소 없음'))),
  ];
  return { ...base, body };
}
