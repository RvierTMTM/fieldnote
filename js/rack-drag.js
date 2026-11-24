/* rack-drag.js — 가상 랙 장비 줄 길게 눌러 위아래로 끌기 (screens/point.js 가 쓴다)
   공개: attachRackDrag(vr, { grid, n, blocked, onDrop })
     vr       가상 랙 바깥 상자(.vr). 안에 끌 수 있는 줄 [data-vrid] 와 선반·랙 바닥 줄 .vr-row.sp[data-pos] 가 있다.
     grid     U 줄 격자(.vr-grid, 위가 n U, 줄 높이가 모두 같다)   n  U 줄 수
     blocked(u, hh, id) → boolean   장비 id 를 맨 아래 칸 u, 높이 hh 로 놓으면 다른 장비와 겹치나
     onDrop({ id, u } | { id, pos })  놓았을 때(겹치지 않고 자리가 바뀐 경우만) 부른다. u = U 위치의 맨 아래 칸 번호, pos = '선반' | '랙 바닥'
   끌 수 있는 줄의 data 속성: data-vrid(장비 id) data-vrh(차지하는 U 수) data-vrpos('U 위치'|'선반'|'랙 바닥') data-vru(맨 아래 칸 번호, U 위치일 때)
   동작(사진 순서 바꾸기 js/photo-slot.js sortable 과 같은 방식)
   · 0.5초 동안 10px 넘게 움직이지 않으면 들린다(그 전에 움직이면 보통 스크롤). 들리면 줄이 위로 떠 보이고 원래 자리는 흐려진다.
   · 손가락을 위아래로 움직이면 U 단위로 따라 움직인다(장비 높이만큼 덩어리째). 선반·랙 바닥 줄 위에 가면 그 줄이 표시된다.
   · 다른 장비와 겹치는 자리면 빨갛게 표시하고, 놓으면 원래 자리로 돌아간다(아무것도 저장하지 않는다).
   · 화면 위·아래 끝에 가면 천천히 스크롤한다. 끄는 동안만 touchmove 를 막는다.
   · 마우스(넓은 화면 PC)도 같은 방식: 0.5초 누른 채로 끈다. 끝난 뒤 따라오는 click 은 막아서 장비 화면이 열리지 않게 한다.
   · 줄 안의 [⋯] 버튼에서는 시작하지 않는다. 크롬 길게 누르기 메뉴·글자 선택은 막는다.
   겉모양(v0.30, css/app.css "가상 랙")만 이 파일이 붙였다 떼는 클래스로 정한다 — 판정 값(LONG·TOL·스크롤)은 바꾸지 않는다.
   · 들린 줄 .vr-ghost(위로 떠 있는 판), 놓을 수 없으면 .bad, 원래 자리 .vr-hole, 끄는 동안 랙 .vr-sorting(눌림 모양 끔·빈 칸은 파인 칸), 선반 줄 .vr-drop.
   · 놓을 수 있는 자리에 놓으면 들린 줄에 .vr-land 를 붙여 0.12초 동안 내려앉힌 뒤 지운다(LAND_MS). 겹치거나 자리가 없으면 바로 지운다. */
const LONG = 500;
const TOL = 10;
const LAND_MS = 120;       // 놓은 뒤 내려앉는 모양(겉모양만)

export function attachRackDrag(vr, { grid, n, blocked, onDrop }) {
  let timer = null;
  let item = null;
  let dragging = false;
  let ghost = null;
  let sx = 0; let sy = 0; let lx = 0; let ly = 0; let offY = 0;
  let target = null;
  let raf = 0;
  let suppress = false;
  const sp = () => Array.from(vr.querySelectorAll('.vr-row.sp[data-pos]'));

  const itemOf = (t) => {
    if (!t || !t.closest || t.closest('.vr-more')) return null;
    const it = t.closest('[data-vrid]');
    return it && vr.contains(it) ? it : null;
  };
  const cancel = () => { clearTimeout(timer); timer = null; if (!dragging) item = null; };

  function begin() {
    timer = null;
    if (!item || !item.isConnected) return;
    dragging = true;
    suppress = true;
    try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* 진동 없음 */ }
    const r = item.getBoundingClientRect();
    offY = sy - r.top;
    ghost = item.cloneNode(true);
    ghost.removeAttribute('data-vrid');
    ghost.classList.add('vr-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.height = r.height + 'px';
    document.body.append(ghost);
    item.classList.add('vr-hole');
    vr.classList.add('vr-sorting');
    lx = sx; ly = sy;
    place();
    raf = requestAnimationFrame(edgeScroll);
  }

  /** 손가락 위치로 놓일 자리를 정하고, 들린 줄을 그 자리(U 단위)로 옮겨 보여 준다 */
  function place() {
    if (!ghost || !item) return;
    const gr = grid.getBoundingClientRect();
    const rowH = gr.height / n;
    const hh = Math.max(1, Number(item.dataset.vrh) || 1);
    const labW = (grid.querySelector('.vr-u') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width;
    let box;
    let t = null;
    let hot = null;
    let bad = false;
    for (const row of sp()) {
      const r = row.getBoundingClientRect();
      if (ly < r.top || ly > r.bottom) continue;
      const lw = row.querySelector('.vr-u') ? row.querySelector('.vr-u').getBoundingClientRect().width : labW;
      hot = row;
      t = { pos: row.dataset.pos };
      box = { left: r.left + lw, top: r.top + Math.max(0, (r.height - rowH) / 2), width: r.width - lw, height: rowH };
      break;
    }
    if (!t && ly > vr.getBoundingClientRect().bottom + 8) {
      // 랙 아래(목록 쪽)로 벗어남: 자리가 없다 — 줄은 손가락 따라 떠 있고 빨갛게, 놓으면 원래 자리
      t = {};
      bad = true;
      box = { left: gr.left + labW, top: ly - offY, width: gr.width - labW, height: hh * rowH };
    }
    if (!t) {
      let rowIdx = Math.round((ly - offY - gr.top) / rowH);
      rowIdx = Math.min(Math.max(0, rowIdx), Math.max(0, n - hh));
      const u = n - rowIdx - hh + 1;
      bad = !!blocked(u, hh, item.dataset.vrid);
      t = { u };
      box = { left: gr.left + labW, top: gr.top + rowIdx * rowH, width: gr.width - labW, height: hh * rowH };
    }
    target = { ...t, bad };
    sp().forEach((row) => row.classList.toggle('vr-drop', row === hot));
    ghost.classList.toggle('bad', bad);
    ghost.style.width = Math.max(40, box.width) + 'px';
    ghost.style.height = box.height + 'px';
    ghost.style.transform = 'translate(' + box.left + 'px,' + box.top + 'px)';
  }

  function edgeScroll() {
    if (!dragging) return;
    const topPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toph')) || 90;
    const top = topPx + 56;                      // 위쪽 고정 줄(제목·위치·자동 저장 줄) 아래
    const bottom = window.innerHeight - 110;      // 아래 큰 메뉴 위
    let dy = 0;
    if (ly < top) dy = -Math.min(6, Math.ceil((top - ly) / 8));
    else if (ly > bottom) dy = Math.min(6, Math.ceil((ly - bottom) / 8));
    if (dy) { window.scrollBy(0, dy); place(); }
    raf = requestAnimationFrame(edgeScroll);
  }

  function finish() {
    clearTimeout(timer);
    timer = null;
    if (!dragging) { item = null; return; }
    dragging = false;
    cancelAnimationFrame(raf);
    const g = ghost;
    ghost = null;
    const it = item;
    item = null;
    it.classList.remove('vr-hole');
    vr.classList.remove('vr-sorting');
    sp().forEach((row) => row.classList.remove('vr-drop'));
    setTimeout(() => { suppress = false; }, 400);
    const t = target;
    target = null;
    const ok = !!t && !t.bad && (t.u != null || !!t.pos);
    if (g) {
      if (ok) { g.classList.add('vr-land'); setTimeout(() => g.remove(), LAND_MS); }      // 놓은 자리에 내려앉는 모양
      else g.remove();
    }
    if (!ok) return;                                                 // 겹치거나 자리가 없으면 원래 자리 그대로
    const same = t.pos ? it.dataset.vrpos === t.pos : (it.dataset.vrpos === 'U 위치' && Number(it.dataset.vru) === t.u);
    if (same) return;
    onDrop(t.pos ? { id: it.dataset.vrid, pos: t.pos } : { id: it.dataset.vrid, u: t.u });
  }

  const press = (el, x, y) => {
    const it = itemOf(el);
    if (!it) return false;
    item = it; sx = x; sy = y;
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

  vr.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { if (dragging) finish(); else cancel(); return; }
    press(e.target, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  vr.addEventListener('touchmove', (e) => {
    const p = e.touches[0];
    if (p && drag(p.clientX, p.clientY)) e.preventDefault();
  }, { passive: false });
  vr.addEventListener('touchend', (e) => { if (dragging) { e.preventDefault(); finish(); } else cancel(); });
  vr.addEventListener('touchcancel', () => { if (dragging) finish(); else cancel(); });
  vr.addEventListener('contextmenu', (e) => { if (itemOf(e.target)) e.preventDefault(); });      // 크롬 길게 누르기 메뉴·우클릭 메뉴
  vr.addEventListener('dragstart', (e) => { if (itemOf(e.target)) e.preventDefault(); });         // 링크 끌기(마우스)
  vr.addEventListener('click', (e) => { if (suppress) { e.preventDefault(); e.stopPropagation(); suppress = false; } }, true);

  vr.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !press(e.target, e.clientX, e.clientY)) return;
    const move = (ev) => { if (drag(ev.clientX, ev.clientY)) ev.preventDefault(); };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); finish(); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
}
