/* photo-slot.js — 사진 칸
   공개:
     photoSlot(opts) → HTMLElement
       opts: { projectId, ownerPath, slot, label, multi=true, hint, warnEmpty, onChange }
       · ownerPath: 사진이 달리는 노드의 path, slot: 칸 이름(docs/ARCH.md 의 사진 칸 표)
       · multi=false 는 한 장짜리 고정 칸(랙 전면 전체·후면 전체 등). 사진이 있으면 추가 버튼이 사라진다.
       · 사진이 늘거나 줄거나 바뀌면 onChange() 를 부르고, 칸 요소에서 'photos-changed' 이벤트(bubbles)를 낸다.
     releaseUrls()   화면을 바꿀 때 app.js 가 부른다(미리보기 주소 해제)
   동작
     · "+ 촬영" = input capture(바로 찍기, source:'camera'), "갤러리" = 고르기(source:'gallery', 여러 장 칸은 여러 장 한 번에)
     · 저장 전에 js/photo-proc.js 로 줄인다(긴 변 2560px JPEG 0.85 + 320px 작은 그림 + EXIF 메타 → photo.exif)
     · 바로 찍은 직후 보정 창(openCorrector)을 연다. 창의 ✕ = 건너뛰기.
     · 짧게 누름 = 사진 메뉴: 다시 찍기 / 갤러리에서 바꾸기 / 크게 보기(두 손가락 확대) / 보정 다시 하기 / (떼어서) 삭제
       바꾸기는 같은 id·칸·순서를 그대로 두고 사진만 바꾼다. 바꾸기 전 사진은 휴지통 14일(trash.trashPhotoCopy).
     · 길게 누름(여러 장 칸, 2장 이상) = 끌어다 놓아 순서 바꾸기. 같은 칸 안에서만. 놓으면 order 자동 저장. */
import { h, sheet, confirmDialog, alertDialog, openOverlay, closeOverlay, toast, fill } from './ui.js';
import { addPhoto, listPhotos, getPhoto, putPhoto, deletePhoto, reorderPhotos, getProject, stamp } from './store.js';
import { processImage } from './photo-proc.js';
import { openCorrector } from './corrector.js';
import { trashPhotoCopy, whereOf } from './trash.js';

let urls = [];
export function releaseUrls() {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
}
function urlOf(blob) {
  const u = URL.createObjectURL(blob);
  urls.push(u);
  return u;
}

/** 파일 고르기 창을 연다. 고르지 않고 닫으면 [] (cancel 이벤트가 없는 브라우저에서는 그냥 끝나지 않는다) */
function pickFiles({ camera = false, multiple = false } = {}) {
  return new Promise((resolve) => {
    const inp = h('input', {
      class: 'hid', type: 'file', accept: 'image/*', capture: camera ? 'environment' : null,
      multiple: multiple || null, tabindex: '-1', 'aria-hidden': 'true',
    });
    let done = false;
    const finish = (files) => {
      if (done) return;
      done = true;
      inp.remove();
      resolve(files);
    };
    inp.addEventListener('change', () => finish(Array.from(inp.files || [])));
    inp.addEventListener('cancel', () => finish([]));
    document.body.append(inp);
    inp.click();
  });
}

function errText(e) {
  if (e && e.name === 'QuotaExceededError') return '폰 저장 공간이 모자라 사진을 저장하지 못했습니다.';
  return (e && e.message) || '사진을 저장하지 못했습니다.';
}

export function photoSlot(opts) {
  const { projectId, ownerPath, slot, label, multi = true, hint, warnEmpty = false, onChange } = opts;
  const wrap = h('div', { class: 'pslot', 'data-slot': slot });
  let busy = false;

  const changed = async () => {
    await draw();
    if (onChange) onChange();
    wrap.dispatchEvent(new CustomEvent('photos-changed', { bubbles: true, detail: { ownerPath, slot } }));
  };
  const setBusy = (v) => { busy = v; draw().catch((e) => console.error(e)); };

  async function addFrom(camera) {
    if (busy) return;
    const files = await pickFiles({ camera, multiple: !camera && multi });
    if (!files.length) return;
    setBusy(true);
    const added = [];
    try {
      for (const f of multi ? files : files.slice(0, 1)) {
        const r = await processImage(f);
        added.push(await addPhoto({
          projectId, ownerPath, slot, blob: r.blob, thumb: r.thumb,
          source: camera ? 'camera' : 'gallery', takenAt: r.takenAt, exif: r.exif,
        }));
      }
    } catch (e) {
      console.error(e);
      await alertDialog('사진', errText(e) + (added.length ? '\n(' + added.length + '장은 저장됨)' : ''));
    } finally {
      busy = false;
    }
    await changed();
    if (camera && added.length) {
      if (await openCorrector(added[0].id)) await changed();      // 현장 자동 보정 제안(✕ = 건너뛰기)
    }
  }

  async function replaceFrom(photo, camera) {
    if (busy) return;
    const files = await pickFiles({ camera });
    if (!files.length) return;
    setBusy(true);
    let ok = false;
    try {
      const r = await processImage(files[0]);
      const old = await getPhoto(photo.id);
      if (!old) throw new Error('바꿀 사진을 찾지 못했습니다. 지워졌을 수 있습니다.');
      await trashPhotoCopy(old, [await whereOf(ownerPath), label].filter(Boolean).join(' · '), label ? ' · ' + label : '');
      await putPhoto({
        ...old, blob: r.blob, thumb: r.thumb, source: camera ? 'camera' : 'gallery',
        takenAt: r.takenAt, exif: r.exif, corrected: null, meta: stamp(),
      });
      ok = true;
    } catch (e) {
      console.error(e);
      await alertDialog('사진', errText(e));
    } finally {
      busy = false;
    }
    await changed();
    if (ok) toast('바꿨습니다. 바꾸기 전 사진은 휴지통에 14일 보관됩니다.');
    if (ok && camera) {
      if (await openCorrector(photo.id)) await changed();
    }
  }

  async function removePhoto(photo) {
    const project = await getProject(projectId);
    const unsent = !project || !project.exportedAt || Math.max(photo.createdAt || 0, photo.changedAt || 0) > project.exportedAt;
    const ok = await confirmDialog({
      title: '사진을 지울까요?',
      body: [
        label ? h('p', null, label) : null,
        h('p', { class: 'lost' }, '! 이 사진 1장이 지워집니다.\n휴지통에 남지 않습니다. 복구할 수 없습니다.'),
        unsent ? h('p', { class: 'lost' }, '! 아직 내보내지 않은 사진입니다.' + (photo.source === 'gallery' ? '\n(갤러리에서 고른 사진이라 갤러리 원본은 남아 있습니다.)' : '\n앱 밖 어디에도 남지 않습니다.')) : null,
      ],
      ok: '삭제', danger: true,
    });
    if (!ok) return;
    await deletePhoto(photo.id);
    await changed();
  }

  async function openMenu(photo, index) {
    if (busy) return;
    const pick = await sheet({
      title: (label || '사진') + (multi ? ' · ' + (index + 1) + '번째' : ''),
      note: multi ? '길게 누르면 끌어서 순서를 바꿀 수 있습니다.' : null,
      items: [
        { label: '다시 찍기', sub: '바꾸기 전 사진은 휴지통에 14일 보관', value: 'retake' },
        { label: '갤러리에서 바꾸기', value: 'gallery' },
        { label: '크게 보기', sub: photo.corrected ? '보정 전·후 비교' : null, value: 'view' },
        { label: '보정 다시 하기', sub: photo.corrected ? null : '기울기·사다리꼴 바로잡기', value: 'correct' },
        { label: '삭제', value: 'del', danger: true },
      ],
    });
    if (pick === 'retake') await replaceFrom(photo, true);
    else if (pick === 'gallery') await replaceFrom(photo, false);
    else if (pick === 'view') await viewPhoto(photo.id, label);
    else if (pick === 'correct') { if (await openCorrector(photo.id)) await changed(); }
    else if (pick === 'del') await removePhoto(photo);
  }

  async function draw() {
    const list = await listPhotos(ownerPath, slot);
    const tiles = list.map((p, i) => h('button', {
      type: 'button', class: 'ph', 'data-id': p.id, 'aria-label': (label || '사진') + ' ' + (i + 1),
      onclick: () => openMenu(p, i),
    },
    h('img', { src: urlOf(p.thumb || p.blob), alt: '', loading: 'lazy', draggable: 'false' }),
    p.corrected ? h('span', { class: 'ph-tag' }, '보정') : null));
    if (busy) {
      tiles.push(h('div', { class: 'ph plus busy', role: 'status' }, '저장 중…'));
    } else if (multi || !list.length) {
      tiles.push(h('button', { type: 'button', class: 'ph plus', onclick: () => addFrom(true) }, '+ 촬영'));
      tiles.push(h('button', { type: 'button', class: 'ph plus gal', onclick: () => addFrom(false) }, '갤러리'));
    }
    const sortableNow = multi && list.length > 1;
    const grid = h('div', { class: 'thumbs' }, tiles);
    if (sortableNow) {
      sortable(grid, async (ids) => {
        try { await reorderPhotos(ids); } catch (e) { console.error(e); toast('순서를 저장하지 못했습니다.'); }
        await changed();
      });
    }
    wrap.classList.toggle('miss', warnEmpty && !list.length);
    fill(wrap, 
      label ? h('p', { class: 'sec' }, label + (list.length ? ' · ' + list.length + '장' : '') + (sortableNow ? ' (길게 눌러 끌면 순서 바뀜)' : '')) : null,
      hint ? h('p', { class: 'hint' }, hint) : null,
      grid);
  }
  draw().catch((e) => console.error(e));
  return wrap;
}

/* ── 순서 바꾸기: 길게 눌러 끌어다 놓기 ────────────────────
   터치: 0.45초 동안 10px 넘게 움직이지 않으면 끌기 시작(그 전에 움직이면 보통 스크롤).
   끄는 동안만 touchmove 를 막아 화면이 따라 스크롤되지 않게 하고, 손가락이 화면 위·아래 끝에 가면 천천히 스크롤한다.
   마우스(PC 2차 입력): 같은 방식으로 길게 누른 채 끈다. */
function sortable(grid, onDrop) {
  const LONG = 450;
  const TOL = 10;
  let timer = null;
  let tile = null;
  let dragging = false;
  let ghost = null;
  let sx = 0; let sy = 0; let lx = 0; let ly = 0; let offX = 0; let offY = 0;
  let before = [];
  let raf = 0;
  let suppress = false;
  const tiles = () => Array.from(grid.querySelectorAll('.ph[data-id]'));

  const cancel = () => { clearTimeout(timer); timer = null; if (!dragging) tile = null; };

  function begin() {
    timer = null;
    if (!tile || !tile.isConnected) return;
    dragging = true;
    suppress = true;
    before = tiles().map((t) => t.dataset.id);
    try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* 진동 없음 */ }
    const r = tile.getBoundingClientRect();
    offX = sx - r.left;
    offY = sy - r.top;
    ghost = tile.cloneNode(true);
    ghost.classList.add('ph-ghost');
    ghost.style.width = r.width + 'px';
    ghost.style.height = r.height + 'px';
    document.body.append(ghost);
    tile.classList.add('ph-hole');
    grid.classList.add('sorting');
    lx = sx; ly = sy;
    place();
    raf = requestAnimationFrame(edgeScroll);
  }

  function place() {
    ghost.style.transform = 'translate(' + (lx - offX) + 'px,' + (ly - offY) + 'px)';
    const list = tiles();
    for (const t of list) {
      if (t === tile) continue;
      const r = t.getBoundingClientRect();
      if (lx >= r.left && lx <= r.right && ly >= r.top && ly <= r.bottom) {
        if (list.indexOf(t) > list.indexOf(tile)) t.after(tile); else t.before(tile);
        break;
      }
    }
  }

  function edgeScroll() {
    if (!dragging) return;
    const top = 70;
    const bottom = window.innerHeight - 100;
    let dy = 0;
    if (ly < top) dy = -Math.ceil((top - ly) / 6);
    else if (ly > bottom) dy = Math.ceil((ly - bottom) / 6);
    if (dy) { window.scrollBy(0, dy); place(); }
    raf = requestAnimationFrame(edgeScroll);
  }

  function finish() {
    clearTimeout(timer);
    timer = null;
    if (!dragging) { tile = null; return; }
    dragging = false;
    cancelAnimationFrame(raf);
    if (ghost) ghost.remove();
    ghost = null;
    if (tile) tile.classList.remove('ph-hole');
    grid.classList.remove('sorting');
    tile = null;
    setTimeout(() => { suppress = false; }, 400);
    const after = tiles().map((t) => t.dataset.id);
    if (after.join() !== before.join()) onDrop(after);
  }

  const press = (target, x, y) => {
    const t = target.closest && target.closest('.ph[data-id]');
    if (!t || !grid.contains(t)) return false;
    tile = t; sx = x; sy = y;
    clearTimeout(timer);
    timer = setTimeout(begin, LONG);
    return true;
  };
  const drag = (x, y) => {
    if (!dragging) {
      if (timer && Math.hypot(x - sx, y - sy) > TOL) cancel();
      return false;
    }
    lx = x; ly = y;
    place();
    return true;
  };

  grid.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { if (dragging) finish(); else cancel(); return; }
    press(e.target, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  grid.addEventListener('touchmove', (e) => {
    const p = e.touches[0];
    if (p && drag(p.clientX, p.clientY)) e.preventDefault();
  }, { passive: false });
  grid.addEventListener('touchend', (e) => { if (dragging) { e.preventDefault(); finish(); } else cancel(); });
  grid.addEventListener('touchcancel', () => { if (dragging) finish(); else cancel(); });
  grid.addEventListener('contextmenu', (e) => { if (e.target.closest('.ph[data-id]')) e.preventDefault(); });
  grid.addEventListener('click', (e) => { if (suppress) { e.preventDefault(); e.stopPropagation(); suppress = false; } }, true);

  grid.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !press(e.target, e.clientX, e.clientY)) return;
    const move = (ev) => { if (drag(ev.clientX, ev.clientY)) ev.preventDefault(); };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); finish(); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
}

/* ── 크게 보기(두 손가락 확대·끌어서 이동·두 번 눌러 확대) ── */
async function viewPhoto(photoId, label) {
  const p = await getPhoto(photoId);
  if (!p) return;
  const hasC = !!(p.corrected && p.corrected.blob);
  let showC = hasC;
  const img = h('img', { class: 'zv-img', alt: '', draggable: 'false' });
  const stage = h('div', { class: 'zv-stage' }, img);
  const zoom = attachZoom(stage, img);
  const segBtns = [];
  const setSrc = () => {
    img.src = urlOf(showC ? p.corrected.blob : p.blob);
    zoom.reset();
    segBtns.forEach((b) => b.classList.toggle('on', b.dataset.c === String(showC)));
  };
  const seg = hasC ? h('div', { class: 'seg zv-seg' }, [false, true].map((c) => {
    const b = h('button', { type: 'button', 'data-c': String(c), onclick: () => { showC = c; setSrc(); } }, c ? '보정 후' : '찍은 그대로');
    segBtns.push(b);
    return b;
  })) : null;
  const box = h('div', { class: 'zv', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'dlg-h zv-h' }, h('b', null, label || '사진'),
      h('button', { type: 'button', class: 'more', 'aria-label': '닫기', onclick: () => closeOverlay() }, '✕')),
    stage,
    h('div', { class: 'zv-f' }, seg, h('p', { class: 'hint' }, '두 손가락으로 벌려 확대 · 두 번 누르면 확대/원래대로')));
  setSrc();
  openOverlay(box, { kind: 'full' });
}

function attachZoom(stage, img) {
  let s = 1; let x = 0; let y = 0;
  let start = null;
  let lastTap = 0;
  let lastTouch = 0;
  const apply = () => { img.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')'; };
  const clamp = () => {
    if (s <= 1.001) { s = 1; x = 0; y = 0; return; }
    const r = stage.getBoundingClientRect();
    const mx = Math.max(0, (img.offsetWidth * s - r.width) / 2);
    const my = Math.max(0, (img.offsetHeight * s - r.height) / 2);
    x = Math.min(mx, Math.max(-mx, x));
    y = Math.min(my, Math.max(-my, y));
  };
  const center = () => { const r = stage.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const zoomAt = (cx, cy, ns) => {
    ns = Math.min(6, Math.max(1, ns));
    const [mx, my] = center();
    const ox = cx - mx; const oy = cy - my;
    x = ox - (ox - x) * (ns / s);
    y = oy - (oy - y) * (ns / s);
    s = ns;
    clamp(); apply();
  };
  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const one = (t) => ({ pinch: false, px: t.clientX, py: t.clientY, x, y });

  stage.addEventListener('touchstart', (e) => {
    lastTouch = Date.now();
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      start = { pinch: true, d: dist(a, b) || 1, s, x, y, cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 };
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      start = one(t);
      const now = Date.now();
      if (now - lastTap < 300) { zoomAt(t.clientX, t.clientY, s > 1 ? 1 : 2.5); lastTap = 0; e.preventDefault(); } else lastTap = now;
    }
  }, { passive: false });
  stage.addEventListener('touchmove', (e) => {
    if (!start) return;
    e.preventDefault();
    if (start.pinch && e.touches.length === 2) {
      const [a, b] = e.touches;
      const ns = Math.min(6, Math.max(1, start.s * dist(a, b) / start.d));
      const [mx, my] = center();
      const ox = start.cx - mx; const oy = start.cy - my;
      x = ox - (ox - start.x) * (ns / start.s) + ((a.clientX + b.clientX) / 2 - start.cx);
      y = oy - (oy - start.y) * (ns / start.s) + ((a.clientY + b.clientY) / 2 - start.cy);
      s = ns;
      clamp(); apply();
    } else if (!start.pinch && e.touches.length === 1 && s > 1) {
      const t = e.touches[0];
      x = start.x + (t.clientX - start.px);
      y = start.y + (t.clientY - start.py);
      clamp(); apply();
    }
  }, { passive: false });
  stage.addEventListener('touchend', (e) => {
    lastTouch = Date.now();
    if (e.touches.length === 1) start = one(e.touches[0]);
    else if (!e.touches.length) start = null;
  });

  // PC: 휠 확대, 끌어서 이동, 두 번 눌러 확대
  stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, s * (e.deltaY < 0 ? 1.2 : 1 / 1.2)); }, { passive: false });
  stage.addEventListener('dblclick', (e) => { if (Date.now() - lastTouch < 800) return; zoomAt(e.clientX, e.clientY, s > 1 ? 1 : 2.5); });
  stage.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || s <= 1) return;
    e.preventDefault();
    const st = { px: e.clientX, py: e.clientY, x, y };
    const move = (ev) => { x = st.x + (ev.clientX - st.px); y = st.y + (ev.clientY - st.py); clamp(); apply(); };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
  return { reset: () => { s = 1; x = 0; y = 0; apply(); } };
}
