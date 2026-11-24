/* screens/point.js — 설치 지점(랙·소형 함체·벽부 분배함·책상·바닥·천장·배관·기둥·벽면)   라우트: #/p/:pid/pt/:id
   공개: render(ctx)
   · 설치 형태가 랙·소형 함체면 탭 3개(촬영 / 랙 구성(장비) / 확인 항목)와 가상 랙(U 줄)을 보여 준다.
     가상 랙: 맨 아래가 1U. 빈 줄을 누르면 그 자리에 장비를 등록한다. 아래에 "선반" 줄과 "랙 바닥" 줄.
     장비의 U 위치(u)는 장비가 차지하는 칸 중 가장 아래 칸 번호, 높이(h)만큼 위로 차지한다.
     줄 높이는 고정: 1U 줄은 장비 정보가 늘어도 한 줄 높이, nU 장비는 n줄 높이 덩어리 하나(격자 줄 합침). 장비 이름은 한 줄(ui.fitText — 길면 글자를 줄이고 "…").
     장비 줄 오른쪽 끝 작은 [⋯] → 시트: "U 위치 옮기기"(같은 랙 안, 빈 자리만 고름 + 선반·랙 바닥) / "다른 랙으로 옮기기"(js/node-edit.js 옮기기 흐름) / "삭제"(맨 아래).
     장비 줄을 0.5초 길게 눌러 위아래로 끌면 U 단위로 옮겨 놓는다(js/rack-drag.js). 겹치면 빨갛게, 놓으면 원래 자리.
   · 그 밖의 형태는 한 화면에 사진·장비 목록·메모.
   · 함체 속성(크기·19인치 수용·콘센트 수·소유·잠김)은 소형 함체·벽부 분배함에서 묻는다.
   · 맨 아래 [이 설치 지점 완료](done). 장비 목록 카드(가상 랙 밖)마다 [옮기기] [삭제].
     [삭제]는 js/trash.js deleteNode(미작성이면 바로, 아니면 확인 창 한 번), [옮기기]는 js/node-edit.js 옮기기 흐름을 바로 시작한다. 둘 다 카드를 눌러 장비 화면으로 가는 동작과 겹치지 않는다.
   · 랙 높이가 비어 있어도 U 줄만 없을 뿐 선반·랙 바닥 줄과 "위치가 정해지지 않은 장비" 목록은 그대로 보인다(다른 랙에서 옮겨 온 장비가 사라지지 않게).
   · FDF·패치판넬 장비의 줄·카드 이름은 첫 선번 줄의 라벨 원문 또는 행선지(연결처)를 보여 준다(store.deviceRowLabel). */
import { h, sheet, fitText, openOverlay, closeOverlay, toast } from '../ui.js';
import { children, addNode, nameOf, val, deviceRowLabel, setField, photoKeys, isBlankNode, locParts } from '../store.js';
import { deleteNode } from '../trash.js';
import { moveFlow } from '../node-edit.js';
import { attachRackDrag } from '../rack-drag.js';
import { renderForm } from '../form.js';
import {
  POINT_FORMS, RACK_FORMS, CABINET_FORMS, RACK_HEIGHTS, SYSTEMS, CABLE_IN, CABINET_MOUNT, CABINET_19, OWNERS, LOCKED,
  REAR_REASONS, PDU_POS, POWER_CONN, TIDY, LABEL_STATE, YES_NO, DEVICE_KINDS,
} from '../options.js';
import { load, hrefOf, crumbsOf, card, addButton, blankCard, savedTop, nodeDel } from './common.js';

const tabOf = new Map();      // 설치 지점 id → 보고 있던 탭
const TAB_DEV = '랙 구성(장비)';
const TABS = ['촬영', TAB_DEV, '확인 항목'];

async function addDeviceFlow(point, init, ctx) {
  const kind = await sheet({ title: '어떤 장비인가요?', items: DEVICE_KINDS.map((k) => ({ label: k, value: k })) });
  if (kind === undefined) return;
  const dev = await addNode(point, 'device', { kind, h: 1, ...init });
  ctx.go(hrefOf(dev));
}

const heightOf = (d) => Math.max(1, Math.floor(Number(val(d, 'h')) || 1));

/** 장비 카드(가상 랙 밖 목록. 오른쪽 [옮기기] [삭제]) */
function devCard(d, sub, blank, ctx) {
  if (blank(d)) return blankCard({ href: hrefOf(d), title: deviceRowLabel(d), node: d, ctx });
  return card({ href: hrefOf(d), title: deviceRowLabel(d), sub, del: nodeDel(d, deviceRowLabel(d), ctx) });
}

/* ── 가상 랙 ──────────────────────────────────────────── */
/** 장비를 새 자리로: { u } = U 위치의 맨 아래 칸 번호, { pos } = '선반' | '랙 바닥' (U 위치는 비운다) */
async function putAt(d, spot, ctx) {
  try {
    if (spot.u != null) {
      await setField(d.id, 'pos', 'U 위치');
      await setField(d.id, 'u', spot.u);
    } else {
      await setField(d.id, 'pos', spot.pos);
      await setField(d.id, 'u', null);
    }
  } catch (e) {
    console.error(e);
    toast('자리를 저장하지 못했습니다.');
  }
  await ctx.refresh();
}

/** U 위치 옮기기: 같은 랙의 자리를 고르는 시트. 장비 높이만큼 비어 있는 자리만 누를 수 있고, 겹치는 자리는 흐리게. 선반·랙 바닥도 고를 수 있다. 고른 자리 { u } | { pos } 또는 undefined */
function pickSpot({ d, n, hh, blocked }) {
  const pos = val(d, 'pos') || 'U 위치';
  const cu = val(d, 'u');
  return new Promise((resolve) => {
    const chip = (label, value, on, disabled) => h('button', {
      type: 'button', class: 'chip sm' + (on ? ' on' : ''), disabled: disabled || null, 'aria-pressed': String(!!on),
      onclick: () => closeOverlay(value),
    }, label);
    const cells = [];
    for (let u = n - hh + 1; u >= 1; u--) {
      cells.push(chip(hh > 1 ? u + '~' + (u + hh - 1) + 'U' : u + 'U', { u }, pos === 'U 위치' && cu === u, blocked(u, hh, d.id)));
    }
    const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'dlg-h' }, h('b', null, 'U 위치 옮기기'),
        h('button', { type: 'button', class: 'more', 'aria-label': '닫기', onclick: () => closeOverlay() }, '✕')),
      h('p', { class: 'hint' }, '"' + deviceRowLabel(d) + '" (' + hh + 'U)' + (n >= hh ? ' — ' + (hh > 1 ? '차지할 칸 범위를' : '놓을 칸을') + ' 고르세요. 흐린 자리는 다른 장비와 겹칩니다.' : ' — 랙 높이를 먼저 골라 주세요.')),
      cells.length ? [h('p', { class: 'sec' }, 'U 위치 (맨 아래 칸 번호)'), h('div', { class: 'chips' }, cells)] : null,
      h('p', { class: 'sec' }, 'U 위치가 아닌 자리'),
      h('div', { class: 'chips' }, ['선반', '랙 바닥'].map((p) => chip(p, { pos: p }, pos === p, false))));
    openOverlay(box, { kind: 'sheet', onClose: resolve });
  });
}

/** 장비 줄 [⋯] 시트 */
async function rowMenu(d, rack, ctx) {
  const pick = await sheet({
    title: deviceRowLabel(d),
    items: [
      { label: 'U 위치 옮기기', sub: '이 랙 안에서 자리를 바꿉니다', value: 'u' },
      { label: '다른 랙으로 옮기기', sub: '다른 설치 지점으로 옮깁니다', value: 'rack' },
      { label: '삭제', value: 'del', danger: true },
    ],
  });
  if (pick === 'u') {
    const hh = rack.n ? Math.min(heightOf(d), rack.n) : heightOf(d);
    const spot = await pickSpot({ d, n: rack.n, hh, blocked: rack.blocked });
    if (spot) await putAt(d, spot, ctx);
  } else if (pick === 'rack') {
    await moveFlow(d, ctx);
  } else if (pick === 'del') {
    if (await deleteNode(d.id)) await ctx.refresh();      // 미작성이면 바로, 값이 있으면 확인 창 한 번
  }
}

/** 가상 랙. 돌려주는 값: { el, free }  (free = 빈 U 수, 높이를 모르면 null) */
function virtualRack(point, devices, ctx, blank) {
  const N = val(point, 'height');
  const hasH = typeof N === 'number' && N >= 1;
  const n = hasH ? Math.min(Math.floor(N), 60) : 0;      // 높이가 없으면 U 줄은 없지만(n=0) 선반·랙 바닥·"위치가 정해지지 않은 장비"는 그대로 그린다
  const spans = [];              // U 위치에 놓인 장비: { d, u, hh, top }
  const shelf = [];
  const floor = [];
  const loose = [];
  for (const d of devices) {
    const pos = val(d, 'pos') || 'U 위치';
    if (pos === '선반') { shelf.push(d); continue; }
    if (pos === '랙 바닥') { floor.push(d); continue; }
    const u = val(d, 'u');
    if (typeof u !== 'number' || u < 1 || u > n) { loose.push(d); continue; }
    const hh = Math.min(heightOf(d), n - u + 1);
    spans.push({ d, u, hh, top: u + hh - 1 });
  }
  const hit = (a, b) => !(a.top < b.u || b.top < a.u);
  const blocked = (u, hh, exceptId) => spans.some((s) => s.d.id !== exceptId && hit(s, { u, top: u + hh - 1 }));
  const overlap = new Set();
  for (const a of spans) for (const b of spans) if (a !== b && hit(a, b)) overlap.add(a.d.id);
  // 겹친 장비는 옆으로 나란히(줄 칸을 나눔) — 보통은 1칸
  const lanes = [];
  for (const s of spans.slice().sort((a, b) => b.top - a.top || b.hh - a.hh)) {
    let k = lanes.findIndex((l) => !l.some((o) => hit(o, s)));
    if (k < 0) { k = lanes.length; lanes.push([]); }
    lanes[k].push(s);
    s.lane = k;
  }
  const occ = new Set();
  for (const s of spans) for (let x = s.u; x <= s.top; x++) occ.add(x);
  const rack = { n, blocked };

  /** 장비 줄(U 칸 덩어리 또는 선반·랙 바닥 안 한 줄): 이름(누르면 장비 화면) + 오른쪽 끝 [⋯] */
  const line = (d, hh, posName, extra) => {
    const label = deviceRowLabel(d) + ' (' + heightOf(d) + 'U)';
    const a = h('a', { class: 'vr-dv', href: hrefOf(d), draggable: 'false' }, fitText(h('span', { class: 'vr-nm' }, label)));
    const more = h('button', {
      type: 'button', class: 'vr-more', 'aria-label': deviceRowLabel(d) + ' 더보기',
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); rowMenu(d, rack, ctx).catch((err) => console.error(err)); },
    }, '⋯');
    const el = h('div', {
      class: 'vr-blk' + (overlap.has(d.id) ? ' vr-ovl' : ''),
      'data-vrid': d.id, 'data-vrh': hh, 'data-vrpos': posName,
    }, a, overlap.has(d.id) ? h('span', { class: 'no vr-ovt', title: '겹침', 'aria-label': '다른 장비와 겹침' }, '!') : null, more);
    if (extra) el.dataset.vru = extra;
    return el;
  };

  const cells = [];
  for (let u = n; u >= 1; u--) {
    const row = n - u + 1;
    cells.push(h('span', { class: 'vr-u', style: 'grid-row:' + row }, u));
    if (!occ.has(u)) {
      cells.push(h('button', {
        type: 'button', class: 'vr-empty', style: 'grid-row:' + row, 'aria-label': u + 'U 비어 있음. 누르면 장비 등록',
        onclick: () => addDeviceFlow(point, { pos: 'U 위치', u }, ctx),
      }, '+ 장비'));
    }
  }
  for (const s of spans) {
    const el = line(s.d, s.hh, 'U 위치', s.u);
    el.style.gridRow = (n - s.top + 1) + ' / span ' + s.hh;
    el.style.gridColumn = String(2 + s.lane);
    cells.push(el);
  }
  const grid = h('div', { class: 'vr-grid', style: '--vr-l:' + Math.max(1, lanes.length) }, cells);

  const special = (label, list, pos) => h('div', { class: 'vr-row sp', 'data-pos': pos },
    h('span', { class: 'vr-u' }, label),
    h('span', { class: 'vr-c' },
      list.map((d) => line(d, 1, pos)),
      h('button', { type: 'button', class: 'lnk', onclick: () => addDeviceFlow(point, { pos }, ctx) }, '+ 장비')));

  const vr = h('div', { class: 'vr', role: 'group', 'aria-label': '가상 랙' }, hasH ? grid : null, special('선반', shelf, '선반'), special('랙 바닥', floor, '랙 바닥'));
  if (hasH) attachRackDrag(vr, { grid, n, blocked, onDrop: (t) => { const d = devices.find((x) => x.id === t.id); if (d) putAt(d, t, ctx); } });

  const el = h('div', null,
    hasH ? null : h('p', { class: 'hint' }, '위에서 높이를 고르면 U 줄이 나옵니다.'),
    overlap.size ? h('p', { class: 'warn' }, h('b', null, '! 겹침'), '같은 U 칸에 장비가 둘 이상 있습니다. 줄 오른쪽 ⋯ → U 위치 옮기기로 바로잡아 주세요.') : null,
    vr,
    loose.length ? [
      h('p', { class: 'sec' }, '위치가 정해지지 않은 장비'),
      loose.map((d) => devCard(d, hasH ? '장비 화면에서 U 위치를 넣어 주세요.' : '위에서 랙 높이를 고른 뒤, 장비 화면에서 U 위치를 넣어 주세요.', blank, ctx)),
    ] : null);
  return { el, free: hasH ? n - occ.size : null };
}

function basicFold(point) {
  return {
    t: 'fold', label: '기본 정보 (이름 · 설치 형태)', open: !val(point, 'form'), items: [
      { t: 'text', k: 'name', label: '이름', rerender: true },
      { t: 'one', k: 'form', label: '설치 형태', opts: POINT_FORMS, none: false, unknown: false, rerender: true },
    ],
  };
}

function cabinetItems(form) {
  if (!CABINET_FORMS.includes(form)) return [];
  return [
    { t: 'sec', label: '함체' },
    { t: 'text', k: 'cabSize', label: '크기', ph: '예: 9U, 600×400' },
    form === '소형 함체' ? { t: 'seg', k: 'cabMount', label: '설치 방식', opts: CABINET_MOUNT, none: false } : null,
    { t: 'seg', k: 'cab19', label: '19인치 장비', opts: CABINET_19, none: false },
    { t: 'num', k: 'cabOutlets', label: '콘센트 수', unit: '개', none: true },
    { t: 'seg', k: 'cabOwner', label: '소유', opts: OWNERS, none: false },
    { t: 'seg', k: 'cabLocked', label: '잠김', opts: LOCKED, none: false },
  ];
}

export async function render(ctx) {
  const { project, node: point, chain } = await load(ctx.params.pid, ctx.params.id, 'point');
  const [devices, keys] = await Promise.all([children(point.id, 'device'), photoKeys(project.id)]);
  const blank = (d) => isBlankNode(d, devices, keys);
  const form = val(point, 'form') || '';
  const isRack = RACK_FORMS.includes(form);
  const place = chain[chain.length - 1];
  const body = [savedTop()];

  if (isRack) {
    const tab = tabOf.get(point.id) || TABS[0];
    body.unshift(h('div', { class: 'tabs', role: 'tablist' }, TABS.map((t) => fitText(h('button', {
      type: 'button', role: 'tab', class: t === tab ? 'on' : '', 'aria-selected': String(t === tab),
      onclick: () => { tabOf.set(point.id, t); ctx.refresh(); },
    }, t)))));

    if (tab === '촬영') {
      body.push(renderForm(point, [
        { t: 'hint', label: '유리문은 열고 찍어 주세요. 얼굴이 나오지 않게, 케이블에 가린 라벨은 젖혀서, 작은 라벨은 따로 가까이.' },
        { t: 'photo', slot: 'front', label: '전면 전체', multi: false, warnEmpty: true, rerender: true },
        { t: 'photo', slot: 'rear', label: '후면 전체', multi: false, warnEmpty: !val(point, 'rearReason'), rerender: true },
        { t: 'one', k: 'rearReason', label: '후면을 못 찍었으면 사유', opts: REAR_REASONS, custom: true, none: false, unknown: false, rerender: true },
        { t: 'photo', slot: 'closeup', label: '장비 근접' },
        { t: 'photo', slot: 'label', label: 'Hostname·랙 이름 라벨' },
        form === '소형 함체' ? { t: 'photo', slot: 'outer', label: '함체 외관' } : null,
        form === '소형 함체' ? { t: 'photo', slot: 'inner', label: '함체 내부' } : null,
      ], ctx));
    } else if (tab === TAB_DEV) {
      const vr = virtualRack(point, devices, ctx, blank);
      body.push(
        renderForm(point, [
          basicFold(point),
          { t: 'seg', k: 'system', label: '계통', opts: SYSTEMS },
          { t: 'num', k: 'height', label: '높이', unit: 'U', quick: RACK_HEIGHTS, rerender: true },
          { t: 'hint', label: '빈 줄을 누르면 그 자리에 장비를 등록합니다. 맨 아래가 1U입니다. 장비 줄을 길게 눌러 위아래로 끌면 U 위치가 바뀝니다.' },
        ], ctx),
        vr.el,
        vr.free == null ? null : h('p', { class: 'hint' }, '빈 공간 ' + vr.free + 'U'));
    } else {
      const vr = virtualRack(point, devices, ctx, blank);
      body.push(renderForm(point, [
        vr.free == null
          ? { t: 'num', k: 'freeU', label: '빈 공간', unit: 'U', none: true }
          : { t: 'custom', render: () => h('div', { class: 'row' }, h('span', { class: 'l' }, '빈 공간'), h('b', null, vr.free + 'U (가상 랙에서 자동 계산)')) },
        { t: 'seg', k: 'cableIn', label: '케이블 인입', opts: CABLE_IN },
        { t: 'num', k: 'pduCount', label: 'PDU 수', unit: '개', none: true },
        { t: 'multi', k: 'pduSystem', label: 'PDU 계통', opts: SYSTEMS },
        ...cabinetItems(form),
        { t: 'sec', label: '후면' },
        { t: 'one', k: 'rearPduPos', label: 'PDU 위치', opts: PDU_POS },
        { t: 'multi', k: 'rearPduSystem', label: 'PDU 계통', opts: SYSTEMS },
        { t: 'one', k: 'rearPower', label: '장비 전원 연결', opts: POWER_CONN },
        { t: 'num', k: 'rearFreeOutlets', label: '빈 콘센트', unit: '개', none: true },
        { t: 'seg', k: 'rearCableIn', label: '케이블 인입 방향', opts: CABLE_IN },
        { t: 'one', k: 'rearTidy', label: '케이블 정리 상태', opts: TIDY },
        { t: 'one', k: 'rearLabel', label: '케이블 라벨', opts: LABEL_STATE, none: false },
        { t: 'seg', k: 'rearFdfIn', label: 'FDF 후면 인입 광케이블', opts: YES_NO, none: false },
        { t: 'memo', k: 'memo', label: '메모', ph: '특이사항 한 줄 (안 써도 됨)' },
      ], ctx));
    }
  } else {
    body.push(
      renderForm(point, [
        basicFold(point),
        ...cabinetItems(form),
        CABINET_FORMS.includes(form) ? { t: 'photo', slot: 'outer', label: '함체 외관' } : null,
        CABINET_FORMS.includes(form) ? { t: 'photo', slot: 'inner', label: '함체 내부' } : null,
        { t: 'photo', slot: 'closeup', label: '장비 근접' },
        { t: 'photo', slot: 'label', label: 'Hostname·이름 라벨' },
      ], ctx),
      h('p', { class: 'sec' }, '장비'),
      devices.map((d) => devCard(d, val(d, 'state') || '', blank, ctx)),
      addButton('+ 장비 추가', () => addDeviceFlow(point, {}, ctx)),
      renderForm(point, [{ t: 'memo', k: 'memo', label: '메모', ph: '특이사항 한 줄 (안 써도 됨)' }], ctx));
  }

  const done = val(point, 'done') === true;
  body.push(h('button', {
    type: 'button', class: 'btn ' + (done ? 'done-on' : 'pri'), 'aria-pressed': String(done),
    onclick: async () => { await setField(point.id, 'done', done ? null : true); await ctx.refresh(); },
  }, done ? '✓ 완료로 표시함 (누르면 풀림)' : '이 설치 지점 완료'));

  const where = place ? [nameOf(place), ...locParts(place)].filter(Boolean).join(' · ') : '';
  return {
    title: nameOf(point), sub: where,
    menu: 'home', projectId: project.id,
    scope: { project, node: point, parentHref: place ? hrefOf(place) : null },
    crumbs: crumbsOf(project, chain, point),
    body,
  };
}
