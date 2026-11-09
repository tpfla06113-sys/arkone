# 산곡역자이힐스테이트&하늘채 관심고객 사이트 (sangokxi.com)

아크원과 같은 구조(Cloudflare Worker). 화면은 `public/`, 접수·문자·관리자는 `src/`.

Cloudflare Worker `sangok` 은 이 저장소 main 브랜치의 `sangok` 폴더(루트 디렉터리)로 자동 배포.
도메인 sangokxi.com, www.sangokxi.com 은 `wrangler.jsonc` routes 로 연결.

Secret (Cloudflare > sangok > 설정 > 변수 및 암호): SOLAPI_API_KEY, SOLAPI_API_SECRET, NOTIFY_TO, SOLAPI_SENDER, ADMIN_PASSWORD

관리자: /admin · 점검: /api/health
