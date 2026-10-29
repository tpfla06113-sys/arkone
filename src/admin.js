// 관리자 페이지 화면 (/admin). 비밀번호는 대시보드 Secret ADMIN_PASSWORD
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtPhone = (p) => String(p || '').replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
const fmtTime = (t) => new Date(t + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');
const INTENT = { visit: '방문예약', consult: '상담문의' };
const SMS = { sent: '발송', failed: '실패', pending: '대기', off: '미설정' };

const page = (title, body) => `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${title}</title><style>
:root{--bg:#f4f6f9;--card:#fff;--ink:#14213d;--sub:#5b6577;--line:#e3e7ee;--navy:#0B2240;--ok:#127a3e;--bad:#c0392b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
header{background:var(--navy);color:#fff;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px}
header b{font-size:16px}header a{color:#cfd8e6;font-size:14px;text-decoration:none}
main{max-width:1100px;margin:0 auto;padding:16px}
h2{font-size:17px;margin:28px 0 10px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.card span{display:block;color:var(--sub);font-size:13px}.card b{font-size:26px;font-variant-numeric:tabular-nums}
.box{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:14px;white-space:nowrap}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left}th{background:#f8f9fb;color:var(--sub);font-weight:600}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tr:last-child td{border-bottom:0}
.ok{color:var(--ok)}.bad{color:var(--bad)}.muted{color:var(--sub);font-size:13px}
.bar{display:flex;justify-content:space-between;align-items:end;gap:10px;flex-wrap:wrap}
.btn{display:inline-block;background:var(--navy);color:#fff;border:0;border-radius:8px;padding:9px 14px;font-size:14px;text-decoration:none;cursor:pointer}
.del{background:none;border:1px solid var(--line);color:var(--sub);border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer}
form.login{max-width:340px;margin:12vh auto;background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px}
form.login input{width:100%;padding:12px;border:1px solid var(--line);border-radius:8px;font-size:16px;margin:12px 0}
form.login .btn{width:100%;padding:12px;font-size:16px}
</style></head><body>${body}</body></html>`;

export const loginPage = (msg = '') => page('관리자 로그인', `
<form class="login" method="post" action="/admin/login">
  <b style="font-size:18px">청라 아크원 관리자</b>
  <input type="password" name="password" placeholder="관리자 비밀번호" autocomplete="current-password" autofocus required>
  ${msg ? `<p class="bad" style="margin:0 0 12px">${esc(msg)}</p>` : ''}
  <button class="btn">로그인</button>
</form>`);

export const noPasswordPage = () => page('관리자 설정 필요', `
<form class="login"><b style="font-size:18px">관리자 비밀번호가 아직 없어요</b>
<p class="muted">Cloudflare → arkone → 설정 → 변수 및 암호에서 <b>ADMIN_PASSWORD</b>를 암호로 추가하고 배포하면 이 화면에서 로그인할 수 있어요.</p></form>`);

export function adminPage(stats, leads) {
  const today = Object.keys(stats.daily).at(-1);
  const t = stats.daily[today] || {};
  const days = Object.entries(stats.daily).reverse();
  const sources = Object.entries(stats.sources).sort((a, b) => b[1].visitors - a[1].visitors);
  return page('청라 아크원 관리자', `
<header><b>청라 아크원 관리자</b><a href="/admin/logout">로그아웃</a></header>
<main>
  <div class="cards">
    <div class="card"><span>오늘 방문자</span><b>${t.visitors || 0}</b></div>
    <div class="card"><span>오늘 등록</span><b>${(t.consult || 0) + (t.visit || 0)}</b></div>
    <div class="card"><span>누적 관심고객</span><b>${stats.total.leads}</b></div>
    <div class="card"><span>누적 방문예약</span><b>${stats.total.visit}</b></div>
  </div>
  ${stats.total.smsFailed ? `<p class="bad">알림 문자 발송 실패 ${stats.total.smsFailed}건 — 아래 목록의 '문자' 칸을 확인하세요.</p>` : ''}

  <h2>날짜별 (최근 ${stats.days}일)</h2>
  <div class="box"><table><thead><tr><th>날짜</th><th class="n">방문자</th><th class="n">페이지뷰</th><th class="n">전화 클릭</th><th class="n">상담문의</th><th class="n">방문예약</th></tr></thead><tbody>
  ${days.map(([d, r]) => `<tr><td>${d.slice(5).replace('-', '/')}</td><td class="n">${r.visitors}</td><td class="n">${r.views}</td><td class="n">${r.calls}</td><td class="n">${r.consult}</td><td class="n">${r.visit}</td></tr>`).join('')}
  </tbody></table></div>

  <h2>유입 경로 (최근 ${stats.days}일)</h2>
  <div class="box"><table><thead><tr><th>경로</th><th class="n">방문자</th><th class="n">등록</th></tr></thead><tbody>
  ${sources.length ? sources.map(([s, r]) => `<tr><td>${esc(s)}</td><td class="n">${r.visitors}</td><td class="n">${r.leads}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">아직 기록이 없어요</td></tr>'}
  </tbody></table></div>
  <p class="muted">문자·카톡으로 보내는 링크 끝에 <b>?utm_source=문자</b>, <b>?utm_source=카톡</b>처럼 붙이면 경로가 구분돼요.</p>

  <div class="bar"><h2>관심고객 목록 (${leads.length}명)</h2><a class="btn" href="/admin/leads.csv">엑셀 다운로드</a></div>
  <div class="box"><table><thead><tr><th>접수</th><th>성함</th><th>연락처</th><th>구분</th><th>방문 희망</th><th>경로</th><th>문자</th><th></th></tr></thead><tbody>
  ${leads.length ? leads.map((l) => `<tr><td>${fmtTime(l.created_at)}</td><td>${esc(l.name)}</td><td><a href="tel:${esc(l.phone)}">${fmtPhone(l.phone)}</a></td><td>${INTENT[l.intent] || ''}</td><td>${esc([l.visit_date, l.visit_time].filter(Boolean).join(' '))}</td><td>${esc(l.source)}</td>
  <td class="${l.sms_status === 'sent' ? 'ok' : l.sms_status === 'failed' ? 'bad' : 'muted'}" title="${esc(l.sms_error)}">${SMS[l.sms_status] || ''}</td>
  <td><form method="post" action="/admin/delete" onsubmit="return confirm('${esc(l.name)}님 정보를 삭제할까요? 되돌릴 수 없어요.')"><input type="hidden" name="id" value="${esc(l.id)}"><button class="del">삭제</button></form></td></tr>`).join('') : '<tr><td colspan="8" class="muted">아직 접수가 없어요</td></tr>'}
  </tbody></table></div>
  <p class="muted">개인정보는 수집일로부터 1년이 지나면 자동으로 삭제돼요. 고객이 동의를 철회하면 '삭제'를 눌러 주세요.</p>
</main>`);
}

export function leadsCsv(leads) {
  const head = ['접수일시', '성함', '연락처', '구분', '방문희망일', '방문희망시간', '유입경로', '알림문자'];
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = leads.map((l) => [fmtTime(l.created_at), l.name, fmtPhone(l.phone), INTENT[l.intent], l.visit_date, l.visit_time, l.source, SMS[l.sms_status]].map(cell).join(','));
  return '﻿' + [head.map(cell).join(','), ...rows].join('\r\n'); // BOM: 엑셀에서 한글 깨짐 방지
}
