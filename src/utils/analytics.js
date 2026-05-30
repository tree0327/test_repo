// 매출 집계 순수 함수 모음. 정산월 = 달력월(1일~말일).
// 레코드: { id, type:'현금'|'카드', original, final, name, date(ISO) }

const ymOf = (dateStr) => {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const ymOfDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);

export function filterByRange(records, start, end) {
  return records.filter((r) => {
    const t = new Date(r.date).getTime();
    return t >= start.getTime() && t < end.getTime();
  });
}

function scopeRecords(records, scope, now = new Date()) {
  if (scope === 'all' || !scope) return records;
  const ym = ymOfDate(now);
  return records.filter((r) => ymOf(r.date) === ym);
}

export function kpiSummary(records, now = new Date()) {
  const ym = ymOfDate(now);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYm = ymOfDate(prev);
  const thisMonth = records.filter((r) => ymOf(r.date) === ym);
  const lastMonth = records.filter((r) => ymOf(r.date) === prevYm);
  const thisMonthTotal = sum(thisMonth, (r) => r.final);
  const lastMonthTotal = sum(lastMonth, (r) => r.final);
  const count = thisMonth.length;
  const avgPerTxn = count ? Math.round(thisMonthTotal / count) : 0;
  const momRatePct = lastMonthTotal
    ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100)
    : null;
  const cumulativeTotal = sum(records, (r) => r.final);
  const byDay = {};
  for (const r of thisMonth) {
    const day = new Date(r.date).getDate();
    byDay[day] = (byDay[day] || 0) + (Number(r.final) || 0);
  }
  const days = Object.entries(byDay).map(([d, t]) => ({ day: Number(d), total: t }));
  const bestDay = days.length ? days.reduce((a, b) => (b.total > a.total ? b : a)) : null;
  const worstDay = days.length ? days.reduce((a, b) => (b.total < a.total ? b : a)) : null;
  return { thisMonthTotal, lastMonthTotal, count, avgPerTxn, momRatePct, cumulativeTotal, bestDay, worstDay };
}

export function monthlyTrend(records, monthsBack = 6, now = new Date()) {
  const out = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = ymOfDate(d);
    const inMonth = records.filter((r) => ymOf(r.date) === ym);
    out.push({
      ym,
      total: sum(inMonth, (r) => r.final),
      cash: sum(inMonth.filter((r) => r.type === '현금'), (r) => r.final),
      card: sum(inMonth.filter((r) => r.type === '카드'), (r) => r.final),
    });
  }
  return out;
}

export function dailySales(records, now = new Date()) {
  const ym = ymOfDate(now);
  const inMonth = records.filter((r) => ymOf(r.date) === ym);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const out = [];
  for (let day = 1; day <= last; day++) {
    const t = sum(inMonth.filter((r) => new Date(r.date).getDate() === day), (r) => r.final);
    out.push({ day, total: t });
  }
  return out;
}

export function byWeekday(records) {
  const names = ['일', '월', '화', '수', '목', '금', '토'];
  const totals = Array(7).fill(0);
  const counts = Array(7).fill(0);
  for (const r of records) {
    const w = new Date(r.date).getDay();
    totals[w] += Number(r.final) || 0;
    counts[w] += 1;
  }
  return names.map((weekday, i) => ({
    weekday,
    total: totals[i],
    avg: counts[i] ? Math.round(totals[i] / counts[i]) : 0,
  }));
}

export function byHour(records) {
  const totals = Array(24).fill(0);
  for (const r of records) {
    const h = new Date(r.date).getHours();
    totals[h] += Number(r.final) || 0;
  }
  return totals.map((total, hour) => ({ hour, total }));
}

export function samePeriodCompare(records, now = new Date()) {
  const ym = ymOfDate(now);
  const lastM = ymOfDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastY = ymOfDate(new Date(now.getFullYear() - 1, now.getMonth(), 1));
  const tot = (k) => sum(records.filter((r) => ymOf(r.date) === k), (r) => r.final);
  return { thisMonth: tot(ym), lastMonth: tot(lastM), lastYear: tot(lastY) };
}

export function cashCardRatio(records, scope = 'all', now = new Date()) {
  const rs = scopeRecords(records, scope, now);
  const cash = sum(rs.filter((r) => r.type === '현금'), (r) => r.final);
  const card = sum(rs.filter((r) => r.type === '카드'), (r) => r.final);
  const total = cash + card;
  return {
    cash, card,
    cashPct: total ? Math.round((cash / total) * 100) : 0,
    cardPct: total ? Math.round((card / total) * 100) : 0,
  };
}

export function cardFeeTotal(records, scope = 'all', now = new Date()) {
  const rs = scopeRecords(records, scope, now);
  return sum(rs.filter((r) => r.type === '카드'), (r) => (Number(r.original) || 0) - (Number(r.final) || 0));
}

export function originalVsFinal(records, scope = 'all', now = new Date()) {
  const rs = scopeRecords(records, scope, now);
  return { original: sum(rs, (r) => r.original), final: sum(rs, (r) => r.final) };
}

export function topTransactions(records, n = 5) {
  return [...records].sort((a, b) => (Number(b.final) || 0) - (Number(a.final) || 0)).slice(0, n);
}

export function byCustomer(records) {
  const map = new Map();
  for (const r of records) {
    const name = (r.name || '').trim();
    if (!name) continue;
    const cur = map.get(name) || { name, total: 0, count: 0 };
    cur.total += Number(r.final) || 0;
    cur.count += 1;
    map.set(name, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function forecast(records, now = new Date()) {
  const ym = ymOfDate(now);
  const inMonth = records.filter((r) => ymOf(r.date) === ym);
  const total = sum(inMonth, (r) => r.final);
  const today = now.getDate();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (today === 0) return total;
  return Math.round((total / today) * last);
}

export function toCSV(records) {
  const header = ['id', 'date', 'type', 'original', 'final', 'name'];
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(',')];
  for (const r of records) {
    lines.push([r.id, r.date, r.type, r.original, r.final, r.name].map(escape).join(','));
  }
  return lines.join('\n');
}
