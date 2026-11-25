# 현장실사 앱 구조 (ARCH)

빌드 없는 정적 웹앱. `index.html` + `css/` + `js/`(ES 모듈) + `manifest.webmanifest` + `sw.js`.
외부 CDN 없음. 라이브러리는 `vendor/` 에 파일로 둔다(PptxGenJS, 내보낼 때만 읽음). 경로는 전부 상대 경로(깃허브 페이지 하위 경로에서 동작).
저장은 폰 안 IndexedDB(`fieldnote`), 화면 설정만 localStorage(`fn.settings`).
저장소에는 앱 파일만 둔다. 사업명·현장명·사진·입력값은 넣지 않는다.

## 1. 파일 구조

```
index.html              화면 틀(CI 띠, 상단 바, 현재 위치 줄, 본문, 아래 큰 메뉴 3개, 창 자리)
manifest.webmanifest    앱 이름·아이콘·standalone
sw.js                   앱 파일 오프라인 캐시(파일 고치면 VERSION 올릴 것, 새 파일은 FILES 에 추가)
css/app.css             전체 스타일. 글자 크기(html[data-fs]), 검은 바탕(html[data-theme=dark]), 색 변수
css/corrector.css       사진 보정 창 스타일 [SA-D]
assets/ci.png           CI (화면 맨 위 흰 띠에만 사용)
assets/icon-*.png       앱 아이콘(192, 512, 마스크용 512)
js/boot.js              (일반 스크립트) 그리기 전에 글자 크기·바탕 적용
js/app.js               시작점: 라우트 등록, 화면 틀 채우기, 사업 링크 받기, 첫 실행 안내, sw 등록
js/router.js            해시 라우팅: addRoute / go / refresh
js/ui.js                h(), nwText()(숫자+단위 줄바꿈 방지), 창(dialog·sheet·full) — ✕·바깥·뒤로 가기 닫기(history 연동), toast
js/db.js                IndexedDB 낮은 단계 + 레코드 모양 주석
js/store.js             업무 함수: 사업·노드·사진·집계·사업 링크 병합
js/settings.js          글자 크기·바탕·실사자 이름·입력 차수
js/options.js           버튼으로 고르는 값 목록(고칠 때는 이 파일만)
js/form.js              입력 칸 목록 → 화면 + 자동 저장(값마다 meta 기록)
js/link.js              사업 링크 인코딩·디코딩(순수 함수, tools 와 공용)
js/install.js           홈 화면에 추가(설치)
js/guide.js             첫 실행 안내 3장
js/photo-slot.js        사진 칸: 찍기·갤러리·사진 메뉴·크게 보기·길게 눌러 순서 바꾸기 (SA-B)
js/photo-proc.js        사진 줄이기(2560px JPEG 0.85)·작은 그림(320px)·EXIF 직접 파싱 (SA-B)
js/notice.js            내보내기 안내 줄·완료 알림 (SA-B)
js/trash.js             삭제·입력 초기화·휴지통(14일) (SA-B)
js/node-edit.js         이름 바꾸기·다른 곳으로 옮기기(화면 위 제목·더보기 항목·목록 카드 [옮기기], 옮길 곳 고르기 시트) [v0.22]
js/rack-drag.js         가상 랙 장비 줄 길게 눌러 위아래로 끌기(U 단위 이동·겹침 표시·선반/랙 바닥·자동 스크롤) [v0.24]
js/export.js            exportModel + 저장 후 내보내기(zip) + PC에서 이어서 하기(불러오기·병합) [SA-C]
js/pptx-build.js        PPT 장표 만들기(PptxGenJS 를 받아서 씀, node 에서도 돎) [SA-C] — 글자 폭·줄 수 어림·칸 높이·"(계속)" 넘기기는 12절
js/zipname.js           내보내기 순서(뼈대)와 파일 이름 규칙(순수 함수) [SA-C]
js/zipfile.js           zip 쓰기·읽기(라이브러리 없이), JPEG 촬영 시각 EXIF 넣기 [SA-C]
js/corrector.js         사진 보정 창 openCorrector(4점 원근·90°·기울기·미리보기·원래대로) [SA-D]
js/warp.js              호모그래피·역매핑+쌍선형 보간(순수 함수, 워커·node 공용) [SA-D]
js/corner-detect.js     모서리 자동 찾기(캐니+허프, 라이브러리 없음, 순수 함수) [SA-D]
js/warp-worker.js       보정 계산 모듈 워커(warp·detect) [SA-D]
js/screens/common.js    화면 공통(주소 만들기, 현재 위치 줄, 카드, 고르기 목록)
js/screens/*.js         화면 하나씩: projects, home, site, place, cond, point, device, extra, routes, export, settings, more
tools/link.html         관리자용 사업 링크·QR 만들기 (tools/link-tool.js, js/qr.js)
vendor/                 pptxgen.bundle.min.js(PptxGenJS 4.0.1 + JSZip 3.10.1), 라이선스, VERSIONS.txt
docs/ARCH.md            이 문서
```

각 모듈 맨 위 주석에 역할과 공개 함수가 적혀 있다.

## 2. 라우트 (주소의 # 뒤)

| 해시 | 화면 | 파일 |
|---|---|---|
| `#/` | 사업 목록 | screens/projects.js |
| `#/settings` | 화면 설정(글자 크기·바탕·실사자 이름) | screens/settings.js |
| `#/p/:pid` | 홈(현장 카드) | screens/home.js |
| `#/p/:pid/s/:id` | 현장(장소·경로 목록, 현장 정보) | screens/site.js |
| `#/p/:pid/pl/:id` | 장소 | screens/place.js |
| `#/p/:pid/cd/:id` | NW공사(예전 이름 공사 조건, id = 장소 id) | screens/cond.js |
| `#/p/:pid/pt/:id` | 설치 지점(랙: 촬영/랙 구성(장비)/확인 항목 탭) | screens/point.js |
| `#/p/:pid/dv/:id` | 장비 | screens/device.js |
| `#/p/:pid/ex/:id` | 자유 추가 | screens/extra.js |
| `#/p/:pid/routes` | 경로 목록(아래 메뉴 "경로") | screens/routes.js |
| `#/p/:pid/rt/:id` | 경로 하나 | screens/routes.js |
| `#/p/:pid/export` | 저장 후 내보내기(아래 메뉴 "내보내기") | screens/export.js |
| `#/p/:pid/trash` | 휴지통 | trash.js `renderTrash` |
| `#/trash` | 휴지통(삭제한 실사) | trash.js `renderTrash` (project 없음) |
| `#p=<코드>` | 사업 링크 받기 → 병합 후 `#/p/:pid` 로 바꿈 | app.js `handleLink` |

화면 모듈은 `render(ctx)` 가 화면 객체를 돌려준다:
`{ title, sub, crumbs:[{label, href, back}], brand, menu:'home'|'routes'|'export'|null, projectId, scope:{project,node,parentHref}, body }`.
`ctx = { params, go(hash,{replace}), refresh() }`.

창(알림·메뉴·안내)은 `ui.openOverlay` 가 history 에 한 칸 쌓는다. ✕·바깥·뒤로 가기 모두 `history.back()` 한 번으로 닫힌다. 창 안에서 화면을 옮길 때는 `ctx.go()` 를 쓴다(창을 먼저 닫음).

## 3. 데이터

### 구조
사업(project) → 현장(site) → 장소(place) / 경로(route) → 설치 지점(point) → 장비(device).
자유 추가(extra)는 장소 아래. 랙은 설치 형태가 `랙`인 설치 지점이다. NW공사(예전 이름 "공사 조건")는 장소 노드의 `cond_*` 항목(데이터 키는 예전 이름 그대로).

### 저장소 (IndexedDB `fieldnote` v1) — 자세한 모양은 `js/db.js` 주석
- `projects` `{ id, name, from, to, source:'link'|'manual', createdAt, changedAt, exportedAt, linkAt }`
- `nodes` `{ id, projectId, parentId, path, type, order, linkId?, data, createdAt, updatedAt }`
  - `path` = `사업id/현장id/장소id/…` (만든 뒤에는 `store.moveNode` — 다른 상위로 옮기기 — 말고는 안 바뀜). 색인: projectId, parentId, path
  - `data[항목] = { v, by, stage, at }` — 값마다 입력자·차수(1 폰 / 2 PC / 3 취합, 0 = 사업 링크)·시각. 지운 값은 `v:null`
  - 여러 줄 항목(VLAN 표 `vlans`, FDF 선번장 `fdfLines`, UTP 선번장 `utpLines`)은 `v` 가 배열 `[{ id, …칸, _m:{by,stage,at} }]`
  - 목록에서 고른 값(업링크 `uplink`, 행선지·연결처 `dest`, 경로 `from`/`to`)은 `{ ref:노드id|null, label }` 또는 `'없음'`/`'확인 못 함'`
    `ref` 는 노드 id 라 노드를 옮겨도(path 가 바뀌어도) 그대로 유효하다. `label` 은 고른 때의 글자인데, 장소 이름을 바꾸면(`store.setField` name) 경로 출발·도착과 선번장 `dest` 의 label 도 같이 바꾼다(`syncPlaceLabels`).
  - 고르기 값은 화면 글자 그대로 저장(여러 개 고르기는 배열). 목록은 `js/options.js`
- `photos` `{ id, projectId, ownerPath, slot, order, blob, thumb, source:'camera'|'gallery', takenAt, exif, corrected, createdAt, changedAt?, meta }`
  - `blob` 줄인 보정 전 사진(긴 변 2560px, JPEG 0.85, 지우지 않음), `thumb` 긴 변 320px(보정되면 SA-D가 보정본 기준으로 바꿈)
  - `exif` = `{ file:{name,type,size,lastModified}, width, height(바로 세운 원본 크기), orientation, make, model, dateTimeOriginal, offsetTime, gps:{lat,lon,alt}|null, saved:{width,height,maxSide,quality}, manualRotate }` (`js/photo-proc.js`)
  - `changedAt` 다시 찍기·바꾸기·보정으로 바뀐 때. `store.putPhoto` 가 찍는다(`{changed:false}` 로 끌 수 있음). 순서 바꾸기(`store.reorderPhotos`)는 찍지 않는다.
  - 색인: projectId, ownerPath, owner_slot(ownerPath+slot), project_created(projectId+createdAt)
- `trash` `{ id, projectId, kind:'reset'|'photo'|'node'|'project', label, path, payload, photoCount, deletedAt, expiresAt }` — 삭제·입력 초기화·바꾸기 전 사진 14일 보관
  - reset: `payload = { kept:[{id,data}], removed:[노드…], photos:[사진…] }`, photo: `payload = { photo }` (모양은 `js/trash.js` 주석)
  - node: `payload = { type, nodes:[지운 노드와 그 아래…], photos:[사진…] }`, `path` = 지운 노드 path
  - project: `payload = { project, nodes, photos, kv:[{k,v}] }`, `path = null` (실사 레코드까지 통째로 담는다)
  - 14일 지난 것은 앱 시작 때(`app.js` → `trash.purgeExpired`)와 휴지통 화면을 열 때 지운다.
- `kv` `{ k, v }` — 작은 값

### 노드 종류별 주요 항목 (data 의 키)
- site: `name, date(실사일), vlans[], memo`
- place: `name, kind, bldg, floor, room, where, env_*(8개), problems[], envTags[], vlans[], memo, done` + NW공사 `cond_ceilH, cond_beamH, cond_ceilType, cond_tray, cond_trayW, cond_trayRoom, cond_spot[], cond_panel, cond_breaker, cond_outlet, cond_ground, cond_work[], cond_memo`
- point: `name, form, system, height, rearReason, freeU, cableIn, pduCount, pduSystem[], rearPduPos, rearPduSystem[], rearPower, rearFreeOutlets, rearCableIn, rearTidy, rearLabel, rearFdfIn, cabSize, cabMount, cab19, cabOutlets, cabOwner, cabLocked, memo`
- device: `kind, pos('U 위치'|'선반'|'랙 바닥'), u(맨 아래 칸 번호), h(높이), layer, ports, slots, modules, cores, carrier, carrierKind, lineUse, lineNo, model, hostname, mgmtIp, vlan, zone, state, ownerCo, role, usedPorts, poe, redundant, configGot, uplink, media, linkCores, viaConv, fdfLines[], term_pc … term_etc, memo`
  - fdfLines(FDF 선번장) 한 줄: `dest, range, used, fiber, conn, labelText, unused`
  - utpLines(UTP 선번장, 패치판넬) 한 줄: `range(포트 구간 예 1-24), dest(연결처), labelText(라벨 원문), unused, memo` — 사진 칸 없음
- extra: `tag, memo`
- route: `from, to, dist, ways[], rise[], wallHoles, slabHoles, fire, problems[], memo`

### 사진 칸(slot) 표
| 달리는 곳(ownerPath) | slot | 장수 |
|---|---|---|
| 장소 | `overview` 전경, `nameplate` 문패·명판, `handnote` 손글씨 대응표, `cond` NW공사 | 여러 장 |
| 설치 지점(랙) | `front` 전면 전체, `rear` 후면 전체 | 한 장 |
| 설치 지점 | `closeup` 장비 근접, `label` 라벨, `outer` 함체 외관, `inner` 함체 내부 | 여러 장 |
| 장비 | `closeup` 근접, `asset` 자산 스티커, `ipscreen` 단말 IP 화면 | 여러 장 |
| 장비(FDF 선번장 줄) | `fdfLines:<줄 id>:photo` | 여러 장 |
| 자유 추가 | `photo` | 여러 장 |
| 경로 | `path` (지나는 순서) | 여러 장 |

### 사업 링크
`#p=` 뒤: JSON(짧은 키) → UTF-8 → deflate-raw(CompressionStream) → base64url.
`{ v:1, i:사업ID, n:사업명, f:시작일, t:종료일, s:[{ i, n, p:[{ i, n, k }] }] }` (`js/link.js`)
재수신(`store.receiveProject`): 사업 ID가 같으면 기존 입력은 그대로, 새 현장·장소만 추가. 링크 ID가 같거나 (같은 현장 안에서) 이름이 같으면 이미 있는 것으로 본다. 링크에서 빠진 곳은 지우지 않는다. 사업명·기간도 바꾸지 않는다. ID가 다르면 새 사업.
`tools/link.html` 은 http(s) 로 열어야 한다(모듈 스크립트라 파일로 직접 열면 안 됨).

## 4. 다른 담당이 붙는 자리

### SA-B (사진·삭제·휴지통·안내 줄·완료 알림) — 구현됨
- `js/photo-slot.js` — `photoSlot({ projectId, ownerPath, slot, label, multi, hint, warnEmpty, onChange })`, `releaseUrls()`.
  - "+ 촬영"(input capture, `source:'camera'`) / "갤러리"(`source:'gallery'`, 여러 장 칸은 여러 장 한 번에). `multi:false` 칸은 사진이 있으면 추가 버튼이 사라진다.
  - 저장 전에 `photo-proc.processImage(file)`: EXIF(APP1) 직접 파싱 → 방향 반영해 바로 세움 → 2560px JPEG 0.85 + 320px 작은 그림.
    방향은 브라우저(createImageBitmap `imageOrientation:'from-image'` / img)가 반영하고, 방향 5~8인데 가로·세로가 EXIF 크기와 같으면 직접 돌린다.
    촬영 시각 `takenAt` = EXIF DateTimeOriginal(+OffsetTimeOriginal) → 없으면 file.lastModified.
  - 바로 찍은 직후(새로 찍기·다시 찍기) `openCorrector(photo.id)` 를 부른다(창의 ✕ = 건너뛰기). 갤러리에서 고른 사진은 부르지 않는다.
  - 짧게 누름 = 사진 메뉴(ui.sheet): 다시 찍기 / 갤러리에서 바꾸기 / 크게 보기 / 보정 다시 하기 / (떼어서) 삭제.
    바꾸기 = 같은 id·칸·순서 유지, 사진·출처·EXIF만 바꾸고 `corrected:null`. 바꾸기 전 레코드는 `trash.trashPhotoCopy` 로 14일 보관.
    크게 보기 = `ui.openOverlay(..., {kind:'full'})`, 두 손가락 확대·끌기·두 번 눌러 확대(PC는 휠·끌기·더블클릭). 보정본이 있으면 "찍은 그대로 / 보정 후" 전환.
    삭제 = 바로 지움(휴지통 아님). 경고창에 "복구할 수 없습니다", 아직 안 보낸 사진이면 따로 경고.
  - 길게 누름(0.45초, 10px 안 움직임) = 끌어다 놓기. 여러 장 칸에 2장 이상일 때만, 같은 칸 안에서만. 놓으면 `store.reorderPhotos(ids)`.
    터치 이벤트로 처리하고 끄는 동안만 touchmove 를 막는다(그 전에 움직이면 스크롤). 화면 위·아래 끝에서 자동 스크롤. PC는 마우스로 같은 방식.
- `js/notice.js` — `renderExportNotice(container, projectId)`(홈 맨 위), `afterDoneChange(projectId)`(모든 장소 완료 → 알림창 한 번, kv `exportAsked:<pid>`).
  "안 보낸 사진" = `store.countUnexportedPhotos`: 내보낸 적 없으면 전체, 있으면 `max(createdAt, changedAt) > exportedAt` 인 사진 수.
- `js/trash.js` — `moreItems(scope)`, `runMoreItem(value, scope, ctx)`, `deleteNode(nodeId)`, `requestDelete(scope)`, `deleteProject(project)`,
  `isBlankProject(nodes, keys)`, `resetScope(scope)`, `trashPhotoCopy`, `purgeExpired`, `renderTrash(ctx)`.
  - 더보기 항목: 입력 초기화(현장·장소·설치 지점 화면, 홈=`scope.whole:true` 실사 전체) / 휴지통(실사 안 모든 화면) / 삭제(danger, 맨 아래).
    실사 밖(실사 목록)의 더보기에는 "휴지통"(`#/trash`, 삭제한 실사 되살리기).
  - 목록 카드 [삭제](v0.23부터 장소·설치 지점·장비는 [옮기기] [삭제] 한 묶음 — 9절 "v0.23"): 실사 카드(실사 목록), 현장 카드(홈), 장소·케이블 경로 카드(현장 화면·케이블 경로 목록), 설치 지점 카드(장소 화면),
    장비 카드(설치 지점 화면 장비 목록·가상 랙의 "위치가 정해지지 않은 장비"), 가상 랙 안(U 줄·선반·랙 바닥)에 놓인 장비 줄(v0.24부터 [삭제]는 줄 오른쪽 [⋯] 시트 맨 아래 — 10절). `common.card({ ..., del })` / `delButton` / `nodeDel` / `blankCard`.
    카드 전체가 링크(`a.t::after` 가 카드를 덮음), [삭제]는 그 위(z-index)에서 `preventDefault`+`stopPropagation` 해 이동이 일어나지 않는다.
    자유 추가 카드·NW공사 카드에는 [삭제]가 없다.
  - 삭제 동작(카드 [삭제]·더보기 삭제·장비 화면 "이 장비 삭제"가 같다):
    미작성(`store.isBlankNode`, 실사는 `isBlankProject` = 현장·장소 말고 노드 없음 + 현장·장소에 이름·종류 말고 입력 없음 + 사진 없음)이면
    확인 없이 바로 지우고 "삭제했습니다". 아니면 확인 창 한 번: "<이름>을 삭제할까요?" / "설치 지점 2개, 사진 5장이 같이 삭제됩니다."
    (아래 딸린 것을 실제로 세되 미작성 항목(`isBlankNode`)은 카드와 같게 빼고, 0인 종류는 뺌, 아무것도 없으면 "입력한 값이 같이 삭제됩니다.") [취소] / [삭제](빨강, `.delred`).
    저장에 실패하면(저장 공간 부족 등) 안내 창 "삭제하지 못했습니다. 저장 공간이 부족할 수 있습니다." + 오류 이름·내용. 한 트랜잭션이라 데이터는 그대로(실사·노드·빈 항목 삭제 모두).
    확인 창·안내에는 "휴지통"이라는 말을 쓰지 않는다.
  - 지운 것은 모두 `trash` 에 14일(node/project) — 한 트랜잭션으로 휴지통에 넣고 지운다. 기한 규칙(예전 30일 규칙)은 없앴다.
    노드를 지워도 그 아래를 가리키는 휴지통 항목은 남긴다. 실사를 지워도 그 실사의 휴지통 항목은 남는다(되살리면 다시 보임).
  - 되살리기(node): 위 노드가 있어야 한다. 없으면 "위 항목을 먼저 되살려 주세요". 아래 노드·사진 그대로 다시 넣는다.
    같은 id 노드가 이미 있으면 덮어쓰지 않고 "이미 같은 항목이 있어 되살리지 않았습니다"(휴지통 항목 그대로). 아래 노드·사진도 같은 id 가 이미 있으면 건너뛴다("이미 있어 건너뛴 것 N개").
    휴지통 항목의 path 들(`rec.path`, payload 노드 path·사진 ownerPath)은 노드를 옮기면 같이 바뀐다(8절).
    되살리기(project): 같은 ID 실사가 이미 있으면(그새 실사 링크로 다시 받음 등) 되살리지 않는다. 되살리면 실사 목록에 다시 나온다.
  - 입력 초기화: 범위의 사진과 입력을 비운다. 남김 = 범위 맨 위 노드와 그 아래 현장·장소(이름·종류만). 경로·설치 지점·장비·자유 추가는 빠진다
    (설치 지점에서 초기화하면 그 설치 지점은 이름·설치 형태만 남는다). 비운 것은 `trash` 14일. 한 트랜잭션.
  - 되살리기: 그 사이 새로 넣은 값은 그대로, 빈 칸만 채움. 지워진 노드는 부모가 있으면 되살림(없으면 빠짐 수 알림).
    한 장짜리 칸(`front`·`rear`)에 새 사진이 있으면 새 사진을 휴지통으로 옮기고 되살린 사진을 넣는다. 되살린 사진은 `changedAt` = 지금(안 보낸 사진으로 셈).
- 저장 공간 유지 요청 `navigator.storage.persist()` 는 `app.js` boot 에서 앱 시작 때 부른다(SA-A가 넣어 둔 것 그대로).

### SA-C (zip·PPT 내보내기·PC 2차 불러오기) — 7절에 자세히
- `js/export.js` — `exportModel(projectId)`, `getPhotoBlob(id, which)`, `runExport(projectId)`, `estimateExportSize(projectId)`,
  `importModel(input, opts)`, `openImport(ctx)`, `buildExportZip(model, io)`(브라우저와 무관한 zip 만들기).
- 내보내기 화면 `screens/export.js` 의 버튼이 `runExport` 를 부른다. 불러오기 버튼("zip 불러오기")은 `data-slot="export-extra"` 안.
- 내보낸 뒤 `store.markExported(projectId)` → 사업 카드 "내보냄", 안 보낸 사진 수 0부터 다시.
- 불러온 뒤 차수가 1이면 2차(PC)로 바꿀지 묻는다 → `settings.setSetting('stage', 2)`.

### SA-D (사진 보정) — 구현됨
- `js/corrector.js` — `openCorrector(photoId) → Promise<boolean>`. 찍은 직후 보정 제안·사진 메뉴 "보정 다시 하기"가 부른다.
  - 반환: "적용"(보정 저장) 또는 "원래대로"(보정 지움)면 `true`(사진이 바뀜 → 칸 다시 그리기), ✕·뒤로 가기·건너뛰기면 `false`.
  - 전체 화면 창(`ui.openOverlay kind:'full'`). 위 ✕, 아래 [건너뛰기 또는 원래대로] [미리보기]. 미리보기는 그 위에 한 겹 더 열리는 창([다시 조정] [적용], 뒤로 가기 = 다시 조정).
  - 모서리 점 4개를 손가락으로 끌어 맞춘다(잡는 반경 44px). 끄는 동안 위쪽 구석에 확대경(지름 128px, 화면 배율 3배, 원본 해상도로 그림)을 띄우고, 손가락이 그 구석에 오면 반대쪽으로 옮긴다. 점이 서로 넘어가 꼬이면 놓을 때 순서를 바로잡는다.
  - 도구: ↺ 90° / ↻ 90° / 자동 찾기 / 사진 전체. 기울기 슬라이더 ±15°(0.5° 단위, −·+ 버튼, 값 누르면 0).
  - 점 상태(모드): 기본(안쪽 여백 6%) · 사진 전체 · 자동(자동으로 찾고 손 안 댐) · 직접. **기울기는 기본·사진 전체일 때만** 결과에 들어가고(화면에 반듯한 가장 큰 같은 비율 사각형을 잘라 냄), 점을 직접 맞추면 슬라이더가 꺼진다(4점이 결과를 정하므로).
  - 90° 돌리기는 화면 그림을 돌리고, 점은 사진에 붙은 채 "화면 기준 좌상·우상·우하·좌하"로 순서만 바뀐다 → 결과 방향 = 화면에 보이는 방향.
- 데이터 약속(B·C 공통). `photo.blob` 은 읽기만 한다.
  - `photo.corrected = { blob, points, rotation, auto, at } | null`
    - `blob` 보정 결과 JPEG(품질 0.85). 크기 = `warp.quadSize(points, 2560)`: 비율 (위+아래)/(왼+오), 가장 긴 변이 줄지 않게, 긴 변 2560 이하.
    - `points` `[[x,y]×4]` = `photo.blob` 픽셀 좌표(EXIF 방향 적용 후, 소수 1자리). 순서 = 결과 사진의 좌상→우상→우하→좌하. 결과는 이 4점을 (0,0)(W,0)(W,H)(0,H)로 펴는 호모그래피로 다시 만들 수 있다(90°·기울기는 4점 순서·위치에 이미 들어 있음).
    - `rotation` 창 상태 복원용 숫자 = 90° 단위 + 미세 각도(예 `92.5`, `-5`). 다시 열면 `round(r/90)` 이 90° 단위, 나머지가 기울기.
    - `auto` 자동으로 찾은 모서리를 손대지 않고 그대로 썼으면 `true`(취합 때 확인 대상).
  - `photo.thumb` 적용하면 보정본으로, 원래대로 하면 `photo.blob` 으로 다시 만든다(긴 변 320, JPEG 0.7). 저장은 `store.putPhoto(rec)`(changedAt 찍힘).
- 계산(`js/warp.js`): 4점→사각형 호모그래피를 8×8 연립방정식(부분 피벗 가우스 소거)으로 직접 풀고, 결과 픽셀마다 원본 좌표로 역매핑 + 쌍선형 보간. 사진 밖은 흰색.
  - 미리보기는 화면용 축소본(긴 변 1600)으로, 적용은 원본(2560)으로 계산한다.
  - 모듈 워커(`js/warp-worker.js`)에서 계산하고 진행 %를 받는다. 워커를 못 쓰면(모듈 워커 미지원·5초 안에 준비 안 됨·도중 실패) 화면 쪽에서 30ms 씩 줄을 나눠 계산하며 진행 막대를 그린다. 창을 닫으면 계산을 버린다(워커 종료).
  - 메모리: 원본 RGBA(2560×1920 약 20MB)는 적용 순간에만 만들고 워커로 넘긴다(transfer). 쓴 캔버스는 크기 0으로 돌려 바로 놓는다.
- 자동 모서리(`js/corner-detect.js`, `AUTO_ON_OPEN = true`): 보정본이 없는 사진을 열 때 한 번 돌리고, "자동 찾기" 버튼으로 다시 돌린다.
  - 긴 변 480 축소 → 그레이 → 블러([1 4 6 4 1] 두 번) → 소벨 → 캐니(임계값 = 전체 기울기 크기 중앙값의 4배, 최소 30 / 낮은 쪽 0.4배) → 기울기 방향 ±2°만 투표하는 허프 → 직선마다 그 위 엣지 점으로 다시 맞춤(1° 눈금 오차 제거) → 가로·세로 직선(표 많은 18개 + 바깥쪽 3개씩)에서 둘씩 골라 사각형 후보 → 네 변의 엣지 지지율·끊긴 구간·면적으로 점수 → 상위 12개는 모서리에서 엣지가 끝나는지(직선 두 개가 엇갈린 곳이 아닌지)·네 변 밝기 방향이 같은지 더 본다 → 고른 변을 엣지 점(부분 픽셀) 최소제곱으로 다시 맞춰 교점 = 모서리.
  - 자동값을 쓰는 기준(`AUTO_RULE`): 가장 약한 변 지지율 ≥ 0.6, 평균 ≥ 0.72, 면적 ≥ 사진의 4%, 모서리 밖 이어짐 ≤ 0.22, 끊긴 구간 ≤ 변의 20%, 그중 모서리에 붙은 끊김 ≤ 10%, 밝기 방향이 안 맞으면 가장 약한 변 ≥ 0.8. 못 넘으면 자동값을 버리고 기본 위치(안쪽 여백 6%)에 둔다.
  - 합성 이미지 검사(node, 저장소 밖에서만 돌림): 1280×960·960×1280, 사각 대상 7종(문패·랙 전면·라벨·함체·저대비+잡음·강한 원근·케이블 가림) + 대상 없음 2종(잡동사니 선·상자만 / 대상이 사진 밖으로 잘림), 시드 4벌 1,080장.
    - 사각 대상 840장 중 797장(95%) 자동 채택, 틀린 채택 1장(함체와 뒤 배관이 같은 회색이라 한 변이 안 보이는 경우, 조정용 시드). 조정에 안 쓴 시드 2벌(540장)에서는 틀린 채택 0.
    - 대상 없음·잘림 240장: 자동 채택 0(기본 위치로 둠).
    - 모서리 오차(2560px 사진 환산): 중앙 1.0~1.2px, 90% 2.4px 이하. 한 장 11~23ms(맥 node, 폰은 몇 배 느릴 것 — 워커에서 돈다).
    - 놓침(자동값 안 씀): 세로 사진 속 작은 라벨(면적 4% 미만), 랙 모서리에서 바닥선·케이블이 이어질 때, 강한 원근 일부.
    - 호모그래피: 카메라 원근 행렬 200개를 4점에서 다시 구해 상대 오차 1e-12. 원근으로 찍은 체커보드(슈퍼샘플)를 펴서 원래 판과 비교 — 셀 경계 3px 밖 오차 0. 2560×1920 펴기 46ms(맥 node).
  - 판단: 합성 이미지에서는 틀린 값이 거의 없고, 자동값은 창에서 점으로 먼저 보여 주고 미리보기·적용을 거쳐야 저장되므로 `AUTO_ON_OPEN = true` 로 둔다. 실제 랙·명판 사진으로는 검사하지 못했다(아래 TODO).

## 5. 설계기록에 없어 임시로 정한 것 (리버 확인 필요)
- `js/options.js` 에 "(가정)" 표시한 목록: 후면 못 찍은 사유, PDU 위치, 장비 전원 연결, 케이블 정리 상태, 케이블 라벨, FDF 코어 수 사이 값(48·72·96).
- 장소 환경 8항목은 있음 / 없음 / 확인 못 함 으로만 받는다.
- 미작성 항목 기준(`store.missingItems`, 화면 글자는 "미작성 항목" — 9절 v0.23): 장소 완료 표시 없음, 랙 전면 없음, 랙 후면도 사유도 없음, 경로 거리 없음.
- 실사 기간이 지난 사업은 "지난 사업"으로 묶기만 하고 입력은 막지 않는다.
- [SA-B] 입력 초기화는 "랙"뿐 아니라 모든 설치 지점 화면 더보기에 둔다(설치 지점 화면이 하나라서). 경로·장비·자유 추가·NW공사 화면에는 없다.
- [SA-B] 순서만 바꾼 사진은 "안 보낸 사진"으로 세지 않는다. 지운 사진도 세지 않는다.
- [SA-B] 사진 칸의 사진 삭제는 휴지통에 넣지 않는다(휴지통 = 바꾸기 전 사진·입력 초기화·목록 삭제(노드·실사)).
- [SA-D] 보정 기본 4점 위치 = 사진 안쪽 여백 6%. 기울기 슬라이더 ±15°, 기울기는 4점을 직접 맞추지 않을 때만 결과에 들어감. 보정본 JPEG 0.85·긴 변 2560 이하.
- [SA-D] "원래대로"도 사진이 바뀐 것이므로 openCorrector 가 true 를 돌려준다(칸 다시 그리기).
- [SA-D] 창을 열 때 자동 모서리 찾기를 돌린다(`AUTO_ON_OPEN`). 실사진에서 틀리는 일이 잦으면 false 로 바꿔 버튼 전용으로.

## 6. 남긴 TODO
- [SA-B] 폰 확인 전: 길게 눌러 끌기(안드로이드 크롬 길게 누름 메뉴·스크롤과 충돌 여부), 두 손가락 확대, 카메라 앱에서 돌아올 때 크롬이 페이지를 새로 여는지(메모리 부족 시 찍은 사진이 안 들어올 수 있음), EXIF 방향(옆으로 찍은 사진), 갤러리 HEIC 사진.
- [SA-D] 폰 확인 전: 확대경 위치·크기, 점 끌기와 화면 스크롤·당겨서 새로고침 충돌, 모듈 워커 동작(iOS 15 미만·구형 안드로이드는 화면 쪽 계산으로 빠짐), 2560px 적용 시간·메모리, createImageBitmap 방향 옵션, 실제 랙·명판 사진에서 자동 모서리 품질(합성 이미지로만 검사함 — 실사진에서 틀린 값이 자주 나오면 `AUTO_ON_OPEN=false` 로 버튼 전용).
- QR(`js/qr.js`, v0.30에 tools/에서 옮김)은 직접 구현. 헤드리스 크롬 BarcodeDetector로 판독 확인(v0.30), 실제 폰 카메라 확인은 아직.
- 전체가 문법 검사(`node --check`)만 거쳤다. 브라우저 실행 확인 전.
- 배포: `sw.js` 의 VERSION 을 파일을 고칠 때마다 올려야 폰이 새 파일을 받는다.
- 장소 종류·설치 형태처럼 분류를 고르는 항목에는 "없음 / 확인 못 함"을 붙이지 않았다(장비 종류에는 "확인 못 함" 있음).
- 문제 표시는 장소에만 있다(랙별로는 없음).
- 사업 링크를 붙여 넣어 받는 칸은 없다(링크·QR을 여는 방식만).

## 7. 저장 후 내보내기 · PC에서 이어서 하기 (SA-C)

### zip 구조 (zip 1개, 이름 `사업명_실사자_yymmdd.zip`)
```
사업명_실사자_yymmdd.pptx            A4 가로 PPT(하단 팀명·쪽 번호·CI). 사진은 긴 변 1280px JPEG(보정본 있으면 보정본)
사진/<현장>/<이름>.jpg                원본(보정 전) 사진. 촬영 시각 EXIF 가 없으면 넣어 둔다
사진/<현장>/<이름>_보정.jpg           보정본이 있을 때만
기록_fieldnote.json                  기록 파일(다시 불러올 수 있는 형식)
```
- 사진은 PPT 장표 순서대로 담는다. 사진·PPT 는 압축하지 않고(STORE) 기록 파일만 압축한다. 이름은 UTF-8(표시 비트 + 0x7075 확장).
- 메모리: 사진은 한 장씩 읽어 PPT용으로 줄이고, 원본은 zip 에 Blob 참조로만 붙인다(전부 메모리에 올리지 않음). Zip64 는 만들지 않는다(4GB 한도).
- PPT 안의 xml 은 PptxGenJS 가 묶은 뒤 다시 압축해 담는다(사진은 그대로).

### 이름 규칙 (`js/zipname.js`)
- 이름 조각 정리: 파일 이름 금지 문자 `\ / : * ? " < > |`·제어 문자 삭제, 띄어쓰기·밑줄 → `-`, 앞뒤 `-`·`.` 삭제, 조각마다 길이 제한(사업명 60, 실사자 20, 현장·장소 30, 설치 지점 24, 그 밖 16자). CON·NUL 같은 예약어는 뒤에 `-`.
- zip·PPT: `사업명_실사자_yymmdd`(날짜는 내보낸 날). 실사자 이름이 비면 내보내기 전에 한 번 묻고, 그래도 비면 `사업명_yymmdd`.
- 사진: 순번은 같은 앞부분끼리 01부터(PPT 순서). 같은 현장 안에서 장소 이름이 겹치면 뒤에 `-2`, 같은 장소 안 설치 지점, 같은 설치 지점 안 장비도 같은 방식.

| 사진이 달린 곳 | 이름 |
|---|---|
| 장소(전경·문패·손글씨·NW공사) | `장소_전경_01`, `장소_문패_01`, `장소_손글씨_01`, `장소_NW공사_01` |
| 설치 지점(랙이면 랙 이름, 아니면 설치 지점 이름) | `장소_R-01_전면_01`, `_후면_`, `_근접_`, `_라벨_`, `_함체외관_`, `_함체내부_` |
| 장비 | `장소_R-01_39U-스위치-근접_01` (`-자산스티커`, `-IP화면`; 랙이 아니면 위치 없이 `스위치-근접`, 선반·바닥은 `선반-`·`바닥-`) |
| FDF 선번장 줄(파일 이름은 예전 말 "행선지" 그대로) | `장소_R-01_42U-FDF-행선지-<행선지>_01` |
| 자유 추가 | `장소_<꼬리표>_01` |
| 경로 | `경로01_<출발>-<도착>_01` (현장 순서대로 사업 전체에서 번호) |
| 어디에도 안 달린 사진 | `사진/기타/기타_<칸>_01` |

### 기록 파일 형식 (`기록_fieldnote.json`)
```
{ format:'fieldnote-record', formatVersion:1, schema:1, app:'fieldnote', exportedAt, surveyor, stage,
  project:{…사업 레코드 그대로},
  nodes:[…노드 레코드 그대로 — data[항목] = { v, by, stage, at }],
  tree:[{ id, type, name, children }],
  files:{ ppt:'….pptx', photosDir:'사진/' },
  photos:[{ id, ownerPath, slot, order, source, takenAt, exif, createdAt, meta, size, type,
            hasCorrected, correctedType, corrected:{ points, rotation, auto, at, …, type, size }|null,
            name, file:'사진/…jpg', correctedFile:'사진/…_보정.jpg'|null, exifWritten }] }
```
- 사진 Blob·thumb 는 넣지 않는다. 사진은 `file`/`correctedFile`(zip 안 경로)로 가리킨다.
- formatVersion 이 앱보다 높으면 불러오지 않는다.

### 불러오기·병합 (`importModel`)
- 받는 것: zip(기록 파일을 찾는다. 다시 묶느라 맨 앞에 폴더가 하나 붙어도 찾음, DEFLATE·EUC-KR 이름도 읽음) 또는 기록 파일(.json, 이때는 사진 없이 기록만).
- 사업 ID 가 이 기기에 없으면 새 사업으로 추가(ID 그대로). 있으면 합친다:
  - 노드: ID 가 같으면 같은 노드. ID 가 달라도 사업 링크 ID(`linkId`)·종류·부모가 같으면 같은 노드로 보고 그 아래 path 를 이 기기 쪽으로 바꿔 넣는다.
  - 값: 항목마다 `at` 이 더 나중인 쪽을 남긴다(같으면 이 기기 값). 여러 줄 항목(VLAN·FDF 선번장·UTP 선번장)은 줄마다 합친다(한쪽에만 있는 줄도 남긴다 — 지운 줄이 되살아날 수 있음).
  - 없는 노드·사진은 추가, 이 기기에만 있는 것은 그대로(아무것도 지우지 않는다). 있는 사진은 보정본만 더 새것이면 바꾼다.
  - 한 장짜리 칸(랙 전면·후면)에 양쪽이 다른 사진을 넣었으면 두 장이 된다.
- 끝나면 결과(새로 들어온 곳·바뀐 값·새 사진 수)를 보여 주고, 차수가 1이면 2차로 바꿀지 묻는다.

### PPT 장표 순서 (`js/pptx-build.js`, 견본: 설계 폴더 PPT 출력 시뮬)
표지 → 현장마다 [장소마다 (장소 전경(짧은 NW공사 포함) → NW공사(긴 것만) → 설치 지점마다 (랙 장표 또는 설치 지점 장표 → 장비 목록(계속) → 장비 근접·라벨) → 선번장 → 자유 추가)] → 그 현장의 케이블 경로 → 기타 사진.
- 장 수 줄이기(v0.24, 리버님 승인안 — 11절에 자세히): 짧은 NW공사는 장소 장표에, 선번장은 장소마다 FDF·UTP 를 이어 채움, 사진 2장 이하 경로는 2~4개씩 한 장, 자유 추가는 장소마다 한 장.
- 랙 장표: 랙·소형 함체. 전면·후면 사진 + 랙 실장도(위가 높은 U, 연속 빈 칸은 한 줄로 "30~18 빈 칸", 선반·바닥 줄) + 장비 표(U·종류·규격·모델·Hostname·관리 IP·VLAN·망·상태, 같은 규격 FDF·패치판넬이 붙어 있으면 "42~41 · 24C × 2"). U 칸 폭 52("42~39" 같은 여러 U 값이 "39~…"로 잘리지 않게, 나머지 칸에서 12를 덜어 합계 484 유지). 미리보기는 같은 표를 그려 같이 반영된다) + 확인 항목·후면·함체·장비 메모 줄.
- 설치 지점 장표(랙이 아닌 형태): 사진 3장 + 설치 정보 + 장비 표(종류·규격·모델·Hostname·관리 IP·상태).
- 사진이 한 장에 안 들어가면 "(계속)" 장표(3×2)로 넘긴다. 장비 표가 넘치면 "장비 목록 (계속)".
- 장비 근접·라벨 장표는 설치 지점마다 그 바로 뒤에 둔다. 선번장은 그 장소의 설치 지점들 뒤에 모아 둔다.

### 빈 항목 규칙
- 장표: 장소·랙·설치 지점·경로 장표는 비어도 낸다(사진 자리에 "사진 없음"). NW공사는 값·사진이 하나도 없으면 장표를 빼고 장소 정보에 "NW공사: 입력 없음". 근접·라벨, 자유 추가, 선번장, (계속) 장표는 내용이 있을 때만.
  FDF 선번장·UTP 선번장은 줄마다 표 한 줄(UTP 는 패치판넬 장비의 줄만, 열: 패치판넬·포트 구간·연결처·라벨 원문·미사용·메모. 포트 구간·연결처가 비면 노란 "미입력").
- 표 칸: 채워야 할 값이 비었으면 노란 "미입력", "확인 못 함"도 노랗게. 해당 없는 값은 "—"(예: FDF·UPS 의 Hostname, 트레이 없음일 때 폭·여유). Hostname·관리 IP·망·모델은 스위치·방화벽·라우터·무선컨트롤러·무선 AP·NAC·서버에서만 "미입력", VLAN 은 스위치만. NW공사·경로 표는 비면 "미입력"(벽·슬래브 타공·방화구획·문제는 "—").
- 상자 글(장소 정보·확인 항목): 값이 있는 줄만 쓴다. 한 줄도 없으면 "입력 없음". 메모가 비면 메모 상자를 그리지 않는다. 노란 칸이 있으면 랙 장표 아래에 "노란 칸은 현장에서 못 채운 값…" 안내.
- 장소 완료 표시가 없으면 장소 정보에 "완료 표시 전".

### 정한 값 (리버 확인 필요)
- 하단 팀명 `스마트인프라팀/인프라Biz담당`(견본 그대로, `pptx-build.js` 의 TEAM_NAME), 글꼴 맑은 고딕.
- PPT 사진 긴 변 1280px·JPEG 품질 0.72. 크기 어림(`estimateExportSize`)은 v0.24부터 PPT 몫(뼈대 40KB + 장표당 4KB + 줄인 사진)을 따로 센다 — 10절.
- 사이트(현장) 단위 VLAN 표·메모·장비 세부(업링크·단말 대수·PoE 등)는 PPT 에 넣지 않고 기록 파일에만 있다.


## 8. v0.22 — 이름 바꾸기 · 옮기기 · 선번장 · 용어 (js/node-edit.js, store.js)

### 이름 바꾸기
- 현장·장소·설치 지점 = `name` 항목, 장비 = Hostname(`hostname`) 항목(장비 표시 이름이 Hostname → 모델명 → 종류 순). 케이블 경로는 출발·도착이 곧 이름이라 뺐다(출발·도착은 경로 화면에서 고른다).
- 화면 위 제목을 누르거나(`app.js` 가 `screen.scope.node` 로 판단, 제목에 점선 밑줄 + ✎) 더보기 → "이름 바꾸기" → `promptText` → `store.renameNode` → 화면 다시 그리기(위치 줄·왼쪽 메뉴·카드가 바로 바뀜).
- 장소 이름이 바뀌면 그 장소를 id 로 가리키는 값의 글자(경로 출발·도착, FDF·UTP 선번장 `dest`)도 같이 바뀐다.

### 다른 곳으로 옮기기 (`store.moveNode(nodeId, newParentId)`)
- 장소 → 다른 현장, 설치 지점 → 다른 장소, 장비 → 다른 설치 지점(같은 실사 안만). 더보기 → "다른 곳으로 옮기기" → 옮길 곳 고르기 시트(지금 상위는 뺌) → 맨 아래 "+ 새로 만들기"(이름을 물어 새 상위를 만들고 그 아래로 옮김).
  - 새 현장: 이름. 새 장소: 종류(장소 종류 목록·직접 입력) → 이름, 지금 있는 현장에 만든다. 새 설치 지점: 설치 형태 → 이름, 지금 있는 장소에 만든다. 옮기기가 실패하면 방금 만든 상위는 지운다.
- 한 트랜잭션(nodes·photos·trash·projects)으로 path 를 쓰는 모든 곳을 같이 바꾼다:
  - 옮긴 노드 `parentId`·`path`, 그 아래 모든 노드 `path`(앞부분 교체)
  - 그 노드와 아래 노드에 달린 사진 `ownerPath`(칸 이름 `slot` 은 path 를 안 써서 그대로)
  - 휴지통(node·reset·photo) `rec.path`, payload 의 노드 `path`·`removed[].path`·사진 `ownerPath`, 위치 글(`label`)의 앞부분(이름이 안 바뀐 경우만 맞음). 실사 통째 삭제 항목(project)은 건드리지 않음
  - 장비를 옮기면 U 위치(`u`)·놓인 자리(`pos`) 값을 비운다(새 설치 지점이 랙이면 "위치가 정해지지 않은 장비"로 나옴)
- id 로 가리키는 값(경로 출발·도착 `from`/`to`, 선번장 `dest`, 업링크 `uplink`)은 `ref` 가 노드 id 라 옮겨도 그대로 유효하다. 화면 주소도 id 기반(`#/p/:pid/pl/:id`)이라 옮긴 뒤 같은 주소가 그대로 열린다.
- 사업 링크 다시 받기(`receiveProject`): 링크 ID 가 같은 장소는 다른 현장으로 옮겨 놨어도 같은 장소로 본다(새로 또 만들지 않음).
- 불러오기(`importModel`)는 같은 id 노드의 위치를 이 기기 기준으로 둔다 — 옮김은 다른 기기로 전파되지 않는다.

### 선번장
- "FDF 행선지" → **FDF 선번장**(줄 제목 "선번 N", 버튼 "+ 선번 추가", PPT·미리보기 장표 "… · FDF 선번장"). 데이터 키 `fdfLines`·줄 안 `dest`/`range`/… 그대로.
- 패치판넬 장비에 **UTP 선번장**(`utpLines`) 새로 추가: 포트 구간·연결처(장소 목록에서 고르기/직접 입력)·라벨 원문·미사용·메모. 장표 "… · UTP 선번장". `zipname.buildOutline` 의 장비마다 `utp:[줄]`.

### 용어
- "공사 조건" → **NW공사**(화면 제목·묶음 제목·카드·입력 현황 "NW공사 입력됨/없음"·PPT 장표 "○○ · NW공사"·"NW공사: 입력 없음"·안내 문구·사진 파일 이름 `장소_NW공사_01`). 데이터 키 `cond_*`, 사진 칸 `cond`, 주소 `/cd/` 는 그대로.

### 표시 규칙
- 장비 표시 이름 `deviceLabel`: Hostname 이 비었거나 "확인 못 함"이면 모델명(있으면), 없으면 종류만. 규격 조각(포트·통신사)에도 "확인 못 함"은 붙이지 않는다.
- 카드 부제·화면 머리말에서 "확인 못 함"·"없음" 값은 다른 글자에 붙이지 않고 그 조각을 뺀다(`store.usable`): 장소 카드 "동 층", 설치 지점 카드 "계통", 장소·설치 지점·NW공사 화면 머리말.
- 현장 추가 창·`tools/link.html` 현장 이름 예시 = "예: 여수1공장".


## 9. v0.23 — 표시 다듬기 · 목록 카드 [옮기기] · 용어 "미작성 항목" (store.js, node-edit.js, trash.js, screens/*)

### 용어
- "빠진 값·빠진 것" → **미작성 항목**(화면·배지 "! 미작성 항목 N"·입력 현황 요약 "미작성 항목 N건"(v0.24 단위 통일)·"그 밖의 미작성 항목"·좌측 메뉴 상태 설명 "미작성 항목 있음"·장표 미리보기 안내·랙 장표 노란 칸 안내). 코드 이름(`missingItems` 등)은 그대로.
  PPT·미리보기의 빈 칸 글자 "미입력"은 그대로(표 칸 값 자리 표시라 별개로 보았다). 휴지통 되살리기 알림의 "빠진 것 N개"는 다른 뜻(되살리지 못한 것)이라 "되살리지 못한 것 N개"로만 고쳤다.
  주의: 코드 주석의 "미작성 노드"(`isBlankNode`, 입력이 하나도 없는 노드)와는 다른 말이다.

### 표시 규칙
- 경로 거리(`store.distText`): 숫자면 "약 12m", "확인 못 함"이면 "거리 확인 못 함", 비었으면 생략. 경로 카드·입력 현황 경로 카드·경로 장표 제목 옆 글이 같이 쓴다.
- 장소 이름에 이미 동·층이 들어 있으면(`store.locParts`) 그 조각은 장표 제목 "(동 층)" 괄호·장소/NW공사/설치 지점 화면 머리말 부제에서 뺀다(조각마다 판단: "A동 2F 전산실"이면 둘 다 빠져 괄호 없음, "2F 전산실"+동 "A동"이면 "(A동)"). 현장 화면 장소 카드의 "동 층"은 그대로.
- NW공사 "기존 트레이"가 "없음"이면 트레이 폭·여유 칸을 숨긴다(`store.condHiddenKeys`). NW공사 화면(기존 트레이 칸 `rerender`)·NW공사 카드 "입력 N"·입력 현황 입력됨/없음·PPT NW공사 장표(폭·여유 줄 뺌)가 같이 따른다. 값은 지우지 않고 표시만 뺀다(다시 "있음"으로 바꾸면 그대로 나온다).
- 가상 랙 줄·장비 카드 이름(`store.deviceRowLabel`, 설치 지점 화면만): FDF·패치판넬은 이름 조각을 Hostname → 첫 선번 줄의 라벨 원문 또는 행선지(연결처) → 모델명 순으로. 예 "FDF 24코어 · BD-6블럭1~16", "패치판넬 48포트 · OA 01-24". 장비 화면 제목·고르기 목록은 `deviceLabel` 그대로.
- 랙 장표 노트의 장비 자리 글은 표 U 칸과 같은 범위로("34~33U 패치판넬 48P: …"). FDF·UTP 선번장 표 첫 칸은 예전 그대로(맨 아래 칸 번호).
- 폰 줄바꿈: 카드·휴지통·입력 현황 카드·가상 랙 줄 글에 `word-break: keep-all` + `overflow-wrap: anywhere`(긴 영문 한 덩어리만 꺾임). 숫자+단위("사진 0", "14일", "2F", "약 12m")는 `ui.nwText` 가 `span.nw`(줄바꿈 금지)로 감싼다. 배지는 한 줄.

### 장비 이름 → 업링크 글자
- 장비의 Hostname·모델명·종류·계층·포트·코어·통신사(= `deviceLabel` 을 이루는 항목)가 바뀌면 그 장비를 `ref` 로 가리키는 다른 장비의 업링크 `{ ref, label }` 의 label 도 `deviceLabel` 로 같이 바뀐다(`store.syncDeviceLabels`, `syncPlaceLabels` 와 같은 방식).

### 가상 랙
- 랙 높이가 비어 있어도 "위치가 정해지지 않은 장비" 목록·선반·랙 바닥 줄은 그대로 보인다(U 줄만 없고 "위에서 높이를 고르면 U 줄이 나옵니다" 안내).
- 옮기기 "+ 새로 만들기"로 랙(설치 형태 "랙")을 만들 때 이름 다음에 높이를 고른다(42U 미리 선택, `RACK_HEIGHTS`). 소형 함체는 묻지 않는다.

### 옮기기
- `store.moveNode`: 옮긴 노드의 `order` = 새 상위 형제들(자기 제외) 최대 order + 1(형제가 없으면 그대로). 새 상위 맨 끝에 놓인다.
- 목록 카드 [옮기기](`common.moveButton`, `common.nodeDel` 이 장소·설치 지점·장비 카드에 [옮기기] [삭제] 를 `span.acts` 한 묶음으로 단다): 장소 카드(현장 화면)·설치 지점 카드(장소 화면)·장비 카드(설치 지점 화면)·미작성 카드·(v0.23 한정) 가상 랙 장비 줄. 누르면 `node-edit.moveFlow` 가 바로 시작되고 카드 이동은 일어나지 않는다(`preventDefault`+`stopPropagation`). 좁은 화면에서는 카드 글 아래 줄 오른쪽으로 내려간다(v0.24에서 카드 배치를 통일 — 10절).
  현장·경로·실사 카드에는 [옮기기]가 없다(옮길 수 없는 종류).

### 휴지통
- 위치 글은 저장된 `label` 대신 `path` 로 지금 이름을 다시 만들어 보여 준다(`trash.liveLabel`). path 의 노드가 하나라도 없으면(상위가 지워졌으면) 저장된 `label` 그대로. 지운 노드 자신·그 아래는 payload 의 노드로 이름을 읽는다.
  사진 항목(바꾸기 전 사진)은 `rec.suffix`(label 끝의 칸 이름 " · 전면 전체")가 있는 새 항목만 다시 만든다 — 이전 버전에서 만든 항목은 저장된 글 그대로.
- 되살리기: 되살린 장비가 같은 설치 지점의 다른 장비와 U 위치(랙 높이 안)가 겹치면 알림 끝에 "같은 U 위치에 다른 장비가 있어 겹쳐 있습니다."(`overlapsAfter`, 화면 가상 랙의 "! 겹침"과 같은 기준).

### 내보내기
- 완료 창: 다운로드가 실제로 시작됐는지 앱이 알 수 없어 "내보냈습니다"를 "파일을 만들었습니다 / 내려받기를 시작했습니다. 받은 파일이 보이지 않으면 브라우저 내려받기 목록을 확인해 주세요."로 바꿨다. 동작(zip 만들기·내려받기 시작·`markExported`·"파일 다시 받기")은 그대로.
- 내보내기 화면: 틀(iframe) 안에서 열렸으면(`window.top !== window.self`, 접근이 막히면 틀 안으로 봄) 버튼 아래에 "시험판(미리보기 창)에서는 파일 내려받기가 막혀 있을 수 있습니다." 안내.


## 10. v0.24 — 검사 지적 정리 · 가상 랙 개편 · 글자 자동 축소 (ui.js, rack-drag.js, screens/point.js, export.js, store.js, css/app.css)

### 검사 지적
- (v0.25: 깨진 .json 안내·영어 세부 숨김은 12절 5번) 자료복구 오류(`export.js` `readInput`·`errorLines`): zip·기록 파일이 아니면(앞이 `PK` 도 `{` 도 아님) 읽지 않고 "zip 파일이나 기록 파일(.json)이 아닙니다. 내보낸 zip 파일을 골라 주세요." 창 제목 "자료복구". 오류 글은 [사람이 읽을 문장 + 작은 "(자세한 내용: …)"] — 한글 문장 오류(zip 읽기·기록 검사)는 그대로, 영어 시스템 메시지는 문장을 대신 붙이고 원문을 자세한 내용으로(저장 공간 부족은 별도 문장). 내보내기 실패 창도 같은 방식.
- 미작성 항목 집계 통일(`store.lackItems` = 완료 표시 전 제외): 홈 현장 카드 배지(장소 + 설치 지점 + 그 현장 경로)·입력 현황 요약·입력 현황 장소 카드 배지·좌측 메뉴(현장 상태가 경로의 미작성도 센다)가 같은 기준. 요약은 "미작성 항목 N건"(곳 → 건). 배지 우선순위 미작성 항목 > 완료 > 완료 전(`home.js`·`preview-status.js` 장소 카드). 빈 칸 "미입력"·경로 배지 "! 거리 없음"은 그대로(리버님 지시).
- 장표·머리말 장소 위치 조각(`store.locParts`): 조각 안 괄호("1.5F(중층)", "폐수처리장(옥외 별동)")를 괄호 앞뒤로 갈라 이름에 이미 있는 말은 빼고 남은 말만 "·"로 잇는다(괄호 안 괄호 없음). 예: "건과공장 1.5F 정비반 (중층)", "폐수처리장 2F (환경관리실) (옥외 별동)".
- 케이블 경로 화면: 방화구획 버튼 위 소제목 "방화구획", 광 코어 빠른 값에 72·96 추가(`CABLE_CORES`).
- 폰 카드(`common.card`): 글(제목·부제) 윗줄 전체 폭, 배지(왼쪽)·[옮기기] [삭제](오른쪽 끝)는 그 아래 줄 — 카드마다 같은 배치(`.card.has-del>a.t{flex:1 1 100%}`). "✓ 자동 저장됨" 고정 줄은 위 묶음과 2px 겹쳐 붙이고(`--toph` 는 소수점까지, `.saved-top{top:calc(var(--toph) - 2px)}`) 사이 틈이 없다. 좌측 메뉴 `.sn-l` `word-break: keep-all`.
- 새 실사 만들기 예시 "예: ○○공장 IT인프라 실사". 설치 지점 새로 만들기(장소 화면 "+ 설치 지점 추가"·옮기기 "+ 새로 만들기") 이름 안내: 형태가 랙이면 지금 문구, 아니면 "설치 지점 이름을 넣어 주세요."
- 내보내기 예상 크기(`estimateExportSize`): 원본 + 보정본 + PPT(뼈대 40KB + 장표 수 × 4KB + 사진 줄인 것) + 기록 파일(노드 300B·사진 250B 압축). 장표 수는 표지 + 장소 + NW공사 입력 있는 장소 + 설치 지점 + 선번장 있는 FDF·패치판넬 + 경로 + 자유 추가 + 사진 10장당 1. PPT 사진 한 장 = 사진(보정본 있으면 보정본) × (긴 변 1280px 초과분 넓이 비율) × 1.05, 6KB~260KB. 예시 실사 3건(대전 138노드·0장 / 여수 114노드·74장 / 시험 19노드·4장)을 실제로 내보낸 zip 과 견주어 오차 −0.3% ~ −2.2%(예전 식은 대전 −34%).

### 가상 랙 (`screens/point.js`, `js/rack-drag.js`)
- 탭 이름 "장비" → "랙 구성(장비)".
- 줄 높이 고정: 격자(`.vr-grid`, `grid-auto-rows: var(--vr-h)` = 2.5rem)에 U 번호 칸·빈 줄 버튼·장비 줄을 얹는다. 장비 줄은 `grid-row: 맨위칸 / span h` 한 덩어리라 1U 는 한 줄, nU 는 n줄 높이. 장비 이름은 한 줄(`.9rem`, ui.fitText — 길면 글자 축소 → 최소 → "…").
  겹친 장비는 옆 칸으로 나란히(`--vr-l` 칸 수) + 빨간 줄·"!" 표시, 위에 "! 겹침" 안내 한 줄.
- 줄 오른쪽 끝 [⋯](폭 2.9rem, 줄 높이를 키우지 않음) → 시트 "U 위치 옮기기"(같은 랙 안) / "다른 랙으로 옮기기"(`node-edit.moveFlow`) / "삭제"(맨 아래·띄움 — 빈 장비는 바로, 값이 있으면 `trash.deleteNode` 확인 창).
  "U 위치 옮기기" 시트: 높이를 고려한 U 칩(맨 아래 칸 기준 "30~32U" 범위 표시), 다른 장비와 겹치는 자리는 흐리게(`disabled`), 지금 자리는 파랑, 아래 "선반"·"랙 바닥". 저장은 `pos`·`u`(선반·랙 바닥이면 `u` 비움).
- 길게 눌러 끌기(`attachRackDrag`): 0.5초(10px 안 움직임)에 들림 → 손가락 위치로 놓일 U 를 정해 들린 줄(고정 위치 복제)이 U 단위로 붙어 다님(원래 자리는 흐리게). 선반·랙 바닥 줄 위에서는 그 줄을 표시. 다른 장비와 겹치면 빨갛게, 놓으면 저장 없이 원래 자리. 랙 아래(목록 쪽)로 벗어나도 자리 없음(빨강). 화면 위·아래 끝에서 천천히 자동 스크롤(프레임당 최대 6px). 들기 전 10px 넘게 움직이면 보통 스크롤, 끄는 동안만 touchmove 를 막고 `contextmenu`·`dragstart` 를 막으며 CSS 로 글자 선택·길게 누르기 메뉴(`-webkit-touch-callout`) 끔. 마우스도 같은 방식, 끝난 뒤 click 은 막아 장비 화면이 안 열린다. [⋯] 위에서는 시작하지 않는다. 선반·랙 바닥에 놓인 줄도 끌 수 있다(U 줄로도 놓을 수 있다).

### 글자 자동 축소 (`ui.fitText(el, { min, title })`)
- el 한 줄 글자가 칸 폭을 넘으면 글자 크기를 칸에 맞을 때까지 줄인다. 최소 `min`(rem, 기본 0.67 = 글자 크기 "보통"에서 약 12px, 화면 설정 글자 크기에 비례) 아래로는 안 줄이고, 그래도 넘치면 `text-overflow: ellipsis`. 잘렸을 때만 `title` 속성에 전체 글.
- ResizeObserver 로 칸 폭이 바뀔 때, `html[data-fs]`(화면 설정 글자 크기)가 바뀔 때(MutationObserver → `refitAll`) 다시 맞춘다. 화면에 붙기 전에 등록한 것은 `app.js applyScreen` 이 붙인 직후 `fitPending()` 으로 첫 그림 전에 맞춘다. 화면에서 사라진 요소는 등록에서 정리한다.
- v0.25: 등록 정리(`fitPrune`)가 화면을 만드는 중의 새 요소를 지우던 오류를 고쳤다(12절 2번).
- 적용: 고르기 줄(`form.js pickItem` — 이름표와 버튼을 한 줄(`.row.pick{flex-wrap:nowrap}`)에 두고 버튼 글만 줄임, 누르면 열리는 시트 맨 위 "지금 고른 것: 전체 이름"), 가상 랙 장비 줄 이름, 화면 위 제목·부제, 위치 줄 각 조각(`.crumb>.fit{max-width:100%}`), 목록 카드 제목(`common.card`)·입력 현황 카드 제목, 랙 탭 이름.

### 확인하지 못한 것
- 실제 폰(안드로이드 크롬)에서의 길게 누르기: 크롬 길게 누르기 메뉴·글자 선택이 뜨지 않는지(코드로는 막았고 Chrome 터치 에뮬레이션에서 끌기·스크롤 구분은 확인함, 실기기 확인 전 — 6절 SA-B 항목과 같은 위험).

## 11. v0.24 — PPT 장 수 줄이기 (js/pptx-build.js, slide-preview.js)

리버님 지시: 합칠 수 있는 장표는 합친다. 미리보기는 같은 pptx-build 를 돌리므로 같이 바뀐다. 예시 장 수: 여수 69 → 51장, 대전 126 → 74장. (v0.25: 칸 높이를 실제 줄 수로 잡고 넘치면 "(계속)" 장으로 넘기게 고쳐 여수 54장·대전 74장 — 12절)

### 공통
- 정보는 빼지 않는다: 합친 표는 칸 글을 자르지 않고 접는다(`wrapHeights` — 칸 글 줄 수를 어림해 줄 높이 22 + 줄당 14, `table(…, { heights })`). 표 글자 10pt(견본 10.5px) 그대로.
- 한 장에 안 들어가면 다음 장으로 넘기고 제목 끝에 "(계속)". A4 가로·하단 팀명·CI·쪽 번호·견본 양식 그대로.

### NW공사 (`placeSlides` · `condInline`)
- 짧으면 장소 장표 안에 "NW공사" 상자로 넣고 따로 장표를 만들지 않는다. 상자 = 항목·값 두 쌍씩 한 줄 표(머리 줄 없음, 미입력·확인 못 함 노란 칸 그대로) + "메모: …".
- 자리: ① 오른쪽 상자(장소 정보·환경 확인·실사자 메모) 밑 남는 높이 ② 안 들어가면 왼쪽 사진 칸 아래(사진 칸을 줄임 — 사진 1장 이하면 사진 칸 180, 2~3장이면 260 이상 남을 때만). 오른쪽 상자 영역에는 대부분 안 들어가 ②를 더했다(판단).
- 짧다 = NW공사 사진이 없거나 장소 사진과 합쳐 3장 이하(왼쪽 사진 칸에 같이 그림) + 위 자리에 들어감. 아니면 지금처럼 "· NW공사" 한 장.

### 선번장 (`lineSlides`)
- 장소마다 설치 지점 순서대로(지점마다 FDF → UTP) 표를 위아래로 이어 채운다. 표마다 소제목 "지점 · FDF 선번장 · N줄"(빨간 막대).
- 남는 높이에 소제목 + 머리 줄 + 3줄(표가 더 짧으면 전부)이 안 들어가면 다음 장. 표가 넘치면 끊고 다음 장에 소제목 "(계속 a~b줄)"·머리 줄을 다시 그린다.
- 제목: 한 장에 설치 지점이 하나면 "장소 › 지점 · 선번장(FDF·UTP)"(한 종류면 "· FDF 선번장"/"· UTP 선번장"), 여럿이면 "장소 · 선번장(FDF·UTP)", 작은 글 "현장 › 장소 · 설치 지점 N곳".
- 순서: 그 장소의 설치 지점 장표(랙·근접·라벨)들 뒤(승인안의 "랙 → 근접·라벨 → 선번장 → 자유 추가" 순서).

### 케이블 경로 (`siteRoutes` · `routeGroupSlide`)
- 사진 2장 이하(`ROUTE_FEW`) 경로가 번호 순서로 이어지면 4개(`ROUTE_GROUP`)까지 한 장: 항목 × 경로 표(출발·도착·케이블·거리·지나는 방식·층간·벽 타공·슬래브 타공·방화구획·문제·사진·메모·완료 표시). 사진이 있으면 표 아래 그 경로 칸 밑에 사진(칸 높이 120 이상 남을 때만 묶음에 더함).
- 사진 없는 경로는 표 "사진" 줄에 노란 "사진 없음"(미리보기는 빨간 ! — slide-preview 가 표 칸 '사진 없음'도 빈 값으로 표시).
- 제목 "케이블 경로 03~06", 작은 글 "현장 · 경로 N개 · 사진 N장". 사진 3장 이상 경로와 혼자 남은 경로는 지금처럼 한 장.

### 자유 추가 (`extraSlides`)
- 장소마다 한 장: 사진 칸 격자(1~2건 2×1, 3건 3×1, 4~6 3×2, 7~8 4×2, 9~12 4×3), 칸 밑 띠 "번호. 사진 이름"(사진 없는 건 "번호. 꼬리표"), 아래에 "번호. 꼬리표 — 메모" 전체(예전엔 띠에 넣어 잘렸음). 메모 줄이 본문 45%를 넘거나 12칸을 넘으면 다음 장.

### 확인
- node(fake-indexeddb)로 예시 zip 2개를 자료복구(importModel) → 미리보기 덱·실제 pptx 생성. 예전 덱의 표 칸·글이 새 덱에 모두 있는지 대조(차이는 제목·잘렸던 이름 띠뿐), 사진 74장 각 1번씩. LibreOffice 로 pptx → PDF(여수 51쪽·대전 74쪽) 열림, 합친 장표 겹침·잘림 없음(눈으로 확인), 미리보기 HTML(Chrome) 같은 모양.
- 내보내기 예상 크기(`export.js slideCount`)의 장표 수 어림은 고치지 않았다(장표당 4KB 어림, 합쳐도 글 양은 같음).

## 12. v0.25 — 오류 수정 5건 (pptx-build.js, slide-preview.js, css/preview.css, ui.js, node-edit.js, preview-status.js, export.js)

### 1. 장표 글 잘림·제목 겹침 (`pptx-build.js`)
원인: ① 글자 폭 어림이 실제(맑은 고딕)보다 좁았다(한글 0.95em → 실측 1.0em, 공백 0.3 → 0.35, 숫자·영문 표 없음) ② 줄 수를 "글자 폭 합 ÷ 칸 폭 올림"으로 셌다(실제는 낱말 단위 줄바꿈이라 더 많다) ③ 줄 간격을 pt 로 반올림해(`F(19)` = 18pt) 줄이 많으면 조금씩 어긋났다 ④ 칸에 안 들어가면 마지막 글을 "…"로 잘라 넘겼다 ⑤ 제목 폭도 같은 어림이라 길면 두 줄이 돼 부제·빨간 선과 겹쳤다.
- 글자 폭: `ASCII_EM`(보통)·`ASCII_EM_B`(굵게) 실측 표(0x20~0x7E, 맑은 고딕 1em=1) + 한글·전각 1.0 + 몇 개 기호(`WIDE_EM`). 3%(`SAFE`) 넉넉히 잡는다(칸 높이를 모자라지 않게 — 남으면 조금 비는 쪽).
- 줄바꿈 계산 `wrapPara`/`lineCount`: 공백 단위로 채우고, 한 줄보다 긴 낱말만 글자 단위로 끊는다(PowerPoint 의 한글 낱말 단위 줄바꿈과 같은 가정). 미리보기 CSS 도 같게 `.pv-t`·`.pv-tb td` 에 `word-break: keep-all`(예전엔 글자마다 끊어 줄 수가 달랐다).
- 줄 간격 `LS(lh)` = lh × 0.935 pt(반올림 안 함) → 칸 높이 = 줄 수 × lh 가 장표에서 그대로 맞는다.
- 칸 높이는 실제 줄 수로: 상자(`box`/`boxLayout`)·노트(`note`)·표(`wrapHeights`)·NW공사 메모·경로 메모 모두. NW공사 표·경로 표도 `wrapHeights` 로 줄 높이를 정해 `table({ heights })`(예전엔 "두 줄이면 ×1.6" 어림).
- 안 들어가면 다음 장 "(계속)": `takeLines` 가 칸 높이만큼 줄을 담고 나머지(rest)를 돌려준다(문단이 4줄 이상이고 2줄 넘게 남으면 줄 중간에서도 끊고, 아니면 문단째 넘긴다). `stackBoxes` → `{ cy, rest }`, `Deck.restBoxes`(상자들)·`restNotes`(노트 글)이 "제목 (계속)" 장표(넓은 폭)로 이어 그린다. 적용: 장소 장표(장소 정보·환경 확인 칩 줄·실사자 메모)·설치 지점 장표(설치 정보)·NW공사 메모·경로 메모·랙 장표 확인·메모(제목 "· 확인·메모 (계속)")·자유 추가 메모. 예전에 "…"로 잘려 사라지던 글(상자 마지막 줄·노트 끝)과 `room < 50` 일 때 통째로 빠지던 상자가 이제 다음 장에 남는다.
- 랙 장표: 장비 표 줄 높이 `RACK_ROW` 20(22 → 20)·표 아래 간격 8·노트 줄 높이 `NOTE_LH` 18 — 확인·메모가 한 장에 더 들어가게(그래도 넘치면 "(계속)").
- 장표 제목(`Deck.title`): 항상 한 줄 — 부제 폭을 뺀 칸에 굵은 글 폭(`textW(…, bold)` × SAFE)이 들어가게 글자 크기를 21px → 14px(0.5씩)까지 줄이고, 그래도 넘치면 "…". 글 칸 `wrap: false`(PPT `wrap="none"`; 미리보기는 `white-space: nowrap`) 라 어림이 틀려도 두 줄로 내려오지 않는다. 표지 사업명도 3줄에 안 들어가면 38px → 24px 까지 줄인다.
- 칩 폭(`chipRows`)·한 줄 잘림(`fit`)도 같은 폭 어림(`fit(s, maxPx, fpx, bold)`).
- 장 수(예시 zip, 이 어림 기준): 여수 51 → 54장, 대전 74 → 74장. 늘어난 3장은 모두 랙 장표 "확인·메모 (계속)"(여수 PC-FDF·PC-코어·BD-A) — 예전에는 그 글이 칸 밖으로 잘렸다. 점검(아래)에서 잘림·겹침 0.

### 장표 점검 방법(검사 스크립트, 저장소 밖)
미리보기(`slide-preview.slideHtml`)를 900px 로 그려 장마다 재서 모두 0 이어야 한다: ① 글 칸 안쪽 높이 > 칸 높이(`clipH`)·한 줄 글 폭 초과 ② 제목 줄바꿈을 풀고 2줄 이상(`title2`) ③ 표가 정한 줄 높이 합보다 커짐(`tableGrow`)·표 칸 글이 칸 밖(`cellClip`) ④ 글·표가 하단 줄(594px) 아래 ⑤ 글 실제 높이·표 사각형끼리 겹침. 줄 수 어림과 실제(미리보기)가 0~1줄 안에서 맞는지도 본다.

### 2. 경로 카드 긴 제목이 처음 열 때 안 줄던 것 (`ui.js fitPrune`)
원인: `fitText()` 가 100번째 부를 때마다 `fitPrune()`("화면에 안 붙은 요소는 등록에서 삭제")을 돌리는데, 화면을 만드는 도중(아직 DOM 에 안 붙은 새 카드 제목들)에 그 100번째가 걸리면 새 제목들이 등록에서 지워져 영영 안 맞춰졌다(다른 화면에 다녀오면 카운터가 달라져 멀쩡해 보임). 현장 화면·케이블 경로 목록뿐 아니라 `fitText` 를 쓰는 모든 제목·카드·위치 줄이 같은 위험이었다.
- 고침: 한 번도 화면에 안 붙은 요소는 지우지 않는다(`rec.seen`). 한 번 붙었다가 떨어졌거나 등록 30초가 지나도 안 붙은 것(만들다 버린 화면)만 지운다.
- 안전망: `fitPending()` 이 붙은 직후 맞춘 뒤, 두 프레임(requestAnimationFrame 두 번) 뒤 `refitAll` 로 레이아웃이 끝난 폭에서 한 번 더 맞춘다.
- 확인: 현장·케이블 경로·내보내기 화면을 25번 왕복(폰 폭 360px)하며 잘렸는데 줄이지 않은 제목을 센 결과 — 수정 전 8곳, 수정 후 0.

### 3. 랙 아닌 설치 지점 이름 바꾸기 문구 (`node-edit.js pointRename`)
형태가 랙이면 "랙 번호나 이름을 넣어 주세요…"·예 R-01, 그 밖은 "설치 지점 이름을 넣어 주세요."·형태별 예시(소형 함체 "예: 1층 사무실 소형 함체" · 벽부 분배함 "예: 1층 복도 분배함" · 책상·바닥 "예: 사무실 책상 아래" · 천장 "예: 2층 복도 천장" · 배관·기둥 "예: 1층 계단 옆 기둥" · 벽면 "예: 1층 로비 벽면"). 새 설치 지점 추가·옮기기 "+ 새로 만들기" 안내는 v0.24 그대로.

### 4. 입력 현황 "완료 N" (`preview-status.js`)
요약의 "완료"를 장소 카드 배지와 같은 기준으로 센다 — 미작성 항목(그 장소 + 아래 설치 지점)이 없고 완료를 누른 장소만(우선순위 미작성 항목 > 완료 > 완료 전). 예시: 여수 5 → 3, 대전 26 → 24(완료를 눌렀지만 미작성 항목이 있는 장소 2곳씩).

### 5. 깨진 .json 자료복구 안내 (`export.js readInput`)
- 이름이 .json 이고 JSON 이 깨졌으면(빈 파일 포함) "기록 파일이 깨져서 읽을 수 없습니다. 내보낸 zip 파일을 골라 주세요."(창 제목 자료복구).
- .json 이 아닌 파일·읽힌 JSON 이 객체가 아닌 것(배열 등)은 "zip 파일이나 기록 파일(.json)이 아닙니다…", 형식이 다른 JSON 객체는 "현장실사 앱의 기록 파일이 아닙니다." — 지금 안내 그대로.
- 영어 오류 세부("(자세한 내용: Expected…)")는 이 경로(zip 안 기록 파일 깨짐 포함)에서 화면에 안 보이고 콘솔(`console.warn`)에만 남긴다. 그 밖에 예상 못 한 오류는 10절 방식 그대로(문장 + 작은 세부).


## 13. v0.30 — 디자인 D안 + 링크 받기 보완 (css/app.css·preview.css·sidenav.css, ui.js, rack-drag.js, settings.js, boot.js, app.js, store.js, guide.js, screens/projects.js·settings.js)

### 1. 디자인 D안(겉모양만)
- 디자인 값은 `css/app.css` 맨 위 `:root` 한 곳. 회색 바탕(--bg) · 받침(--trayc, 안쪽 그림자) · 판(--card, 아래 두께 2px --sh1) · 메뉴·창(--pop, 층 3).
- 글자 3단계: 제목 20px/700 · 본문 16px · 보조 13px(보통 기준, rem). 화면 설정 글자 크기(html[data-fs]) 16 / 17.8 / 20.4px 로 같은 비율로 커진다. 장표 미리보기 안 글자(.pv-sl)는 PPT 와 맞춘 값 그대로.
- 받침: `.form`·펼친 `details.fold`·`.foot`·`.vr`는 그 자체가 받침. `#view` 바로 아래 이어진 `.card`·`.row`는 판마다 `::before`(z-index -1) 받침 조각을 이어 붙여 한 받침처럼 보인다(`#view{isolation:isolate}`).
- 누름 = 아래로 2px·두께 0, 고른 칩 = 눌린 채 옅은 파랑 테, 탭·두 칸 버튼 = --track 바탕 안 고른 것만 --card2 판, 입력 칸 = 파인 칸(--well) 44px 이상, 주 버튼(.pri) = --pri.
- 커버(344px): 카드 제목·위 제목·위치 줄·탭·고르기 버튼 글자는 줄이지 않고 줄을 나눈다(css 로 `.fit` 의 white-space 를 normal). 랙 U 줄 장비 이름·케이블 경로 카드 제목만 한 줄 자동 축소.
- 가상 랙: 받침 안 U 줄 판(줄 높이 3rem 고정, 판 틈은 판 위·아래 여백 — rack-drag 의 줄 높이 계산은 그대로). 끄는 동안 빈 U 칸·선반 줄은 파인 칸, 다른 장비는 흐리게, 눌림 모양 끔. 들린 줄은 위로 5px·층 3, 놓으면 `.vr-land` 로 0.12초 내려앉음.
- 의미 색은 채도를 낮춰 점·가는 띠로: 완료 초록 점, 미작성 노란 점·띠, 겹침·삭제 빨강(--hot), 고른 것 파랑. 상단 빨간 바·분홍 바탕은 없앴다(CI 그림은 흰 판 위에 그대로).

### 2. 바탕 "자동"
- settings.theme 'auto'(기본) | 'light' | 'dark'. light·dark 는 html[data-theme], 자동은 속성 없음 → `prefers-color-scheme` 을 따른다. 어두운 값은 app.css 에 두 번(검은 바탕 · 자동+폰 어두움) 같은 값으로 있다.
- 예전 앱은 설정을 저장할 때 theme:'light' 까지 함께 저장했다. 그래서 `settings.js` 가 처음 열 때 한 번만(표시 `themeAuto30`) 'light' → 'auto' 로 바꾼다(리버 결정). 그 뒤 사용자가 고른 '밝게'·'어둡게'는 그대로 둔다.

### 3. 글자 자동 축소(ui.fitText)
- 최소 0.8125rem(보통 13px). 넘침 판정을 Range 의 실제 글자 폭(소수점)으로 하고 줄일 때 0.5px 여유를 둔다 — 정수 scrollWidth 때문에 끝 1~3글자가 "…"로 남던 문제 고침.

### 4. 링크 받기 보완
- A. 앱 안 브라우저(userAgent: KAKAOTALK·NAVER(inapp·Instagram·FBAN/FBAV·Line·DaumApps·everytimeApp·BAND)에서 #p= 링크를 열면 받기 전에 안내 화면(`app.js inAppGate`). [크롬으로 열기] 카톡 `kakaotalk://web/openExternal?url=` · 안드로이드 `intent://…#Intent;scheme=https;package=com.android.chrome;end` · 그 밖 주소 복사. [여기서 그냥 열기]는 평소대로 받는다. 두 주소 방식은 실기기 확인 안 됨.
- B. 링크로 받거나 다시 받으면 project.receivedAt(필드만 추가, DB 버전 그대로). 실사 목록은 max(createdAt, receivedAt) 최근 순, 24시간 안이면 "방금 받음". 내보내기는 사업 레코드를 통째로 담고, 불러오기(새 실사)는 정해진 필드만 옮기므로 receivedAt 은 옮기지 않는다(받은 폰에서만 의미).
- C. 첫 실행 안내 3장에 "실사 링크는 크롬(또는 홈 화면 앱)에서 여세요. 카톡 안에서 열면 기록이 따로 저장됩니다."

### v0.30 추가 — 실사정보 배포 · 실사샘플 받기
- 실사정보 배포(`js/screens/distribute.js`, 라우트 `#/p/:pid/distribute`): 이 폰의 실사 현장·장소로 링크·QR을 바로 만든다. ID는 linkId가 있으면 그것, 없으면 노드 ID. 링크 주소는 github.io·localhost면 지금 주소, 그 밖(시험판)은 배포판 주소.
- 관리자 기능(`js/admin.js`): 화면 설정에서 암호(SHA-256 비교)로 켠다. 켠 폰의 실사 안 더보기 맨 위에 "실사정보 배포"(v0.34 부터 실사 선택 화면 더보기 — 15절). 서버가 없어 진짜 잠금은 아니다(실수로 켜는 것만 막음).
- QR 모듈은 `tools/qr.js` → `js/qr.js`로 옮겼다(tools/link.html 도 이것을 쓴다).
- 실사샘플 받기(`js/export.js` SAMPLES·openSamples·sampleButton): 실사 선택·더보기·내보내기에서 구글 드라이브 "바로 내려받기" 주소(v0.31)를 새 창으로 연다. 예시 zip은 공개 repo에 넣지 않는다.
- `copyText`는 `js/ui.js`로 옮겨 같이 쓴다.

## 14. v0.31 · v0.32 — 실사샘플 받기 · 버전 표시 (export.js, app.js, index.html, css/app.css, sw.js)
### v0.31 실사샘플
- 링크를 드라이브 보기 화면 대신 바로 내려받기 주소로 열어(v0.33부터 `https://drive.usercontent.google.com/download?id=…&export=download` — `drive.google.com` 주소는 안드로이드에서 드라이브 앱이 가로채 zip 을 열어 버림) zip 이 다운로드 폴더에 바로 받아지게 했다(드라이브 앱·계정 고르기 없이). 받은 뒤 안내: 압축 풀지 말 것, 알림의 '열기' 누르지 말 것, 자료복구에서 zip 고르기(v0.32 문구).
- 대전 샘플을 사진 43장(실사보고서 별첨 사진, PPT 속 원본 그대로) 든 새 드라이브 파일로 바꿨다(ID 는 SAMPLES). 옛 파일(사진 없음)은 쓰지 않는다.
- 앱이 zip 을 직접 받아 바로 넣는 방식은 쓸 수 없다: 브라우저가 보내는 Sec-Fetch(cors·cross-site·empty) 조합에 구글이 403 을 준다(curl 로 머리글별 확인, 배포판 주소에서 실제 브라우저로도 막힘 — v0.32 시험).
### v0.32 버전 표시 · 업데이트 필요
- `#brand` 안 CI 오른쪽에 `#ver`(APP_VERSION, 보조 글자)와 `#verupd`("업데이트 필요", 평소 숨김). CI 는 실사 선택 화면(s.brand)에만 있다.
- 새 버전 판단: ① 서비스 워커가 새 파일을 받아 기다림(waiting) — 기존 "새 버전이 있습니다" 줄과 같은 신호(showUpdateBar 가 #verupd 도 보임) ② 실사 선택 화면을 열 때(60초에 한 번) `js/version.js?fresh=…` 를 받아 APP_VERSION 이 더 높으면. `sw.js` 는 `fresh` 가 붙은 요청을 가로채지 않는다(저장본 대신 네트워크).
- 누르면 applyUpdate: 입력 저장 → waiting 이 없으면 reg.update() 후 최대 60초 기다림(버튼 "받는 중…") → SKIP_WAITING → 새로 고침.
- 시험(헤드리스): 서버 버전을 올리면 버튼이 뜨고, 누르면 새 버전으로 바뀌고 버튼이 사라짐.

## 15. v0.34 — 실사정보 배포 입구 옮김 (screens/more.js, screens/distribute.js)
- 입구를 실사 안 더보기에서 **실사 선택 화면 더보기**(실사 밖, 관리자 기능 켠 기기만)로 옮겼다. 실사 안 더보기에서는 뺐다. 관리자 기능을 켜는 곳(첫 화면 더보기 → 화면 설정)과 같은 층에 두어 켠 뒤 바로 찾게 했다.
- 누르면 고르기 창: **새로 만들기(목록 입력)** → `tools/link.html`(책상에서 실사명·기간·현장·장소를 쳐서 만드는 길) / **이 기기의 실사** 이름 → `#/p/:pid/distribute`(현장에서 만든 실사를 그대로 보내는 길).
- link.html 주소는 distribute.linkToolUrl(): github.io·localhost 면 같은 사이트(이 창에서 열어 설치 앱 창 안에 머문다), 그 밖(시험판)은 배포판 주소를 새 창으로.
- 배포 화면 위 경로 "‹ 실사 선택"(`#/`)으로 돌아간다(예전 "‹ 홈"은 실사 홈).
- 폰·PC 사이 배포 실사 맞추기(깃허브 비공개 저장소 등)는 넣지 않았다. 다른 기기에서 이어서 고치려면 보낸 링크를 그 기기에서 열면 같은 ID로 들어온다.

## 16. v0.35 — 앱만 보내기 · 앱 주소도 카톡 안내 (screens/distribute.js renderApp, screens/more.js, app.js)
- 배포 고르기 창 맨 위 **앱만 보내기 (빈 화면)** → `#/distribute-app`(관리자): 앱 주소(`new URL('./', appUrl())` — 배포판 주소, 이 PC면 localhost) QR·공유하기·링크 복사. 공유 문구 "크롬에서 열고 첫 화면의 홈 화면에 추가를 눌러 주세요".
- 앱 안 브라우저 안내(inAppGate)를 앱 주소만 연 경우에도 띄운다(boot, `#p=`가 아닐 때. 실사 링크는 handleLink 에서). 제목 "크롬에서 열어 주세요".
- 실기기(v0.34, 갤럭시 폴드7·카톡 26.10, UA 끝 `KAKAOTALK/26.10.1 (INAPP)`): 실사 링크 안내 화면 → [크롬으로 열기](`kakaotalk://web/openExternal`) → 바깥 브라우저로 넘어가 링크 받기까지 확인. 처음엔 안내가 안 떴는데, 카톡 브라우저에 v0.30 전 버전이 저장돼 있었기 때문(업데이트 뒤 정상).
- 홈 화면 아이콘은 웹앱이 스스로 만들 수 없다(사용자가 홈 화면에 추가 → 설치를 눌러야 함).

## 17. v0.36 — 아이폰 안내 문구 (install.js isIOS, app.js inAppGate)
- `isIOS()`: UA 에 iPhone·iPad·iPod, 또는 MacIntel + 터치(아이패드 OS, 안드로이드 UA 는 제외).
- 홈 화면에 추가: 아이폰은 설치 창이 없어 항상 안내 — "사파리나 크롬의 공유 버튼(□↑)을 누른 뒤 홈 화면에 추가". 안드로이드는 그대로(크롬 ⋮).
- 앱 안 브라우저 안내: 아이폰이면 제목 "사파리나 크롬에서 열어 주세요", 버튼 [사파리·크롬으로 열기], 복사 안내도 같은 말. 카톡 바깥 열기가 아이폰에서 기본 브라우저로 가는지는 확인 안 됨(추측).
- 아이폰 기록 분리 확인 결과는 18절(크롬 같이 씀, 사파리 따로 씀).

## 18. v0.40 — 실사 링크 붙여 넣기 (receive.js, screens/projects.js, app.js)
- 아이폰 실기기(v0.36): 크롬은 브라우저와 홈 화면 앱이 기록을 같이 쓴다(받은 실사가 아이콘 앱에도 보임). 사파리는 따로 쓴다(브라우저에서 받은 실사가 아이콘 앱에 안 보임). 아이폰은 링크를 누르면 늘 브라우저로 열리고 홈 화면 앱으로는 못 받는다.
- 그래서 실사 선택 화면에 **실사 링크 붙여 넣기**(모두에게 보임): 입력 칸에 링크(메시지 통째도 됨)를 넣으면 `findLinkCode`가 `#p=([A-Za-z0-9_-]+)`를 찾아 `receiveCode`로 받는다. 결과 알림은 링크로 열 때와 같다. 못 찾으면 "실사 링크를 찾지 못했습니다".
- 링크 받기 코드를 `js/receive.js`로 뺐다(app.js handleLink 와 붙여 넣기가 같이 씀). sw.js FILES 에 추가.
- 아이폰 사파리(홈 화면 앱 아님, UA 에 CriOS·FxiOS·EdgiOS 없음)에서 링크로 받으면 결과 알림 끝에 "홈 화면 아이콘으로 쓰려면 이 링크를 복사해 앱 첫 화면의 실사 링크 붙여 넣기에 넣어 주세요".

## 19. v0.41 — 아이폰 자료복구 사진 깨짐 (export.js importModel getFile)
- 증상(아이폰 크롬·사파리, 여수·대전 샘플): 자료복구 뒤 사진 칸(작은 그림)은 보이는데 크게 보기는 빈 화면에 깨진 그림 아이콘. 아이폰에서 찍은 사진은 정상. 안드로이드는 정상.
- 원인(추측 — 코드와 증상으로 판단, WebKit 내부는 확인 안 함): 복구 때 zip 안 사진을 파일 조각(`File.slice`)째 IndexedDB 에 넣었다. 크롬(안드로이드)은 바이트를 복사하지만 WebKit 은 고른 파일을 가리키는 표시만 남길 수 있어, 파일 고르기가 끝나 임시 파일이 사라지면 원본을 못 읽는다. 작은 그림은 복구 때 새로 그려 저장하므로 멀쩡했다.
- 고침: getFile 이 `arrayBuffer()`로 실제 바이트를 읽어 새 Blob 을 만든다(사진·보정본, 한 장씩).
- 이미 깨진 채 복구된 실사는 복구가 같은 사진을 건너뛰므로 실사를 삭제하고 다시 복구해야 한다.
- 실기기 확인(2026-11-26): v0.41 배포 뒤 아이폰 크롬에서 실사 삭제 → 다시 복구 → 크게 보기 정상, 앱을 닫았다 열어도 정상. 원인 판단이 맞았던 것으로 본다.
- 아이폰 Claude 앱 안 아티팩트(시험판)는 작은 그림까지 깨진다(예시 다시 넣기 후에도). 사진 데이터 저장 자체가 안 되는 환경으로 보이며(추측) 배포판과 무관 — 아이폰 사진 시험은 배포판으로 한다.
