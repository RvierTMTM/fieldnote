/* screens/cond.js — NW공사(장소마다 한 벌. 예전 이름 "공사 조건", 데이터 키는 cond_* 그대로)   라우트: #/p/:pid/cd/:id  (id = 장소 id)
   공개: render(ctx)
   값은 장소 노드의 'cond_' 로 시작하는 항목에, 사진은 장소 path 의 'cond' 칸에 들어간다.
   기존 트레이가 "없음"이면 폭(cond_trayW)·여유(cond_trayRoom) 칸을 숨긴다(값은 지우지 않고 표시만 — store.condHiddenKeys). 머리말은 동·층 중 이름에 이미 있는 것을 뺀다(store.locParts). */
import { nameOf, val, locParts } from '../store.js';
import { renderForm } from '../form.js';
import { CEILING, YES_NO, TRAY_ROOM, RACK_SPOT, WORK_CONDS, NONE } from '../options.js';
import { load, hrefOf, crumbsOf, savedTop } from './common.js';

export async function render(ctx) {
  const { project, node: place, chain } = await load(ctx.params.pid, ctx.params.id, 'place');
  const form = renderForm(place, [
    { t: 'photo', slot: 'cond', label: '사진' },
    { t: 'sec', label: '천장' },
    { t: 'num', k: 'cond_ceilH', label: '층고 (대략)', unit: 'm' },
    { t: 'num', k: 'cond_beamH', label: '보 하단 높이', unit: 'm' },
    { t: 'one', k: 'cond_ceilType', opts: CEILING, none: false },
    { t: 'sec', label: '기존 트레이' },
    { t: 'seg', k: 'cond_tray', label: '있나요', opts: YES_NO, none: false, rerender: true },
    ...(val(place, 'cond_tray') === NONE ? [] : [      // 기존 트레이가 "없음"이면 폭·여유 칸은 숨긴다(넣어 둔 값은 지우지 않는다)
      { t: 'num', k: 'cond_trayW', label: '폭 (W)', unit: 'mm' },
      { t: 'one', k: 'cond_trayRoom', opts: TRAY_ROOM, none: false },
    ]),
    { t: 'sec', label: '랙·함체 놓을 자리' },
    { t: 'multi', k: 'cond_spot', opts: RACK_SPOT, none: false },
    { t: 'sec', label: '전원' },
    { t: 'seg', k: 'cond_panel', label: '분전반', opts: YES_NO, none: false },
    { t: 'seg', k: 'cond_breaker', label: '여유 차단기', opts: YES_NO, none: false },
    { t: 'seg', k: 'cond_outlet', label: '콘센트', opts: YES_NO, none: false },
    { t: 'seg', k: 'cond_ground', label: '접지', opts: YES_NO, none: false },
    { t: 'sec', label: '작업 조건' },
    { t: 'multi', k: 'cond_work', opts: WORK_CONDS, custom: true },
    { t: 'memo', k: 'cond_memo', label: '메모', ph: '반입 동선·출입문 크기 등 (안 써도 됨)' },
  ], ctx);

  const where = locParts(place).join(' ');
  return {
    title: 'NW공사', sub: [nameOf(place), where].filter(Boolean).join(' · '),
    menu: 'home', projectId: project.id,
    scope: { project, node: null, parentHref: hrefOf(place) },
    crumbs: crumbsOf(project, chain, place, 'NW공사'),
    body: [savedTop(), form],
  };
}
