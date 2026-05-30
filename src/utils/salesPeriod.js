// 매출 정산 기간 계산 유틸리티
// 정산 주기: 매월 1일 ~ 다음달 1일 (달력상 한 달)

/**
 * 현재 정산 기간(이번 달 1일 ~ 다음달 1일)을 반환.
 * end 는 미포함 경계(다음달 1일 00:00) — 필터는 `date < end` 로 비교한다.
 * @returns {{ start: Date, end: Date }}
 */
export function getSalesPeriod() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const start = new Date(year, month, 1, 0, 0, 0);     // 이번 달 1일
    const end = new Date(year, month + 1, 1, 0, 0, 0);   // 다음 달 1일 (미포함)
    return { start, end };
}

/**
 * 주어진 날짜가 속한 정산월 키("YYYY-MM"). 달력상 연-월을 그대로 사용.
 * @param {string} dateString
 * @returns {string}
 */
export function getPeriodKey(dateString) {
    const dt = new Date(dateString);
    const y = dt.getFullYear();
    const m = dt.getMonth();
    return `${y}-${String(m + 1).padStart(2, '0')}`;
}
