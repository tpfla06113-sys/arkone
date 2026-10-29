# 청라 아크원 푸르지오 관심고객 사이트

Cloudflare Pages 정적 사이트 + `functions/api/lead.js`(솔라피 문자 발송).

Cloudflare Pages 설정 > 환경 변수 (모두 "암호화"로 저장):

| 이름 | 값 |
|---|---|
| SOLAPI_API_KEY | 솔라피 콘솔 > API Key |
| SOLAPI_API_SECRET | 솔라피 콘솔 > API Secret |
| SOLAPI_SENDER | 솔라피에 등록된 발신번호 |
| NOTIFY_TO | 접수 알림 받을 번호 (쉼표로 여러 개) |
| CUSTOMER_SMS | `on` 이면 고객에게 접수 확인 문자 발송 |

빌드 명령 없음, 출력 디렉터리 `/`.
