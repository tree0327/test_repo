# 정산 기간 변경 + Supabase 영속화 설계

작성일: 2026-05-30
상태: 승인됨 (사용자 승인 2026-05-30)

## 1. 배경 / 목적

매출 관리 앱(Vite + React)에서:

1. **누적매출 정산 기준 변경**: 현재 "매월 11일 ~ 다음달 10일"로 정산되는 것을
   "매월 1일 ~ 다음달 1일"(= 달력상 한 달)로 변경한다.
2. **전체 기록 재정렬**: 모든 기록을 매월 1일 기준으로 다시 그룹/정렬한다.
3. **Supabase 영속화**: 모든 기록을 localStorage에만 저장하던 것을 실제 Supabase DB에
   저장한다(주 저장소 = Supabase, localStorage = 오프라인 캐시 + 기존 데이터 1회 마이그레이션).

## 2. 현재 코드 구조 (변경 전)

- `src/utils/salesPeriod.js`
  - `getSalesPeriod()` — 인자 없음. 오늘 기준 정산기간 `{start, end}` 반환. 현재 11일~다음달10일.
  - `getPeriodKey(dateString)` — 그룹핑 키 `"YYYY-MM"` 반환. 현재 10일 이하면 전월로 귀속.
- `src/hooks/useSalesData.js` — localStorage(`salesData`) 기반 CRUD.
  - 레코드 모델: `{ id, date, type, name, original, final }`
  - `id = Date.now()` (숫자), `date = new Date().toISOString()`
  - `final` = 현금: `original`, 카드: `Math.floor(original * 0.9)` (수수료 10%)
  - API: `addRecord(type, originalAmount, name)`, `updateRecord(id, type, newOriginalAmount, name)`,
    `deleteRecord(id)`
- `src/App.jsx`
  - `getSalesPeriod()`로 이번 달 누적 집계. 필터: `itemDate >= start && itemDate <= end`.
  - 하단 바에 기간 표시 `formatPeriodDate(start) ~ formatPeriodDate(end)`.
- `src/components/RecordModal.jsx`
  - **자체 인라인 `getSalesPeriod` 복사본**(구 11~10 규칙)을 가지고 있음.
  - "이번 달" 뷰 필터: `dt >= start && dt <= end`.
  - "전체" 뷰: `getPeriodKey(item.date)`로 그룹핑, key 내림차순 정렬.
  - 레코드 표시에 `item.original`, `item.final`, `item.name`, `item.type` 사용.

## 3. 변경 설계

### 3.1 정산 기간 (`src/utils/salesPeriod.js`)

```js
// 정산 주기: 매월 1일 ~ 다음달 1일 (달력상 한 달)
export function getSalesPeriod() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1, 0, 0, 0);      // 이번 달 1일
  const end = new Date(y, m + 1, 1, 0, 0, 0);    // 다음 달 1일 (미포함 경계)
  return { start, end };
}

export function getPeriodKey(dateString) {
  const dt = new Date(dateString);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
```

- `end`는 **미포함 경계**. 따라서 모든 범위 필터는 `>= start && < end`로 비교(다음달 1일 0시 이중집계 방지).
- `getPeriodKey`는 달력 연-월을 그대로 반환 → 전체 기록이 자동으로 1일 기준 재그룹.

### 3.2 호출부 수정

- `src/App.jsx`: 필터 `itemDate <= period.end` → `itemDate < period.end`.
- `src/components/RecordModal.jsx`:
  - 인라인 `getSalesPeriod` 함수 **삭제**, `import { getSalesPeriod, getPeriodKey } from '../utils/salesPeriod'`로 공용 함수 사용.
  - 필터 `dt <= period.end` → `dt < period.end`.
- 화면 라벨: 기존 "YYYY년 M월" 유지. 하단 바는 "M/1 ~ (M+1)/1" 형태로 표시됨(요구사항 "1일~다음달 1일"과 일치).

### 3.3 Supabase 테이블 (`public.sales_records`)

기존 데이터 모델 보존. MCP 재인증 후 `apply_migration`으로 생성.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | text (PK) | 클라이언트 생성 id. 신규=`crypto.randomUUID()`, 기존=숫자 id의 문자열 |
| type | text | '현금' \| '카드' |
| original | numeric | 원금 |
| final | numeric | 최종액(현금=원금, 카드=floor(원금×0.9)) |
| name | text | 고객명/메모 (기본 '') |
| date | timestamptz | 기록 시각(ISO) |
| created_at | timestamptz | 생성 시각 default now() |

- 인덱스: `(date desc)`.
- RLS 활성화 + anon/authenticated 대상 select/insert/update/delete 공개 정책(인증 없는 데모앱).
- SQL 사본을 `supabase/migrations/0001_create_sales_records.sql`에 보관(대시보드 수동 실행 대비).

### 3.4 영속화 로직 (`src/hooks/useSalesData.js` 재작성)

- 주 저장소 = Supabase. localStorage(`salesData`)는 오프라인 캐시 + 1회 마이그레이션.
- `computeFinal(type, original)` = 현금이면 original, 아니면 `Math.floor(original*0.9)`.
- **마운트**: `select('*').order('date', {ascending:false})`로 로드.
  - DB 로드 실패 시 로컬 캐시 유지(폴백), `error` 상태 세팅.
- **1회 마이그레이션**: DB가 비어있고 로컬 기록이 있고 마이그레이션 플래그(`salesData_migrated_to_supabase`)가 없으면,
  로컬 기록을 매핑(`id: String(id)`)하여 `insert` 후 플래그 저장.
- **addRecord/updateRecord/deleteRecord**: 낙관적 업데이트(즉시 state+캐시 반영) 후 Supabase 호출,
  실패 시 스냅샷으로 롤백 + `error` 세팅. 카드 수수료 계산 보존.
- 반환: `{ salesData, addRecord, updateRecord, deleteRecord, loading, error }`
  (기존 호출부 호환 — App.jsx는 추가 필드 무시).

### 3.5 Supabase 클라이언트 / 환경설정

- `src/supabaseClient.js`: `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)`,
  `RECORDS_TABLE = 'sales_records'` export. 환경변수 누락 시 콘솔 경고.
- `.env.local`: 실제 URL + **MCP로 받은 실제 publishable 키**(현재 미검증 키는 교체). `*.local`로 gitignore됨.
- `.env.example`: placeholder.

## 4. 전제조건

- **사용자**: `/mcp`로 Supabase 재연결하여 프로젝트(`jvtwxjkfntxnuepkfcuq`) 쓰기 권한 부여.
  현재 프로젝트 범위 MCP 호출(테이블/키/SQL)이 모두 "permission denied" 상태.
- 권한 확인 후 구현 진행: 테이블 생성 → 실제 키 조회/기록 → 코드 구현 → 검증.

## 5. 검증 기준

- `npm run build` 성공.
- 변경/신규 파일(`salesPeriod.js`, `useSalesData.js`, `supabaseClient.js`) lint 클린.
- `getPeriodKey` 유닛 테스트:
  - `2024-01-10` → `2024-01` (구 규칙이면 2023-12)
  - `2024-02-01` → `2024-02` (구 규칙이면 2024-01)
  - `2025-01-05` → `2025-01` (구 규칙이면 2024-12)
- MCP로 `sales_records` insert/select/delete 왕복 성공, `get_advisors`(security) 경고 없음.

## 6. 범위 밖 (YAGNI)

- 사용자 인증/멀티테넌시(현재 단일 사용자 데모, 공개 RLS).
- 실시간 구독(realtime), 페이지네이션, 서버측 집계.
- 카드 수수료율 변경 등 기존 비즈니스 로직 변경.
