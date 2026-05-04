# 특수교육 AI 통합 플랫폼 — 시스템 분석 보고서

> **프로젝트명:** special-edu-platform (BehaviorInterventionPlan)
> **저장소:** github.com/cwygp1/BehaviorInterventionPlan
> **호스팅:** Vercel (자동 배포 / GitHub 연동)
> **DB:** Vercel Postgres (Neon serverless)
> **분석 일자:** 2026-05-04
> **참고 자료:** `우리반_긍정행동_AI_솔루션_분석.md` (aba2025), `특수교육_Prompt_Studio_V2_분석.md`

본 문서는 두 원본 사이트(aba2025, Prompt Studio V2)의 기능을 통합·재구현한 본 플랫폼의 **현재 구현 상태**를 정리한 자료다. 향후 기능 추가, 리팩토링, 인수인계 시 참조한다.

---

## 📑 목차

1. [기술 스택 및 인프라](#1-기술-스택-및-인프라)
2. [인증 및 세션 관리](#2-인증-및-세션-관리)
3. [데이터 모델 (DB 스키마)](#3-데이터-모델-db-스키마)
4. [메뉴 구조 / 라우팅 / 가드](#4-메뉴-구조--라우팅--가드)
5. [페이지별 상세](#5-페이지별-상세)
6. [API 엔드포인트](#6-api-엔드포인트)
7. [보조 도구 및 모달](#7-보조-도구-및-모달)
8. [UX / 성능 / 보안 설계](#8-ux--성능--보안-설계)
9. [현재 알려진 갭 / 미완성 영역](#9-현재-알려진-갭--미완성-영역)
10. [원본 사이트(aba2025 / Prompt Studio V2) 대비 매핑](#10-원본-사이트-대비-매핑)

---

## 1. 기술 스택 및 인프라

| 구분 | 선택 | 비고 |
|------|------|------|
| 프레임워크 | Next.js 14.2 (Pages Router) | `pages/api/*` 서버리스 함수 |
| 프런트엔드 | 단일 SPA (`public/index.html`, ~140KB) | 원본 aba2025 SPA 그대로 정적 서빙. `pages/index.js`는 없음 → `vercel.json`/Vercel 라우팅이 `/` → `/index.html`을 처리 |
| React | 18.3 | `pages/_app.js`만 사용, 실질적 React 컴포넌트 없음 |
| DB 클라이언트 | `@vercel/postgres` 0.10 | tagged template `sql\`...\`` 패턴 |
| 인증 | `jsonwebtoken` 9.0 + httpOnly Cookie | 자체 구현 (Firebase Auth 미사용) |
| 비밀번호 해시 | `bcryptjs` 2.4 | salt rounds 10 |
| 스타일 | Inline `<style>` (Tailwind 등 미사용) | CSS variables 활용 |
| 차트 | Chart.js (CDN) | radar / line / bar / doughnut |

**디렉터리 구조 (요약)**

```
BehaviorInterventionPlan/
├── lib/
│   ├── auth.js            # JWT 발급·검증·쿠키 + requireAuth/requireStudentAccess HOF
│   ├── db.js              # 래핑된 sql — ensureSchema 자동 실행
│   └── ensureSchema.js    # 콜드 스타트 시 1회 CREATE TABLE IF NOT EXISTS
├── pages/
│   ├── _app.js
│   └── api/
│       ├── auth/{login,register,logout}.js
│       ├── me.js
│       ├── chat.js              # LLM 프록시 (LM Studio 호환)
│       ├── chat-history.js
│       ├── migrate.js
│       └── students/
│           ├── index.js                      # CRUD
│           ├── summary.js                    # 홈 대시보드 집계
│           └── [studentId]/
│               ├── abc.js / monitor.js
│               ├── qabf.js / bip.js
│               ├── fidelity.js / sz.js
├── public/
│   └── index.html         # 단일 SPA (모든 UI/로직)
├── scripts/
│   └── seed-sample.js     # 샘플 학생 10명 + 자식 레코드 시드
└── vercel.json            # framework: nextjs (rewrite 없음)
```

**환경변수 (Vercel + .env.local 양쪽)**
- `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING` — Vercel Storage 연결 시 자동 주입
- `JWT_SECRET` — 본 프로젝트가 직접 추가 (64+ chars hex 권장)
- `MIGRATE_SECRET` — `/api/migrate` 보호용 (선택)
- `LLM_API_URL` — `/api/chat` 프록시 대상 (기본값 `http://localhost:1234/v1/chat/completions` = LM Studio)

---

## 2. 인증 및 세션 관리

### 2.1 인증 모델 (현재)

JWT in **httpOnly + SameSite=Lax + (Production) Secure** Cookie. `lib/auth.js` 단일 모듈에서 발급/검증/미들웨어를 모두 담당한다.

**쿠키:** `seai_session`, Max-Age 7일, Path=/, JS 접근 불가
**페이로드:** `{ sub: userId, email, iat, exp }`
**검증 흐름:** 클라이언트는 토큰을 직접 다루지 않음 → 모든 API는 `requireAuth(handler)` 또는 `requireStudentAccess(handler)`로 래핑되어 쿠키에서 userId를 자동 추출

### 2.2 보안 가드

| HOF | 검증 내용 |
|-----|-----------|
| `requireAuth` | 쿠키 검증 → 미인증 시 401. `req.userId`/`req.session` 주입 |
| `requireStudentAccess` | requireAuth + URL의 `studentId`가 `req.userId`의 students에 속하는지 확인. 타인 학생 접근 시 403 |

**적용 범위:** `/api/me`, `/api/students/*` (전부), `/api/chat-history`. `/api/auth/*`와 `/api/chat`은 미적용(토큰 발급용 + LLM 프록시).

### 2.3 부트스트랩 / 로그아웃

- 새로고침 시 `fetchMe()` → `/api/me` 호출로 세션 자동 복원. localStorage 미사용.
- 로그아웃: `/api/auth/logout` 호출 → 쿠키 만료 + 클라이언트 상태 초기화.
- 401 응답 자동 처리: `api()` 헬퍼가 401 받으면 `handleSessionExpired()` 호출 → 로그인 화면으로 강제 이동.

### 2.4 약관 동의 메타데이터

회원가입 시 `users` 테이블에 다음 컬럼으로 동의 기록 저장 (정책 v1.0):
- `terms_version` (예: `v1.0`)
- `terms_agreed_at` (서버 시각)
- `user_agent` (브라우저 정보 300자 제한)

---

## 3. 데이터 모델 (DB 스키마)

총 9개 테이블. `lib/ensureSchema.js`가 콜드 스타트 시 자동으로 `CREATE TABLE IF NOT EXISTS` + 일부 `ALTER TABLE ADD COLUMN IF NOT EXISTS` 실행.

### 3.1 사용자 / 학생

| 테이블 | 주요 컬럼 | 설명 |
|--------|-----------|------|
| `users` | `id, email UNIQUE, password_hash, name, school, terms_version, terms_agreed_at, user_agent, created_at` | 교사 계정 |
| `students` | `id, user_id FK, student_code, level, disability, note, created_at, UNIQUE(user_id, student_code)` | 학생 (익명 ID 기반). 같은 교사 안에서는 student_code 유니크 |

### 3.2 이벤트 누적형 (event log)

학생당 무한 누적. 각 레코드가 시점 데이터(date)를 가짐.

| 테이블 | 핵심 컬럼 | 용도 |
|--------|-----------|------|
| `abc_records` | `date, time_context, antecedent, behavior, consequence, created_at` | ABC 관찰 |
| `monitor_records` | `date, behavior, frequency, duration, intensity, alternative, latency, dbr, phase, created_at` | CICO/일일 행동 데이터. `phase`는 'A'(기초선) 또는 'B'(중재) |
| `fidelity_records` | `date, score, total (default 4), created_at` | BIP 실행 충실도 (4개 항목 중 N개) |
| `sz_records` | `date, reason, in_time, out_time, strategy, intervention, returned, created_at` | 심리안정실 이용 |

### 3.3 상태 보존형 (state, 학생당 1행)

`UNIQUE(student_id)` + UPSERT 패턴. 시간 컬럼은 `updated_at`만 있음.

| 테이블 | 핵심 컬럼 | 용도 |
|--------|-----------|------|
| `qabf_data` | `responses JSONB (25문항 응답 배열), updated_at` | QABF 평가 결과 |
| `bip_data` | `alt, fct, crit, prev, teach, reinf, resp, updated_at` | 행동중재계획 7요소 |

### 3.4 기타

| 테이블 | 컬럼 | 용도 |
|--------|------|------|
| `chat_history` | `user_id, role, content, created_at` | AI 어시스턴트 대화 로그 (최근 50개) |

**중요한 어댑터 매핑** — 원본 SPA(`public/index.html`)는 짧은 키 컨벤션(`a/b/c/time`, `beh/freq/dur/int/alt/lat`, `in_t/out_t/intv/ret`)을 쓰는데, 백엔드는 표준 컬럼명(`antecedent/behavior/consequence/time_context` 등)을 쓴다. 각 API의 `toResponse()` 헬퍼가 양방향 매핑을 담당한다. 또한 Postgres `DATE`/`TIMESTAMP`를 KST 기준 `yyyy-MM-dd` / `yyyy-MM-dd HH:mm:ss` 문자열로 포맷해 반환한다.

---

## 4. 메뉴 구조 / 라우팅 / 가드

### 4.1 사이드바 메뉴

| 그룹 | 메뉴 | 페이지 ID | 학생 선택 가드 |
|------|------|-----------|---------------|
| 시작 | 홈 | `home` | ❌ |
| 행동 중재 (PBS) | 학생 관찰 / ABC | `observe` | ✅ |
| | 기능평가 (QABF) | `qabf` | ✅ |
| | 중재계획 (BIP) | `bip` | ✅ |
| | 행동 데이터 | `monitor` | ✅ |
| | 결과 평가 | `eval` | ✅ |
| AI 도구 | AI 어시스턴트 | `builder` | ❌ |
| 위기 / 지원 | 위기행동 대처 | `crisis` | ❌ |
| | 교사 지원 | `support` | ❌ |

### 4.2 학생 선택 가드 (`requireStudentFor`)

PBS 5개 메뉴는 `curStu` 미선택 상태에서 진입 불가. `go()` 함수가 가로채서:
- 등록된 학생 0명 → 즉시 "학생 추가" 모달
- 등록된 학생 N명 → "학생 선택" 모달 (학생 카드 리스트 + "+ 새 학생 추가")
- 모달에서 학생 선택/추가 완료 시 → `pendingTargetPage`에 저장된 원래 목적지로 자동 이동
- 취소 시 → 사이드바 active 상태 유지, 페이지 전환 없음

### 4.3 학생 선택 동시 호출 가드

`selectStudent._inflight` 플래그로 재진입 방지. 사용자가 학생을 빠르게 두 번 클릭해도 첫 호출의 promise를 그대로 반환 → `cachedABC` 등 글로벌 변수가 마지막 응답 순서에 따라 뒤섞이는 race 차단.

---

## 5. 페이지별 상세

### 5.1 인증 화면 (`#authScreen`)

- 로그인/회원가입 탭 토글
- 회원가입 추가 필드: 성함, 비밀번호 확인, 소속 학교(선택), 약관 동의 체크박스(필수) + "전문 보기" 모달
- "둘러보기 (게스트)" — `currentUser={id:null,name:'게스트'}` 로컬 상태만, 서버 미전송 (현재는 사실상 데이터 입력/저장 불가)
- 버튼 로딩 인디케이터: 클릭 시 "로그인 중..." + 인라인 스피너 + 전역 오버레이
- 로그인 실패 시 toast로 에러 메시지

### 5.2 홈 대시보드 (`#p-home`)

**상단 그리팅 카드** — `안녕하세요, {name} 선생님 👋` + 오늘 날짜(YYYY년 M월 D일 (요일))

**상단 통계 4종** — 등록 학생 / ABC 관찰 / 행동 데이터 / 심리안정실 (전체 합계)

**학생별 한눈 요약 그리드** — 학생 카드 N개. 각 카드:
- 아바타(이니셜 + 학생별 고정 색상 `stuColor()`)
- 이름 / 학교급 · 장애영역 / 비식별 요약 노트
- 하단 3 메트릭: 행동 추이(최근 빈도 + ↑/↓/→ 방향), ABC 건수, 안정실 횟수
- 클릭 시 → 화면을 학생 관찰 페이지로 즉시 전환 + 백그라운드로 학생 데이터 로딩 (UX 끊김 방지)

**빠른 작업 6개** — ABC 기록 / 일일 데이터 / 위기 대처 / AI 어시스턴트 / 결과 평가 / 교사 지원

**최근 활동 피드** — ABC/MON/SZ 8개를 시간순으로 혼합 표시

**데이터 소스 우선순위:**
1. `/api/students/summary` — 단일 라운드트립 (학생별 카운트·추세·최근 8건) → `homeSummaryCache` / `homeRecentCache`
2. `studentDataCache[dbId]` — 학생을 클릭한 적이 있으면 우선 사용 (방금 추가/삭제한 기록 즉시 반영)
3. 모두 없으면 0/빈 값

홈 재진입 시 백그라운드로 summary 재호출 → 다른 탭에서의 변경도 자동 반영.

### 5.3 학생 관찰 / ABC (`#p-observe`)

**상단 stuHero 카드** — 선택된 학생 정보 + 메트릭(ABC 건수, 행동 데이터, 안정실)

**학생 프로필 카드** — ID / 학교급 / 장애 / 비식별 요약 + "프로필 수정" 버튼

**ABC 행동 관찰 기록 작성**
- 날짜(자동 today) / 시간·장소(자유 텍스트) / A / B / C 입력
- "작성 예시 보기" 모달 — 국립특수교육원 기준 좋은/나쁜 예시 비교 + Dead Man's Test 안내 (텍스트만, 변환 도구 없음)
- 저장 시 `cachedABC` 갱신 + `studentDataCache[dbId].abc` 동기화 + hero 메트릭 재계산

**누적 ABC 기록 카드** — 시간 역순(최신 위), 뱃지에 `created_at`(KST yyyy-MM-dd HH:mm:ss), 항목별 삭제 버튼

### 5.4 기능평가 (QABF) (`#p-qabf`)

- 25문항 체크리스트 (펼치기/접기 UI)
- 4점 척도: 0(전혀 아님) / 1(가끔) / 2(자주) / 3(매우 자주)
- 5가지 기능 분류: 관심 / 회피 / 획득 / 자동(감각) / 비사회적
- 응답 변경 시 즉시 저장(API POST), 5기능별 점수 자동 계산
- AI 분석 / ABC 데이터 연동 분석 — 미구현

### 5.5 중재계획 (BIP) (`#p-bip`)

**🎯 목표 행동(대체 행동) 설정**
- 대체 행동 / FCT 기술 / 성공 기준 입력 + "목표 행동 저장" 버튼

**📜 중재 전략 (예방-교수-강화-반응)**
- 4개 textarea: `bipPrev` / `bipTeach` / `bipReinf` / `bipResp`
- 각 칸에 가이드북 기반 placeholder 예시 제공
- "중재 전략 저장" 버튼 (saveBIPStrategy)

**✍ 행동 계약서**
- 학생 약속 / 성공 기준 / 교사 약속 / 계약 기간(시작~종료)
- "계약서 인쇄/저장" 버튼 → `printContract()` 함수가 새 창에 인쇄용 HTML 렌더 → 브라우저 인쇄로 PDF 저장 가능

**미구현 영역** — AI 중재안 자동 생성 / 가정 연계 통신문 / BIP 본문 PDF

### 5.6 행동 데이터 (`#p-monitor`)

**일일 행동 데이터 기록 (CICO 양식)**
- 날짜 / 행동(자유 텍스트) / 빈도(횟수) / 지속(분) / 강도(1-5) / 대체행동 수행(예/아니오) / 지연시간(분) / 평정척도 DBR(0-10)
- 저장 시 `phase` 컬럼은 코드상 `'B'` 고정 (Phase A/B 명시적 전환 UX 미구현)

**📋 BIP 실행 충실도 (오늘)**
- 4개 체크박스: 예방 전략 실행 / 교수 전략 실행 / 강화 제공 / 위기 절차 준수
- "충실도 저장" → 체크된 개수를 score(0~4)로 저장

**기록 목록** — 시간 역순, 빈도/지속/강도/대체행동/DBR 표시, 삭제 가능

### 5.7 결과 평가 (`#p-eval`)

5종 차트 + 비교 모달.

| 차트 | 타입 | 데이터 소스 |
|------|------|------------|
| QABF 행동 기능 분석 | radar | `cachedQABF` 25문항 → 5기능 합산 |
| 행동 변화 추이 | line | `cachedMon` (지표 선택 가능: 빈도/지속/강도/DBR) — 기초선(A) vs 중재(B) 색상 구분, 평균 수평선 |
| 심리안정실 사유 분포 | doughnut | `cachedSZ.reason` 그룹 |
| 심리안정실 월별 이용 | bar | `cachedSZ.date` 월 단위 |
| BIP 실행 충실도 추이 | bar | `cachedFid` (점수/총점 → %) |

**기간별 비교 모달**
- 기간 A(기초선) 시작/종료 + 기간 B(중재 후) 시작/종료 입력
- "비교 생성" → 평균 빈도/지속/강도/DBR 표 + 변화량 색상(감소=초록, 증가=빨강)

**미구현** — AI 성과 분석, 결과 보고서 PDF, DPR/CICO 카드 인쇄, PND/Tau-U 효과크기

**버그 수정 이력** — 학생 변경 시 차트가 이전 학생 그대로 남던 문제는 `selectStudent` 끝부분에서 active 페이지가 eval일 때 `renderAllEvalCharts()` 자동 호출하도록 패치됨.

### 5.8 AI 어시스턴트 (`#p-builder`)

본 메뉴는 **Prompt Studio V2 기능을 통합한 영역**이며, aba2025의 "PBS Q&A 전문가"와는 다르다.

**칩(chip) 기반 프롬프트 빌더**
- 학생 프로파일 (장애영역 10종, 기능 수준 5종)
- 결과물 형태 19종 (학습게임 / 그림퀴즈 / AAC보드 / 사회적 이야기 / 시각일과표 / 감정조절도구 / 토큰경제 / 매칭게임 / 수개념 / 지역사회시뮬 / 과제분석앱 / 수업지도안 / 협력교수계획안 / 수정활동지 / IEP목표초안 / 행동지원계획 / 가정연계통신문 / PECS카드 / 시각규칙판)
- 교육과정 / 수업 수정·설계 / IEP 목표·평가 / EBP 교수법 / 접근성 / 디자인 카테고리

**AI 대화 영역**
- 칩 선택 → 프롬프트 자동 조립 → 수업 내용 입력 → "보내기"
- 백엔드 `/api/chat` 프록시 → `LLM_API_URL`(기본: LM Studio 로컬) 또는 사용자 지정 endpoint
- SSE 스트리밍 응답 처리 (`updateStreamingMessage`)
- 대화 이력 `chat_history` 테이블에 저장 (최근 50개)

### 5.9 위기행동 대처 (`#p-crisis`)

**🚨 위기행동 7단계 대처 (Acting-Out Cycle)**
Colvin & Sugai (1989) 모델 기반. 7단계 카드 클릭 시 상세 대응 전략 펼쳐짐.

| 단계 | 명칭 | 영문 | 색상 |
|------|------|------|------|
| 1 | 안정 | Calm | 녹색 |
| 2 | 전조 | Trigger | 연두 |
| 3 | 흥분 | Agitation | 주황 |
| 4 | 가속 | Acceleration | 진주황 |
| 5 | 고조/위기 | Peak | 적색 |
| 6 | 탈고조 | De-escalation | 진주황 |
| 7 | 회복 | Recovery | 녹색 |

각 단계의 상세 텍스트는 `crisisData[]` 배열에 하드코딩 (서울시교육청 PBS 가이드북 기반).

**💚 5-4-3-2-1 그라운딩** — 시각/촉각/청각/후각/미각 단계별 안내 (정서 조절 도구)

**💚 심리안정실 이용 기록**
- 날짜 / 사유(불안/분노/위기전조/피로·과민) / 입실시간 / 퇴실시간 / 사용 전략 / 교사 개입 정도 / 학습 복귀 여부
- "기록 저장" → `sz_records` INSERT
- 누적 목록: 사유 뱃지 + 날짜 + 시간 + 전략 + 개입 + 복귀 표시

**미구현** — 위기 시뮬레이션 AI 요청 (단계별 자동 대응 시나리오 생성), 신체적 개입 5대 원칙 안내 카드

### 5.10 교사 지원 (`#p-support`)

**📚 교사 지원 자료** — 4개 카드:
1. 🎬 PBS 영상 강의 — 서울시교육청 사이트 외부 링크 (`https://seoulpbs.sen.go.kr/...`)
2. 🛡 위기행동관리팀 — 안내 텍스트
3. ⚖ 교권 보호 — 안내 텍스트
4. 💚 회복 지원 — 안내 텍스트

**🔬 근거 기반 교수법(EBP) 11종 가이드** — 표:
ABA / DTT / UDL / Social Story / 과제분석 / PECS / PBS / 감각통합 / 비디오모델링 / 자기관리 / 또래지원

**⚠ 반드시 알아두세요** — 윤리 안내 (AI는 보조 / 실명·생년월일·학번 입력 금지 / 성취기준 코드 ncic.re.kr 확인 / 상업적 배포 시 저작권)

**미구현** — PBS 영상 강의 전용 페이지(주제별 추천, 학습 팁 3단계)

---

## 6. API 엔드포인트

| 메서드 | 경로 | 인증 | 용도 |
|--------|------|------|------|
| POST | `/api/auth/login` | ❌ | 로그인 → JWT 쿠키 설정 |
| POST | `/api/auth/register` | ❌ | 회원가입 → 즉시 로그인 처리 |
| POST | `/api/auth/logout` | ❌ | 쿠키 만료 |
| GET | `/api/me` | requireAuth | 현재 사용자 프로필 |
| GET/POST/PUT/DELETE | `/api/students` | requireAuth | 학생 CRUD (자기 학생만 영향, ownership SQL 검증) |
| GET | `/api/students/summary` | requireAuth | 홈 대시보드 집계 (1 round-trip) |
| GET/POST/DELETE | `/api/students/[studentId]/abc` | requireStudentAccess | ABC 이벤트 |
| GET/POST/DELETE | `/api/students/[studentId]/monitor` | requireStudentAccess | Monitor 이벤트 |
| GET/POST/PUT | `/api/students/[studentId]/qabf` | requireStudentAccess | QABF 상태 (UPSERT) |
| GET/POST/PUT | `/api/students/[studentId]/bip` | requireStudentAccess | BIP 상태 (UPSERT) |
| GET/POST | `/api/students/[studentId]/fidelity` | requireStudentAccess | 충실도 이벤트 |
| GET/POST/DELETE | `/api/students/[studentId]/sz` | requireStudentAccess | 심리안정실 이벤트 |
| POST | `/api/chat` | ❌ (보호 가치 낮음) | LLM 프록시 (SSE 스트리밍) |
| GET/POST/DELETE | `/api/chat-history` | requireAuth | 채팅 이력 |
| POST | `/api/migrate` | MIGRATE_SECRET | 수동 스키마 생성 (사실상 ensureSchema가 처리하므로 호출 불필요) |

**응답 컨벤션:**
- 성공: `200/201 + { data | records | record | summaries | recent | user | success }`
- 에러: `400/401/403/404/405/409/500 + { error: '메시지' }`

---

## 7. 보조 도구 및 모달

| ID | 트리거 | 용도 |
|----|--------|------|
| `pickStuModal` | PBS 메뉴 클릭 시 학생 미선택 | 학생 선택 / 추가 라우팅 |
| `addStuModal` | 우상단 ➕ 또는 가드에서 자동 | 새 학생 등록 (익명 ID + 학교급 + 장애영역 + 비식별 요약) |
| `editStuModal` | 학생 프로필의 "수정" | 학교급/장애/노트 수정 |
| `abcExampleModal` | ABC 입력의 "작성 예시 보기" | 좋은/나쁜 예시 비교 + Dead Man's Test 텍스트 안내 |
| `termsModal` | 회원가입의 "전문 보기" | 약관 v1.0 5개 조항 본문 |
| `globalLoading` | showLoading() | 전역 로딩 오버레이 (대형 스피너 + 메시지) |
| `toast` | toast() | 우하단 짧은 알림 (2.2초) |

**미구현 모달** (aba2025에 있던 것) — 우선순위 체크리스트, 조작적 정의 도우미, 새 관찰 기간 시작(Tier 선택), DPR/CICO 카드 인쇄, AI 결과 결과 모달, 학급 보상 설정, 도움말.

---

## 8. UX / 성능 / 보안 설계

### 8.1 로딩 인디케이터 패턴

3가지 레이어:
1. **버튼 인라인 스피너** (`setBtnLoading`) — disabled + 텍스트 교체 + 작은 spinner
2. **전역 오버레이** (`showLoading/hideLoading`) — 반투명 + blur + 큰 스피너 + 메시지
3. **toast** — 비차단 알림 (저장 성공 등)

세션 복원 → 학생 목록 로딩 → 홈 요약 로딩 → 모두 메시지가 자연스럽게 전환됨.

### 8.2 성능 최적화

- 홈 대시보드: 1 round-trip (`/api/students/summary`) — 학생 N명에 비례하지 않는 O(1) 쿼리 횟수
- 학생 데이터: 클릭 시 6 endpoint 병렬 (`Promise.all`) → `studentDataCache`에 저장 → 재방문 시 즉시 반환
- 콜드 스타트: `lib/db.js`의 `ensureSchema` 결과를 모듈 로컬 promise에 캐시 → 한 인스턴스에서 1회만 실행
- 동시 클릭 가드: `selectStudent._inflight`로 race 차단

### 8.3 보안 정책

- **JWT in httpOnly Secure Cookie** — XSS로 토큰 탈취 불가
- **Ownership SQL 검증** — 모든 `/api/students/*`는 `WHERE user_id = ${req.userId}` 또는 `requireStudentAccess` 미들웨어로 강제. 다른 교사의 학생 ID로 직접 호출해도 403/404
- **bcrypt salt rounds 10** — 무차별 대입 비용 적정
- **JWT_SECRET 환경변수 강제** — `lib/auth.js`의 `getSecret()`이 미설정/짧을 때 throw → 운영에서 인증 API 전부 500 (안전한 fail-loud)
- **약관 동의 메타데이터** — 분쟁 대비 user_agent + agreed_at + version 저장

### 8.4 개인정보 / 윤리 원칙

- 학생 실명 입력 금지 (UI placeholder + addStuModal 안내)
- 비식별 요약 필드(`note`)에만 학생 특성 입력
- "AI가 제시하는 결과는 보조이며 최종 책임은 교사" 안내 (교사 지원 페이지)
- 게스트 모드는 서버에 저장 안 함 (현재 사실상 입력 자체가 막힌 상태 — 인증 가드 때문)

---

## 9. 추가 작업 계획

원본 두 사이트의 기능과 비교한 갭, 그리고 현재 텍스트 위주의 입력 UX를 클릭 기반으로 강화하는 작업을 통합 정리. ID 체계는 향후 작업 추적용이다.

### 9.1 AI 보조 도구 (프롬프트 빌더 패턴)

본 플랫폼의 AI 보조 기능은 **칩/폼으로 컨텍스트를 조립 → 프롬프트 텍스트 생성 → 사용자가 외부 AI에 복사·실행 → 결과를 교사가 검토 후 적절한 칸에 직접 입력**하는 패턴을 표준으로 한다(기존 `AI 어시스턴트(builder)` 메뉴와 동일한 형태). 이 분리 구조의 장점:

- 학생 데이터를 어디로 보낼지 사용자가 직접 통제
- 외부 AI(ChatGPT / Claude / Gemini)의 최신 모델을 그때그때 선택 가능
- 향후 자체 LLM 백엔드(`/api/chat`) 연동 시에도 **같은 입력 컴포넌트를 그대로 재사용** (변경 지점은 "복사" 버튼 → "AI에게 보내기" 버튼 한 곳)

| ID | 위치 | 입력 컨텍스트 | 출력 프롬프트 요지 |
|----|------|--------------|--------------------|
| **A1** | 학생 관찰 → 모달 "🪄 조작적 정의 도우미" | 모호한 행동 서술 | Dead Man's Test 통과하는 관찰 가능·측정 가능 행동 정의로 변환 |
| **A2** | BIP 페이지 상단 "📜 AI 중재안 프롬프트" | **자동**: 학생의 ABC 누적 + QABF 점수 + 목표 행동 | 예방·교수·강화·반응 4영역 BIP 초안 생성 |
| **A3** | 결과 평가 페이지 상단 "💡 성과 분석 프롬프트" | **자동**: 학생의 monitor + fidelity + sz | 단일대상연구 4지표(Level/Trend/Variability/Immediacy) 해석 |
| **A4** | 학급 차원 PBS 페이지(신규) | 학급 목표 + 누적 데이터 + 교사 질문 | 서울시교육청 가이드북 기반 학급 운영 코칭 |
| **A5** | 별도 메뉴 또는 builder 내 탭 | 자유 질문 | 가이드북 컨텍스트 + 질문 (FCT/4:1/위기 등) PBS Q&A |
| **A6** | 위기행동 대처 페이지 | 학생 상황 묘사 | Acting-Out Cycle 단계별 대응 시나리오 |

### 9.2 입력 UX 클릭 전환 (B10~B14)

현재 대부분의 입력이 자유 텍스트라 작성 부담이 크다. `AI 어시스턴트(builder)` 메뉴의 칩 누적 패턴을 다른 입력 화면들에 확장 적용한다. 표준 행동 용어를 사용하게 유도되어 데이터 분석 정확도와 AI 프롬프트 품질도 함께 개선된다.

| ID | 영역 | 패턴 |
|----|------|------|
| **B10** | ABC A/B/C textarea | 빠른 입력 칩 (선행 10·행동 12·결과 10) → textarea 줄 단위 누적 |
| **B11** | BIP 4 전략 textarea | 가이드북 기반 칩 (예방 10·교수 8·강화 8·반응 8) → textarea 누적 |
| **B12** | Monitor 행동 이름 | 표준 행동 칩 + 학생별 이전 사용 행동(★ 표시) → input 단일 선택 |
| **B13** | ABC 시간/장소 | 2단계 칩 (시간 10 + 장소 8) → input 자동 조립 ("2교시 / 교실") |
| **B14** | SZ 진정 전략, 행동 계약서 | SZ 전략 칩 + BIP 대체행동/FCT/성공기준 칩 + 행동 계약서 "📋 BIP에서 가져오기" 버튼 |

### 9.3 단순 폼 / 인쇄 / 정적 콘텐츠

| ID | 항목 | 비고 |
|----|------|------|
| **B1** | RAISD 선호/강화물 탐색 | 신규 테이블 `raisd_assessments` (state, 학생당 1행) |
| **B2** | 문제행동 우선순위 체크리스트 | 신규 테이블 `priority_checklist` (state, 9문항 4점척도, 0/36 자동 계산) |
| **B3** | Phase A/B 명시적 전환 | 기존 `monitor.phase` 컬럼 활용 — monitor 페이지에 "기초선 종료 → 중재 시작" 토글 |
| **B4** | 관찰 기간 / Tier 시작 모달 | 신규 테이블 `observation_periods` 또는 students 컬럼 추가 |
| **B5** | 학급 차원 PBS (Tier 1) 메뉴 | 신규 테이블 `class_pbs_state` (학급 목표·포인트·보상). 메뉴 신설 |
| **B6** | 가정 연계 통신문 인쇄 | 클라이언트 인쇄 (학생 정보 + 템플릿) |
| **B7** | BIP 본문 PDF | 클라이언트 인쇄 (행동 계약서와 동일 패턴) |
| **B8** | 결과 보고서 PDF | 차트 + 표 + 학생 정보 통합 인쇄 (`window.print()` + 인쇄용 CSS) |
| **B9** | DPR/CICO 카드 인쇄 | 1교시~종례 칸. 초등/중등 양식 분리 |
| **C1** | PBS 영상 강의 전용 페이지 | 추천 강의 주제 + 학습 팁 3단계 |
| **C2** | 신체적 개입 5대 원칙 안내 카드 | 위기 페이지 하단 추가 |
| **C3** | 헤더 보안 배너 상시 노출 | "🔒 AI 전송 시 가명·비식별 요약만 사용" |
| **D1** | PND (Percentage of Non-overlapping Data) | 기간별 비교 모달에 효과크기 추가 |
| **D2** | Tau-U 효과크기 | 동일 |

### 9.4 우선순위 (Phase 단위 추천)

**Phase 1 — 즉시 효과, 단순 작업** (1~2주)
1. **B3** Phase A/B 명시적 전환 — 결과 차트 신뢰도 회복
2. **B10/B11/B13** 입력 칩 도입 — 작성 부담 즉시 감소, 표준 용어 정착, 향후 AI 프롬프트 품질 향상의 기반
3. **B12** Monitor 행동 이름 자동 채움
4. **B14** SZ 칩 + 계약서 자동 채움
5. **B1, B2** RAISD + 우선순위 체크리스트 (단순 폼)
6. **C2, C3** 신체적 개입 안내 + 헤더 배너

**Phase 2 — 출력 / 인쇄 강화** (1주)
7. **B6, B7, B8** 가정 통신문 / BIP / 결과 보고서 PDF
8. **B9** DPR/CICO 카드

**Phase 3 — 프롬프트 빌더 도입** (1주)
9. **A1** Dead Man's Test 변환 (가장 작은 단위, 패턴 검증용)
10. **A2** AI BIP 중재안 (B11 칩 입력 데이터를 그대로 프롬프트화)
11. **A3** 성과 분석 프롬프트

**Phase 4 — 신규 메뉴 / 대형 작업** (2~3주)
12. **B5 + A4** 학급 차원 PBS (Tier 1) 메뉴 + 학급 코칭 프롬프트
13. **A5** PBS Q&A 전문가
14. **B4** 관찰 기간 / Tier 모달

**Phase 5 — 선택적 보완**
15. **A6** 위기 시뮬레이션 프롬프트
16. **C1** PBS 영상 강의 페이지
17. **D1, D2** PND / Tau-U 효과크기

### 9.5 공통 설계 원칙

1. **AI 결과는 사용자 검토 후 수동 입력** — 외부 AI 응답을 자동으로 DB에 넣지 않음. 사용자가 복사해서 BIP/ABC 등 해당 칸에 붙여넣음.
2. **프롬프트는 한국어** — 외부 AI에 한국어 답변을 받기 위함.
3. **외부 AI 새 창 직링크** — `chat.openai.com` / `claude.ai/new` / `gemini.google.com` — 한 번 클릭으로 열기 + toast로 "프롬프트가 클립보드에 복사됐습니다".
4. **프롬프트 자체에도 비식별 원칙** — 학생 ID(익명) + note(비식별 요약)만 포함. 실명·민감정보 입력은 UI 단계에서 막혀 있어 안전.
5. **모든 출력에 면책 문구** — "AI 결과는 참고용이며, 검토·수정 후 사용. 최종 책임은 교사".
6. **재사용 가능한 컴포넌트** — `qchipAppend(targetId, text)`, `qchipSet(targetId, text)`, `promptBuilder({title, fields, template})` 같은 헬퍼로 추상화해 코드 중복 최소화.

---

## 10. 원본 사이트 대비 매핑

### 10.1 aba2025(우리반 긍정행동 AI 솔루션) 대비

| aba2025 영역 | 본 플랫폼 위치 | 상태 |
|---|---|---|
| 학급 차원 PBS (Tier 1) | — | ❌ 미구현 |
| 학생 관찰 / ABC | observe | 🟡 핵심만 (RAISD/우선순위/Dead Man 변환 없음) |
| QABF 25문항 | qabf | ✅ |
| BIP 입력 | bip | 🟡 입력은 되나 AI 자동 생성 없음, 통신문/PDF 없음 |
| 행동 계약서 | bip 내부 | ✅ 인쇄 가능 |
| CICO/DBR/지연시간 | monitor | ✅ |
| BIP 실행 충실도 | monitor 내부 | ✅ |
| Phase 전환 | monitor.phase | 🟡 컬럼 있으나 코드상 'B' 고정 |
| 결과 차트 (5종) | eval | ✅ |
| 기간별 비교 | eval 내부 | ✅ |
| AI 성과 분석 / 보고서 PDF / DPR 카드 | — | ❌ 미구현 |
| AI PBS Q&A | — | ❌ 미구현 (별도 메뉴 필요) |
| PBS 영상 강의 | support 내 카드 | 🟡 외부 링크만 |
| 심리안정실 | crisis 내부 | ✅ |
| 위기 7단계 | crisis | ✅ |
| 그라운딩 5-4-3-2-1 | crisis | ✅ |
| 신체적 개입 5원칙 | — | ❌ 안내 미구현 |
| 교사 지원 자료 | support | ✅ |
| 약관 동의 v1.0 | 회원가입 모달 | ✅ |

### 10.2 Prompt Studio V2 대비

| Prompt Studio V2 영역 | 본 플랫폼 위치 | 상태 |
|---|---|---|
| 칩 기반 프롬프트 빌더 | builder | ✅ |
| 결과물 형태 카테고리 | builder | ✅ 19종 |
| 학생 프로파일(장애·수준) | builder | ✅ |
| 교육과정·EBP·접근성 카테고리 | builder | ✅ |
| LLM 호출 (ChatGPT/Claude/Gemini) | `/api/chat` 프록시 → LM Studio 또는 사용자 정의 | 🟡 프록시 구조 |
| 결과물 23종 | builder 결과물 칩 19개 | 🟡 일부만 매핑 |
| 추천 20선 / 학생 유형별 예시 | — | ❌ 미구현 |

### 10.3 양 사이트 통합 효과 (본 플랫폼의 차별점)

- **하나의 학생 컨텍스트** — 같은 학생에 대해 ABC → QABF → BIP → Monitor → Eval이 한 흐름으로 연결됨. 원본 두 사이트는 분리되어 있음.
- **자체 인증 + Postgres 영속화** — Firebase 의존성 제거, 모든 데이터를 자체 스키마에 저장. 2명 이상 교사가 같은 플랫폼을 안전하게 공유 가능 (ownership 검증).
- **Vercel 단일 배포** — 두 사이트의 인프라 분리 부담 제거.
- **AI 어시스턴트의 LLM 백엔드 자유도** — Prompt Studio V2는 외부 LLM URL을 사용자가 직접 붙여야 했지만, 본 플랫폼은 `LLM_API_URL` 환경변수로 운영자가 일괄 설정 가능 (LM Studio / Ollama / OpenAI 호환 어떤 백엔드든).

---

## 📎 참조

- **Repository:** github.com/cwygp1/BehaviorInterventionPlan
- **Production:** Vercel (프로젝트 ID `prj_euueHSNzQGCgO4oaPGL9JXOr6k6o`, team `cwygp1-9704s-projects`)
- **DB:** Vercel Postgres (Neon serverless, region us-east-1)
- **원본 자료:**
  - 우리반 긍정행동 AI 솔루션 V8.3 — https://aba2025.web.app/ (2024 서울시교육청 PBS 가이드북 기반)
  - 특수교육 Prompt Studio V2 — https://kimju1416.github.io/uni/ (2022 개정 기본교육과정 기반)

---

*본 문서는 코드베이스의 현재 상태(2026-05-04 기준)를 정리한 것이며, 향후 기능 추가·수정 시 함께 갱신해야 한다.*
