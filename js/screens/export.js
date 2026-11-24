/* screens/export.js — 내보내기 화면   라우트: #/p/:pid/export
   공개: render(ctx)
   · 맨 위 "입력 현황"(미리보기 A, js/preview-status.js): 요약 한 줄, 현장별 장소 카드, 미작성 항목 노란 줄(누르면 그 화면), 케이블 경로
   · "장표 미리보기 ›" → #/p/:pid/preview (미리보기 B, screens/preview.js)
   · "저장 후 내보내기" 버튼과 예상 크기. 실제 내보내기는 js/export.js 의 runExport(projectId)
     페이지가 틀(iframe, 예: 아티팩트 시험판 미리보기 창) 안에서 열렸으면(window.top !== window.self) 버튼 아래에
     "시험판(미리보기 창)에서는 파일 내려받기가 막혀 있을 수 있습니다." 안내를 보여 준다.
   · data-slot="export-extra" : "PC에서 이어서 하기"(zip·기록 파일 불러오기, js/export.js 의 openImport) */
import { h } from '../ui.js';
import { projectSummary, missingItems } from '../store.js';
import { runExport, estimateExportSize, importButton, sampleButton } from '../export.js';
import { statusSection } from '../preview-status.js';
import { P, load } from './common.js';

function sizeText(bytes) {
  if (bytes < 1024 * 1024) return '약 ' + Math.max(1, Math.round(bytes / 1024)) + 'KB';
  return '약 ' + Math.round(bytes / 1024 / 1024) + 'MB';
}

/** 틀(iframe) 안에서 열렸는지. 위 창을 읽다가 막히면 틀 안으로 본다 */
function inFrame() {
  try { return window.top !== window.self; } catch (e) { return true; }
}

export async function render(ctx) {
  const { project } = await load(ctx.params.pid);
  const sum = await projectSummary(project.id);
  const miss = await missingItems(project.id, sum);
  const size = await estimateExportSize(project.id);

  const body = [
    statusSection({ sum, miss }),
    h('a', { class: 'btn sub pv-go', href: P(project.id) + '/preview' }, '장표 미리보기 ›'),
    h('button', {
      type: 'button', class: 'btn pri pv-exp',
      onclick: async () => { if (await runExport(project.id)) ctx.refresh(); },
    }, '저장 후 내보내기'),
    inFrame() ? h('p', { class: 'hint pv-center' }, '시험판(미리보기 창)에서는 파일 내려받기가 막혀 있을 수 있습니다.') : null,
    size != null ? h('p', { class: 'pv-size' }, '예상 크기 ', h('b', null, sizeText(size))) : null,
    h('p', { class: 'hint pv-center' }, 'PPT·원본 사진·기록 파일을 zip 하나로 내려받습니다.'),
    h('div', { 'data-slot': 'export-extra' },
      h('p', { class: 'sec' }, 'PC에서 이어서 하기'),
      h('p', { class: 'hint' }, '내보낸 zip(또는 기록 파일 .json)을 불러와 이어서 입력합니다. 같은 실사면 합치고(더 나중에 넣은 값을 남김, 지우는 것 없음), 다른 실사면 새로 추가합니다.'),
      importButton(ctx, 'zip 불러오기'), sampleButton()),
    h('div', { class: 'foot' },
      h('p', null, project.exportedAt ? '마지막으로 내보낸 때: ' + new Date(project.exportedAt).toLocaleString('ko-KR') : '아직 내보낸 적이 없습니다.'),
      h('p', null, '보낸 뒤에도 기록은 폰에 남아 있습니다.')),
  ];

  return {
    title: '내보내기', sub: project.name,
    brand: true, menu: 'export', projectId: project.id,
    scope: { project, node: null },
    crumbs: [{ label: '홈', href: P(project.id) }, { label: '내보내기' }],
    body,
  };
}
