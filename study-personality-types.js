export const STUDY_TYPE_GROUPS = [
  ['원리와 패턴', [
    ['아인슈타인', '한 주제를 여러 날 이어가는 시간이 길수록'],
    ['뉴턴', '가장 많이 공부한 과목의 비중이 높을수록'],
    ['다윈', '여러 과목을 조금씩 반복한 날이 많을수록'],
    ['앨런 튜링', '주력 과목을 여러 세션으로 나눠 공부할수록'],
  ]],
  ['검토와 반복', [
    ['마리 퀴리', '같은 과목을 연속으로 공부한 날이 많을수록'],
    ['갈릴레이', '공부한 날마다 과목을 고르게 분배할수록'],
    ['파스퇴르', '같은 과목을 짧은 세션으로 자주 공부할수록'],
    ['캐서린 존슨', '일별 공부 시간의 차이가 작고 학습일이 많을수록'],
  ]],
  ['연결과 응용', [
    ['다빈치', '공부한 과목이 많고 과목별 시간이 고르게 분산될수록'],
    ['테슬라', '하루에 많은 시간을 몰아서 쓰고 과목도 다양할수록'],
    ['에이다 러브레이스', '여러 과목을 자주 바꾸며 나눠 공부할수록'],
    ['장영실', '여러 과목을 공부한 날과 완료한 세션이 많을수록'],
  ]],
  ['몰입과 루틴', [
    ['라마누잔', '적은 날에 한 과목을 길게 공부할수록'],
    ['파인만', '학습 시간이 여러 날에 나뉘고 세션당 시간이 짧을수록'],
    ['정약용', '학습일이 많고 여러 과목을 여러 날에 나눠 공부할수록'],
    ['세종대왕', '총 학습 시간이 길고 여러 과목과 날짜에 고르게 분배될수록'],
  ]],
];

export function studyRadar(stats) {
  const days = (stats?.days ?? []).slice(0, 7).map(day => Math.max(0, Number(day.seconds) || 0));
  const active = days.filter(seconds => seconds > 0);
  if (!active.length) return [];
  const total = active.reduce((sum, seconds) => sum + seconds, 0);
  const average = total / active.length;
  let streak = 0, longest = 0;
  for (const seconds of days) {
    streak = seconds > 0 ? streak + 1 : 0;
    longest = Math.max(streak, longest);
  }
  const minutes = seconds => Math.floor(seconds / 60);
  const peak = Math.max(...active) / total;
  const subjects = stats.subjectCount;
  const metrics = [
    ['학습일', active.length / 7, `${active.length}일 / 7일`],
    ['총 학습량', total / 25200, `${minutes(total)}분 / 420분`],
    ['일평균', average / 3600, `${minutes(average)}분 / 60분`],
    ['연속 학습', longest / 7, `${longest}일 / 7일`],
    ['시간 분산', (1 - peak) / (1 - 1 / 7), `가장 긴 하루가 전체의 ${Math.round(peak * 100)}%`],
    ['과목 다양성', subjects / 5, Number.isFinite(subjects) ? `${subjects}과목 / 5과목` : '기록 없음'],
  ];
  return metrics.map(([label, ratio, detail]) => ({
    label, detail, score: Number.isFinite(ratio) ? Math.round(Math.min(1, Math.max(0, ratio)) * 100) : null,
  }));
}
