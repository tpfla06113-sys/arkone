# 청라 아크원 푸르지오 관심고객 사이트

Cloudflare Worker: 화면은 `public/`, 신청서 접수와 솔라피 문자 발송은 `src/worker.js`.

Cloudflare > Workers & Pages > arkone > Settings > Variables and Secrets (모두 Secret으로 저장):

| 이름 | 값 |
|---|---|
| SOLAPI_API_KEY | 솔라피 콘솔 > API Key |
| SOLAPI_API_SECRET | 솔라피 콘솔 > API Secret |
| NOTIFY_TO | 접수 알림 받을 번호 (쉼표로 여러 개) |
| SOLAPI_SENDER | 솔라피에 등록된 발신번호 |
| ADMIN_PASSWORD | 관리자 페이지 비밀번호 |

배포 설정은 `wrangler.jsonc`.

고객 확인 문자(CUSTOMER_SMS)는 `wrangler.jsonc`의 vars에 있음. 발신번호 SOLAPI_SENDER를 따로 넣지 않으면 NOTIFY_TO 첫 번호로 발송.

관리자 페이지: `/admin` (접수 목록, 엑셀 다운로드, 날짜별 방문·등록, 유입 경로). 저장소는 Durable Object(SQLite) `src/store.js`.
설정 점검: `/api/health`.
