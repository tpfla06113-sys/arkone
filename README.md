# 청라 아크원 푸르지오 관심고객 사이트

Cloudflare Worker: 화면은 `public/`, 신청서 접수와 솔라피 문자 발송은 `src/worker.js`.

Cloudflare > Workers & Pages > arkone > Settings > Variables and Secrets (모두 Secret으로 저장):

| 이름 | 값 |
|---|---|
| SOLAPI_API_KEY | 솔라피 콘솔 > API Key |
| SOLAPI_API_SECRET | 솔라피 콘솔 > API Secret |
| SOLAPI_SENDER | 솔라피에 등록된 발신번호 |
| NOTIFY_TO | 접수 알림 받을 번호 (쉼표로 여러 개) |
| CUSTOMER_SMS | `on` 이면 고객에게 접수 확인 문자 발송 |

배포 설정은 `wrangler.jsonc`.
