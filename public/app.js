/* 청라 아크원 푸르지오 — 페이지 동작 / 신청서 / 추적 (오정 해모로 템플릿 공용)
 * 원칙: 콘텐츠는 HTML에 이미 있고(JS 없이도 보임), 여기서는 데이터 렌더링·검증·전송·추적만 담당한다.
 * 신청 "완료"는 서버 저장 성공(HTTP 200 + ok:true)일 때만 인정하고, 그때만 전환 이벤트를 보낸다.
 */
(function () {
  'use strict';
  var D = window.SITE_DATA;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  var PREVIEW = !!window.__PREVIEW__;           // 미리보기: 저장·전송 없이 화면만 시뮬레이션
  var CFG = window.__CONFIG__ || {};
  var HOOKS = window.__INTERNAL_HOOKS__ || {};   // 인증된 검토 화면에서만 채워지는 확장 지점 (공개 화면에서는 비어 있음)
  function hk(name) { var f = HOOKS[name]; return typeof f === 'function' ? f.apply(HOOKS, Array.prototype.slice.call(arguments, 1)) : undefined; }

  /* ---------- 설정 로드 ---------- */
  function loadConfig() {
    if (window.__CONFIG__) return Promise.resolve(window.__CONFIG__);
    return fetch('/config.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () {
      return { phone: '', leadEnabled: false, tracking: {}, privacy: {}, times: [] };
    });
  }

  /* ---------- 유입경로 (첫 방문 기준 저장) ---------- */
  var ATTR_KEY = 'ojeong_attr';
  function captureAttribution() {
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(ATTR_KEY) || 'null'); } catch (e) { /* ignore */ }
    var p = new URLSearchParams(location.search);
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid',
      'n_media', 'n_query', 'n_rank', 'n_ad_group', 'n_ad', 'n_keyword_id', 'n_keyword', 'n_campaign_type', 'n_contract', 'n_ad_group_type', 'NaPm'];   // 네이버 검색광고 자동 파라미터
    var cur = {}; var any = false;
    keys.forEach(function (k) { var v = p.get(k); if (v) { cur[k] = v.slice(0, 200); any = true; } });
    if (saved && !any) return saved;
    var a = cur;
    a.referrer = (document.referrer || '').slice(0, 300);
    a.landing_url = (location.origin + location.pathname + (any ? location.search.replace(/[?&](?!utm_|fbclid|gclid|n_|NaPm)[^&]*/g, '') : '')).slice(0, 400);
    if (!saved || any) { try { sessionStorage.setItem(ATTR_KEY, JSON.stringify(a)); } catch (e) { /* ignore */ } }
    return a;
  }
  function cookie(n) { var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }
  var ATTR = {};

  /* ---------- 추적 (설정된 ID만 로드) ---------- */
  var T = { gtm: false, ga4: false, fb: false, gads: false };
  function loadScript(src) { var s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); }
  function initTracking(t) {
    if (PREVIEW) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    if (t.gtmId) {
      T.gtm = true;
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      loadScript('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(t.gtmId));
    } else if (t.ga4Id || t.gadsId) {
      loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(t.ga4Id || t.gadsId));
      window.gtag('js', new Date());
      if (t.ga4Id) { T.ga4 = true; window.gtag('config', t.ga4Id); }
      if (t.gadsId) { T.gads = true; window.gtag('config', t.gadsId); }
    }
    if (t.metaPixelId) {
      T.fb = true;
      !function (f, b, e, v, n, tt, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; tt = b.createElement(e); tt.async = !0; tt.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(tt, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', t.metaPixelId);
      window.fbq('track', 'PageView');
    }
  }
  function beacon(event, eventId, detail) {
    if (PREVIEW) return;
    try {
      var body = JSON.stringify({ event: event, event_id: eventId || '', detail: detail || '', attribution: ATTR });
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (e) { /* ignore */ }
  }
  /* 이벤트 구분: page_view / phone_click / lead_submit_success / visit_booking_success */
  function track(name, eventId) {
    if (PREVIEW) { (window.__trackLog = window.__trackLog || []).push({ name: name, eventId: eventId || null }); return; }
    var payload = { event: name };
    if (eventId) payload.event_id = eventId;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);                                         // GTM 사용 시 트리거로 연결
    if (T.ga4 && !T.gtm) {
      var ga = { phone_click: 'phone_click', lead_submit_success: 'generate_lead', visit_booking_success: 'book_visit' }[name];
      if (ga) window.gtag('event', ga, { event_id: eventId || undefined });
    }
    if (T.fb) {
      if (name === 'lead_submit_success') window.fbq('track', 'Lead', {}, { eventID: eventId });
      else if (name === 'visit_booking_success') window.fbq('track', 'Schedule', {}, { eventID: eventId });
      else if (name === 'phone_click') window.fbq('trackCustom', 'PhoneClick');
    }
    if (T.gads && !T.gtm && (name === 'lead_submit_success' || name === 'visit_booking_success')) {
      var label = name === 'lead_submit_success' ? CFG.tracking.gadsLeadLabel : CFG.tracking.gadsVisitLabel;
      if (label) window.gtag('event', 'conversion', { send_to: CFG.tracking.gadsId + '/' + label, transaction_id: eventId });
    }
    beacon(name, eventId);
  }

  /* ---------- 화면 (콘텐츠는 HTML 에 고정 — 확인된 현장 정보와 이미지) ---------- */
  function setPhone() {
    var raw = (CFG.phone || '').trim(); var phone = raw.replace(/[^\d+]/g, '');
    var shown = /^1[5-8]\d{6}$/.test(phone) ? phone.slice(0, 4) + '-' + phone.slice(4) : (phone ? fmtPhone(phone) : '');
    $$('.js-phone-text').forEach(function (t) { if (shown) t.textContent = shown; });
    $$('.js-call').forEach(function (a) {
      if (phone) {
        a.setAttribute('href', 'tel:' + phone);
        a.addEventListener('click', function () { track('phone_click'); });      // 전화 버튼 클릭(통화 연결·계약과 구분)
      } else {
        a.hidden = true;                             // 번호가 없으면 전화 버튼 자체를 숨김
      }
    });
    if (!phone) { $$('.js-phone-text').forEach(function (t) { var line = t.closest('p'); if (line) line.hidden = true; }); $('#dock').classList.add('dock--single'); document.body.classList.add('no-phone'); }
  }
  function renderPlan() {
    // 평면도 확대 (data-hires 고해상도 원본)
    $$('.js-zoom').forEach(function (fig) {
      var src = fig.getAttribute('data-hires'); var alt = (fig.querySelector('img') || {}).alt;
      fig.addEventListener('click', function () { openLightbox(src, alt); });
    });
    // 타입 탭 (42A·42B·42C·59·71)
    var tabs = $$('.ptab');
    function select(t, focus) {
      tabs.forEach(function (b) { var on = b === t; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; var pn = document.getElementById(b.getAttribute('aria-controls')); if (pn) pn.hidden = !on; });
      if (focus) t.focus();
    }
    tabs.forEach(function (b, k) {
      b.addEventListener('click', function () { select(b); });
      b.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
        e.preventDefault(); select(tabs[(k + d + tabs.length) % tabs.length], true);
      });
    });
    hk('plan', { section: $('#plan'), figure: $('#planFig') });
  }


  /* ---------- 개인정보 처리방침 (운영정보는 설정값) ---------- */
  function renderPrivacy() {
    var p = CFG.privacy || {}; var body = $('#privacyBody'); body.textContent = '';
    var rows = [['수집·이용 목적', '분양 상담 및 방문예약 안내, 신청 내용 확인'],
      ['수집 항목', '(필수) 고객명, 연락처 / (선택) 방문 희망일·시간 / (자동 수집) 접속 유입경로(UTM 등), 접속 환경 정보']];
    if (p.retention) rows.push(['보유·이용 기간', p.retention]);
    if (p.operator) rows.push(['수집·이용 주체', p.operator]);
    if (p.contact) rows.push(['문의처', p.contact]);
    if (p.processors) rows.push(['제3자 제공·처리위탁', p.processors]);
    rows.push(['동의 거부 권리', '동의를 거부할 수 있으나, 거부 시 상담 및 방문예약 신청이 제한됩니다.']);
    var t = el('table'); var tb = el('tbody'); t.appendChild(tb);
    rows.forEach(function (r) { var tr = el('tr'); tr.appendChild(el('th', '', r[0])); tr.appendChild(el('td', '', r[1])); tb.appendChild(tr); });
    body.appendChild(t);
    body.appendChild(el('p', 'hint', '※ 생년월일·주민등록번호 등은 수집하지 않습니다. 광고 성과 측정을 위해 광고 플랫폼의 추적 기술(픽셀 등)이 사용될 수 있습니다.'));
  }
  function wireDialogs() {
    var dlg = $('#privacyDlg');
    function open() { renderPrivacy(); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
    $$('.js-privacy').forEach(function (b) { b.addEventListener('click', open); });
    $('#closePrivacy').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  }

  /* ---------- 평면도 라이트박스 (핀치/휠/드래그 확대) ---------- */
  var lb = { scale: 1, x: 0, y: 0, base: 1, pts: {}, last: 0 };
  function openLightbox(src, alt) {
    var dlg = $('#lightbox'); var img = $('#lbImg');
    img.onload = function () { fit(); };
    img.alt = alt || ''; img.src = src;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    if (img.complete) fit();
  }
  function applyLb() { var img = $('#lbImg'); img.style.transform = 'translate(' + lb.x + 'px,' + lb.y + 'px) scale(' + lb.scale + ')'; }
  function fit() {
    var st = $('#lbStage'); var img = $('#lbImg'); if (!img.naturalWidth) return;
    lb.base = Math.min(st.clientWidth / img.naturalWidth, st.clientHeight / img.naturalHeight, 1) || 1;
    img.style.width = img.naturalWidth + 'px'; img.style.height = img.naturalHeight + 'px'; img.style.left = '0'; img.style.top = '0';
    lb.scale = lb.base; lb.x = (st.clientWidth - img.naturalWidth * lb.scale) / 2; lb.y = (st.clientHeight - img.naturalHeight * lb.scale) / 2; applyLb();
  }
  function zoomAt(f, cx, cy) {
    var ns = Math.max(lb.base * 0.8, Math.min(lb.base * 8, lb.scale * f)); var r = ns / lb.scale;
    lb.x = cx - (cx - lb.x) * r; lb.y = cy - (cy - lb.y) * r; lb.scale = ns; applyLb();
  }
  function wireLightbox() {
    var st = $('#lbStage'); var dlg = $('#lightbox');
    $('#lbClose').addEventListener('click', function () { dlg.close(); });
    $('#lbIn').addEventListener('click', function () { zoomAt(1.4, st.clientWidth / 2, st.clientHeight / 2); });
    $('#lbOut').addEventListener('click', function () { zoomAt(1 / 1.4, st.clientWidth / 2, st.clientHeight / 2); });
    $('#lbReset').addEventListener('click', fit);
    st.addEventListener('wheel', function (e) { e.preventDefault(); var r = st.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    var dist0 = 0;
    st.addEventListener('pointerdown', function (e) { st.setPointerCapture(e.pointerId); lb.pts[e.pointerId] = { x: e.clientX, y: e.clientY }; dist0 = 0; });
    st.addEventListener('pointermove', function (e) {
      var p = lb.pts[e.pointerId]; if (!p) return;
      var ids = Object.keys(lb.pts);
      if (ids.length === 2) {
        lb.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        var a = lb.pts[ids[0]], b = lb.pts[ids[1]]; var d = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist0) { var r = st.getBoundingClientRect(); zoomAt(d / dist0, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); }
        dist0 = d;
      } else { lb.x += e.clientX - p.x; lb.y += e.clientY - p.y; lb.pts[e.pointerId] = { x: e.clientX, y: e.clientY }; applyLb(); }
    });
    function up(e) { delete lb.pts[e.pointerId]; dist0 = 0; }
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    st.addEventListener('dblclick', function (e) { var r = st.getBoundingClientRect(); if (lb.scale > lb.base * 1.5) fit(); else zoomAt(3, e.clientX - r.left, e.clientY - r.top); });
  }

  /* ---------- 신청서 (상단 간편 신청 + 하단 전체 신청서: 같은 검증·같은 전송 경로) ---------- */
  function fmtPhone(v) {
    var d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length < 4) return d; if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
    return d.length <= 10 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }
  function kstDate(offsetDays) { var d = new Date(Date.now() + offsetDays * 864e5); return new Date(d.getTime() + 9 * 36e5).toISOString().slice(0, 10); }
  function fld(f, name) { return f.querySelector('[name=' + name + ']'); }
  function setErr(f, key, msg) {
    var e = f.querySelector('.err[data-f="' + key + '"]'); if (e) e.textContent = msg || '';
    var i = fld(f, key); if (i && i.type !== 'radio' && i.type !== 'checkbox') i.classList.toggle('is-bad', !!msg);
  }
  function clearErrs(f) { ['name', 'phone', 'consent', 'visit_date', 'visit_time', 'form'].forEach(function (k) { setErr(f, k, ''); }); }
  function intentOf(f) { var r = f.querySelector('input[name=intent]:checked'); if (r) return r.value; var h = f.querySelector('input[type=hidden][name=intent]'); return h ? h.value : 'consult'; }
  function validate(f) {
    var er = {}; var date = fld(f, 'visit_date');
    if (fld(f, 'name').value.trim().length < 2) er.name = '성함을 2자 이상 입력해 주세요.';
    if (!/^01[016789]\d{7,8}$/.test(fld(f, 'phone').value.replace(/\D/g, ''))) er.phone = '휴대폰 번호를 정확히 입력해 주세요. (예: 010-1234-5678)';
    if (!fld(f, 'consent').checked) er.consent = '개인정보 수집·이용에 동의해 주세요.';
    if (date && intentOf(f) === 'visit' && date.value && (date.value < date.min || date.value > date.max)) er.visit_date = '방문 희망일을 확인해 주세요.';
    return er;
  }
  function syncIntent() {
    $$('.lead-form').forEach(function (f) {
      var v = intentOf(f); var box = f.querySelector('.js-visit'); if (box) box.hidden = v !== 'visit';
      var b = f.querySelector('.js-submit'); if (b && !b.disabled) b.textContent = v === 'visit' ? '방문예약 신청하기' : '관심고객 등록하기';
    });
  }
  function chooseIntent(v) { $$('.lead-form input[name=intent][value=' + v + ']').forEach(function (r) { r.checked = true; }); syncIntent(); }

  /* 접수 완료: 두 신청 영역을 모두 완료 안내로 바꿔 같은 사람이 이어서 다시 보내지 않게 한다 */
  function showDone(intent, from) {
    $$('.js-card').forEach(function (card) {
      card.textContent = '';
      var d = el('div', 'done'); d.setAttribute('role', 'status'); d.tabIndex = -1;
      d.appendChild(el('h3', '', intent === 'visit' ? '방문예약 신청이 접수되었습니다' : '관심고객 등록이 접수되었습니다'));
      d.appendChild(el('p', '', intent === 'visit' ? '방문 일정은 담당자가 확인 후 연락드려 안내합니다.' : '담당자가 확인 후 연락드리겠습니다.'));
      card.appendChild(d);
    });
    var mine = from && from.closest('.js-card') ? from.closest('.js-card') : $('#formCard');
    var dn = mine.querySelector('.done'); if (dn) { dn.focus({ preventScroll: true }); mine.scrollIntoView({ block: 'center' }); }
  }

  var submitting = false; var started = false; var sentOnce = false;
  function formUnavailable() {
    $$('.js-card').forEach(function (card) {
      card.textContent = '';
      var d = el('div', 'done'); d.setAttribute('role', 'status');
      d.appendChild(el('h3', '', '온라인 접수를 준비하고 있습니다'));
      d.appendChild(el('p', '', CFG.phone ? '지금은 전화로 문의해 주세요.' : '접수 준비가 끝나는 대로 안내드리겠습니다.'));
      if (CFG.phone) { var a = el('a', 'btn btn--navy btn--block', '전화문의'); a.href = 'tel:' + CFG.phone.replace(/[^\d+]/g, ''); a.style.marginTop = '16px'; a.addEventListener('click', function () { track('phone_click'); }); d.appendChild(a); }
      card.appendChild(d);
    });
    $$('[data-intent]').forEach(function (a) { a.addEventListener('click', function () { beacon('visit_cta_click'); }); });
  }

  function wireOne(form) {
    var btn = form.querySelector('.js-submit'); var phone = fld(form, 'phone'); var date = fld(form, 'visit_date'); var time = fld(form, 'visit_time');
    if (date) { date.min = kstDate(0); date.max = kstDate(90); }
    if (time) (CFG.times && CFG.times.length ? CFG.times : ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']).forEach(function (t) { var o = el('option', '', t); o.value = t; time.appendChild(o); });
    $$('input[name=intent]', form).forEach(function (r) { r.addEventListener('change', syncIntent); });
    phone.addEventListener('input', function () { phone.value = fmtPhone(phone.value); });
    form.addEventListener('focusin', function () { if (!started) { started = true; beacon('form_start'); } });

    form.addEventListener('submit', function (e) {
      e.preventDefault(); if (submitting || sentOnce) return;                  // 중복 클릭·이중 제출 방지
      clearErrs(form);
      var er = validate(form);
      if (Object.keys(er).length) {
        Object.keys(er).forEach(function (k) { setErr(form, k, er[k]); });
        var first = er.name ? fld(form, 'name') : er.phone ? phone : er.visit_date ? date : fld(form, 'consent'); first.focus(); beacon('form_error', '', Object.keys(er).join(','));
        return;
      }
      var intent = intentOf(form);
      var a = Object.assign({}, ATTR, { fbp: cookie('_fbp'), fbc: cookie('_fbc') || (ATTR.fbclid ? 'fb.1.' + Date.now() + '.' + ATTR.fbclid : '') });
      var payload = { name: fld(form, 'name').value.trim(), phone: phone.value, intent: intent, consent: true, consent_version: (CFG.privacy || {}).version || '', website: fld(form, 'website').value, attribution: a,
        visit_date: intent === 'visit' && date ? date.value : '', visit_time: intent === 'visit' && time ? time.value : '' };
      submitting = true; btn.disabled = true; var label = btn.textContent; btn.textContent = '전송 중...';

      var req = PREVIEW
        ? Promise.resolve({ status: 200, body: { ok: true, duplicate: false, event_id: 'preview_' + Date.now(), intent: intent } })
        : fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; }); });

      req.then(function (r) {
        var b = r.body || {};
        if (r.status === 200 && b.ok) {                    // ← 서버 저장 성공일 때만 완료 처리
          sentOnce = true;
          // 신규 고객: Lead 1회(event_id) + 방문예약이면 Schedule 1회(schedule_event_id, 별개 ID). 기존 고객의 최초 방문예약은 서버가 schedule_event_id 만 내려줌.
          if (!b.duplicate && b.event_id) track('lead_submit_success', b.event_id);
          if (b.schedule_event_id) track('visit_booking_success', b.schedule_event_id);
          showDone(intent, form);
          if (PREVIEW) hk('previewNote', $('#previewNote'));
        } else if (r.status === 422 && b.fields) {
          Object.keys(b.fields).forEach(function (k) { setErr(form, k, b.fields[k]); });
          btn.textContent = label; btn.disabled = false; submitting = false;
        } else {
          setErr(form, 'form', b.message || '신청이 저장되지 않았습니다. 잠시 후 다시 시도하거나 전화로 문의해 주세요.');
          btn.textContent = label; btn.disabled = false; submitting = false; // 실패: 전환 이벤트 없음
        }
      }).catch(function () {
        setErr(form, 'form', '네트워크 오류로 신청이 저장되지 않았습니다. 연결을 확인한 뒤 다시 시도해 주세요.');
        btn.textContent = label; btn.disabled = false; submitting = false;
      });
    });
  }

  function wireForm() {
    if (!PREVIEW && !CFG.leadEnabled) return formUnavailable();   // 서버가 개인정보 운영정보 미설정으로 접수를 막는 상태
    $$('.lead-form').forEach(wireOne);
    $$('[data-intent]').forEach(function (a) { a.addEventListener('click', function () { chooseIntent(a.getAttribute('data-intent')); beacon('visit_cta_click'); }); });
    syncIntent();
    // 신청서가 화면에 보이는 동안에는 하단 고정 버튼을 내려 중복 노출·가림을 막는다
    if ('IntersectionObserver' in window) {
      var seen = new Set();
      var io = new window.IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) seen.add(x.target); else seen.delete(x.target); }); dock.classList.toggle('dock--away', seen.size > 0); }, { threshold: 0.25 });
      $$('.js-card').forEach(function (c) { io.observe(c); });
    }
    var dv = $('#dockVisit'); if (dv) dv.addEventListener('click', function (e) { var f = $('#quickCard'); if (!f) return; e.preventDefault(); f.scrollIntoView({ behavior: 'smooth', block: 'start' }); beacon('visit_cta_click'); });
    // 모바일 키보드·하단 고정 버튼이 입력칸을 가리지 않도록: 입력 중에는 고정 버튼을 내린다
    var dock = $('#dock');
    document.addEventListener('focusin', function (e) { if (e.target.matches && e.target.matches('input,select,textarea')) dock.classList.add('dock--hidden'); });
    document.addEventListener('focusout', function () { setTimeout(function () { var a = document.activeElement; if (!(a && a.matches && a.matches('input,select,textarea'))) dock.classList.remove('dock--hidden'); }, 50); });
  }

  /* ---------- 헤더: PC 에서 첫 화면 위 투명 → 스크롤하면 흰 바 ---------- */
  (function wireHeader() {
    var hd = document.querySelector('.hd'); if (!hd) return;
    var on = false;
    function upd() { var s = window.scrollY > 24; if (s !== on) { on = s; hd.classList.toggle('hd--solid', s); } }
    window.addEventListener('scroll', upd, { passive: true }); upd();
  })();

  /* ---------- 시작 ---------- */
  loadConfig().then(function (c) {
    CFG = c; CFG.tracking = CFG.tracking || {};
    ATTR = captureAttribution();
    hk('init', { config: CFG });
    renderPlan();
    setPhone(); wireDialogs(); wireLightbox(); wireForm();
    if (PREVIEW) hk('previewNote', $('#previewNote'));
    initTracking(CFG.tracking);
    track('page_view'); // GTM 이벤트 + 사이트 로그
  });
})();
