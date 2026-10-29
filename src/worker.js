// 관심고객 등록 → 솔라피 문자 발송 (Cloudflare Worker). 화면 파일은 public/ 에서 그대로 제공
// 비밀값은 Cloudflare 대시보드 > Settings > Variables and Secrets(Secret)에만 저장. 페이지 코드에는 넣지 않음.
//   SOLAPI_API_KEY, SOLAPI_API_SECRET : 솔라피 콘솔 > API Key 관리
//   SOLAPI_SENDER  : 솔라피에 등록된 발신번호 (비우면 NOTIFY_TO 첫 번호)
//   NOTIFY_TO      : 접수 알림 받을 번호, 여러 개면 쉼표 (예: 01012345678,01098765432)
//   CUSTOMER_SMS   : "on" 이면 고객에게도 접수 확인 문자 발송
const SITE = '청라 아크원 푸르지오';
const TEL = '1688-6189';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const digits = (s) => String(s || '').replace(/\D/g, '');

async function solapiAuth(key, secret) {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, '');
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(date + salt));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${hex}`;
}

async function sendSms(env, messages) {
  const res = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await solapiAuth(env.SOLAPI_API_KEY, env.SOLAPI_API_SECRET) },
    body: JSON.stringify({ messages }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`solapi ${res.status} ${body.errorCode || ''} ${body.errorMessage || ''}`.trim());
  const failed = (body.failedMessageList || [])[0];
  if (failed) throw new Error(`solapi ${failed.statusCode || ''} ${failed.statusMessage || ''}`.trim());
  return body;
}

async function handleLead(request, env) {
  let p;
  try { p = await request.json(); } catch { return json({ ok: false }, 400); }

  const eventId = 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  if (p.website) return json({ ok: true, duplicate: false, event_id: eventId }); // 스팸봇(숨김칸 입력) 무시

  const name = String(p.name || '').trim().slice(0, 30);
  const phone = digits(p.phone);
  const intent = p.intent === 'visit' ? 'visit' : 'consult';
  const fields = {};
  if (!name) fields.name = '성함을 입력해 주세요.';
  if (!/^01[016789]\d{7,8}$/.test(phone)) fields.phone = '휴대폰 번호를 정확히 입력해 주세요.';
  if (p.consent !== true) fields.consent = '개인정보 수집·이용에 동의해 주세요.';
  if (intent === 'visit' && !p.visit_date) fields.visit_date = '방문 희망일을 선택해 주세요.';
  if (Object.keys(fields).length) return json({ ok: false, fields }, 422);

  const notify = String(env.NOTIFY_TO || '').split(',').map(digits).filter(Boolean);
  const from = digits(env.SOLAPI_SENDER) || notify[0]; // 발신번호를 따로 안 넣으면 알림 받는 번호(솔라피 등록 번호)로 발송
  const visit = intent === 'visit' ? `${p.visit_date} ${p.visit_time || ''}`.trim() : '';
  const fmt = phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
  const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');

  const messages = notify.map((to) => ({
    to, from,
    text: `[${SITE}] ${intent === 'visit' ? '방문예약' : '상담문의'} 접수\n성함: ${name}\n연락처: ${fmt}${visit ? `\n방문: ${visit}` : ''}\n접수: ${kst}`,
  }));

  if (env.CUSTOMER_SMS === 'on') {
    messages.push({
      to: phone, from,
      text: intent === 'visit'
        ? `[${SITE}] ${name}님, ${visit} 견본주택 방문예약이 접수되었습니다. 담당자가 확인 연락드리겠습니다. 문의 ${TEL}`
        : `[${SITE}] ${name}님, 관심고객 등록이 완료되었습니다. 담당자가 곧 연락드리겠습니다. 문의 ${TEL}`,
    });
  }

  try {
    if (messages.length) await sendSms(env, messages);
  } catch (e) {
    console.error(e);
    const why = !env.SOLAPI_API_KEY || !env.SOLAPI_API_SECRET ? '솔라피 키 미설정' : !from ? '발신번호 미설정' : String(e.message).slice(0, 120);
    return json({ ok: false, error: 'send_failed', message: `신청이 저장되지 않았습니다. 전화로 문의해 주세요. (${why})` }, 502);
  }
  return json({ ok: true, duplicate: false, event_id: eventId, intent });
}

async function health(env) {
  const out = {
    worker: 'ok',
    SOLAPI_API_KEY: !!env.SOLAPI_API_KEY, SOLAPI_API_SECRET: !!env.SOLAPI_API_SECRET,
    SOLAPI_SENDER: digits(env.SOLAPI_SENDER).replace(/^(\d{3})\d+(\d{4})$/, '$1****$2'),
    NOTIFY_TO: String(env.NOTIFY_TO || '').split(',').map(digits).filter(Boolean).length + '개',
    CUSTOMER_SMS: env.CUSTOMER_SMS || 'off',
  };
  if (env.SOLAPI_API_KEY && env.SOLAPI_API_SECRET) {
    try {
      const r = await fetch('https://api.solapi.com/cash/v1/balance', { headers: { Authorization: await solapiAuth(env.SOLAPI_API_KEY, env.SOLAPI_API_SECRET) } });
      const b = await r.json().catch(() => ({}));
      out.solapi = r.ok ? `연결 OK (잔액 ${b.balance ?? '?'}원, 포인트 ${b.point ?? '?'})` : `연결 실패 ${r.status} ${b.errorCode || ''} ${b.errorMessage || ''}`;
    } catch (e) { out.solapi = '연결 실패 ' + e.message; }
  }
  return json(out);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/lead') return request.method === 'POST' ? handleLead(request, env) : json({ ok: false }, 405);
    if (pathname === '/api/health') return health(env); // 설정 점검용: 문자는 보내지 않고 키·번호 설정과 솔라피 잔액 조회만
    if (pathname === '/api/track') return new Response(null, { status: 204 }); // 방문 통계 비콘 자리 — 지금은 저장하지 않음
    return env.ASSETS.fetch(request);
  },
};
