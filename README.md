# TFT 덱 추천기

현재 내 기물을 입력하면, 상위 랭커 게임 통계를 바탕으로 성적이 좋은 덱부터 실시간으로 추천해 주는 React 앱.

## 구조

```
[수집: Node 스크립트, API 키 필요]
라이엇 API → 상위 랭커(KR) 랭크 게임 → data/matches.jsonl
Community Dragon → data/set18.json (기물/시너지 한글 이름, 아이콘)

[분석: 아직 안 만듦]
matches.jsonl → 덱(최종 보드) 묶기 → 덱별 평균 등수/순방률/1등률 → comps.json

[React 앱: 아직 안 만듦]
comps.json 을 한 번 받아 두고, 기물을 바꿀 때마다 브라우저 안에서 바로 다시 계산
(라이엇 API 키는 절대 프론트엔드에 넣지 않는다)
```

## 진행 상황 (2026-11-17)

- [x] 라이엇 개발 키 발급, API 동작 확인
- [x] 수집 스크립트 `collector/collect.mjs` (재실행하면 이어서 받음)
- [x] 세트 18 기물/시너지 데이터 `data/set18.json`
- [ ] 덱 통계 계산 스크립트 → `comps.json`
- [ ] React 앱 (기물 선택 UI + 추천 목록)
- [ ] Personal API Key 신청 (개발 키는 24시간마다 만료)

## 다른 PC에서 이어서 하기

1. 이 저장소를 받는다.
2. https://developer.riotgames.com 로그인 → 대시보드에서 **REGENERATE API KEY** (개발 키는 24시간마다 만료)
3. 프로젝트 루트에 `.env` 파일을 만든다 (git 에 올라가지 않음):
   ```
   RIOT_API_KEY=RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
4. 수집 이어서 하기: `node collector/collect.mjs`
   - `data/collect-state.json` 에 완료한 유저가 기록돼 있어서 이어서 받는다.
   - 키가 만료되면 메시지를 출력하고 멈춘다. 새 키로 `.env` 를 바꾸고 다시 실행.

## 알아둔 것

- 한국 서버: 유저/랭크는 `kr.api.riotgames.com`, 게임 기록은 `asia.api.riotgames.com`
- 쓰는 API: `TFT-LEAGUE-V1`(챌린저/그마/마스터 목록), `TFT-MATCH-V1`(게임 ID 목록, 게임 상세)
- 랭크 게임 `queue_id` = 1100
- 개발 키 한도: 1초 20회, 2분 100회 → 스크립트는 1.25초 간격으로 요청
- 유저 수(2026-11-17): 챌린저 400, 그랜드마스터 800, 마스터 10,000 — LP 높은 순으로 수집
- 기물 ID 예: `DA_18_LeBlanc` → `set18.json` 의 `champions[].id` 와 그대로 매칭됨
- 아이템(`itemNames`)은 대부분 게임에 들어 있음 (처음 받은 샘플 1판만 비어 있었음). 증강체(`augments`)는 세트 18 게임에서 계속 비어 있음.
- 챌린저의 최근 20판 중 랭크(1100)가 아닌 게임도 많아서 건너뜀 → 유저 1명당 랭크 게임은 생각보다 적게 나옴.
- 게임 데이터에는 **최종 보드만** 있다. 중간 라운드 상태는 없으므로 추천은 "지금 기물로 갈 수 있는 최종 덱 중 성적 좋은 것" 방식.

## 파일

| 경로 | 내용 |
|---|---|
| `collector/collect.mjs` | 게임 수집 |
| `collector/extract-set.mjs` | Community Dragon 원본에서 세트 데이터 추출 (`node collector/extract-set.mjs 18`) |
| `data/matches.jsonl` | 게임 1판 = 1줄. 참가자별 등수, 레벨, 기물(성급/아이템), 활성 시너지, 증강체 |
| `data/players.json` | 수집 대상 유저 목록 |
| `data/collect-state.json` | 수집 진행 상태 |
| `data/set18.json` | 세트 18 기물/시너지 |
| `sample-match.json` | 원본 게임 응답 1판 (구조 참고용) |
