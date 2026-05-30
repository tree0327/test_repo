# 관리자 분석 대시보드 + 사용성 개선 설계

작성일: 2026-05-30
상태: 승인됨 (사용자 승인 2026-05-30)

## 1. 배경 / 목적

매출 관리 앱(React + Vite + Supabase)을 다음과 같이 개선한다.

- **역할 분리**: 직원(1명)은 매출을 입력하고, 관리자(나)는 분석 대시보드로 추이·개선점을 파악한다.
- **관리자 분석 대시보드**: 18종 분석 지표/차트를 한 화면(스크롤)에서 제공.
- **직원 입력 화면 개선**: 날짜 지정 입력, 저장 안정성(에러/오프라인/로딩), 코드 품질 정리.
- **월 기간 표시 수정**: 누적매출 기간 표시를 "1일 ~ 말일"로 변경(내부 집계는 동일).

규모가 크므로 통합 spec 1개로 정의하되, 구현은 writing-plans에서 task로 분해한다.

## 2. 현재 상태 (변경 전)

- 인증: `signInWithPassword` 이메일+비밀번호. `Root.jsx`가 세션 유무로 Login/App 분기.
- 직원 계정: `tntkssk1006@naver.com` (Supabase). 가입 경로 없음.
- 데이터: `public.sales_records` (id text, type, original, final, name, date, created_at).
  RLS authenticated 전용, anon 권한 회수됨.
- 정산 기간: `getSalesPeriod()` = 이번달 1일 ~ 다음달 1일(미포함 경계). 필터 `>= start && < end`.
  → 집계 결과는 1일~말일과 동일하나, 화면 표시가 "5/1 ~ 6/1"로 나옴.
- `useSalesData`: Supabase 주저장 + localStorage 캐시, addRecord/updateRecord/deleteRecord/backupLocalToDb.
  - addRecord는 date를 항상 `new Date()`(현재시각)로 저장 — 과거 날짜 입력 불가.
- `RecordModal.jsx`: 내부에 `FilterButtons`/`RecordItem` 컴포넌트가 렌더 함수 안에 정의됨(lint 경고, 리렌더마다 재생성).

## 3. 설계

### 3.1 역할 분기

- 관리자 계정을 Supabase에 생성하고 `user_metadata.role = 'admin'` 부여(비밀번호는 코드에 두지 않음).
- 로그인 후 `session.user.user_metadata?.role === 'admin'` 이면 관리자, 아니면 직원.
- `src/Root.jsx` 분기:
  - `loading` → "불러오는 중"
  - 세션 없음 → `<Login/>`
  - admin → `<AdminDashboard/>`
  - 그 외 → `<App/>` (직원 입력 화면)
- 관리자/직원 모두 같은 `sales_records` 를 보지만, 관리자는 읽기·집계 전용 화면.

### 3.2 데이터/집계 계층

- `src/utils/analytics.js` (순수 함수, 유닛 테스트 대상):
  - `kpiSummary(records, now)` → { thisMonthTotal, count, avgPerTxn, momRatePct, cumulativeTotal, bestDay, worstDay }
  - `monthlyTrend(records, monthsBack=6)` → [{ ym, total, cash, card }]
  - `dailySales(records, now)` → [{ day, total }] (이번 정산월)
  - `byWeekday(records)` → [{ weekday, total, avg }]
  - `byHour(records)` → [{ hour, total }]
  - `samePeriodCompare(records, now)` → { thisMonth, lastMonth, lastYear }
  - `cashCardRatio(records, scope)` → { cash, card, cashPct, cardPct }
  - `cardFeeTotal(records, scope)` → 카드 original-final 합(수수료 총액)
  - `originalVsFinal(records, scope)` → { original, final }
  - `topTransactions(records, n=5)` → 상위 거래
  - `byCustomer(records)` → [{ name, total, count }] (name 있는 것만)
  - `forecast(records, now)` → 이번 페이스 기준 월말 예상 매출
  - `filterByRange(records, start, end)` → 기간 필터
  - `toCSV(records)` → CSV 문자열
- 모든 집계는 정산월=달력월(1일~말일) 기준. 관리자 대시보드는 전체 `sales_records` 로드 후 `useMemo` 캐싱.

### 3.3 직원 입력 화면 개선

- **날짜 지정 입력**: `InputModal` 에 날짜 input 추가(기본=오늘, 과거 선택 가능, 미래 제한).
  - `useSalesData.addRecord(type, amount, name, dateISO)` / `updateRecord(id, type, amount, name, dateISO)` 로 date 인자 추가(미지정 시 기존 동작 유지).
  - 수정 시 기존 날짜를 초기값으로 표시.
- **안정성**:
  - `useSalesData.error` 를 화면 상단 배너로 표시(저장 실패/네트워크 오류).
  - `loading` 중 상단에 "동기화 중" 표시.
  - 오프라인(`navigator.onLine === false`) 시 안내 배너.
- **코드 정리**: `RecordModal` 의 `FilterButtons`, `RecordItem` 을 `src/components/` 하위 별도 파일로 분리 → lint 경고 제거, 리렌더 안정화.

### 3.4 관리자 대시보드 (`src/components/AdminDashboard.jsx` + 하위)

모바일 세로 스크롤. 섹션:

1. **KPI 카드**: 이번달 총매출 / 거래건수 / 건당평균 / 전월대비증감률 / 목표달성률 / 누적총매출 / 최고일·최저일
2. **추이**: 월별 추이(막대, Recharts) / 일별 매출(이번달) / 요일별 패턴 / 시간대별 패턴 / 동기대비(이번달·전월·전년)
3. **결제수단**: 현금·카드 비율(파이) / 카드 수수료 총액 / 원금 vs 실수령
4. **순위/하이라이트**: 최고 거래 TOP5 / 고객명별 집계
5. **예측·도구**: 이번달 예상 매출 / 기간 직접 선택(날짜 범위 → 해당 구간 요약) / CSV 내보내기 / 로그아웃

- 차트: **Recharts** (의존성 추가). 막대/선/파이.
- 목표 매출(달성률용): 관리자 기기 **localStorage** 에 저장(`admin_monthly_goal`), 대시보드에서 입력/수정. DB 변경 없음.

### 3.5 월 기간 표시 수정

- `src/utils/salesPeriod.js` 에 표시용 말일 계산 추가:
  - 내부 `getSalesPeriod()` 의 `end`(다음달 1일, 미포함)는 유지.
  - 표시용으로 `end - 1일` = 말일을 계산하는 헬퍼 추가(예: `getPeriodLabel()` 또는 App에서 계산).
- `App.jsx` 하단 바: `5/1 ~ 6/1` → **`5/1 ~ 5/31`** (2월·30일달 자동 처리).
- 집계 필터는 변경 없음(결과 동일, 표시만 정확).

### 3.6 DB

- `sales_records` 스키마 변경 없음(컬럼 추가 없이 진행).
- 관리자 계정만 Supabase Auth에 추가(role 메타데이터).

## 4. 검증 기준

- `analytics.js` 순수 함수 유닛 테스트(node ESM): kpiSummary/monthlyTrend/cashCardRatio/forecast/toCSV 등 대표 케이스.
- `npm run build` 성공, 변경/신규 파일 lint 클린(기존 RecordModal 경고도 제거).
- 직원 화면: 과거 날짜 입력→저장→해당 월에 집계 확인. 기간 표시 "1일~말일" 확인.
- 관리자 로그인 시 대시보드 노출, 직원 로그인 시 입력 화면 노출(role 분기).
- 최종 배포 후 라이브 URL 200, 관리자/직원 각각 로그인 동작.

## 5. 범위 밖 (YAGNI)

- 직원 다인 계정/세분 권한(현재 직원 1명).
- 실시간 구독, 서버측 집계 함수, 페이지네이션.
- 매출 외 비용/순이익 등 회계 기능.

## 6. 위험/주의

- Recharts 의존성으로 번들 크기 증가 → 관리자 화면에서만 쓰므로 허용. 필요시 코드 스플리팅 고려(이번 범위 밖).
- 관리자 비밀번호는 Supabase에 저장. 생성 후 사용자에게 임시 비번 전달, 변경 권장.
- 역할 분기는 클라이언트 메타데이터 기반(UI 분기). 데이터 보호는 RLS가 담당(직원도 전체 조회 가능 — 현재 1직원이라 허용. 다인 전환 시 user_id 기반 RLS 필요).
