(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var desktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var SECS = Array.prototype.slice.call(document.querySelectorAll('[data-sec]'));
  var LABELS = ['home', 'legend', '10 days', 'pookalam', 'sadhya', 'culture', 'facts', 'thanks'];
  var AUTO_MS = 9000;      // time per section
  var RESUME_MS = 10000;   // idle before auto-play resumes after user input
  var current = 0;
  var autoTimer = null;
  var resumeTimer = null;
  var enabled = false;       // auto-present off by default; user can start it with the play button
  var ticking = false;
  var prog = null;         // scroll progress bar
  var pxEls = null;        // parallax targets (.sticker img)
  var burstFired = false;

  /* Natural (flow) top of each section, cached at init for nav targets. */
  var tops = [];

  function measure() {
    tops = SECS.map(function (s) { return s.getBoundingClientRect().top + window.pageYOffset; });
  }

  /* ---------- active section ---------- */
  function activeIndex() {
    var y = window.pageYOffset + window.innerHeight / 2;
    var idx = 0;
    for (var i = 0; i < SECS.length; i++) {
      if (tops[i] <= y) idx = i;
    }
    return idx;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var idx = activeIndex();
      if (idx !== current) {
        current = idx;
        paint();
      }
      if (prog) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        prog.style.transform = 'scaleX(' + (max > 0 ? window.pageYOffset / max : 0) + ')';
      }
      if (pxEls && !reduced && desktop) {
        var vh = window.innerHeight;
        var mid = window.pageYOffset + vh / 2;
        for (var i = 0; i < pxEls.length; i++) {
          var el = pxEls[i];
          var r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > vh) continue;
          var d = (r.top + r.height / 2 - mid) * -0.04;
          if (d > 6) d = 6; else if (d < -6) d = -6;
          el.style.transform = 'translateY(' + d + 'px)';
        }
      }
      if (desktop && !reduced) {
        var vh2 = window.innerHeight;
        var maxY = document.documentElement.scrollHeight - vh2;
        for (var s = 0; s < SECS.length; s++) {
          var wrap = SECS[s].querySelector('.wrap, .hero-inner');
          if (!wrap) continue;
          var r2 = SECS[s].getBoundingClientRect();
          if (r2.bottom <= 0 || r2.top >= vh2) { wrap.style.transform = ''; wrap.style.opacity = ''; continue; }
          var start = tops[s];
          var end = s < SECS.length - 1 ? tops[s + 1] : maxY;
          var p = (window.pageYOffset - start) / Math.max(1, end - start);
          if (p <= 0 || p >= 1) { wrap.style.transform = ''; wrap.style.opacity = ''; }
          else {
            wrap.style.transform = 'translateY(' + (-26 * p) + 'px)';
            wrap.style.opacity = String(1 - p * 0.7);
          }
        }
      }
      ticking = false;
    });
  }

  /* ---------- ui ---------- */
  function paint() {
    var dots = document.querySelectorAll('.rail button');
    dots.forEach(function (d, i) {
      d.classList.toggle('on', i === current);
      if (i === current) d.setAttribute('aria-current', 'true');
      else d.removeAttribute('aria-current');
    });
    document.body.classList.toggle('on-dark', SECS[current].dataset.theme === 'dark');
  }

  function buildRail() {
    var rail = document.createElement('nav');
    rail.className = 'rail';
    rail.setAttribute('aria-label', 'Sections');
    SECS.forEach(function (_, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.label = LABELS[i];
      b.setAttribute('aria-label', 'Go to ' + LABELS[i]);
      var NS = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'ring');
      svg.setAttribute('viewBox', '0 0 20 20');
      svg.setAttribute('aria-hidden', 'true');
      var ring = document.createElementNS(NS, 'circle');
      ring.setAttribute('cx', '10');
      ring.setAttribute('cy', '10');
      ring.setAttribute('r', '9');
      svg.appendChild(ring);
      b.appendChild(svg);
      b.addEventListener('click', function () { resetIdle(); go(i); });
      rail.appendChild(b);
    });
    document.body.appendChild(rail);
    paint();
  }

  function buildMarquees() {
    var m1 = document.getElementById('mq1');
    var m2 = document.getElementById('mq2');
    var items1 = ['Onam 2026', 'Welcome home, Mahabali', 'Pookalam', 'Sadhya', 'Boat race', 'Payasam', 'Onam Ashamsakal'];
    var items2 = ['Avial', 'Sambar', 'Olans', 'Poriyal', 'Thoran', 'Kalan', 'Puliyinji', 'Payasam', 'Ada Pradhaman'];
    fill(m1, items1);
    fill(m2, items2);
  }

  function fill(el, items) {
    var group = document.createElement('div');
    group.style.display = 'contents';
    items.forEach(function (t, i) {
      var s = document.createElement('span');
      s.textContent = t;
      group.appendChild(s);
      if (i < items.length - 1) {
        var star = document.createElement('i');
        star.textContent = '\u2737';
        group.appendChild(star);
      }
    });
    el.appendChild(group);
    var clone = group.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    el.appendChild(clone);
  }

  /* ---------- auto scroll ---------- */
  function next() { go(current + 1); }

  function go(i) {
    if (i < 0) i = SECS.length - 1;
    if (i >= SECS.length) i = 0;
    var target = tops[i];
    if (reduced) { window.scrollTo(0, target); return; }
    animateScroll(target, 900);
  }

  /* ---------- eased scroll tween (cancellable) ---------- */
  var scrollToken = 0;
  var scrollRAF = null;

  function animateScroll(targetY, dur) {
    var token = ++scrollToken;
    var startY = window.pageYOffset;
    var diff = targetY - startY;
    if (Math.abs(diff) < 1) return;
    function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    var startT = null;
    function step(ts) {
      if (token !== scrollToken) return;
      if (startT === null) startT = ts;
      var p = Math.min(1, (ts - startT) / dur);
      window.scrollTo(0, startY + diff * ease(p));
      if (p < 1) scrollRAF = window.requestAnimationFrame(step);
    }
    if (scrollRAF) window.cancelAnimationFrame(scrollRAF);
    scrollRAF = window.requestAnimationFrame(step);
  }

  function cancelScroll() { scrollToken++; }

  function startAuto() {
    if (!enabled || reduced) return;
    stopAuto();
    autoTimer = window.setInterval(next, AUTO_MS);
  }

  function stopAuto() {
    if (autoTimer) { window.clearInterval(autoTimer); autoTimer = null; }
  }

  function resetIdle() {
    cancelScroll();
    stopAuto();
    if (resumeTimer) { window.clearTimeout(resumeTimer); resumeTimer = null; }
    if (enabled && !reduced) {
      resumeTimer = window.setTimeout(startAuto, RESUME_MS);
    }
  }

  function togglePlay() {
    enabled = !enabled;
    var btn = document.getElementById('pauseBtn');
    btn.textContent = enabled ? '\u23F8 pause' : '\u25B6 play';
    btn.setAttribute('aria-pressed', String(!enabled));
    if (enabled) startAuto(); else stopAuto();
    document.body.classList.toggle('no-auto', !enabled);
  }

  /* ---------- petal burst (finale) ---------- */
  function petalBurst() {
    var fin = document.querySelector('.sec.final');
    if (!fin) return;
    for (var i = 0; i < 40; i++) {
      var p = document.createElement('i');
      p.className = 'bp';
      p.style.setProperty('--dx', ((Math.random() * 2 - 1) * (120 + Math.random() * 240)) + 'px');
      p.style.setProperty('--dy', (-(60 + Math.random() * 280)) + 'px');
      p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      p.style.setProperty('--dr', (1.3 + Math.random() * 1.1) + 's');
      p.style.left = '50%';
      p.style.top = '45%';
      fin.appendChild(p);
      (function (el) { setTimeout(function () { el.remove(); }, 2600); })(p);
    }
  }

  /* ---------- events ---------- */
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('wheel', resetIdle, { passive: true });
  window.addEventListener('touchstart', resetIdle, { passive: true });
  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.closest && e.target.closest('button')) return;
    var k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ') {
      e.preventDefault(); resetIdle(); next();
    } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') {
      e.preventDefault(); resetIdle(); go(current - 1);
    } else if (k === 'p' || k === 'P') {
      togglePlay();
    }
  });
  document.getElementById('pauseBtn').addEventListener('click', togglePlay);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopAuto();
    else if (enabled && !reduced) startAuto();
  });

  /* ---------- lazy inline videos (each plays only when on screen) ---------- */
  var scrollers = Array.prototype.slice.call(document.querySelectorAll('.card video'));
  if (scrollers.length && 'IntersectionObserver' in window && !reduced) {
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var v = en.target;
        if (en.isIntersecting) {
          v.muted = true;
          if (v.readyState === 0) v.load();
          v.play().catch(function () {});
        }
        else { v.pause(); }
      });
    }, { threshold: 0.3, rootMargin: '0px 0px 10% 0px' });
    scrollers.forEach(function (v) { vio.observe(v); });
  }

  /* ---------- final title replays when the thanks section arrives ---------- */
  var finTitle = document.querySelector('.final-title');
  if (finTitle && 'IntersectionObserver' in window) {
    var fio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        finTitle.classList.toggle('on', en.isIntersecting);
        if (en.isIntersecting && !burstFired && !reduced) {
          burstFired = true;
          petalBurst();
        }
      });
    }, { threshold: 0.25 });
    fio.observe(finTitle);
  } else if (finTitle) {
    finTitle.classList.add('on');
  }

  /* ---------- init ---------- */
  buildRail();
  buildMarquees();
  var progEl = document.createElement('div');
  progEl.className = 'prog';
  progEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progEl);
  prog = progEl;
  pxEls = Array.prototype.slice.call(document.querySelectorAll('.sticker img'));
  var pauseBtn = document.getElementById('pauseBtn');
  pauseBtn.textContent = enabled ? '\u23F8 pause' : '\u25B6 play';
  pauseBtn.setAttribute('aria-pressed', String(!enabled));
  measure();
  var remeasure = false;
  var remeasureTick = function () {
    if (remeasure) return;
    remeasure = true;
    window.requestAnimationFrame(function () {
      measure();
      remeasure = false;
    });
  };
  window.addEventListener('resize', remeasureTick, { passive: true });
  window.addEventListener('orientationchange', remeasureTick, { passive: true });
  window.addEventListener('load', remeasureTick, { passive: true });
  paint();
  document.body.classList.toggle('no-auto', !enabled);
  document.documentElement.style.setProperty('--ring-dur', (AUTO_MS / 1000) + 's');
  if (!reduced && enabled) startAuto();

  /* ---------- service worker teardown (caching removed) ---------- */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (rs) {
      rs.forEach(function (r) { r.unregister(); });
    });
  }
  if (window.caches) {
    caches.keys().then(function (names) { names.forEach(function (n) { caches.delete(n); }); });
  }
})();
