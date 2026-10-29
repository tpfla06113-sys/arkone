// 관심고객 등록 → 솔라피 문자 발송 (Cloudflare Worker). 화면 파일은 public/ 에서 그대로 제공
// 비밀값은 Cloudflare 대시보드 > Settings > Variables and Secrets(Secret)에만 저장. 페이지 코드에는 넣지 않음.
//   SOLAPI_API_KEY, SOLAPI_API_SECRET : 솔라피 콘솔 > API Key 관리
//   SOLAPI_SENDER  : 솔라피에 등록된 발신번호 (비우면 NOTIFY_TO 첫 번호)
//   NOTIFY_TO      : 접수 알림 받을 번호, 여러 개면 쉼표 (예: 01012345678,01098765432)
//   CUSTOMER_SMS   : "on" 이면 고객에게도 접수 확인 문자 발송
//   ADMIN_PASSWORD : 관리자 페이지(/admin) 비밀번호
import { adminPage, leadsCsv, loginPage, noPasswordPage } from './admin.js';
export { Store } from './store.js';

const SITE = '청라 아크원 푸르지오';
const TEL = '1688-6189';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const digits = (s) => String(s || '').replace(/\D/g, '');
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const store = (env) => env.STORE.get(env.STORE.idFromName('main'));

// 유입 경로: utm_source 우선, 없으면 이전 페이지(referrer) 주소로 구분
function sourceOf(a = {}, host = '') {
  if (a.utm_source) return String(a.utm_source).slice(0, 40);
  let ref = '';
  try { ref = new URL(a.referrer).hostname; } catch {}
  if (!ref || ref === host) return '직접·문자';
  const known = [[/kakao/, '카카오'], [/naver/, '네이버'], [/daum/, '다음'], [/google/, '구글'], [/instagram/, '인스타그램'], [/facebook|fb\./, '페이스북'], [/youtube/, '유튜브']];
  return (known.find(([re]) => re.test(ref)) || [, ref])[1];
}

async function solapiAuth(key, secret) {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, '');
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(date + salt));
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${hex(sig)}`;
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

async function handleLead(request, env, url) {
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

  // 1) 접수 내역 저장 → 2) 문자 발송. 둘 중 하나라도 되면 고객에게는 접수 완료로 안내
  let saved = false;
  try {
    await store(env).addLead({
      id: eventId, created_at: Date.now(), name, phone, intent, visit_date: p.visit_date || '', visit_time: p.visit_time || '',
      source: sourceOf(p.attribution, url.hostname), landing: String(p.attribution?.landing_url || '').slice(0, 300),
      consent_version: String(p.consent_version || '').slice(0, 20),
    });
    saved = true;
  } catch (e) { console.error('store', e); }

  let smsError = '';
  if (!env.SOLAPI_API_KEY || !env.SOLAPI_API_SECRET) smsError = '솔라피 키 미설정';
  else if (!from) smsError = '발신번호 미설정';
  else if (messages.length) {
    try { await sendSms(env, messages); } catch (e) { console.error(e); smsError = String(e.message).slice(0, 120); }
  }
  if (saved) {
    try { await store(env).setSms(eventId, !messages.length ? 'off' : smsError ? 'failed' : 'sent', smsError); } catch (e) { console.error('store', e); }
  }

  if (!saved && (smsError || !messages.length)) {
    return json({ ok: false, error: 'send_failed', message: `신청이 저장되지 않았습니다. 전화로 문의해 주세요. (${smsError || '저장소 오류'})` }, 502);
  }
  return json({ ok: true, duplicate: false, event_id: eventId, intent });
}

// 방문 통계 비콘: 방문자는 IP·브라우저·날짜로 만든 익명값으로만 구분 (IP 자체는 저장하지 않음)
const TRACKED = new Set(['page_view', 'phone_click', 'visit_cta_click', 'form_start']);
async function handleTrack(request, env, url, ctx) {
  const ua = request.headers.get('user-agent') || '';
  let p = {};
  try { p = await request.json(); } catch {}
  if (TRACKED.has(p.event) && !/bot|crawl|spider|preview|headless/i.test(ua)) {
    const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const raw = `${request.headers.get('cf-connecting-ip') || ''}|${ua}|${day}`;
    const visitor = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))).slice(0, 16);
    ctx.waitUntil(store(env).addEvent({ event: p.event, source: sourceOf(p.attribution, url.hostname), visitor }).catch((e) => console.error('store', e)));
  }
  return new Response(null, { status: 204 });
}

// 관리자: 비밀번호에서 만든 서명값을 쿠키로 확인
async function adminToken(env) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('arkone-admin-v1')));
}
const html = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const redirect = (to, headers = {}) => new Response(null, { status: 303, headers: { Location: to, ...headers } });

async function handleAdmin(request, env, url) {
  if (!env.ADMIN_PASSWORD) return html(noPasswordPage());
  const token = await adminToken(env);
  const cookie = (request.headers.get('cookie') || '').match(/(?:^|;\s*)arkone_admin=([a-f0-9]+)/)?.[1];
  const authed = cookie === token;
  const path = url.pathname;

  if (path === '/admin/login' && request.method === 'POST') {
    const form = await request.formData();
    if (String(form.get('password') || '') !== env.ADMIN_PASSWORD) {
      await new Promise((r) => setTimeout(r, 800)); // 비밀번호 대입 속도 늦추기
      return html(loginPage('비밀번호가 맞지 않아요.'), 401);
    }
    return redirect('/admin', { 'Set-Cookie': `arkone_admin=${token}; Path=/admin; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict` });
  }
  if (path === '/admin/logout') return redirect('/admin', { 'Set-Cookie': 'arkone_admin=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict' });
  if (!authed) return html(loginPage());

  const db = store(env);
  if (path === '/admin/delete' && request.method === 'POST') {
    await db.deleteLead(String((await request.formData()).get('id') || ''));
    return redirect('/admin');
  }
  if (path === '/admin/leads.csv') {
    const name = `arkone_leads_${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)}.csv`;
    return new Response(leadsCsv(await db.leads(5000)), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
  }
  return html(adminPage(await db.stats(14), await db.leads(1000)));
}

async function health(env) {
  const out = {
    worker: 'ok',
    SOLAPI_API_KEY: !!env.SOLAPI_API_KEY, SOLAPI_API_SECRET: !!env.SOLAPI_API_SECRET,
    SOLAPI_SENDER: digits(env.SOLAPI_SENDER).replace(/^(\d{3})\d+(\d{4})$/, '$1****$2'),
    NOTIFY_TO: String(env.NOTIFY_TO || '').split(',').map(digits).filter(Boolean).length + '개',
    CUSTOMER_SMS: env.CUSTOMER_SMS || 'off',
    ADMIN_PASSWORD: !!env.ADMIN_PASSWORD,
  };
  try { out.store = `OK (관심고객 ${(await store(env).stats(1)).total.leads}명)`; } catch (e) { out.store = '오류 ' + e.message; }
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
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname === '/api/lead') return request.method === 'POST' ? handleLead(request, env, url) : json({ ok: false }, 405);
    if (pathname === '/api/track') return request.method === 'POST' ? handleTrack(request, env, url, ctx) : json({ ok: false }, 405);
    if (pathname === '/api/health') return health(env); // 설정 점검용: 문자는 보내지 않고 키·번호·저장소 상태와 솔라피 잔액 조회만
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return handleAdmin(request, env, url);
    return env.ASSETS.fetch(request);
  },
};
