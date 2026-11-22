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
js/ui.js                h(), 창(dialog·sheet·full) — ✕·바깥·뒤로 가기 닫기(history 연동), toast
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
js/trash.js             삭제·입력 초기화·휴지통·30일 규칙 (SA-B)
js/export.js            exportModel + 저장 후 내보내기(zip) + PC에서 이어서 하기(불러오기·병합) [SA-C]
js/pptx-build.js        PPT 장표 만들기(PptxGenJS 를 받아서 씀, node 에서도 돎) [SA-C]
js/zipname.js           내보내기 순서(뼈대)와 파일 이름 규칙(순수 함수) [SA-C]
js/zipfile.js           zip 쓰기·읽기(라이브러리 없이), JPEG 촬영 시각 EXIF 넣기 [SA-C]
js/corrector.js         사진 보정 창 openCorrector(4점 원근·90°·기울기·미리보기·원래대로) [SA-D]
js/warp.js              호모그래피·역매핑+쌍선형 보간(순수 함수, 워커·node 공용) [SA-D]
js/corner-detect.js     모서리 자동 찾기(캐니+허프, 라이브러리 없음, 순수 함수) [SA-D]
js/warp-worker.js       보정 계산 모듈 워커(warp·detect) [SA-D]
js/screens/common.js    화면 공통(주소 만들기, 현재 위치 줄, 카드, 고르기 목록)
js/screens/*.js         화면 하나씩: projects, home, site, place, cond, point, device, extra, routes, export, settings, more
tools/link.html         관리자용 사업 링크·QR 만들기 (tools/link-tool.js, tools/qr.js)
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
| `#/p/:pid/cd/:id` | 공사 조건(id = 장소 id) | screens/cond.js |
| `#/p/:pid/pt/:id` | 설치 지점(랙: 촬영/장비/확인 항목 탭) | screens/point.js |
| `#/p/:pid/dv/:id` | 장비 | screens/device.js |
| `#/p/:pid/ex/:id` | 자유 추가 | screens/extra.js |
| `#/p/:pid/routes` | 경로 목록(아래 메뉴 "경로") | screens/routes.js |
| `#/p/:pid/rt/:id` | 경로 하나 | screens/routes.js |
| `#/p/:pid/export` | 저장 후 내보내기(아래 메뉴 "내보내기") | screens/export.js |
| `#/p/:pid/trash` | 휴지통 | trash.js `renderTrash` |
| `#p=<코드>` | 사업 링크 받기 → 병합 후 `#/p/:pid` 로 바꿈 | app.js `handleLink` |

화면 모듈은 `render(ctx)` 가 화면 객체를 돌려준다:
`{ title, sub, crumbs:[{label, href, back}], brand, menu:'home'|'routes'|'export'|null, projectId, scope:{project,node,parentHref}, body }`.
`ctx = { params, go(hash,{replace}), refresh() }`.

창(알림·메뉴·안내)은 `ui.openOverlay` 가 history 에 한 칸 쌓는다. ✕·바깥·뒤로 가기 모두 `history.back()` 한 번으로 닫힌다. 창 안에서 화면을 옮길 때는 `ctx.go()` 를 쓴다(창을 먼저 닫음).

## 3. 데이터

### 구조
사업(project) → 현장(site) → 장소(place) / 경로(route) → 설치 지점(point) → 장비(device).
자유 추가(extra)는 장소 아래. 랙은 설치 형태가 `랙`인 설치 지점이다. 공사 조건은 장소 노드의 `cond_*` 항목.

### 저장소 (IndexedDB `fieldnote` v1) — 자세한 모양은 `js/db.js` 주석
- `projects` `{ id, name, from, to, source:'link'|'manual', createdAt, changedAt, exportedAt, linkAt }`
- `nodes` `{ id, projectId, parentId, path, type, order, linkId?, data, createdAt, updatedAt }`
  - `path` = `사업id/현장id/장소id/…` (만든 뒤 안 바뀜). 색인: projectId, parentId, path
  - `data[항목] = { v, by, stage, at }` — 값마다 입력자·차수(1 폰 / 2 PC / 3 취합, 0 = 사업 링크)·시각. 지운 값은 `v:null`
  - 여러 줄 항목(VLAN 표 `vlans`, FDF 행선지 `fdfLines`)은 `v` 가 배열 `[{ id, …칸, _m:{by,stage,at} }]`
  - 목록에서 고른 값(업링크 `uplink`, 행선지 `dest`, 경로 `from`/`to`)은 `{ ref:노드id|null, label }` 또는 `'없음'`/`'확인 못 함'`
  - 고르기 값은 화면 글자 그대로 저장(여러 개 고르기는 배열). 목록은 `js/options.js`
- `photos` `{ id, projectId, ownerPath, slot, order, blob, thumb, source:'camera'|'gallery', takenAt, exif, corrected, createdAt, changedAt?, meta }`
  - `blob` 줄인 보정 전 사진(긴 변 2560px, JPEG 0.85, 지우지 않음), `thumb` 긴 변 320px(보정되면 SA-D가 보정본 기준으로 바꿈)
  - `exif` = `{ file:{name,type,size,lastModified}, width, height(바로 세운 원본 크기), orientation, make, model, dateTimeOriginal, offsetTime, gps:{lat,lon,alt}|null, saved:{width,height,maxSide,quality}, manualRotate }` (`js/photo-proc.js`)
  - `changedAt` 다시 찍기·바꾸기·보정으로 바뀐 때. `store.putPhoto` 가 찍는다(`{changed:false}` 로 끌 수 있음). 순서 바꾸기(`store.reorderPhotos`)는 찍지 않는다.
  - 색인: projectId, ownerPath, owner_slot(ownerPath+slot), project_created(projectId+createdAt)
- `trash` `{ id, projectId, kind:'reset'|'photo', label, path, payload, photoCount, deletedAt, expiresAt }` — 입력 초기화·바꾸기 전 사진 7일 보관
  - reset: `payload = { kept:[{id,data}], removed:[노드…], photos:[사진…] }`, photo: `payload = { photo }` (모양은 `js/trash.js` 주석)
  - 7일 지난 것은 앱 시작 때(`app.js` → `trash.purgeExpired`)와 휴지통 화면을 열 때 지운다.
- `kv` `{ k, v }` — 작은 값

### 노드 종류별 주요 항목 (data 의 키)
- site: `name, date(실사일), vlans[], memo`
- place: `name, kind, bldg, floor, room, where, env_*(8개), problems[], envTags[], vlans[], memo, done` + 공사 조건 `cond_ceilH, cond_beamH, cond_ceilType, cond_tray, cond_trayW, cond_trayRoom, cond_spot[], cond_panel, cond_breaker, cond_outlet, cond_ground, cond_work[], cond_memo`
- point: `name, form, system, height, rearReason, freeU, cableIn, pduCount, pduSystem[], rearPduPos, rearPduSystem[], rearPower, rearFreeOutlets, rearCableIn, rearTidy, rearLabel, rearFdfIn, cabSize, cabMount, cab19, cabOutlets, cabOwner, cabLocked, memo`
- device: `kind, pos('U 위치'|'선반'|'랙 바닥'), u(맨 아래 칸 번호), h(높이), layer, ports, slots, modules, cores, carrier, carrierKind, lineUse, lineNo, model, hostname, mgmtIp, vlan, zone, state, ownerCo, role, usedPorts, poe, redundant, configGot, uplink, media, linkCores, viaConv, fdfLines[], term_pc … term_etc, memo`
  - fdfLines 한 줄: `dest, range, used, fiber, conn, labelText, unused`
- extra: `tag, memo`
- route: `from, to, dist, ways[], rise[], wallHoles, slabHoles, fire, problems[], memo`

### 사진 칸(slot) 표
| 달리는 곳(ownerPath) | slot | 장수 |
|---|---|---|
| 장소 | `overview` 전경, `nameplate` 문패·명판, `handnote` 손글씨 대응표, `cond` 공사 조건 | 여러 장 |
| 설치 지점(랙) | `front` 전면 전체, `rear` 후면 전체 | 한 장 |
| 설치 지점 | `closeup` 장비 근접, `label` 라벨, `outer` 함체 외관, `inner` 함체 내부 | 여러 장 |
| 장비 | `closeup` 근접, `asset` 자산 스티커, `ipscreen` 단말 IP 화면 | 여러 장 |
| 장비(FDF 행선지 줄) | `fdfLines:<줄 id>:photo` | 여러 장 |
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
    바꾸기 = 같은 id·칸·순서 유지, 사진·출처·EXIF만 바꾸고 `corrected:null`. 바꾸기 전 레코드는 `trash.trashPhotoCopy` 로 7일 보관.
    크게 보기 = `ui.openOverlay(..., {kind:'full'})`, 두 손가락 확대·끌기·두 번 눌러 확대(PC는 휠·끌기·더블클릭). 보정본이 있으면 "찍은 그대로 / 보정 후" 전환.
    삭제 = 바로 지움(휴지통 아님). 경고창에 "복구할 수 없습니다", 아직 안 보낸 사진이면 따로 경고.
  - 길게 누름(0.45초, 10px 안 움직임) = 끌어다 놓기. 여러 장 칸에 2장 이상일 때만, 같은 칸 안에서만. 놓으면 `store.reorderPhotos(ids)`.
    터치 이벤트로 처리하고 끄는 동안만 touchmove 를 막는다(그 전에 움직이면 스크롤). 화면 위·아래 끝에서 자동 스크롤. PC는 마우스로 같은 방식.
- `js/notice.js` — `renderExportNotice(container, projectId)`(홈 맨 위), `afterDoneChange(projectId)`(모든 장소 완료 → 알림창 한 번, kv `exportAsked:<pid>`).
  "안 보낸 사진" = `store.countUnexportedPhotos`: 내보낸 적 없으면 전체, 있으면 `max(createdAt, changedAt) > exportedAt` 인 사진 수.
- `js/trash.js` — `moreItems(scope)`, `runMoreItem(value, scope, ctx)`, `requestDelete(scope)`, `requestDeleteProject(project)`,
  `projectDeleteButton(project, ctx)`, `canDeleteWhole(project)`, `resetScope(scope)`, `trashPhotoCopy`, `purgeExpired`, `renderTrash(ctx)`.
  - 더보기 항목: 입력 초기화(현장·장소·설치 지점 화면, 홈=`scope.whole:true` 사업 전체) / 휴지통(사업 안 모든 화면) / 삭제(danger, 맨 아래).
  - 삭제: 장소·경로·설치 지점·장비·자유 추가는 항상, 현장·사업은 30일 규칙. 경고창에 지워지는 사진 수·기록 수, "복구할 수 없습니다",
    안 내보냄(한 번도 / 마지막 내보내기 뒤 바뀜) 경고, 내보낸 적 있으면 "남는 것: 이미 내보낸 파일(zip)". 내보낸 적 없는 사업은 확인 한 번 더.
    노드를 지우면 그 아래를 가리키는 휴지통 항목도 지운다. 사업을 지우면 노드·사진·휴지통·kv `exportAsked` 를 한 트랜잭션으로 지운다.
  - **30일 규칙**: 기준일 = `project.to`(실사 기간 끝 날짜) 다음 날 0시. 끝 날짜가 없으면 `project.changedAt`(마지막 입력 시각).
    기준일 + 30일부터 사업 카드(사업 목록)의 "삭제"와 홈·현장 더보기의 삭제가 보인다. 현장도 사업 기준일을 쓴다.
  - 입력 초기화: 범위의 사진과 입력을 비운다. 남김 = 범위 맨 위 노드와 그 아래 현장·장소(이름·종류만). 경로·설치 지점·장비·자유 추가는 빠진다
    (설치 지점에서 초기화하면 그 설치 지점은 이름·설치 형태만 남는다). 비운 것은 `trash` 7일. 한 트랜잭션.
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
- 빠진 것 기준(`store.missingItems`): 장소 완료 표시 없음, 랙 전면 없음, 랙 후면도 사유도 없음, 경로 거리 없음.
- 실사 기간이 지난 사업은 "지난 사업"으로 묶기만 하고 입력은 막지 않는다.
- [SA-B] 입력 초기화는 "랙"뿐 아니라 모든 설치 지점 화면 더보기에 둔다(설치 지점 화면이 하나라서). 경로·장비·자유 추가·공사 조건 화면에는 없다.
- [SA-B] 순서만 바꾼 사진은 "안 보낸 사진"으로 세지 않는다. 지운 사진도 세지 않는다.
- [SA-B] 사진 삭제는 휴지통에 넣지 않는다(설계: 바꾸기 전 사진·입력 초기화만 휴지통).
- [SA-D] 보정 기본 4점 위치 = 사진 안쪽 여백 6%. 기울기 슬라이더 ±15°, 기울기는 4점을 직접 맞추지 않을 때만 결과에 들어감. 보정본 JPEG 0.85·긴 변 2560 이하.
- [SA-D] "원래대로"도 사진이 바뀐 것이므로 openCorrector 가 true 를 돌려준다(칸 다시 그리기).
- [SA-D] 창을 열 때 자동 모서리 찾기를 돌린다(`AUTO_ON_OPEN`). 실사진에서 틀리는 일이 잦으면 false 로 바꿔 버튼 전용으로.

## 6. 남긴 TODO
- [SA-B] 폰 확인 전: 길게 눌러 끌기(안드로이드 크롬 길게 누름 메뉴·스크롤과 충돌 여부), 두 손가락 확대, 카메라 앱에서 돌아올 때 크롬이 페이지를 새로 여는지(메모리 부족 시 찍은 사진이 안 들어올 수 있음), EXIF 방향(옆으로 찍은 사진), 갤러리 HEIC 사진.
- [SA-D] 폰 확인 전: 확대경 위치·크기, 점 끌기와 화면 스크롤·당겨서 새로고침 충돌, 모듈 워커 동작(iOS 15 미만·구형 안드로이드는 화면 쪽 계산으로 빠짐), 2560px 적용 시간·메모리, createImageBitmap 방향 옵션, 실제 랙·명판 사진에서 자동 모서리 품질(합성 이미지로만 검사함 — 실사진에서 틀린 값이 자주 나오면 `AUTO_ON_OPEN=false` 로 버튼 전용).
- QR(`tools/qr.js`)은 직접 구현했고 실제 스캐너 확인 전이다. 통합 때 폰으로 한 번 읽어 볼 것.
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
| 장소(전경·문패·손글씨·공사 조건) | `장소_전경_01`, `장소_문패_01`, `장소_손글씨_01`, `장소_공사조건_01` |
| 설치 지점(랙이면 랙 이름, 아니면 설치 지점 이름) | `장소_R-01_전면_01`, `_후면_`, `_근접_`, `_라벨_`, `_함체외관_`, `_함체내부_` |
| 장비 | `장소_R-01_39U-스위치-근접_01` (`-자산스티커`, `-IP화면`; 랙이 아니면 위치 없이 `스위치-근접`, 선반·바닥은 `선반-`·`바닥-`) |
| FDF 행선지 줄 | `장소_R-01_42U-FDF-행선지-<행선지>_01` |
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
  - 값: 항목마다 `at` 이 더 나중인 쪽을 남긴다(같으면 이 기기 값). 여러 줄 항목(VLAN·FDF 행선지)은 줄마다 합친다(한쪽에만 있는 줄도 남긴다 — 지운 줄이 되살아날 수 있음).
  - 없는 노드·사진은 추가, 이 기기에만 있는 것은 그대로(아무것도 지우지 않는다). 있는 사진은 보정본만 더 새것이면 바꾼다.
  - 한 장짜리 칸(랙 전면·후면)에 양쪽이 다른 사진을 넣었으면 두 장이 된다.
- 끝나면 결과(새로 들어온 곳·바뀐 값·새 사진 수)를 보여 주고, 차수가 1이면 2차로 바꿀지 묻는다.

### PPT 장표 순서 (`js/pptx-build.js`, 견본: 설계 폴더 PPT 출력 시뮬)
표지 → 현장마다 [장소마다 (장소 전경 → 공사 조건 → 설치 지점마다 (랙 장표 또는 설치 지점 장표 → 장비 목록(계속) → FDF 행선지 → 장비 근접·라벨) → 자유 추가)] → 그 현장의 경로마다 1장 → 기타 사진.
- 랙 장표: 랙·소형 함체. 전면·후면 사진 + 랙 실장도(위가 높은 U, 연속 빈 칸은 한 줄로 "30~18 빈 칸", 선반·바닥 줄) + 장비 표(U·종류·규격·모델·Hostname·관리 IP·VLAN·망·상태, 같은 규격 FDF·패치판넬이 붙어 있으면 "42~41 · 24C × 2") + 확인 항목·후면·함체·장비 메모 줄.
- 설치 지점 장표(랙이 아닌 형태): 사진 3장 + 설치 정보 + 장비 표(종류·규격·모델·Hostname·관리 IP·상태).
- 사진이 한 장에 안 들어가면 "(계속)" 장표(3×2)로 넘긴다. 장비 표가 넘치면 "장비 목록 (계속)".
- 장비 근접·라벨 장표는 설치 지점마다 그 바로 뒤에 둔다.

### 빈 항목 규칙
- 장표: 장소·랙·설치 지점·경로 장표는 비어도 낸다(사진 자리에 "사진 없음"). 공사 조건은 값·사진이 하나도 없으면 장표를 빼고 장소 정보에 "공사 조건: 입력 없음". 근접·라벨, 자유 추가, FDF 행선지, (계속) 장표는 내용이 있을 때만.
- 표 칸: 채워야 할 값이 비었으면 노란 "미입력", "확인 못 함"도 노랗게. 해당 없는 값은 "—"(예: FDF·UPS 의 Hostname, 트레이 없음일 때 폭·여유). Hostname·관리 IP·망·모델은 스위치·방화벽·라우터·무선컨트롤러·무선 AP·NAC·서버에서만 "미입력", VLAN 은 스위치만. 공사 조건·경로 표는 비면 "미입력"(벽·슬래브 타공·방화구획·문제는 "—").
- 상자 글(장소 정보·확인 항목): 값이 있는 줄만 쓴다. 한 줄도 없으면 "입력 없음". 메모가 비면 메모 상자를 그리지 않는다. 노란 칸이 있으면 랙 장표 아래에 "노란 칸은 현장에서 못 채운 값…" 안내.
- 장소 완료 표시가 없으면 장소 정보에 "완료 표시 전".

### 정한 값 (리버 확인 필요)
- 하단 팀명 `스마트인프라팀/인프라Biz담당`(견본 그대로, `pptx-build.js` 의 TEAM_NAME), 글꼴 맑은 고딕.
- PPT 사진 긴 변 1280px·JPEG 품질 0.72. 크기 어림은 PPT 사진 한 장 180KB 기준.
- 사이트(현장) 단위 VLAN 표·메모·장비 세부(업링크·단말 대수·PoE 등)는 PPT 에 넣지 않고 기록 파일에만 있다.

