import { useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useSalesData } from '../hooks/useSalesData';
import { supabase } from '../supabaseClient';
import {
  kpiSummary, monthlyTrend, dailySales, byWeekday, byHour, samePeriodCompare,
  cashCardRatio, cardFeeTotal, originalVsFinal, topTransactions, byCustomer,
  forecast, toCSV, filterByRange,
} from '../utils/analytics';
import './AdminDashboard.css';

const won = (n) => `${(Number(n) || 0).toLocaleString()}원`;
const GOAL_KEY = 'admin_monthly_goal';

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

  const PIE = ['#34c759', '#007aff'];

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
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trend}>
            <XAxis dataKey="ym" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={50} />
            <Tooltip formatter={(v) => won(v)} />
            <Bar dataKey="total" fill="#007aff" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="admin-section">
        <h2>이번 달 일별 매출</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={daily}>
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} width={50} />
            <Tooltip formatter={(v) => won(v)} />
            <Line type="monotone" dataKey="total" stroke="#34c759" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="admin-section">
        <h2>요일별 패턴</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={weekday}>
            <XAxis dataKey="weekday" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} width={50} />
            <Tooltip formatter={(v) => won(v)} />
            <Bar dataKey="total" fill="#5856d6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="admin-section">
        <h2>시간대별 패턴</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={hours}>
            <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} width={50} />
            <Tooltip formatter={(v) => won(v)} />
            <Bar dataKey="total" fill="#ff9500" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
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
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={[{ name: '현금', value: ratio.cash }, { name: '카드', value: ratio.card }]}
                 dataKey="value" nameKey="name" outerRadius={70} label>
              {PIE.map((c, i) => <Cell key={i} fill={c} />)}
            </Pie>
            <Tooltip formatter={(v) => won(v)} />
          </PieChart>
        </ResponsiveContainer>
        <p className="muted">현금 {ratio.cashPct}% · 카드 {ratio.cardPct}%</p>
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
          {top5.map((r, i) => (
            <li key={r.id}><span>{i + 1}. {r.name || r.type}</span><strong>{won(r.final)}</strong></li>
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
