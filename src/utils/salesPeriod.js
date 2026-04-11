export function getSalesPeriod() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();

    let start, end;
    if (date <= 10) {
        start = new Date(year, month - 1, 11, 0, 0, 0);
        end = new Date(year, month, 10, 23, 59, 59);
    } else {
        start = new Date(year, month, 11, 0, 0, 0);
        end = new Date(year, month + 1, 10, 23, 59, 59);
    }
    return { start, end };
}

export function getPeriodKey(dateString) {
    const dt = new Date(dateString);
    let y = dt.getFullYear();
    let m = dt.getMonth();
    let d = dt.getDate();
    if (d <= 10) {
        m -= 1;
        if (m < 0) { m = 11; y -= 1; }
    }
    return `${y}-${String(m + 1).padStart(2, '0')}`;
}
