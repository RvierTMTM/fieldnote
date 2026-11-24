/* screens/projects.js — 실사 목록(앱을 열면 맨 먼저 보이는 화면)   라우트: #/
   공개: render(ctx)
   · 카드마다 "내보냄 / 아직 안 내보냄" 표시
   · 실사 기간이 지난 실사는 "지난 실사"로 따로 묶는다(입력을 막지는 않는다)
   · 실사 카드마다 [삭제](js/trash.js deleteProject — 미작성이면 바로, 아니면 확인 창 한 번. 기한 규칙 없음)
   · 순서: 만든 때·링크로 받은 때 중 나중 것이 위(store.listProjects). 링크로 받은 지 24시간 안이면 "방금 받음" 표시(v0.30) */
import { h, promptText } from '../ui.js';
import { listProjects, projectSummary, createProject } from '../store.js';
import { getSettings } from '../settings.js';
import { installButton } from '../install.js';
import { deleteProject } from '../trash.js';
import { importButton, sampleButton } from '../export.js';
import { P, card, badge, addButton, periodText, today, delButton } from './common.js';

const RECENT_MS = 24 * 60 * 60 * 1000;

export async function render(ctx) {
  const list = await listProjects();
  const now = today();
  const nowMs = Date.now();
  const active = [];
  const past = [];
  for (const p of list) {
    const s = await projectSummary(p.id);
    const el = card({
      href: P(p.id),
      title: p.name,
      sub: periodText(p) + ' · 현장 ' + s.nodes.filter((n) => n.type === 'site' && !s.blankIds.has(n.id)).length + ' · 장소 ' + s.nodes.filter((n) => n.type === 'place' && !s.blankIds.has(n.id)).length + ' · 사진 ' + s.photos,
      right: [
        p.receivedAt && nowMs - p.receivedAt < RECENT_MS ? badge('recv', '방금 받음') : null,
        p.exportedAt ? badge('ok', '내보냄') : badge('no', '아직 안 내보냄'),
      ],
      del: delButton(p.name, () => deleteProject(p), ctx),
    });
    (p.to && p.to < now ? past : active).push(el);
  }

  const body = [];
  if (!list.length) {
    body.push(h('p', { class: 'empty' }, '받은 실사가 없습니다.\n실사 링크·QR을 열거나, 받은 zip 파일로 자료복구 하세요.'));
  }
  if (active.length) body.push(h('p', { class: 'sec' }, '진행 중'), active);
  if (past.length) body.push(h('p', { class: 'sec' }, '지난 실사'), past);
  body.push(addButton('+ 링크 없이 새 실사 만들기', async () => {
    const name = await promptText({ title: '새 실사 만들기', label: '실사명을 넣어 주세요.', placeholder: '예: ○○공장 IT인프라 실사', ok: '만들기' });
    if (!name) return;
    const p = await createProject({ name });
    ctx.go(P(p.id));
  }));
  body.push(importButton(ctx, '자료복구'), sampleButton(),
    h('p', { class: 'hint' }, '내보낸 zip 파일(또는 기록 파일)을 골라 실사 기록을 되살립니다. 실사샘플은 드라이브에서 받은 뒤 자료복구로 엽니다.'));
  const install = installButton();
  if (install) body.push(install);

  return { title: '실사 선택', sub: getSettings().surveyor || '', brand: true, menu: null, crumbs: null, body };
}
