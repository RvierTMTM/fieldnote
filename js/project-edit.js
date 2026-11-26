/* project-edit.js — 실사 정보 바꾸기(v0.50): 실사명·시작일·종료일을 한 창에서 고친다.
   공개: editProjectFlow(project, { refresh }) → Promise<boolean>(바꿨으면 true)
   여는 곳: 실사 홈 위 제목 누르기(app.js applyScreen), 실사 안 더보기 "실사 정보 바꾸기"(screens/more.js)
   · 날짜는 비워 두면 기간 없음. 시작일이 종료일보다 늦으면 저장하지 않고 알린다.
   · 배포 링크(screens/distribute.js)는 실사 정보를 그때그때 읽으므로 바뀐 이름·기간이 그대로 담긴다. */
import { h, openOverlay, closeOverlay, closeX, toast } from './ui.js';
import { updateProjectInfo } from './store.js';

export function editProjectFlow(project, { refresh } = {}) {
  return new Promise((resolve) => {
    const name = h('input', { class: 'inp', type: 'text', 'aria-label': '실사명', placeholder: '실사명' });
    name.value = project.name || '';
    const from = h('input', { class: 'inp', type: 'date', 'aria-label': '시작일' });
    from.value = project.from || '';
    const to = h('input', { class: 'inp', type: 'date', 'aria-label': '종료일' });
    to.value = project.to || '';
    let saved = false;
    const save = async () => {
      const n = name.value.trim();
      if (!n) { toast('실사명을 넣어 주세요.'); return; }
      if (from.value && to.value && from.value > to.value) { toast('시작일이 종료일보다 늦습니다.'); return; }
      await updateProjectInfo(project.id, { name: n, from: from.value || null, to: to.value || null });
      saved = true;
      closeOverlay();
    };
    const row = (label, el) => h('label', { class: 'row' }, h('span', { class: 'l' }, label), el);
    const box = h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'dlg-h' }, h('b', null, '실사 정보 바꾸기'), closeX()),
      row('실사명', name), row('시작일', from), row('종료일', to),
      h('p', { class: 'hint' }, '날짜를 비워 두면 기간 없음입니다. 바꾼 뒤 배포 링크를 다시 보내면 받은 폰에도 바뀝니다.'),
      h('div', { class: 'two' },
        h('button', { type: 'button', class: 'btn sub', onclick: () => closeOverlay() }, '취소'),
        h('button', { type: 'button', class: 'btn pri', onclick: save }, '저장')));
    openOverlay(box, { kind: 'dialog', onClose: async () => { if (saved && refresh) await refresh(); resolve(saved); } });
    setTimeout(() => name.focus(), 50);
  });
}
