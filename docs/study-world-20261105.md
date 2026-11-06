# 2.5D 공부방 · 친구 초대 · 채팅

플레이 탭에 아이소메트릭 8×8 공부방을 추가했습니다. 기존 아바타와 장비를 사용하며 바닥 클릭·터치 또는 방향키/WASD로 가구를 피해 이동합니다.

- 방 꾸미기: 책상·책장·의자·화분·스탠드·소파·러그·작은 테이블. 선택 후 빈 바닥으로 이동, 회전, 보관. 가구는 무료이며 최대 32개입니다.
- 테마: 초록 서재·햇살 원목·달빛 서재. `방 저장`으로 현재 위치와 배치를 계정에 저장합니다. `변경 취소`는 마지막 저장 상태로 복원합니다.
- 친구 초대: 방 주인이 기존 친구에게 초대합니다. 초대는 30분 유효하며 플레이 탭의 받은 초대에서 입장·거절합니다. 수정 중인 방은 저장하거나 취소한 뒤 방문합니다.
- 방문: 주인 포함 최대 8명. 친구도 자신의 아바타로 이동하며 가구 편집은 주인만 가능합니다. 주인은 친구를 내보낼 수 있고 방문자는 `내 방으로` 돌아갑니다.
- 채팅: 현재 방 참여자만 송수신. 1~300자, 1.5초 전송 간격, 메시지 ID로 재시도 중복 방지. 최근 24시간 내 최대 50개를 응답·저장하며 다음 동기화 때 오래된 메시지를 정리합니다. 사용자 텍스트는 textContent로 출력합니다.
- 위치·채팅 동기화: 화면이 보이는 동안 0.5초마다 요청합니다. 이전 동기화가 진행 중이면 다음 요청은 건너뛰어 중복 실행을 막습니다. 초대 목록은 15초마다 확인합니다. 45초 동안 접속 신호가 없으면 방 참여 권한이 만료되어 방문자는 새 초대가 필요합니다. 탭 이동 시 참여를 종료합니다.

## 서버와 배포

`functions/study-room.js`는 프런트와 서버가 함께 사용하는 배치 검증·길찾기 규칙입니다. `functions/study-world-service.js`는 트랜잭션 안에서 친구 관계·초대·참여 권한·정원·위치·채팅을 확인합니다.

저장 위치는 `users/{uid}.studyRoom`, `users/{uid}/studyWorldInvites/{host}`, `studyWorlds/{host}`입니다. 새 컬렉션의 클라이언트 직접 접근은 기존 Firestore 기본 거부 규칙으로 차단됩니다. 공부방 데이터는 기존 친구 공개 프로필 응답에 추가하지 않습니다.

정적 파일과 서버 코드를 함께 배포해야 합니다. 실제 운영 배포 원본은 인접 `multi server`의 `apps/study/web`, `apps/study/backend`이며 서버 전용 어댑터를 유지합니다. 브라우저용 공용 모듈 허용 목록에 `study-room.js`를 추가했습니다. Firebase Functions 환경이라면 `getPlayProfile`, `updatePlayProfile`, `updateStudyWorld`, `getStudyWorldInvites`를 갱신해야 합니다.

2026-11-05 16:18 KST에 기존 서명·백업 절차로 `0.1.5-study-world-20261105-r1`을 운영 서버에 배포했습니다. 웹·서버와 0.5초 동기화를 함께 반영했습니다. 적용 후 활성 릴리스 일치, `busy=false`, `lastError=null`, Study·Word readiness와 네 프로세스 정상 실행을 확인했습니다.

## 검증

- `node --test tests/study-world.test.mjs tests/play.test.mjs tests/avatar-rpg.test.mjs tests/navigation-ui.test.mjs tests/social-ui.test.mjs`
- `node scripts/test-study-world-browser.mjs`: 실제 Edge 두 컨텍스트와 인메모리 서버 저장소로 배치·회전·저장 후 재로드·초대·방문 권한·채팅·HTML 이스케이프·위치 공유·내보내기·320/390/768px 화면을 확인합니다. 테스트 서버만 사용하며 운영 계정이나 데이터는 사용하지 않습니다.
- 화면 캡처: `tmp/study-world/host.png`, `tmp/study-world/guest.png`.

배포 패키지의 통합 테스트 77개와 서명·해시 검증이 통과했습니다. 공개 Study·Word·메인 페이지, 자체 서버 health, 인증 없는 API 차단도 확인했습니다. 공개 공부방 관련 파일 6개가 검증된 개발 소스와 바이트 단위로 일치하며 모바일 공개 페이지·공부방 모듈이 런타임 오류와 가로 넘침 없이 초기화됩니다. 운영 계정 로그인 및 실제 사용자끼리의 대화는 대신 수행하지 않았습니다. 음성·영상 통화는 포함하지 않습니다.

배포 기록: `tmp/study-world/build-release.log`, `tmp/study-world/deploy-release.log`. 공개 검증: `node scripts/verify-study-world-public.mjs`.
