/* options.js — 화면에서 버튼으로 고르는 값 목록 (고칠 때는 이 파일만 고치면 된다)
   공개: 아래 상수 전부. 값은 화면에 보이는 글자 그대로 저장한다.
   "(가정)" 표시가 붙은 목록은 설계기록에 선택지가 적혀 있지 않아 임시로 정한 값이다 — 리버 확인 필요. */

export const NONE = '없음';
export const UNKNOWN = '확인 못 함';

// 장소
export const PLACE_KINDS = ['전산실', '서버실', 'TPS실', 'EPS실', '통신실', '사무실', '컨트롤룸', '창고', '전기실', '방재실', '옥외'];
export const PROBLEM_TAGS = ['선정리 필요', '케이블 노후', '랙 공간 부족', '랙 파손', '교체 필요', '허브 다단'];
export const ENV_TAGS = ['먼지', '습기', '저온', '고온', '옥외'];
export const YES_NO = ['있음', '없음'];
// 환경 항목(설계기록 "제안 수준, 미확정") — 항목 이름은 설계기록, 고르는 값은 있음/없음/확인 못 함
export const PLACE_ENV_ITEMS = [
  ['env_hvac', '공조'],
  ['env_panel', '분전반'],
  ['env_ups', 'UPS'],
  ['env_tray', '트레이·배관 인입'],
  ['env_floor', '이중마루'],
  ['env_space', '여유 공간'],
  ['env_wallbox', '벽부 단자함'],
  ['env_carrier', '통신사 인입 장비'],
];

// 설치 지점
export const POINT_FORMS = ['랙', '소형 함체', '벽부 분배함', '책상·바닥', '천장', '배관·기둥', '벽면'];
export const RACK_FORMS = ['랙', '소형 함체'];            // 가상 랙(U 줄)을 보여 주는 형태
export const CABINET_FORMS = ['소형 함체', '벽부 분배함']; // 함체 속성을 묻는 형태
export const RACK_HEIGHTS = [42, 45, 36, 22, 12, 9, 6];
export const SYSTEMS = ['A', 'S'];
export const CABLE_IN = ['상부', '하부'];
export const CABINET_MOUNT = ['벽부', '스탠드'];
export const CABINET_19 = ['수용 가능', '수용 불가'];
export const OWNERS = ['자사', '통신사'];
export const LOCKED = ['잠김', '열림'];
export const REAR_REASONS = ['문이 잠김', '벽에 붙어 있음', '공간이 좁음'];   // (가정)
export const PDU_POS = ['좌', '우', '양쪽'];                                   // (가정)
export const POWER_CONN = ['PDU 연결', '멀티탭 사용', '섞여 있음'];             // (가정)
export const TIDY = ['양호', '보통', '불량'];                                   // (가정)
export const LABEL_STATE = ['있음', '일부만', '없음'];                          // (가정)

// 장비
export const DEVICE_KINDS = ['FDF', '패치판넬', '스위치', '방화벽', '라우터', '무선컨트롤러', '무선 AP', 'PoE 인젝터',
  '허브', '광 컨버터', '서버', 'UPS', '통신사장비', '전화 설비(단자·교환기)', 'DVR·NVR', 'NAC', '기타'];
export const SWITCH_LAYERS = ['L3', 'L2', '모름'];
export const SWITCH_PORTS = ['12포트', '24포트', '48포트', '샤시형(2U 이상)'];
export const SWITCH_PORTS_L2 = ['8포트', '12포트', '24포트', '48포트', '샤시형(2U 이상)'];
export const CHASSIS = '샤시형(2U 이상)';
export const FDF_CORES = [12, 24, 48, 72, 96, 144];       // 설계기록 "12~144코어" — 사이 값은 (가정)
export const PATCH_PORTS = ['24포트', '48포트'];
export const SERVER_U = [1, 2, 3, 4, 5, 6];
export const UPS_U = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const DEFAULT_U = [1, 2, 3, 4];
export const CARRIERS = ['KT', 'SKB', 'LGU+', '기타'];
export const NET_ZONES = ['OA', 'FA', 'CCTV', '출입통제', '기타'];
export const DEVICE_STATES = ['사용', '미사용', '전원 꺼짐', '고장', '임시'];
export const MEDIA = ['광 SM', '광 MM', 'UTP'];
export const FIBER_TYPES = ['SM', 'MM'];
export const CONNECTORS = ['ST', 'SC', 'LC'];
export const VIA_CONVERTER = ['경유함', '경유 안 함'];
export const CONFIG_GOT = ['받음', '안 받음'];
export const TERMINALS = [
  ['term_pc', 'PC'], ['term_printer', '프린터'], ['term_fa', 'FA 설비'],
  ['term_cctv', 'CCTV'], ['term_finger', '지문인식기'], ['term_etc', '기타'],
];
export const DEVICE_POS = ['U 위치', '선반', '랙 바닥'];

// 자유 추가
export const EXTRA_TAGS = ['UPS', '액세스플로어', '분전반', '공조', '트레이·배관', '소화설비', '단자함'];

// 공사 조건
export const CEILING = ['노출 천장', '텍스', '기밀 천장'];
export const TRAY_ROOM = ['여유 있음', '꽉 참', '재사용 어려움'];
export const RACK_SPOT = ['바닥 자리 있음', '벽부만 가능', '자리 없음', '이중마루'];
export const POWER_ITEMS = ['분전반 있음', '여유 차단기 있음', '콘센트 있음', '접지 있음'];
export const WORK_CONDS = ['고소 작업', '고소차 필요', '가동 중 작업 제한', '위생·청정 구역', '방폭 구역', '보양 필요'];

// 케이블 경로
// 케이블 종류: [화면 글자, 수를 넣는 항목 이름, 단위]. 고른 종류는 route.cable(배열), 수는 각 항목(숫자)에 넣는다.
//   "확인 못 함"(UNKNOWN)은 다른 종류와 같이 고를 수 없다(form.js multi 가 자동으로 붙이고 혼자만 남긴다).
export const CABLE_KINDS = [['광 SM', 'cableSm', '코어'], ['광 MM', 'cableMm', '코어'], ['UTP', 'cableUtp', '가닥']];
export const CABLE_CORES = [4, 6, 12, 24, 48];            // 광 코어 수 빠른 값
export const ROUTE_WAYS = ['기존 트레이', '새 트레이', '배관', '천장 속', '노출', '옥외', '지중'];
export const ROUTE_RISE = ['EPS·샤프트 있음', '기존 관통부 있음', '상승 없음'];
export const ROUTE_FIRE = ['방화구획 통과'];
export const ROUTE_PROBLEMS = ['장애물·우회', '기존 케이블 철거', '고소 작업'];

// 사진 칸 이름(slot) — 화면 글자
export const SLOT_LABELS = {
  overview: '전경', nameplate: '문패·명판', handnote: '손글씨 대응표', cond: '공사 조건',
  front: '전면 전체', rear: '후면 전체', closeup: '장비 근접', label: 'Hostname·랙 이름 라벨',
  outer: '함체 외관', inner: '함체 내부', asset: '자산 스티커', ipscreen: '단말 IP 화면',
  photo: '사진', path: '케이블 경로 사진',
};
