# 카드 수수료 13.3% + 전체기록 월→주→일 드릴다운 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카드 수수료를 10%→13.3%로 바꾸고(기존 기록 재계산 포함), "전체 매출 기록"을 월→주→일→거래 중첩 드릴다운으로 재구성한다.

**Architecture:** 수수료 계산을 테스트 가능한 순수 모듈 `src/utils/fee.js`로 분리하고 정수연산(`floor(원금×867/1000)`)으로 SQL 마이그레이션과 일치시킨다. 그룹핑 순수함수를 `analytics.js`에 추가하고, RecordModal all view를 재귀 `DrillGroups`로 3단계 중첩 아코디언화한다. 기존 데이터는 Supabase 마이그레이션으로 재계산.

**Tech Stack:** Vite, React 19, @supabase/supabase-js. 테스트는 임시 node ESM 스크립트(`tmp/*.mjs`) + `npm run build` + `eslint src/`. 마이그레이션은 Supabase MCP.

**Reference spec:** `docs/superpowers/specs/2026-06-09-card-fee-and-record-drilldown-design.md`

---

## File Structure

- `src/utils/fee.js` — 신규. `CARD_FEE_RATE`, `finalAmount(type, original)` (정수연산).
- `src/hooks/useSalesData.js` — `computeFinal` 제거, `fee.js`의 `finalAmount` 사용.
- `src/components/InputModal.jsx` — 수수료 표시 텍스트/계산 `fee.js` 사용.
- `src/components/RecordItem.jsx` — 수수료 표시 텍스트 `fee.js` 사용.
- `src/utils/analytics.js` — `groupByMonth/groupByWeek/groupByDay` 추가.
- `src/components/RecordModal.jsx` — all view를 재귀 DrillGroups로 재구성.
- `src/components/RecordModal.css` — 중첩 깊이 들여쓰기 스타일.
- `tmp/fee_test.mjs`, `tmp/grouping_test.mjs` — 임시 테스트.

---

## Task 1: 수수료 계산 분리 + 13.3% (TDD)

**Files:**
- Create: `src/utils/fee.js`
- Test: `tmp/fee_test.mjs`
- Modify: `src/hooks/useSalesData.js`, `src/components/InputModal.jsx`, `src/components/RecordItem.jsx`

- [ ] **Step 1: 실패 테스트 작성** — `tmp/fee_test.mjs`

```js
import assert from 'node:assert';
import { finalAmount, CARD_FEE_RATE } from '../src/utils/fee.js';

assert.strictEqual(CARD_FEE_RATE, 0.133, 'rate');
assert.strictEqual(finalAmount('현금', 10000), 10000, 'cash unchanged');
assert.strictEqual(finalAmount('카드', 10000), 8670, 'card 10000 -> 8670'); // floor(10000*867/1000)
assert.strictEqual(finalAmount('카드', 12345), 10703, 'card 12345 -> 10703'); // floor(12345*867/1000)=floor(10703.115)
assert.strictEqual(finalAmount('카드', 0), 0, 'zero');
assert.strictEqual(finalAmount('카드', '5000'), 4335, 'string original'); // floor(5000*867/1000)=4335
// 표시용 퍼센트 문자열
assert.strictEqual((CARD_FEE_RATE * 100).toFixed(1), '13.3', 'pct label');
console.log('FEE PASS');
```

- [ ] **Step 2: 실패 확인**

Run: `cd "C:\Users\User\OneDrive\문서\test_repo" && node tmp/fee_test.mjs`
Expected: FAIL — `Cannot find module ... fee.js`.

- [ ] **Step 3: fee.js 작성** — `src/utils/fee.js`

```js
// 카드 수수료율 13.3%. 카드 최종액 = floor(원금 × 867 / 1000) (정수연산으로 DB의 floor(original*0.867)와 일치).
export const CARD_FEE_RATE = 0.133;

export function finalAmount(type, original) {
  const n = Number(original) || 0;
  return type === '현금' ? n : Math.floor((n * 867) / 1000);
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd "C:\Users\User\OneDrive\문서\test_repo" && node tmp/fee_test.mjs`
Expected: `FEE PASS`

- [ ] **Step 5: useSalesData.js 연결** — `src/hooks/useSalesData.js`

5a. 상단 import 블록(2번째 줄 아래)에 추가:

```js
import { finalAmount } from '../utils/fee.js';
```

5b. 기존 9-12번째 줄 제거:

```js
// 결제수단별 최종액: 현금=원금, 카드=수수료 10% 차감
function computeFinal(type, original) {
  return type === '현금' ? original : Math.floor(original * 0.9);
}
```

5c. `computeFinal(` 호출 3곳(`toPayload`의 `r.final ?? computeFinal(...)`, `addRecord`의 `final: computeFinal(...)`, `updateRecord`의 `final: computeFinal(...)`)을 `finalAmount(`로 치환. (인자 동일: `finalAmount(r.type, original)`, `finalAmount(type, original)`)

- [ ] **Step 6: InputModal.jsx 연결** — `src/components/InputModal.jsx`

6a. 파일 상단 import에 추가:

```js
import { finalAmount, CARD_FEE_RATE } from '../utils/fee.js';
```

6b. 73-77번째 줄의 fee-notice 블록 교체:

```jsx
          {initialType === '카드' && amount && (
            <div className="fee-notice">
              수수료 {(CARD_FEE_RATE * 100).toFixed(1)}% 차감 후: <strong>{finalAmount('카드', Number(amount)).toLocaleString()}원</strong>
            </div>
          )}
```

- [ ] **Step 7: RecordItem.jsx 연결** — `src/components/RecordItem.jsx`

7a. 파일 1번째 줄 위에 import 추가:

```js
import { CARD_FEE_RATE } from '../utils/fee.js';
```

7b. 22번째 줄 교체:

```jsx
          {item.type === '카드' ? ` (원금: ${item.original.toLocaleString()}원, 수수료 ${(CARD_FEE_RATE * 100).toFixed(1)}% 차감)` : ''}
```

- [ ] **Step 8: 빌드 + lint**

Run: `cd "C:\Users\User\OneDrive\문서\test_repo" && npm run build && npx eslint src/hooks/useSalesData.js src/components/InputModal.jsx src/components/RecordItem.jsx src/utils/fee.js`
Expected: `✓ built`, eslint 출력 없음.

- [ ] **Step 9: 커밋**

```bash
cd "C:\Users\User\OneDrive\문서\test_repo" && git add src/utils/fee.js src/hooks/useSalesData.js src/components/InputModal.jsx src/components/RecordItem.jsx && git commit -m "feat: 카드 수수료 10%→13.3% (fee.js 분리, 정수연산)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 그룹핑 순수 함수 (TDD)

**Files:**
- Test: `tmp/grouping_test.mjs`
- Modify: `src/utils/analytics.js`

- [ ] **Step 1: 실패 테스트 작성** — `tmp/grouping_test.mjs`

```js
import assert from 'node:assert';
import { groupByMonth, groupByWeek, groupByDay } from '../src/utils/analytics.js';

const D = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0).toISOString();
const records = [
  { id: 'a', type: '현금', original: 7000, final: 7000, name: '', date: D(2026, 6, 3) },   // 6월 1주차
  { id: 'b', type: '현금', original: 10000, final: 10000, name: '', date: D(2026, 6, 8) },  // 6월 2주차 월
  { id: 'c', type: '카드', original: 10000, final: 8670, name: '', date: D(2026, 6, 9, 9) },// 6월 2주차 화 오전
  { id: 'd', type: '현금', original: 5000, final: 5000, name: '', date: D(2026, 6, 9, 15) },// 6월 2주차 화 오후
  { id: 'e', type: '카드', original: 20000, final: 17340, name: '', date: D(2026, 6, 9, 18) },// 6월 2주차 화 저녁
  { id: 'f', type: '카드', original: 8000, final: 6936, name: '', date: D(2026, 5, 20) },   // 5월
];

// groupByMonth: 최근월 우선
const months = groupByMonth(records);
assert.strictEqual(months.length, 2, 'month count');
assert.strictEqual(months[0].key, '2026-06', 'recent month first');
assert.strictEqual(months[0].label, '2026년 6월', 'month label');
assert.strictEqual(months[0].total, 48010, 'june total'); // 7000+10000+8670+5000+17340
assert.strictEqual(months[0].cash, 22000, 'june cash');    // 7000+10000+5000
assert.strictEqual(months[0].card, 26010, 'june card');    // 8670+17340
assert.strictEqual(months[0].items.length, 5, 'june items');
assert.strictEqual(months[1].key, '2026-05', 'older month');
assert.strictEqual(months[1].card, 6936, 'may card');

// groupByWeek (6월 items): 최근주 우선
const weeks = groupByWeek(months[0].items);
assert.strictEqual(weeks.length, 2, 'week count');
assert.strictEqual(weeks[0].label, '2주차', 'recent week first');
assert.strictEqual(weeks[0].rangeLabel, '6/8~6/14', 'week2 range');
assert.strictEqual(weeks[0].total, 41010, 'week2 total'); // 10000+8670+5000+17340
assert.strictEqual(weeks[1].label, '1주차', 'week1');
assert.strictEqual(weeks[1].rangeLabel, '6/1~6/7', 'week1 range');
assert.strictEqual(weeks[1].total, 7000, 'week1 total');

// groupByDay (2주차 items): 최근일 우선
const days = groupByDay(weeks[0].items);
assert.strictEqual(days.length, 2, 'day count');
assert.strictEqual(days[0].key, '2026-06-09', 'recent day first');
assert.strictEqual(days[0].label, '6/9 (화)', 'day label with weekday');
assert.strictEqual(days[0].total, 31010, 'day 9 total'); // 8670+5000+17340
assert.strictEqual(days[0].cash, 5000, 'day 9 cash');
assert.strictEqual(days[0].card, 26010, 'day 9 card');
assert.strictEqual(days[0].items.length, 3, 'day 9 items');
assert.strictEqual(days[1].label, '6/8 (월)', 'day 8 label');
console.log('GROUPING PASS');
```

- [ ] **Step 2: 실패 확인**

Run: `cd "C:\Users\User\OneDrive\문서\test_repo" && node tmp/grouping_test.mjs`
Expected: FAIL — `does not provide an export named 'groupByMonth'`.

- [ ] **Step 3: 함수 구현** — `src/utils/analytics.js` 의 `thisWeekTotal` 함수 다음(파일 끝 부근)에 추가

```js
const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

function groupTotals(items) {
  return {
    total: sum(items, (r) => r.final),
    cash: sum(items.filter((r) => r.type === '현금'), (r) => r.final),
    card: sum(items.filter((r) => r.type === '카드'), (r) => r.final),
  };
}

const byDateDesc = (a, b) => new Date(b.date) - new Date(a.date);
const keyDesc = (a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0);

// 정산월(YYYY-MM) 그룹. 최근월 우선.
export function groupByMonth(records) {
  const map = new Map();
  for (const r of records) {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return [...map.entries()].sort(keyDesc).map(([key, items]) => {
    const [y, m] = key.split('-');
    const sorted = [...items].sort(byDateDesc);
    return { key, label: `${y}년 ${parseInt(m, 10)}월`, ...groupTotals(sorted), items: sorted };
  });
}

// ISO주(월~일) 그룹. records 는 같은 달 가정. N주차 = 그 달 첫 ISO주를 1주차로. 최근주 우선.
export function groupByWeek(records) {
  if (records.length === 0) return [];
  const ref = new Date(records[0].date);
  const monthStart = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const firstWeekMs = isoWeekStart(monthStart).getTime();
  const map = new Map();
  for (const r of records) {
    const ws = isoWeekStart(r.date);
    const key = ws.toISOString();
    if (!map.has(key)) map.set(key, { ws, items: [] });
    map.get(key).items.push(r);
  }
  return [...map.entries()].sort(keyDesc).map(([key, { ws, items }]) => {
    const weekNo = Math.round((ws.getTime() - firstWeekMs) / (7 * 86400000)) + 1;
    const end = new Date(ws);
    end.setDate(end.getDate() + 6);
    const sorted = [...items].sort(byDateDesc);
    return {
      key,
      label: `${weekNo}주차`,
      rangeLabel: `${ws.getMonth() + 1}/${ws.getDate()}~${end.getMonth() + 1}/${end.getDate()}`,
      ...groupTotals(sorted),
      items: sorted,
    };
  });
}

// 날짜(YYYY-MM-DD) 그룹. 최근일 우선.
export function groupByDay(records) {
  const map = new Map();
  for (const r of records) {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return [...map.entries()].sort(keyDesc).map(([key, items]) => {
    const d = new Date(items[0].date);
    const sorted = [...items].sort(byDateDesc);
    return {
      key,
      label: `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAY_KR[d.getDay()]})`,
      ...groupTotals(sorted),
      items: sorted,
    };
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd "C:\Users\User\OneDrive\문서\test_repo" && node tmp/grouping_test.mjs`
Expected: `GROUPING PASS`

- [ ] **Step 5: lint**

Run: `cd "C:\Users\User\OneDrive\문서\test_repo" && npx eslint src/utils/analytics.js`
Expected: 출력 없음.

- [ ] **Step 6: 커밋**

```bash
cd "C:\Users\User\OneDrive\문서\test_repo" && git add src/utils/analytics.js && git commit -m "feat: 월/주/일 그룹핑 순수 함수 추가 (groupByMonth/Week/Day)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: RecordModal 전체기록 중첩 드릴다운

**Files:**
- Modify: `src/components/RecordModal.jsx`
- Modify: `src/components/RecordModal.css`

- [ ] **Step 1: import 추가** — `src/components/RecordModal.jsx` 의 import 블록(1-6번째 줄)에 analytics import 추가

```js
import { groupByMonth, groupByWeek, groupByDay } from '../utils/analytics';
```

- [ ] **Step 2: DrillGroups 재귀 컴포넌트 추가** — `src/components/RecordModal.jsx` 의 `export default function RecordModal(` 위에 추가

```jsx
const NEXT_LEVEL = { month: 'week', week: 'day' };
const GROUPER = { month: groupByMonth, week: groupByWeek, day: groupByDay };

function DrillGroups({
  records, level, parentKey, monthIndexMap,
  openPanels, togglePanel, panelFilters, setPanelFilter, onEdit, onDelete,
}) {
  const groups = GROUPER[level](records);
  return groups.map((g) => {
    const key = parentKey ? `${parentKey}|${g.key}` : g.key;
    const filter = panelFilters[key] || '전체';
    const filteredItems = filter === '전체' ? g.items : g.items.filter((i) => i.type === filter);
    const isLeaf = level === 'day';
    const monthBadge = level === 'month' ? `${monthIndexMap[g.key]}개월차` : null;
    const titleLabel = level === 'month' ? `${g.label} 주기`
      : level === 'week' ? `${g.label} (${g.rangeLabel})`
      : g.label;

    return (
      <div key={key} className={`accordion-group depth-${level}`}>
        <button className="accordion" onClick={() => togglePanel(key)}>
          <div className="accordion-title">
            {monthBadge && <span className="month-badge">{monthBadge}</span>}
            <span className="period-label">{titleLabel}</span>
          </div>
          <div className="accordion-right">
            <span className="accordion-total">{g.total.toLocaleString()}원</span>
            <div className="accordion-sub-totals">
              <span className="accordion-cash">현금 {g.cash.toLocaleString()}</span>
              <span className="accordion-divider">/</span>
              <span className="accordion-card">카드 {g.card.toLocaleString()}</span>
            </div>
          </div>
        </button>

        {openPanels[key] && (
          <div className="panel slide-down">
            <FilterButtons activeFilter={filter} onFilterChange={(f) => setPanelFilter(key, f)} />
            {isLeaf ? (
              filteredItems.length === 0 ? (
                <div className="empty-state small"><div>해당 결제 수단의 기록이 없습니다.</div></div>
              ) : (
                filteredItems.map((item) => (
                  <RecordItem key={item.id} item={item} showActions={true} onEdit={onEdit} onDelete={onDelete} />
                ))
              )
            ) : (
              <DrillGroups
                records={filteredItems}
                level={NEXT_LEVEL[level]}
                parentKey={key}
                monthIndexMap={monthIndexMap}
                openPanels={openPanels}
                togglePanel={togglePanel}
                panelFilters={panelFilters}
                setPanelFilter={setPanelFilter}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            )}
          </div>
        )}
      </div>
    );
  });
}
```

- [ ] **Step 3: all view 본문 교체** — `src/components/RecordModal.jsx` 의 `} else {` (62번째 줄)부터 `}` 직전(125번째 줄 `}` 닫힘)까지의 all-view 블록을 아래로 교체

기존(삭제 대상)은 `// all view` 주석부터 `groups`/`sortedKeys`/`content = sortedKeys.map(...)` 전체. 교체:

```jsx
  } else {
    // all view: 월 → 주 → 일 → 거래 중첩 드릴다운
    if (salesData.length === 0) {
      content = (
        <div className="empty-state">
          <div className="empty-icon">--</div>
          <div>기록이 없습니다.</div>
        </div>
      );
    } else {
      // N개월차 라벨: 오래된 달이 1개월차
      const monthKeys = [...new Set(salesData.map((r) => {
        const d = new Date(r.date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }))].sort();
      const monthIndexMap = {};
      monthKeys.forEach((k, i) => { monthIndexMap[k] = i + 1; });

      content = (
        <DrillGroups
          records={salesData}
          level="month"
          parentKey=""
          monthIndexMap={monthIndexMap}
          openPanels={openPanels}
          togglePanel={togglePanel}
          panelFilters={panelFilters}
          setPanelFilter={setPanelFilter}
          onEdit={onEdit}
          onDelete={handleDelete}
        />
      );
    }
  }
```

- [ ] **Step 4: 중첩 들여쓰기 CSS 추가** — `src/components/RecordModal.css` 맨 끝에 추가

```css
/* 중첩 드릴다운 단계별 들여쓰기/구분 */
.accordion-group.depth-week { margin-bottom: 8px; }
.accordion-group.depth-day { margin-bottom: 6px; }
.depth-week > .accordion { background-color: rgba(0, 122, 255, 0.06); }
.depth-day > .accordion { background-color: rgba(0, 0, 0, 0.03); }
.depth-week > .accordion .period-label,
.depth-day > .accordion .period-label { font-size: 13px; }
.depth-week > .accordion .accordion-total,
.depth-day > .accordion .accordion-total { font-size: 15px; }
.panel .panel { padding-right: 0; padding-left: 8px; border-left: 2px solid rgba(0, 0, 0, 0.06); }
```

- [ ] **Step 5: 빌드 + lint**

Run: `cd "C:\Users\User\OneDrive\문서\test_repo" && npm run build && npx eslint src/components/RecordModal.jsx`
Expected: `✓ built`, eslint 출력 없음.

- [ ] **Step 6: 커밋**

```bash
cd "C:\Users\User\OneDrive\문서\test_repo" && git add src/components/RecordModal.jsx src/components/RecordModal.css && git commit -m "feat: 전체 기록을 월→주→일→거래 중첩 드릴다운으로 재구성

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 기존 카드 기록 Supabase 재계산 (되돌릴 수 없음)

**Files:** 없음 (Supabase MCP `mcp__plugin_supabase_supabase__execute_sql` / `apply_migration`, project id `cckuhriufgziikpipmdx`)

- [ ] **Step 1: 영향 건수 + 현재값 샘플 확인**

SQL: `SELECT count(*) AS card_count FROM public.sales_records WHERE type = '카드';`
SQL: `SELECT id, original, final FROM public.sales_records WHERE type = '카드' ORDER BY date DESC LIMIT 5;`
→ 건수와 샘플을 기록. (현재 final = floor(original*0.9))

- [ ] **Step 2: 재계산 실행**

SQL: `UPDATE public.sales_records SET final = floor(original * 0.867) WHERE type = '카드';`

- [ ] **Step 3: 검증**

SQL: `SELECT count(*) AS mismatched FROM public.sales_records WHERE type = '카드' AND final <> floor(original * 0.867);`
Expected: `mismatched = 0`.
SQL: Step 1과 같은 샘플 5건 재조회 → `final = floor(original*0.867)` 확인 (Step 1 대비 감소).

- [ ] **Step 4: 현금 기록 무변경 확인**

SQL: `SELECT count(*) AS bad_cash FROM public.sales_records WHERE type = '현금' AND final <> original;`
Expected: `bad_cash = 0`.

---

## Task 5: 최종 검증 + 배포

**Files:** 없음(검증만)

- [ ] **Step 1: 전체 lint + 유닛테스트 + 빌드**

Run: `cd "C:\Users\User\OneDrive\문서\test_repo" && npx eslint src/ && node tmp/fee_test.mjs && node tmp/grouping_test.mjs && npm run build 2>&1 | tail -2`
Expected: eslint 무출력, `FEE PASS`, `GROUPING PASS`, `✓ built`.

- [ ] **Step 2: 런타임 확인 (Playwright)**

`npm run preview` 후 admin 로그인(`admin@moha.local` / `Admin-Temp-1234`)은 대시보드라 전체기록 모달이 없음 → 직원 화면 필요. 직원 비번 미상이면 이 단계는 사용자 확인 요청으로 대체하고, 최소한 빌드/유닛/콘솔에러 검증으로 갈음. (가능 시 직원 로그인 후 "전체 기록" 모달에서 월→주→일 펼침·필터·수정/삭제·콘솔 에러 0 확인.)

- [ ] **Step 3: 배포 (사용자 승인 후)**

Run: `cd "C:\Users\User\OneDrive\문서\test_repo" && npm run deploy && git push origin main`
Expected: `Published`, push 성공. 라이브 HTTP 200.

---

## Self-Review (작성자 체크)

- **Spec 커버리지:** 수수료 계산/표시/마이그레이션(T1,T4) · groupBy(T2) · 드릴다운 UI+필터 하향전파(T3) · 검증/배포(T5) — spec 4·5·6·7장 매핑. ✓
- **정밀도:** JS `floor(n*867/1000)` = SQL `floor(original*0.867)` (정수 원금 가정, 부동소수점 회피). 테스트로 8670/10703/4335 고정. ✓
- **타입 일관성:** groupBy 반환 `{key,label,(rangeLabel),total,cash,card,items}`. DrillGroups가 `g.total/g.cash/g.card/g.label/g.rangeLabel/g.items/g.key` 사용 — 일치. month만 rangeLabel 미사용. ✓
- **필터 하향전파:** 자식은 `filteredItems`(부모 필터 적용분)를 받아 재그룹 → 부모 필터가 하위에 전파. 각 노드 헤더 total/cash/card는 그 노드가 받은 records 기준(부모필터 반영). 자식 자체 필터로 추가 narrow. ✓
- **주의:** monthIndexMap은 salesData 전체 기준(필터 무관)이라 N개월차 안정적. groupByWeek는 같은 달 records 가정(월 그룹 내부 호출이므로 충족).
