/* notice.js — 내보내기 안내 줄·완료 알림
   공개:
     renderExportNotice(container, projectId) → Promise
        홈 화면 맨 위 고정 줄. 평소엔 옅은 안내 문구, 안 보낸 사진이 있으면 노란 "! 아직 안 보낸 사진 N장".
        "안 보낸 사진" = 마지막 내보내기(projects.exportedAt) 뒤에 생기거나 바뀐 사진(store.countUnexportedPhotos).
        누르면 내보내기 화면으로 간다. (홈 화면이 그릴 때마다 부른다)
     afterDoneChange(projectId) → Promise
        장소의 완료 표시가 바뀐 직후 장소 화면이 부른다.
        모든 장소가 완료가 됐으면 "실사가 끝났나요?" 알림창을 한 번만 띄운다(지금 내보내기 / 나중에 / ✕).
        띄웠다는 기록: kv 'exportAsked:'+projectId (사업을 지우면 같이 지운다). */
import { h, dialog, fill } from './ui.js';
import { go } from './router.js';
import { countUnexportedPhotos, getProject, projectNodes, val, kvGet, kvSet } from './store.js';

const exportHref = (pid) => '#/p/' + encodeURIComponent(pid) + '/export';

export async function renderExportNotice(container, projectId) {
  const n = await countUnexportedPhotos(projectId);
  const href = exportHref(projectId);
  fill(container, n > 0
    ? h('a', { class: 'warn', href }, h('b', null, '! 아직 안 보낸 사진 ' + n + '장'), '실사 종료 후 반드시 내보내기 하세요 ›')
    : h('a', { class: 'hint', href }, '실사 종료 후 반드시 내보내기 하세요 ›'));
}

export async function afterDoneChange(projectId) {
  const key = 'exportAsked:' + projectId;
  if (await kvGet(key)) return;
  const places = (await projectNodes(projectId)).filter((n) => n.type === 'place');
  if (!places.length || places.some((p) => val(p, 'done') !== true)) return;
  await kvSet(key, Date.now());
  const [project, n] = await Promise.all([getProject(projectId), countUnexportedPhotos(projectId)]);
  if (!project) return;
  const v = await dialog({
    title: '실사가 끝났나요?',
    body: [
      h('p', null, project.name + ' · 장소 ' + places.length + '곳 모두 완료'),
      h('p', { class: 'lost' }, '! 실사 종료 후 반드시 내보내기 하세요' + (n > 0 ? '\n· 아직 안 보낸 사진 ' + n + '장' : '')),
      h('p', null, '내보내기 전에는 기록이 이 폰에만 있습니다.'),
    ],
    buttons: [{ label: '나중에', cls: 'sub', value: 'later' }, { label: '지금 내보내기', cls: 'pri', value: 'now' }],
  });
  if (v === 'now') go(exportHref(projectId));
}
