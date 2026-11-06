# 액세서리 추가 및 서버 배포

- 서비스: https://study.junhyuk.site
- 활성 릴리스: `0.1.5-avatar-accessory-20261106-r2`
- 배포 완료: 2026-11-06 09:55 KST

## 반영 내용

- 새 슬롯과 탭 이름: **액세서리**.
- 없음 1종 + 유료 24종. 일반·레어·에픽·레전드·신화 등급 구성.
- 신화 액세서리: 칠색 다이아 세라핌(333시간), 무지개 은하룡(999시간), 샤라랑 우주 한 조각(9,999시간).
- 이전 작업의 신화 10종도 함께 배포되어 전체 신화 아이템은 13종.
- 일반 아바타 및 친구 탭: 아바타 오른쪽에서 작은 상하 움직임으로 떠 있는 액세서리.
- 가상 공간: 각 참여자의 오른쪽을 별도 레이어로 부드럽게 추적. 장착 변경·해제·퇴장·종료 시 갱신 및 제거.
- 기존 액세서리 없는 프로필과 호환. 서버에서 판매 항목·보유권 검증.
- 움직임 줄이기 설정에서는 액세서리 애니메이션과 추적 전환 제거.

## 검증 결과

- 배포 워크스페이스 전체 테스트 94개 통과.
- PC·모바일 브라우저: 25종 미리보기, 6개 분류의 신화 진열, 장착·해제, 친구 카드 갱신, 추적·퇴장 정리 확인.
- 기존 2인 가상 공간: 이동·채팅·이모트·가위바위보·반응형 레이아웃 회귀 검증 통과.
- 공개 서버에서도 액세서리 브라우저 검증 통과. SVG 및 런타임 오류 없음.
- 공개 자산 10개의 SHA-256이 검증한 로컬 소스와 일치.
- 서명 및 패키지 해시 검증 통과. 서버 busy=false, lastError=null, 두 API ready=true, 네 프로세스 정상.
- Study·Word·Main 및 API 공개 상태 검증 통과.
- 로그인 사용자의 실제 잔액을 사용한 구매는 수행하지 않음.

## 재검증

`node scripts/verify-avatar-accessories-public.mjs`

PowerShell: `$env:AVATAR_BASE='https://study.junhyuk.site'; node scripts/test-avatar-accessories-browser.mjs`

시각 자료: `tmp/features-ui/accessory-collection.png`, `accessory-friend.png`, `accessory-shop-mobile.png`, `accessory-world.png`.
