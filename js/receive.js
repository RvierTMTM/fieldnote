/* receive.js — 실사 링크 받기(v0.40). 링크로 앱을 열었을 때(app.js handleLink)와
   실사 선택 화면의 "실사 링크 붙여 넣기"(screens/projects.js)가 같은 코드를 쓴다.
   공개: findLinkCode(text) → code | null      글(메시지 통째도 됨) 안에서 '#p=…' 의 code 를 찾는다
         receiveCode(code) → Promise<{ route, notice }>   받아서 옮겨 갈 해시와 결과 알림 글
   · 아이폰 사파리는 홈 화면 앱과 기록을 따로 쓴다(v0.36 실기기). 그래서 홈 화면 앱 안에서 링크를 받을 길로 붙여 넣기를 둔다. */
import { decodeProjectLink } from './link.js';
import { receiveProject } from './store.js';
import { P } from './screens/common.js';

export function findLinkCode(text) {
  const m = /#p=([A-Za-z0-9_-]+)/.exec(String(text || ''));
  return m ? m[1] : null;
}

export async function receiveCode(code) {
  try {
    const r = await receiveProject(await decodeProjectLink(code));
    let notice;
    if (r.isNew) {
      notice = '새 실사가 추가되었습니다.\n' + r.name + '\n현장 ' + r.addedSites + '곳 · 장소 ' + r.addedPlaces + '곳';
    } else if (r.addedSites || r.addedPlaces) {
      const parts = [];
      if (r.addedSites) parts.push('새 현장 ' + r.addedSites + '곳');
      if (r.addedPlaces) parts.push('새 장소 ' + r.addedPlaces + '곳');
      notice = r.name + '\n' + parts.join(', ') + ' 추가됨\n이미 입력한 내용은 그대로입니다.';
    } else {
      notice = r.name + '\n이미 받은 실사입니다. 새로 추가된 곳이 없습니다.';
    }
    return { route: P(r.projectId), notice };
  } catch (e) {
    console.error(e);
    return { route: '#/', notice: '실사 링크를 읽지 못했습니다.\n링크가 중간에 잘리지 않았는지 확인해 주세요.' };
  }
}
