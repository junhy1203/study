# 등록 중 실제 얼굴 각도 갱신 수정

운영 배포 완료: `0.1.5-face-angle-20261105-r1`.

## 원인과 변경

`applyResult`가 등록 중인 결과의 `identityPhase`를 먼저 `enrolling`으로 설정한 뒤, 재인증 게이트의 `required=true`를 보고 다시 `checking`으로 덮어썼다. 따라서 등록 전용 80ms 간격은 첫 결과 이후 유지되지 않고 일반 400ms 간격으로 되돌아갔다. 이전 카메라 단위 테스트는 `applyResult`를 대체하고 있었으며, 모델 단독 테스트는 실제 카메라 제어기를 실행하지 않아 이 문제를 놓쳤다.

- 등록 중에는 재인증 표시가 등록 상태를 덮어쓰지 않게 수정했다. 등록이 완료된 뒤에는 기존 재인증 게이트로 진입한다.
- 등록 중 지원되는 브라우저에서는 `requestVideoFrameCallback`으로 새 카메라 프레임을 직접 받는다. 별도 80ms 타이머와 카메라 프레임 주기가 어긋나 생기던 누락을 줄였다. 미지원 환경은 기존 80ms 방식으로 동작한다.
- 이미 분석 중이면 새 작업을 쌓지 않는다. 같은 영상 프레임을 중복 분석하지 않으며, 종료·숨김·복귀 시 예약된 콜백을 취소한다.
- 각도 이벤트에 원본 프레임의 요청 시각을 포함해 카메라 캡처부터 원시 각도 수신까지 지연을 측정할 수 있게 했다.

얼굴 모델, 추론 방식, 영상 해상도와 카메라 프레임 설정, 특징 추출·수집 간격, 18개 각도, 6초 보완 수집, 품질·일치 기준은 변경하지 않았다. 애니메이션 보간값은 측정이나 얼굴 판정에 사용하지 않는다.

## 실제 제어 경로 비교

동일한 공개 참고 사진으로 만든 960×720, 10fps 합성 카메라 스트림을 사용했다. 실제 `camera.js`, 영상 캡처, Worker, 얼굴 모델을 실행했다. 계정 서버 부분만 대체했고 프로필을 저장하지 않았다.

| 항목 | 이전 배포 원본 | 최종 공개 배포본 |
|---|---:|---:|
| 등록 중 상태 | 잘못된 checking | enrolling 유지 |
| 보간 전 원시 각도 수신 | 초당 2.39회 | 초당 9.99회 |
| 수신 간격 p95 | 407.3ms | 110.2ms |
| 캡처→각도 수신 지연 p95 | 23.5ms | 23.0ms |

병목은 모델 실행 시간보다 제어기의 불필요한 400ms 대기였다. 최종 공개 코드에서는 5초 동안 새 각도 50개를 수신했다. 실제 사용자 기기나 모든 브라우저를 물리적으로 측정한 결과는 아니다.

## 회귀·배포 검증

- 전체 단위 테스트 370개 통과. 실제 `applyResult`와 포커스·재인증 정책을 함께 실행해 등록 상태 유지, 등록 완료 후 재인증 진입, 작업 중복 방지, 프레임 콜백 취소를 검증한다.
- 등록·암호화 저장·재시도·재인식 브라우저 테스트 통과.
- 서버 테스트 69개 및 서명·패키지 해시 검증 통과.
- 공개 자산 11개의 SHA-256이 검증본과 일치했다. 브라우저 초기화 오류가 없고 공개 서비스 상태 검사도 통과했다.
- 새 운영 릴리스 활성화, busy=false, lastError=null, 모든 프로세스 실행 및 Study·Word readiness 정상을 확인했다.

로그: `.codex-face-angle-baseline.log`, `.codex-face-angle-controller-browser.log`, `.codex-face-angle-public-controller.log`, `.codex-face-angle-unit.log`, `.codex-face-angle-browser.log`, `.codex-face-angle-build.log`, `.codex-face-angle-deploy.log`, `.codex-face-angle-public.log`.

재현 스크립트: `scripts/test-face-angle-controller.mjs`. 공개 자산 검증은 `STUDY_FACE_ANGLE_PUBLIC=1`, 이전 제어기 비교는 `STUDY_FACE_ANGLE_BASELINE=1`로 실행한다. 이전 제어기 파일은 `STUDY_FACE_ANGLE_BASELINE_SOURCE`로 지정하거나 로컬 `.codex-face-angle-deploy-backup/camera.js`를 사용한다.
