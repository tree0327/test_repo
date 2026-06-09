import { useMemo, useState } from 'react';
import { useSalesData } from '../hooks/useSalesData';
import { supabase } from '../supabaseClient';
import {
  kpiSummary, monthlyTrend, dailySales, byWeekday, byHour, samePeriodCompare,
  cashCardRatio, cardFeeTotal, originalVsFinal, topTransactions, byCustomer,
  forecast, toCSV, filterByRange,
  weeklyTrend, weeksInMonth, dayDetail,
} from '../utils/analytics';
import './AdminDashboard.css';

const won = (n) => `${(Number(n) || 0).toLocaleString()}원`;
const GOAL_KEY = 'admin_monthly_goal';

// 의존성 없는 순수 CSS 막대 차트.
// data: [{ label, value }]
function BarChartLite({ data, color = '#007aff', unit = '원' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="barchart">
      {data.map((d, i) => (
        <div className="barchart-col" key={i}>
          <div className="barchart-track">
            <div
              className="barchart-bar"
              style={{ height: `${(d.value / max) * 100}%`, background: color }}
              title={`${d.label}: ${d.value.toLocaleString()}${unit}`}
            />
          </div>
          <span className="barchart-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const { salesData, loading } = useSalesData();
  const [now] = useState(() => new Date());
  const [goal, setGoal] = useState(() => Number(localStorage.getItem(GOAL_KEY)) || 0);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  const kpi = useMemo(() => kpiSummary(salesData, now), [salesData, now]);
  const trend = useMemo(() => monthlyTrend(salesData, 6, now), [salesData, now]);
  const daily = useMemo(() => dailySales(salesData, now), [salesData, now]);
  const weekday = useMemo(() => byWeekday(salesData), [salesData]);
  const hours = useMemo(() => byHour(salesData), [salesData]);
  const compare = useMemo(() => samePeriodCompare(salesData, now), [salesData, now]);
  const ratio = useMemo(() => cashCardRatio(salesData, 'month', now), [salesData, now]);
  const fee = useMemo(() => cardFeeTotal(salesData, 'all'), [salesData]);
  const ovf = useMemo(() => originalVsFinal(salesData, 'month', now), [salesData, now]);
  const top5 = useMemo(() => topTransactions(salesData, 5), [salesData]);
  const customers = useMemo(() => byCustomer(salesData).slice(0, 10), [salesData]);
  const projected = useMemo(() => forecast(salesData, now), [salesData, now]);
  const weekly = useMemo(() => weeklyTrend(salesData, 8, now), [salesData, now]);
  const monthWeeks = useMemo(() => weeksInMonth(salesData, now), [salesData, now]);
  const [selectedDay, setSelectedDay] = useState(null); // 1~말일 또는 null
  const dayInfo = useMemo(
    () => (selectedDay ? dayDetail(salesData, new Date(now.getFullYear(), now.getMonth(), selectedDay)) : null),
    [salesData, now, selectedDay]
  );

  const rangeSummary = useMemo(() => {
    if (!rangeStart || !rangeEnd) return null;
    const rs = filterByRange(salesData, new Date(rangeStart), new Date(rangeEnd + 'T23:59:59'));
    return { count: rs.length, total: rs.reduce((s, r) => s + (Number(r.final) || 0), 0) };
  }, [salesData, rangeStart, rangeEnd]);

  const goalPct = goal ? Math.round((kpi.thisMonthTotal / goal) * 100) : null;

  const saveGoal = (v) => {
    const n = Number(v) || 0;
    setGoal(n);
    localStorage.setItem(GOAL_KEY, String(n));
  };

  const downloadCSV = () => {
    const csv = toCSV(salesData);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_${now.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="app-container"><p className="empty">불러오는 중...</p></div>;
  }

  // 차트용 데이터 변환
  const trendData = trend.map((t) => ({ label: t.ym.slice(5), value: t.total }));
  const dailyData = daily.map((d) => ({ label: String(d.day), value: d.total }));
  const weekdayData = weekday.map((w) => ({ label: w.weekday, value: w.total }));
  const hourData = hours
    .filter((h) => h.total > 0)
    .map((h) => ({ label: `${h.hour}시`, value: h.total }));
  const weeklyData = weekly.map((w) => ({ label: w.label.split('~')[0], value: w.total }));
  const monthWeeksMax = Math.max(1, ...monthWeeks.map((w) => w.total));
  const ratioTotal = ratio.cash + ratio.card || 1;

  return (
    <div className="admin">
      <div className="admin-top">
        <h1 className="title">관리자 대시보드</h1>
        <button className="btn-logout" onClick={() => supabase.auth.signOut()}>로그아웃</button>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><span>이번 달 총매출</span><strong>{won(kpi.thisMonthTotal)}</strong></div>
        <div className="kpi-card"><span>거래 건수</span><strong>{kpi.count}건</strong></div>
        <div className="kpi-card"><span>건당 평균</span><strong>{won(kpi.avgPerTxn)}</strong></div>
        <div className="kpi-card">
          <span>전월 대비</span>
          <strong className={kpi.momRatePct > 0 ? 'up' : kpi.momRatePct < 0 ? 'down' : ''}>
            {kpi.momRatePct === null ? '—' : `${kpi.momRatePct > 0 ? '▲' : kpi.momRatePct < 0 ? '▼' : ''} ${Math.abs(kpi.momRatePct)}%`}
          </strong>
        </div>
        <div className="kpi-card"><span>누적 총매출</span><strong>{won(kpi.cumulativeTotal)}</strong></div>
        <div className="kpi-card"><span>예상 월매출</span><strong>{won(projected)}</strong></div>
        <div className="kpi-card"><span>최고 매출일</span><strong>{kpi.bestDay ? `${kpi.bestDay.day}일 (${won(kpi.bestDay.total)})` : '—'}</strong></div>
        <div className="kpi-card"><span>최저 매출일</span><strong>{kpi.worstDay ? `${kpi.worstDay.day}일 (${won(kpi.worstDay.total)})` : '—'}</strong></div>
      </div>

      <div className="admin-section">
        <h2>월 목표 달성률</h2>
        <div className="goal-row">
          <input type="number" placeholder="월 목표 금액" value={goal || ''} onChange={(e) => saveGoal(e.target.value)} />
          <span>{goalPct === null ? '목표를 입력하세요' : `${goalPct}% 달성`}</span>
        </div>
        {goalPct !== null && (
          <div className="progress"><div className="progress-bar" style={{ width: `${Math.min(goalPct, 100)}%` }} /></div>
        )}
      </div>

      <div className="admin-section">
        <h2>월별 매출 추이</h2>
        <BarChartLite data={trendData} color="#007aff" />
      </div>

      <div className="admin-section">
        <h2>이번 달 일별 매출</h2>
        <div className="barchart">
          {dailyData.map((d) => {
            const max = Math.max(1, ...dailyData.map((x) => x.value));
            const day = Number(d.label);
            const isSel = selectedDay === day;
            return (
              <div className="barchart-col" key={d.label}>
                <div
                  className={`barchart-track clickable${isSel ? ' selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  title={`${d.label}일: ${d.value.toLocaleString()}원`}
                  onClick={() => setSelectedDay(isSel ? null : day)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedDay(isSel ? null : day);
                    }
                  }}
                >
                  <div
                    className="barchart-bar"
                    style={{ height: `${(d.value / max) * 100}%`, background: isSel ? '#ff9500' : '#34c759' }}
                  />
                </div>
                <span className="barchart-label">{d.label}</span>
              </div>
            );
          })}
        </div>
        {dayInfo && (
          <div className="day-detail">
            <div className="day-detail-head">
              <strong>{now.getMonth() + 1}월 {selectedDay}일</strong>
              <button className="day-detail-close" onClick={() => setSelectedDay(null)} aria-label="닫기">✕</button>
            </div>
            <div className="compare-row">
              <div><span>합계</span><strong>{won(dayInfo.total)}</strong></div>
              <div><span>건수</span><strong>{dayInfo.count}건</strong></div>
              <div><span>현금 {dayInfo.cashPct}%</span><strong>{won(dayInfo.cash)}</strong></div>
              <div><span>카드 {dayInfo.cardPct}%</span><strong>{won(dayInfo.card)}</strong></div>
            </div>
            <ul className="rank-list day-detail-list">
              {dayInfo.items.map((r) => (
                <li key={r.id}>
                  <span>{new Date(r.date).toTimeString().slice(0, 5)} · {r.type}{r.name ? ` · ${r.name}` : ''}</span>
                  <strong>{won(r.final)}</strong>
                </li>
              ))}
              {dayInfo.count === 0 && <li className="muted">거래 없음</li>}
            </ul>
          </div>
        )}
      </div>

      <div className="admin-section">
        <h2>최근 8주 매출 추이</h2>
        <BarChartLite data={weeklyData} color="#5ac8fa" />
      </div>

      <div className="admin-section">
        <h2>이번 달 주차별 매출</h2>
        <ul className="rank-list">
          {monthWeeks.map((w) => (
            <li key={w.label} className="week-row">
              <span className="week-label">{w.label} <em>{w.rangeLabel}</em></span>
              <div className="week-bar-wrap">
                <div className="week-bar" style={{ width: `${(w.total / monthWeeksMax) * 100}%` }} />
              </div>
              <strong>{won(w.total)}</strong>
            </li>
          ))}
        </ul>
      </div>

      <div className="admin-section">
        <h2>요일별 패턴</h2>
        <BarChartLite data={weekdayData} color="#5856d6" />
      </div>

      <div className="admin-section">
        <h2>시간대별 패턴</h2>
        {hourData.length ? <BarChartLite data={hourData} color="#ff9500" /> : <p className="muted">데이터 없음</p>}
      </div>

      <div className="admin-section">
        <h2>동기 대비</h2>
        <div className="compare-row">
          <div><span>이번 달</span><strong>{won(compare.thisMonth)}</strong></div>
          <div><span>전월</span><strong>{won(compare.lastMonth)}</strong></div>
          <div><span>전년 동월</span><strong>{won(compare.lastYear)}</strong></div>
        </div>
      </div>

      <div className="admin-section">
        <h2>현금/카드 비율 (이번 달)</h2>
        <div className="ratio-bar">
          <div className="ratio-cash" style={{ width: `${(ratio.cash / ratioTotal) * 100}%` }} />
          <div className="ratio-card" style={{ width: `${(ratio.card / ratioTotal) * 100}%` }} />
        </div>
        <div className="compare-row">
          <div><span>현금 {ratio.cashPct}%</span><strong>{won(ratio.cash)}</strong></div>
          <div><span>카드 {ratio.cardPct}%</span><strong>{won(ratio.card)}</strong></div>
        </div>
      </div>

      <div className="admin-section">
        <h2>카드 수수료 · 원금 대비 실수령</h2>
        <div className="compare-row">
          <div><span>카드 수수료 총액</span><strong>{won(fee)}</strong></div>
          <div><span>원금 합계(이번달)</span><strong>{won(ovf.original)}</strong></div>
          <div><span>실수령 합계(이번달)</span><strong>{won(ovf.final)}</strong></div>
        </div>
      </div>

      <div className="admin-section">
        <h2>최고 거래 TOP 5</h2>
        <ul className="rank-list">
          {top5.map((r) => (
            <li key={r.id}><span>{r.name || r.type}</span><strong>{won(r.final)}</strong></li>
          ))}
          {top5.length === 0 && <li className="muted">데이터 없음</li>}
        </ul>
      </div>

      <div className="admin-section">
        <h2>고객별 집계 (상위 10)</h2>
        <ul className="rank-list">
          {customers.map((c) => (
            <li key={c.name}><span>{c.name} ({c.count}건)</span><strong>{won(c.total)}</strong></li>
          ))}
          {customers.length === 0 && <li className="muted">고객명이 입력된 기록 없음</li>}
        </ul>
      </div>

      <div className="admin-section">
        <h2>기간 조회 & 내보내기</h2>
        <div className="range-row">
          <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
          <span>~</span>
          <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
        </div>
        {rangeSummary && (
          <p className="muted">기간 합계: {won(rangeSummary.total)} ({rangeSummary.count}건)</p>
        )}
        <button className="btn-csv" onClick={downloadCSV}>전체 CSV 내보내기</button>
      </div>
    </div>
  );
}
