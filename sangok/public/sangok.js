/* 산곡역자이힐스테이트&하늘채 — 슬라이더, 시스템 탭, 숫자 카운트, 스크롤 등장 */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* CORE VALUE 슬라이더 */
  var track = document.getElementById('coreTrack');
  if (track) {
    var slides = track.children, n = slides.length, cur = 0, timer = null;
    var dots = document.getElementById('coreDots');
    for (var i = 0; i < n; i++) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'core__dot'; b.setAttribute('aria-label', (i + 1) + '번째 이미지');
      b.addEventListener('click', (function (k) { return function () { go(k); restart(); }; })(i));
      dots.appendChild(b);
    }
    function mark() { for (var j = 0; j < n; j++) dots.children[j].setAttribute('aria-current', j === cur ? 'true' : 'false'); }
    function go(k) { cur = (k + n) % n; track.scrollTo({ left: track.clientWidth * cur, behavior: reduce ? 'auto' : 'smooth' }); mark(); }
    function restart() { if (timer) clearInterval(timer); if (!reduce) timer = setInterval(function () { go(cur + 1); }, 5000); }
    document.getElementById('corePrev').addEventListener('click', function () { go(cur - 1); restart(); });
    document.getElementById('coreNext').addEventListener('click', function () { go(cur + 1); restart(); });
    var st; track.addEventListener('scroll', function () {
      clearTimeout(st); st = setTimeout(function () { var k = Math.round(track.scrollLeft / track.clientWidth); if (k !== cur) { cur = k; mark(); restart(); } }, 120);
    }, { passive: true });
    window.addEventListener('resize', function () { track.scrollLeft = track.clientWidth * cur; });
    mark(); restart();
  }

  /* 시스템 탭 */
  var tabs = document.querySelectorAll('[data-sys]');
  var img = document.getElementById('sysImg'), fig = document.getElementById('sysFig');
  var names = { smart: '스마트 & 안전 시스템', energy: '에너지 시스템', convenience: '편의 시스템' };
  Array.prototype.forEach.call(tabs, function (t) {
    t.addEventListener('click', function () {
      Array.prototype.forEach.call(tabs, function (o) { o.setAttribute('aria-selected', o === t ? 'true' : 'false'); });
      var src = 'assets/img/sys-' + t.getAttribute('data-sys') + '.webp';
      img.src = src; img.alt = names[t.getAttribute('data-sys')]; fig.setAttribute('data-hires', src);
    });
  });

  /* 숫자 카운트 */
  function count(el) {
    var to = +el.getAttribute('data-count'), t0 = null, d = 1400;
    function f(ts) { if (!t0) t0 = ts; var p = Math.min(1, (ts - t0) / d); p = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * p).toLocaleString('ko-KR'); if (p < 1) requestAnimationFrame(f); }
    requestAnimationFrame(f);
  }

  /* 스크롤 등장 */
  if (!('IntersectionObserver' in window) || reduce) return;
  var sel = '.sec__head, .bnf__item, .stat li, .facts, .site, .comm, .cgal__item, .loc__grp, .utbl-wrap, .pfig, .free, .terms-block, .band__copy, .brands__row div, .tabpanel';
  var els = document.querySelectorAll(sel);
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target, sib = el.parentNode ? Array.prototype.indexOf.call(el.parentNode.children, el) : 0;
      el.style.transitionDelay = Math.min(sib, 6) * 70 + 'ms';
      el.classList.add('rv--in'); io.unobserve(el);
      Array.prototype.forEach.call(el.querySelectorAll('[data-count]'), count);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  Array.prototype.forEach.call(els, function (el) {
    var r = el.getBoundingClientRect();
    if (r.top < window.innerHeight) return;           // 첫 화면에 보이는 것은 그대로 둠
    el.classList.add('rv'); io.observe(el);
  });
})();
