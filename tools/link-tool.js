/* tools/link-tool.js — 실사업무 링크 만들기 페이지(tools/link.html)의 동작
   · 실사 정보(실사 ID·실사명·실사 기간·현장 목록·장소 목록) → 링크 + QR
   · 전에 만든 링크를 붙여 넣으면 ID를 그대로 살려서 고칠 수 있다(재수신 때 같은 것으로 맞춰지게).
   · 링크 형식과 변환은 ../js/link.js, QR은 ../js/qr.js */
import { encodeProjectLink, decodeProjectLink, buildLinkUrl, newId } from '../js/link.js';
import { PLACE_KINDS } from '../js/options.js';
import { qrSvg, QR_MAX_BYTES } from '../js/qr.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props, ...kids) => {
  const e = document.createElement(tag);
  Object.assign(e, props || {});
  e.append(...kids);
  return e;
};

/** 화면 상태: [{ id, name, places:[{ id, name, kind }] }] */
let sites = [];

function drawSites() {
  const box = $('sites');
  box.replaceChildren(...sites.map((s, si) => {
    const nameInp = el('input', { type: 'text', placeholder: '현장 이름 (예: 여수1공장)', value: s.name });
    nameInp.addEventListener('input', () => { s.name = nameInp.value; });
    const rows = s.places.map((p, pi) => {
      const inp = el('input', { type: 'text', placeholder: '장소 이름 (예: 2층 전산실)', value: p.name });
      inp.addEventListener('input', () => { p.name = inp.value; });
      const sel = el('select', { title: '종류' },
        el('option', { value: '', textContent: '종류 없음' }),
        ...PLACE_KINDS.map((k) => el('option', { value: k, textContent: k })));
      sel.value = PLACE_KINDS.includes(p.kind) ? p.kind : '';
      sel.addEventListener('change', () => { p.kind = sel.value || null; });
      const del = el('button', { type: 'button', className: 'x', textContent: '빼기', title: '이 장소 빼기' });
      del.addEventListener('click', () => { s.places.splice(pi, 1); drawSites(); });
      return el('div', { className: 'line' }, inp, sel, del);
    });
    const addPlace = el('button', { type: 'button', textContent: '+ 장소 추가' });
    addPlace.addEventListener('click', () => { s.places.push({ id: newId(6), name: '', kind: null }); drawSites(); });
    const delSite = el('button', { type: 'button', className: 'x', textContent: '현장 빼기' });
    delSite.addEventListener('click', () => { sites.splice(si, 1); drawSites(); });
    return el('div', { className: 'site' },
      el('div', { className: 'line' }, nameInp, delSite),
      ...rows,
      el('div', { className: 'line' }, addPlace));
  }));
}

function say(id, text, kind) {
  const m = $(id);
  m.textContent = text || '';
  m.className = 'msg' + (kind ? ' ' + kind : '');
}

async function loadOld() {
  const raw = $('old').value.trim();
  const i = raw.indexOf('#p=');
  const code = i >= 0 ? raw.slice(i + 3) : raw;
  try {
    const p = await decodeProjectLink(code);
    $('name').value = p.name;
    $('from').value = p.from || '';
    $('to').value = p.to || '';
    $('pid').value = p.id;
    if (i > 0) $('app').value = raw.slice(0, i);
    sites = p.sites.map((s) => ({ id: s.id || newId(6), name: s.name, places: s.places.map((q) => ({ id: q.id || newId(6), name: q.name, kind: q.kind })) }));
    drawSites();
    say('oldMsg', '불러왔습니다. 아래에서 고친 뒤 링크를 다시 만드세요.', 'ok');
  } catch (e) {
    say('oldMsg', '링크를 읽지 못했습니다: ' + e.message, 'bad');
  }
}

async function make() {
  $('copy').disabled = true;
  $('out').value = '';
  $('qr').replaceChildren();
  const project = {
    id: $('pid').value.trim(),
    name: $('name').value.trim(),
    from: $('from').value || null,
    to: $('to').value || null,
    sites: sites.map((s) => ({ id: s.id, name: s.name.trim(), places: s.places.map((p) => ({ id: p.id, name: p.name.trim(), kind: p.kind })) })),
  };
  if (!project.name) { say('msg', '실사명을 넣어 주세요.', 'bad'); return; }
  if (project.from && project.to && project.from > project.to) { say('msg', '실사 종료일이 시작일보다 빠릅니다.', 'bad'); return; }
  if (project.sites.some((s) => !s.name)) { say('msg', '이름이 빈 현장이 있습니다.', 'bad'); return; }
  if (project.sites.some((s) => s.places.some((p) => !p.name))) { say('msg', '이름이 빈 장소가 있습니다.', 'bad'); return; }
  try {
    const code = await encodeProjectLink(project);
    const url = buildLinkUrl($('app').value.trim(), code);
    $('out').value = url;
    $('copy').disabled = false;
    const places = project.sites.reduce((n, s) => n + s.places.length, 0);
    let note = '현장 ' + project.sites.length + '곳 · 장소 ' + places + '곳 · 링크 길이 ' + url.length + '자';
    if (new TextEncoder().encode(url).length > QR_MAX_BYTES) {
      say('msg', note + ' — QR에 담기에는 너무 깁니다. 링크만 보내 주세요.', 'bad');
      return;
    }
    $('qr').replaceChildren(qrSvg(url));
    if (url.length > 1200) note += ' (QR이 촘촘합니다. 잘 안 읽히면 링크로 보내세요)';
    say('msg', note, 'ok');
  } catch (e) {
    say('msg', '링크를 만들지 못했습니다: ' + e.message, 'bad');
  }
}

$('pid').value = newId(10);
$('app').value = new URL('../', location.href).href;
$('newPid').addEventListener('click', () => { $('pid').value = newId(10); });
$('addSite').addEventListener('click', () => { sites.push({ id: newId(6), name: '', places: [] }); drawSites(); });
$('loadOld').addEventListener('click', loadOld);
$('make').addEventListener('click', make);
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('out').value);
    say('msg', '링크를 복사했습니다.', 'ok');
  } catch (e) {
    $('out').select();
    say('msg', '자동 복사가 안 됩니다. 링크 칸을 길게 눌러 복사해 주세요.', 'bad');
  }
});
drawSites();
