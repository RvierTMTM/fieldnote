/* screens/point.js — 설치 지점(랙·소형 함체·벽부 분배함·책상·바닥·천장·배관·기둥·벽면)   라우트: #/p/:pid/pt/:id
   공개: render(ctx)
   · 설치 형태가 랙·소형 함체면 탭 3개(촬영 / 장비 / 확인 항목)와 가상 랙(U 줄)을 보여 준다.
     가상 랙: 맨 아래가 1U. 줄을 누르면 그 자리에 장비를 등록한다. 아래에 "선반" 줄과 "랙 바닥" 줄.
     장비의 U 위치(u)는 장비가 차지하는 칸 중 가장 아래 칸 번호, 높이(h)만큼 위로 차지한다.
   · 그 밖의 형태는 한 화면에 사진·장비 목록·메모.
   · 함체 속성(크기·19인치 수용·콘센트 수·소유·잠김)은 소형 함체·벽부 분배함에서 묻는다.
   · 맨 아래 [이 설치 지점 완료](done). 장비 목록 카드는 미작성이면 [지우기]. */
import { h, sheet } from '../ui.js';
import { children, addNode, nameOf, val, deviceLabel, setField, photoKeys, isBlankNode } from '../store.js';
import { renderForm } from '../form.js';
import {
  POINT_FORMS, RACK_FORMS, CABINET_FORMS, RACK_HEIGHTS, SYSTEMS, CABLE_IN, CABINET_MOUNT, CABINET_19, OWNERS, LOCKED,
  REAR_REASONS, PDU_POS, POWER_CONN, TIDY, LABEL_STATE, YES_NO, DEVICE_KINDS,
} from '../options.js';
import { load, hrefOf, crumbsOf, card, addButton, blankCard, savedTop } from './common.js';

const tabOf = new Map();      // 설치 지점 id → 보고 있던 탭
const TABS = ['촬영', '장비', '확인 항목'];

async function addDeviceFlow(point, init, ctx) {
  const kind = await sheet({ title: '어떤 장비인가요?', items: DEVICE_KINDS.map((k) => ({ label: k, value: k })) });
  if (kind === undefined) return;
  const dev = await addNode(point, 'device', { kind, h: 1, ...init });
  ctx.go(hrefOf(dev));
}

const heightOf = (d) => Math.max(1, Math.floor(Number(val(d, 'h')) || 1));

function devChip(d) {
  return h('a', { class: 'vr-dv', href: hrefOf(d) }, deviceLabel(d) + ' (' + heightOf(d) + 'U)');
}

/** 장비 목록 카드(미작성이면 [지우기]) */
function devCard(d, sub, blank, ctx) {
  if (blank(d)) return blankCard({ href: hrefOf(d), title: deviceLabel(d), node: d, ctx });
  return card({ href: hrefOf(d), title: deviceLabel(d), sub });
}

/** 가상 랙. 돌려주는 값: { el, free }  (free = 빈 U 수, 높이를 모르면 null) */
function virtualRack(point, devices, ctx, blank) {
  const N = val(point, 'height');
  if (typeof N !== 'number' || N < 1) {
    return { el: h('p', { class: 'hint' }, '위에서 높이를 고르면 U 줄이 나옵니다.'), free: null };
  }
  const n = Math.min(Math.floor(N), 60);
  const at = new Map();          // U 번호 → [{ d, top }]
  const shelf = [];
  const floor = [];
  const loose = [];
  for (const d of devices) {
    const pos = val(d, 'pos') || 'U 위치';
    if (pos === '선반') { shelf.push(d); continue; }
    if (pos === '랙 바닥') { floor.push(d); continue; }
    const u = val(d, 'u');
    if (typeof u !== 'number' || u < 1 || u > n) { loose.push(d); continue; }
    const top = Math.min(n, u + heightOf(d) - 1);
    for (let x = u; x <= top; x++) {
      if (!at.has(x)) at.set(x, []);
      at.get(x).push({ d, top: x === top });
    }
  }
  const rows = [];
  for (let u = n; u >= 1; u--) {
    const here = at.get(u);
    if (!here) {
      rows.push(h('button', {
        type: 'button', class: 'vr-row', 'aria-label': u + 'U 비어 있음. 누르면 장비 등록',
        onclick: () => addDeviceFlow(point, { pos: 'U 위치', u }, ctx),
      }, h('span', { class: 'vr-u' }, u), h('span', { class: 'vr-c' }, h('span', { class: 'vr-e' }, '+ 장비'))));
      continue;
    }
    const anyTop = here.some((x) => x.top);
    rows.push(h('div', { class: 'vr-row ' + (anyTop ? 'used' : 'cont') },
      h('span', { class: 'vr-u' }, u),
      h('span', { class: 'vr-c' },
        here.map((x) => (x.top ? devChip(x.d) : h('a', { class: 'vr-e', href: hrefOf(x.d), 'aria-label': deviceLabel(x.d) + ' 이어짐' }, '〃'))),
        here.length > 1 ? h('span', { class: 'no' }, '! 겹침') : null)));
  }
  const special = (label, list, pos) => h('div', { class: 'vr-row sp' },
    h('span', { class: 'vr-u' }, label),
    h('span', { class: 'vr-c' },
      list.map(devChip),
      h('button', { type: 'button', class: 'lnk', onclick: () => addDeviceFlow(point, { pos }, ctx) }, '+ 장비')));
  rows.push(special('선반', shelf, '선반'));
  rows.push(special('랙 바닥', floor, '랙 바닥'));

  const el = h('div', null,
    h('div', { class: 'vr', role: 'group', 'aria-label': '가상 랙' }, rows),
    loose.length ? [
      h('p', { class: 'sec' }, '위치가 정해지지 않은 장비'),
      loose.map((d) => devCard(d, '장비 화면에서 U 위치를 넣어 주세요.', blank, ctx)),
    ] : null);
  return { el, free: n - at.size };
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
    body.unshift(h('div', { class: 'tabs', role: 'tablist' }, TABS.map((t) => h('button', {
      type: 'button', role: 'tab', class: t === tab ? 'on' : '', 'aria-selected': String(t === tab),
      onclick: () => { tabOf.set(point.id, t); ctx.refresh(); },
    }, t))));

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
    } else if (tab === '장비') {
      const vr = virtualRack(point, devices, ctx, blank);
      body.push(
        renderForm(point, [
          basicFold(point),
          { t: 'seg', k: 'system', label: '계통', opts: SYSTEMS },
          { t: 'num', k: 'height', label: '높이', unit: 'U', quick: RACK_HEIGHTS, rerender: true },
          { t: 'hint', label: '줄을 누르면 그 자리에 장비를 등록합니다. 맨 아래가 1U입니다.' },
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

  const where = place ? [nameOf(place), val(place, 'bldg'), val(place, 'floor')].filter(Boolean).join(' · ') : '';
  return {
    title: nameOf(point), sub: where,
    menu: 'home', projectId: project.id,
    scope: { project, node: point, parentHref: place ? hrefOf(place) : null },
    crumbs: crumbsOf(project, chain, point),
    body,
  };
}
