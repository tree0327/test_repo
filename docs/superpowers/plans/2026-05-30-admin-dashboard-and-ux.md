# 관리자 대시보드 + 사용성 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 직원은 매출을 입력하고 관리자(role=admin)는 18종 분석 대시보드로 추이를 보는 역할 분리 앱으로 개선하고, 입력 편의성/안정성/코드품질/기간표시를 정리한다.

**Architecture:** 집계는 `src/utils/analytics.js` 순수 함수로 분리(TDD). 로그인 후 `user_metadata.role`로 `Root.jsx`에서 관리자/직원 화면 분기. 관리자 대시보드는 Recharts로 시각화. 직원 화면은 날짜 입력/에러배너/코드분리 추가. 정산 기간 표시만 "1일~말일"로 수정(집계 로직 불변).

**Tech Stack:** Vite, React 19, @supabase/supabase-js, Recharts, gh-pages. 테스트는 node ESM 스크립트(순수함수) + npm run build + eslint.

---

## File Structure

- `src/utils/salesPeriod.js` (수정) — 표시용 말일 라벨 헬퍼 추가.
- `src/utils/analytics.js` (생성) — 모든 집계 순수 함수.
- `src/App.jsx` (수정) — 하단 기간표시 말일, 에러배너, 날짜입력 연결.
- `src/hooks/useSalesData.js` (수정) — add/update에 date 인자.
- `src/components/InputModal.jsx` (수정) — 날짜 input.
- `src/components/RecordItem.jsx` (생성) — RecordModal에서 분리.
- `src/components/FilterButtons.jsx` (생성) — RecordModal에서 분리.
- `src/components/RecordModal.jsx` (수정) — 분리된 컴포넌트 사용.
- `src/components/AdminDashboard.jsx` (생성) — 관리자 화면 컨테이너.
- `src/components/admin/*.jsx` (생성) — KPI/차트 섹션 컴포넌트.
- `src/components/AdminDashboard.css`, `src/components/admin/*.css` (생성).
- `src/Root.jsx` (수정) — role 분기.
- 관리자 계정: Supabase Auth (MCP/대시보드).

전제: Supabase MCP 권한(현재 동작 중). Recharts npm 설치.

---

## Task 1: 정산 기간 표시를 "1일 ~ 말일"로 변경

**Files:**
- Modify: `src/utils/salesPeriod.js`
- Modify: `src/App.jsx`
- Test: `tmp/period_label_test.mjs` (임시)

- [ ] **Step 1: 실패 테스트 작성** (`tmp/period_label_test.mjs`)

```js
import { getPeriodEndDay } from '../src/utils/salesPeriod.js';

// getPeriodEndDay(start) = 해당 월의 말일 Date 반환
const cases = [
  ['2024-01-01', 31],
  ['2024-02-01', 29], // 윤년
  ['2025-02-01', 28],
  ['2024-04-01', 30],
];
let fail = 0;
for (const [iso, expectedDay] of cases) {
  const d = getPeriodEndDay(new Date(iso));
  const ok = d.getDate() === expectedDay;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${iso} -> ${d.getDate()} (expect ${expectedDay})`);
  if (!ok) fail++;
}
console.log(`\n${cases.length - fail} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: 실패 확인**

Run: `cd "C:\Users\User\OneDrive\문서\test_repo" && node tmp/period_label_test.mjs`
Expected: `getPeriodEndDay is not a function` 류 실패.

- [ ] **Step 3: salesPeriod.js에 헬퍼 추가**

`src/utils/salesPeriod.js` 끝에 추가:
```js
/**
 * 정산월의 말일 Date 반환(표시용). start = 해당 월 1일.
 * 다음달 1일에서 하루 뺀 날 = 이번 달 말일.
 * @param {Date} start
 * @returns {Date}
 */
export function getPeriodEndDay(start = new Date()) {
    const y = start.getFullYear();
    const m = start.getMonth();
    return new Date(y, m + 1, 0); // day 0 = 전월(=이번달) 말일
}
```

- [ ] **Step 4: 통과 확인**

Run: `node tmp/period_label_test.mjs`
Expected: `4 PASS / 0 FAIL`.

- [ ] **Step 5: App.jsx 하단 표시 말일로 변경**

`src/App.jsx` 상단 import 에 `getPeriodEndDay` 추가:
```js
import { getSalesPeriod, getPeriodEndDay } from './utils/salesPeriod';
```
(현재 `import { getSalesPeriod } from './utils/salesPeriod';` 를 위로 교체)

기간 표시 부분:
```jsx
        <span className="period-range">{formatPeriodDate(period.start)} ~ {formatPeriodDate(period.end)}</span>
```
를:
```jsx
        <span className="period-range">{formatPeriodDate(period.start)} ~ {formatPeriodDate(getPeriodEndDay(period.start))}</span>
```

- [ ] **Step 6: 빌드 + 정리 + 커밋**

Run: `npm run build` (Expected: ✓ built)
```bash
rm -rf tmp
git add src/utils/salesPeriod.js src/App.jsx
git commit -m "feat: 누적매출 기간 표시를 1일~말일로 변경"
```

---

## Task 2: analytics.js 집계 순수 함수 (TDD)

**Files:**
- Create: `src/utils/analytics.js`
- Test: `tmp/analytics_test.mjs` (임시)

레코드 형태: `{ id, type:'현금'|'카드', original:number, final:number, name:string, date:ISOstring }`

- [ ] **Step 1: 실패 테스트 작성** (`tmp/analytics_test.mjs`)

```js
import {
  kpiSummary, monthlyTrend, cashCardRatio, cardFeeTotal,
  topTransactions, byCustomer, toCSV, filterByRange, forecast,
} from '../src/utils/analytics.js';

const recs = [
  { id:'1', type:'현금', original:10000, final:10000, name:'A', date:'2026-05-02T10:00:00Z' },
  { id:'2', type:'카드', original:10000, final:9000,  name:'B', date:'2026-05-10T13:00:00Z' },
  { id:'3', type:'카드', original:20000, final:18000, name:'A', date:'2026-04-15T09:00:00Z' },
];
const now = new Date('2026-05-15T00:00:00Z');
let fail = 0;
const check = (label, got, expected) => {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(`${ok?'PASS':'FAIL'} ${label} -> ${JSON.stringify(got)}${ok?'':' expected '+JSON.stringify(expected)}`);
  if (!ok) fail++;
};

const kpi = kpiSummary(recs, now);
check('kpi.thisMonthTotal', kpi.thisMonthTotal, 19000);   // 10000+9000
check('kpi.count', kpi.count, 2);
check('kpi.cumulativeTotal', kpi.cumulativeTotal, 37000); // 10000+9000+18000

check('cashCardRatio.cash', cashCardRatio(recs, 'all').cash, 10000);
check('cashCardRatio.card', cashCardRatio(recs, 'all').card, 27000);
check('cardFeeTotal', cardFeeTotal(recs, 'all'), 3000);   // (10000-9000)+(20000-18000)

check('topTransactions[0].final', topTransactions(recs,1)[0].final, 18000);
check('byCustomer A total', byCustomer(recs).find(c=>c.name==='A').total, 28000);

const range = filterByRange(recs, new Date('2026-04-01'), new Date('2026-05-01'));
check('filterByRange count', range.length, 1);

const csv = toCSV([recs[0]]);
check('csv has header', csv.split('\\n')[0].includes('date'), true);

console.log(`\n${fail===0?'ALL PASS':fail+' FAIL'}`);
process.exit(fail?1:0);
```

- [ ] **Step 2: 실패 확인**

Run: `cd "C:\Users\User\OneDrive\문서\test_repo" && node tmp/analytics_test.mjs`
Expected: 모듈 없음으로 실패.

- [ ] **Step 3: analytics.js 구현**

```js
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
  // 'month' = 이번 정산월
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
  // 일별 최고/최저(이번 달)
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
```

- [ ] **Step 4: 통과 확인**

Run: `node tmp/analytics_test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: 정리 + 커밋**

```bash
rm -rf tmp
git add src/utils/analytics.js
git commit -m "feat: 매출 집계 순수 함수(analytics) 추가 + 유닛테스트 통과"
```

---

## Task 3: 날짜 지정 입력 (InputModal + useSalesData)

**Files:**
- Modify: `src/hooks/useSalesData.js`
- Modify: `src/components/InputModal.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: useSalesData add/update에 date 인자 추가**

`src/hooks/useSalesData.js` 의 `addRecord` 시그니처와 date 처리:
```js
  const addRecord = useCallback(
    async (type, originalAmount, name = '', dateISO = null) => {
      const original = Number(originalAmount) || 0;
      const record = {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()),
        type,
        original,
        final: computeFinal(type, original),
        name: (name || '').trim(),
        date: dateISO || new Date().toISOString(),
      };
      persist((prev) => [record, ...prev]);
      const { error: insErr } = await supabase.from(RECORDS_TABLE).insert(record);
      if (insErr) {
        setError(insErr.message);
        persist((prev) => prev.filter((r) => r.id !== record.id));
      } else {
        setError(null);
      }
    },
    [persist]
  );
```

`updateRecord` 에 dateISO 추가:
```js
  const updateRecord = useCallback(
    async (id, type, newOriginalAmount, name = '', dateISO = null) => {
      const original = Number(newOriginalAmount) || 0;
      const patch = {
        type,
        original,
        final: computeFinal(type, original),
        name: (name || '').trim(),
      };
      if (dateISO) patch.date = dateISO;
      let snapshot;
      persist((prev) => {
        snapshot = prev;
        return prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      });
      const { error: updErr } = await supabase
        .from(RECORDS_TABLE)
        .update(patch)
        .eq('id', id);
      if (updErr) {
        setError(updErr.message);
        if (snapshot) persist(snapshot);
      } else {
        setError(null);
      }
    },
    [persist]
  );
```

- [ ] **Step 2: InputModal에 날짜 input 추가**

`src/components/InputModal.jsx` 의 state에 추가(상단 useState 부근):
```js
  const [date, setDate] = useState('');
```
`useEffect`의 `if (isOpen)` 블록에서 초기화:
```js
    if (isOpen) {
      if (initialData) {
        const val = String(initialData.original || '');
        setAmount(val);
        setDisplayAmount(val ? Number(val).toLocaleString() : '');
        setName(initialData.name || '');
        setDate(initialData.date ? initialData.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
      } else {
        setAmount('');
        setDisplayAmount('');
        setName('');
        setDate(new Date().toISOString().slice(0, 10));
      }
    }
```
폼에 날짜 input 추가(고객명 input-group 위에):
```jsx
        <div className="input-group">
          <label>날짜</label>
          <input
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
```
저장 시 date 전달:
```js
  const handleSave = () => {
    if (!amount) {
      showAlert('알림', '금액을 입력해주세요!');
      return;
    }
    const dateISO = date ? new Date(date + 'T12:00:00').toISOString() : null;
    onSave(initialType, Number(amount), name, dateISO);
    onClose();
  };
```

- [ ] **Step 3: App.jsx 핸들러에 date 전달**

`src/App.jsx` 의 `handleSaveSales`:
```js
  const handleSaveSales = (type, amount, name, dateISO) => {
    if (modalState.isEdit) {
      updateRecord(modalState.editId, type, amount, name, dateISO);
    } else {
      addRecord(type, amount, name, dateISO);
    }
  };
```
편집 진입 시 기존 날짜 전달 — `handleEditFromRecord` 와 RecordModal onEdit는 originalAmount/name만 넘기므로, initialData에 date 포함하도록 `openInputModal` 호출부 보강:
```js
  const handleEditFromRecord = (type, id, originalAmount, name, dateISO) => {
    openInputModal(type, true, id, { original: originalAmount, name, date: dateISO });
  };
```

- [ ] **Step 4: RecordItem onEdit가 날짜도 넘기도록 (Task 5에서 분리 후 반영)**

주의: 이 시점엔 RecordModal이 아직 `onEdit(item.type, item.id, item.original, item.name)` 만 호출. Task 5 분리 시 `item.date` 인자를 추가한다. 지금은 date 미전달이어도 InputModal이 오늘로 기본 처리하므로 빌드는 통과.

- [ ] **Step 5: 빌드 + 커밋**

Run: `npm run build` (Expected: ✓ built)
```bash
git add src/hooks/useSalesData.js src/components/InputModal.jsx src/App.jsx
git commit -m "feat: 매출 입력 시 날짜 지정(과거 매출) 지원"
```

---

## Task 4: 에러/오프라인/로딩 배너 (App.jsx)

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.css`

- [ ] **Step 1: App.jsx에서 error/loading 사용 + 배너 렌더**

`useSalesData` 구조분해에 추가:
```js
  const { salesData, addRecord, updateRecord, deleteRecord, backupLocalToDb, loading, error } =
    useSalesData();
```
`return` 의 `app-container` 최상단(`top-bar` 위)에 배너:
```jsx
      {error && <div className="status-banner error">저장 중 문제가 발생했습니다: {error}</div>}
      {loading && <div className="status-banner info">동기화 중…</div>}
```

- [ ] **Step 2: App.css에 배너 스타일 추가**

`src/App.css` 끝에:
```css
.status-banner {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 12px;
  text-align: center;
}
.status-banner.error {
  background: #fef2f2;
  color: #ef4444;
  border: 1px solid #fecaca;
}
.status-banner.info {
  background: #eff6ff;
  color: var(--primary);
  border: 1px solid #bfdbfe;
}
```

- [ ] **Step 3: 빌드 + 커밋**

Run: `npm run build` (Expected: ✓ built)
```bash
git add src/App.jsx src/App.css
git commit -m "feat: 저장 실패/동기화 상태 배너 표시"
```

---

## Task 5: RecordModal 내부 컴포넌트 분리 (코드 정리)

**Files:**
- Create: `src/components/RecordItem.jsx`
- Create: `src/components/FilterButtons.jsx`
- Modify: `src/components/RecordModal.jsx`

- [ ] **Step 1: FilterButtons.jsx 생성**

```jsx
export default function FilterButtons({ activeFilter, onFilterChange }) {
  return (
    <div className="filter-buttons">
      {['전체', '현금', '카드'].map((f) => (
        <button
          key={f}
          className={`filter-btn ${activeFilter === f ? 'active' : ''} ${
            f === '현금' ? 'cash-filter' : f === '카드' ? 'card-filter' : ''
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onFilterChange(f);
          }}
        >
          {f}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: RecordItem.jsx 생성**

```jsx
function formatDateTime(isoString) {
  const dt = new Date(isoString);
  return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')} ${String(
    dt.getHours()
  ).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

export default function RecordItem({ item, showActions = true, onEdit, onDelete }) {
  return (
    <div className="record-item">
      <div className="record-row">
        <div className="type-info">
          <span className={`type-badge ${item.type === '현금' ? 'cash' : 'card'}`}>{item.type}</span>
          {item.name && <span className="customer-name">{item.name}</span>}
        </div>
        <span className="final-amt">{item.final.toLocaleString()}원</span>
      </div>
      <div className="sub-row">
        <span>
          {formatDateTime(item.date)}
          {item.type === '카드' ? ` (원금: ${item.original.toLocaleString()}원, 수수료 10% 차감)` : ''}
        </span>
        {showActions && (
          <div className="action-btns">
            <button
              className="action-btn btn-edit"
              onClick={() => onEdit(item.type, item.id, item.original, item.name, item.date)}
            >
              수정
            </button>
            <button className="action-btn btn-delete" onClick={() => onDelete(item.id)}>
              삭제
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: RecordModal.jsx에서 내부 정의 제거하고 import 사용**

상단 import 추가:
```js
import FilterButtons from './FilterButtons';
import RecordItem from './RecordItem';
```
파일 내부의 `formatDateTime`, `const FilterButtons = ...`, `const RecordItem = ...` 정의를 **삭제**.
기존 사용처에서 `<RecordItem key={item.id} item={item} showActions={true} />` 를
```jsx
<RecordItem key={item.id} item={item} showActions={true} onEdit={onEdit} onDelete={handleDelete} />
```
로 변경(두 군데: current 뷰, all 뷰).
`<FilterButtons .../>` 호출은 그대로 동작(이미 props 동일).

- [ ] **Step 4: 빌드 + lint 확인**

Run: `npm run build` (Expected: ✓ built)
Run: `npx eslint src/components/RecordModal.jsx src/components/RecordItem.jsx src/components/FilterButtons.jsx`
Expected: 0 errors (기존 react-hooks/static-components 경고 사라짐).

- [ ] **Step 5: 커밋**

```bash
git add src/components/RecordModal.jsx src/components/RecordItem.jsx src/components/FilterButtons.jsx
git commit -m "refactor: RecordModal 내부 컴포넌트 분리(lint 경고 제거) + 수정 시 날짜 전달"
```

---

## Task 6: Recharts 설치 + 관리자 계정 생성

**Files:**
- Modify: `package.json` (recharts)
- DB: Supabase Auth 관리자 계정

- [ ] **Step 1: recharts 설치**

Run: `cd "C:\Users\User\OneDrive\문서\test_repo" && npm install recharts`
Expected: 설치 성공.

- [ ] **Step 2: 관리자 계정 생성 (MCP execute_sql)**

`mcp__plugin_supabase_supabase__execute_sql` (project_id=cckuhriufgziikpipmdx):
```sql
with new_user as (
  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), 'authenticated', 'authenticated', 'admin@moha.local',
    crypt('1234', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"admin"}',
    '', '', '', ''
  ) returning id, email
)
insert into auth.identities (provider_id, id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select nu.id::text, gen_random_uuid(), nu.id,
  jsonb_build_object('sub', nu.id::text, 'email', nu.email, 'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
from new_user nu returning provider;
```

- [ ] **Step 3: 검증**

```sql
select email, raw_user_meta_data->>'role' as role,
  (encrypted_password = crypt('Admin-Temp-1234', encrypted_password)) as pw_ok
from auth.users where email='admin@moha.local';
```
Expected: role=admin, pw_ok=true.

- [ ] **Step 4: 커밋**

```bash
git add package.json package-lock.json
git commit -m "chore: recharts 의존성 추가"
```

---

## Task 7: 역할 분기 (Root.jsx)

**Files:**
- Modify: `src/Root.jsx`

- [ ] **Step 1: Root.jsx에서 role로 분기**

```jsx
import App from './App.jsx'
import Login from './components/Login.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import { useAuth } from './useAuth.js'

export default function Root() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="app-container">
        <p className="empty">불러오는 중...</p>
      </div>
    )
  }
  if (!session) {
    return <Login />
  }
  const role = session.user?.user_metadata?.role
  if (role === 'admin') {
    return <AdminDashboard />
  }
  return <App />
}
```

- [ ] **Step 2: 임시 AdminDashboard 스텁 생성(빌드용, Task 8에서 채움)**

`src/components/AdminDashboard.jsx`:
```jsx
export default function AdminDashboard() {
  return <div className="app-container"><h1 className="title">관리자 대시보드</h1></div>
}
```

- [ ] **Step 3: 빌드 + 커밋**

Run: `npm run build` (Expected: ✓ built)
```bash
git add src/Root.jsx src/components/AdminDashboard.jsx
git commit -m "feat: role=admin이면 관리자 대시보드로 분기"
```

---

## Task 8: 관리자 대시보드 구현 (18개 분석)

**Files:**
- Modify: `src/components/AdminDashboard.jsx`
- Create: `src/components/AdminDashboard.css`

데이터 로드는 `useSalesData` 재사용(salesData, loading). 집계는 `analytics.js`.

- [ ] **Step 1: AdminDashboard.jsx 전체 구현**

```jsx
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
  const now = new Date();
  const [goal, setGoal] = useState(() => Number(localStorage.getItem(GOAL_KEY)) || 0);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  const kpi = useMemo(() => kpiSummary(salesData, now), [salesData]);
  const trend = useMemo(() => monthlyTrend(salesData, 6, now), [salesData]);
  const daily = useMemo(() => dailySales(salesData, now), [salesData]);
  const weekday = useMemo(() => byWeekday(salesData), [salesData]);
  const hours = useMemo(() => byHour(salesData), [salesData]);
  const compare = useMemo(() => samePeriodCompare(salesData, now), [salesData]);
  const ratio = useMemo(() => cashCardRatio(salesData, 'month', now), [salesData]);
  const fee = useMemo(() => cardFeeTotal(salesData, 'all'), [salesData]);
  const ovf = useMemo(() => originalVsFinal(salesData, 'month', now), [salesData]);
  const top5 = useMemo(() => topTransactions(salesData, 5), [salesData]);
  const customers = useMemo(() => byCustomer(salesData).slice(0, 10), [salesData]);
  const projected = useMemo(() => forecast(salesData, now), [salesData]);

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

      {/* KPI 카드 */}
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

      {/* 목표 달성률 */}
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

      {/* 월별 추이 */}
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

      {/* 일별 매출 */}
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

      {/* 요일별 */}
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

      {/* 시간대별 */}
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

      {/* 동기 대비 */}
      <div className="admin-section">
        <h2>동기 대비</h2>
        <div className="compare-row">
          <div><span>이번 달</span><strong>{won(compare.thisMonth)}</strong></div>
          <div><span>전월</span><strong>{won(compare.lastMonth)}</strong></div>
          <div><span>전년 동월</span><strong>{won(compare.lastYear)}</strong></div>
        </div>
      </div>

      {/* 현금/카드 비율 */}
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

      {/* 카드 수수료 / 원금 vs 실수령 */}
      <div className="admin-section">
        <h2>카드 수수료 · 원금 대비 실수령</h2>
        <div className="compare-row">
          <div><span>카드 수수료 총액</span><strong>{won(fee)}</strong></div>
          <div><span>원금 합계(이번달)</span><strong>{won(ovf.original)}</strong></div>
          <div><span>실수령 합계(이번달)</span><strong>{won(ovf.final)}</strong></div>
        </div>
      </div>

      {/* TOP5 */}
      <div className="admin-section">
        <h2>최고 거래 TOP 5</h2>
        <ul className="rank-list">
          {top5.map((r, i) => (
            <li key={r.id}><span>{i + 1}. {r.name || r.type}</span><strong>{won(r.final)}</strong></li>
          ))}
          {top5.length === 0 && <li className="muted">데이터 없음</li>}
        </ul>
      </div>

      {/* 고객별 */}
      <div className="admin-section">
        <h2>고객별 집계 (상위 10)</h2>
        <ul className="rank-list">
          {customers.map((c) => (
            <li key={c.name}><span>{c.name} ({c.count}건)</span><strong>{won(c.total)}</strong></li>
          ))}
          {customers.length === 0 && <li className="muted">고객명이 입력된 기록 없음</li>}
        </ul>
      </div>

      {/* 기간 선택 + CSV */}
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
```

- [ ] **Step 2: AdminDashboard.css 생성**

```css
.admin {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 40px;
  overflow-y: auto;
  height: 100%;
}
.admin-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.kpi-card {
  background: var(--card-bg);
  border-radius: var(--border-radius-md);
  padding: 14px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.kpi-card span { font-size: 12px; color: var(--text-secondary); font-weight: 600; }
.kpi-card strong { font-size: 18px; font-weight: 800; }
.kpi-card strong.up { color: var(--success); }
.kpi-card strong.down { color: var(--danger); }
.admin-section {
  background: var(--card-bg);
  border-radius: var(--border-radius-md);
  padding: 16px;
  box-shadow: var(--shadow-sm);
}
.admin-section h2 { font-size: 15px; font-weight: 800; margin: 0 0 12px; }
.compare-row { display: flex; gap: 10px; }
.compare-row > div { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.compare-row span { font-size: 12px; color: var(--text-secondary); }
.compare-row strong { font-size: 15px; font-weight: 800; }
.goal-row { display: flex; gap: 10px; align-items: center; }
.goal-row input { flex: 1; padding: 10px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.1); font-size: 15px; }
.progress { height: 10px; background: var(--input-bg); border-radius: 6px; margin-top: 10px; overflow: hidden; }
.progress-bar { height: 100%; background: var(--primary); }
.rank-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.rank-list li { display: flex; justify-content: space-between; font-size: 14px; }
.rank-list strong { font-weight: 800; }
.range-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.range-row input { flex: 1; padding: 10px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.1); }
.btn-csv {
  width: 100%; padding: 14px; background: var(--text-primary); color: var(--bg-color);
  border-radius: var(--border-radius-sm); font-size: 15px; font-weight: 700;
}
.muted { color: var(--text-secondary); font-size: 13px; margin: 8px 0 0; }
```

- [ ] **Step 3: 빌드 + lint**

Run: `npm run build` (Expected: ✓ built)
Run: `npx eslint src/components/AdminDashboard.jsx`
Expected: 0 errors.

- [ ] **Step 4: 커밋**

```bash
git add src/components/AdminDashboard.jsx src/components/AdminDashboard.css
git commit -m "feat: 관리자 분석 대시보드(18종 지표/차트) 구현"
```

---

## Task 9: 최종 검증 + 배포

- [ ] **Step 1: 전체 빌드 + lint**

Run: `npm run build` (Expected: ✓ built)
Run: `npx eslint src/` (Expected: 0 errors)

- [ ] **Step 2: 관리자 로그인 검증(REST)**

Run (dangerouslyDisableSandbox):
```bash
KEY="sb_publishable_3rF_oiazJUCoOwZUQjDHBg_nI5f3hUN"
curl -s -m 25 -X POST "https://cckuhriufgziikpipmdx.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"email":"admin@moha.local","password":"Admin-Temp-1234"}' -w "\nHTTP:%{http_code}\n"
```
Expected: access_token 발급, HTTP 200, 토큰 payload에 role 포함.

- [ ] **Step 3: 푸시 + 배포**

```bash
git push origin main
npm run deploy
```
Expected: Published.

- [ ] **Step 4: 라이브 확인**

Run (dangerouslyDisableSandbox): `curl -s -m 20 -o /dev/null -w "HTTP %{http_code}\n" "https://tree0327.github.io/test_repo/"`
Expected: HTTP 200.

---

## Self-Review (작성자 점검)

- **Spec 커버리지**: 역할분기(T7) / 18개 분석(T2,T8) / 날짜입력(T3) / 안정성배너(T4) / 코드정리(T5) / 말일표시(T1) / 관리자계정·Recharts(T6) / 검증배포(T9) — 전 항목 매핑.
- **Placeholder**: 모든 코드 단계 실제 코드 포함. 관리자 비번은 'Admin-Temp-1234'로 명시(사용자에 전달·변경 안내).
- **타입/시그니처 일관성**: analytics 함수명(kpiSummary/monthlyTrend/dailySales/byWeekday/byHour/samePeriodCompare/cashCardRatio/cardFeeTotal/originalVsFinal/topTransactions/byCustomer/forecast/toCSV/filterByRange)이 T2 정의와 T8 사용 일치. addRecord/updateRecord date 인자(T3) → RecordItem onEdit가 item.date 전달(T5) 일치. getPeriodEndDay(T1) App 사용 일치.
- **알려진 순서 의존**: T3에서 RecordModal은 아직 date 미전달이나 InputModal이 오늘 기본 처리 → 빌드 통과. T5에서 onEdit에 item.date 추가로 완성. 모순 없음.
