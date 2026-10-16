(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var rootStyle = getComputedStyle(document.documentElement);
  var tok = function (n) { return rootStyle.getPropertyValue(n).trim(); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var ease = function (t) { return t * t * (3 - 2 * t); };

  /* ------------------------------------------------------------
     Small UI: menu, year, copy email
  ------------------------------------------------------------ */
  var menuBtn = $("#menuBtn");
  var nav = $("#nav");
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("open");
        menuBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  var yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  var status = $("#copyStatus");
  $$("[data-copy]").forEach(function (btn) {
    var label = btn.textContent;
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy");
      var done = function (ok) {
        btn.textContent = ok ? "Copied" : "Copy failed, select it manually";
        if (status) status.textContent = ok ? "Email address copied" : "Could not copy the email address";
        setTimeout(function () { btn.textContent = label; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      } else {
        try {
          var ta = document.createElement("textarea");
          ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select();
          var ok = document.execCommand("copy");
          document.body.removeChild(ta);
          done(ok);
        } catch (err) { done(false); }
      }
    });
  });

  /* ------------------------------------------------------------
     Hero: simulated data pipeline
     Messy records -> ingest -> clean and dedupe -> model -> dashboard
  ------------------------------------------------------------ */
  function hexToRgb(h) {
    h = h.replace("#", "");
    if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * t) + "," + Math.round(a[1] + (b[1] - a[1]) * t) + "," + Math.round(a[2] + (b[2] - a[2]) * t) + ")";
  }

  function pipeline() {
    var canvas = $("#flow");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var counter = $("#delivered");

    var RAW = [hexToRgb(tok("--coral")), hexToRgb(tok("--amber")), hexToRgb(tok("--violet"))];
    var MINT = hexToRgb(tok("--mint"));
    var MUTED = tok("--muted");
    var LINE = tok("--line");

    var lanes = ["API", "CRM", "SQL", "CSV"];
    var gateFrac = [0.34, 0.5, 0.66];
    var gateNames = ["Ingest", "Clean", "Model"];
    var BAR_CAP = 36;

    var W = 0, H = 0, dpr = 1, k = 1;
    var parts = [], flash = [0, 0, 0], bars = [], time = 0, spawn = 0, delivered = 0, shown = -1;
    for (var i = 0; i < 4; i++) bars.push({ count: 0, h: 0 });

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      k = clamp(W / 900, 0.7, 1.2);
    }

    function laneY(i) { return H * 0.17 + H * 0.58 * (i / (lanes.length - 1)); }
    function barX(i) { return W * 0.79 + (i + 0.5) * (W * 0.17 / 4); }
    function baseline() { return H * 0.8; }
    function barMax() { return H * 0.58; }

    function addParticle(x) {
      var lane = Math.floor(Math.random() * lanes.length);
      parts.push({
        lane: lane, x: x, y: laneY(lane), baseY: laneY(lane), dy: 0,
        v: (95 + Math.random() * 45),
        ph: Math.random() * 6.28, amp: 7 + Math.random() * 16,
        shape: Math.floor(Math.random() * 3), col: RAW[Math.floor(Math.random() * RAW.length)],
        size: 4 + Math.random() * 4, spin: (Math.random() - 0.5) * 4, rot: Math.random() * 6.28,
        dup: Math.random() < 0.22, pass: [false, false, false], alpha: 1, dying: false, c: 0
      });
    }

    function step(dt) {
      time += dt;
      spawn += dt * 9;
      while (spawn >= 1) { spawn -= 1; addParticle(W * 0.1); }

      for (var g = 0; g < 3; g++) flash[g] = Math.max(0, flash[g] - dt * 2.2);

      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.x += p.v * k * dt;
        p.rot += p.spin * dt;
        var c = clamp((p.x - W * gateFrac[0]) / (W * (gateFrac[2] - gateFrac[0])), 0, 1);
        p.c = c;

        for (var j = 0; j < 3; j++) {
          if (!p.pass[j] && p.x > W * gateFrac[j]) { p.pass[j] = true; flash[j] = 1; }
        }
        if (p.dup && p.pass[1] && !p.dying) p.dying = true;
        if (p.dying) { p.alpha -= dt * 2.4; p.dy -= dt * 34 * k; if (p.alpha <= 0) { parts.splice(i, 1); continue; } }

        if (p.x < W * gateFrac[2]) {
          p.y = p.baseY + p.dy + Math.sin(p.ph + p.x * 0.035 + time * 1.6) * p.amp * (1 - ease(c)) * k;
        } else {
          var b = bars[p.lane];
          var ty = baseline() - b.h * barMax() - 9;
          p.y += (ty - p.y) * Math.min(1, dt * 3.5);
          if (p.x >= barX(p.lane) - 4) {
            b.count++;
            if (b.count > BAR_CAP) b.count = 0;
            delivered++;
            parts.splice(i, 1);
          }
        }
      }

      for (var q = 0; q < bars.length; q++) {
        var target = bars[q].count / BAR_CAP;
        bars[q].h += (target - bars[q].h) * Math.min(1, dt * (target < bars[q].h ? 5 : 3));
      }
    }

    function drawShape(p) {
      var t = ease(p.c);
      var s = (p.size + (6 - p.size) * t) * k;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = mix(p.col, MINT, t);
      if (t > 0.55) {
        var r = s * 0.28;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-s, -s, s * 2, s * 2, r); else ctx.rect(-s, -s, s * 2, s * 2);
        ctx.fill();
      } else {
        ctx.rotate(p.rot * (1 - t));
        ctx.beginPath();
        if (p.shape === 0) { ctx.arc(0, 0, s, 0, 6.2832); }
        else if (p.shape === 1) { ctx.moveTo(0, -s * 1.2); ctx.lineTo(s * 1.1, s * 0.9); ctx.lineTo(-s * 1.1, s * 0.9); ctx.closePath(); }
        else { ctx.moveTo(0, -s * 1.25); ctx.lineTo(s * 1.25, 0); ctx.lineTo(0, s * 1.25); ctx.lineTo(-s * 1.25, 0); ctx.closePath(); }
        ctx.fill();
      }
      ctx.restore();
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      var fs = Math.round(clamp(11 * k + 1, 10, 12));
      ctx.font = fs + "px 'JetBrains Mono', ui-monospace, monospace";
      ctx.textBaseline = "middle";

      // sources
      ctx.fillStyle = MUTED;
      ctx.textAlign = "left";
      for (var i = 0; i < lanes.length; i++) {
        var y = laneY(i);
        ctx.fillText(lanes[i], W * 0.025, y);
        ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(W * 0.075, y); ctx.lineTo(W * 0.1, y); ctx.stroke();
        ctx.setLineDash([]);
      }

      // gates
      ctx.textAlign = "center";
      for (var g = 0; g < 3; g++) {
        var gx = W * gateFrac[g];
        var a = 0.28 + flash[g] * 0.55;
        var grad = ctx.createLinearGradient(0, H * 0.06, 0, H * 0.9);
        grad.addColorStop(0, "rgba(91,240,194,0)");
        grad.addColorStop(0.5, "rgba(91,240,194," + a + ")");
        grad.addColorStop(1, "rgba(91,240,194,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(gx - 1, H * 0.06, 2, H * 0.84);
        if (flash[g] > 0.05) {
          ctx.fillStyle = "rgba(91,240,194," + flash[g] * 0.07 + ")";
          ctx.fillRect(gx - 14, H * 0.06, 28, H * 0.84);
        }
        ctx.fillStyle = MUTED;
        ctx.fillText(gateNames[g], gx, H - 14);
      }

      // dashboard bars
      var base = baseline();
      ctx.strokeStyle = LINE; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(W * 0.78, base); ctx.lineTo(W * 0.97, base); ctx.stroke();
      var bw = (W * 0.17 / 4) * 0.58;
      for (var b = 0; b < bars.length; b++) {
        var bh = Math.max(2, bars[b].h * barMax());
        var bx = barX(b) - bw / 2;
        ctx.fillStyle = "rgba(91,240,194,0.9)";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, base - bh, bw, bh, 3); else ctx.rect(bx, base - bh, bw, bh);
        ctx.fill();
      }
      ctx.fillStyle = MUTED; ctx.textAlign = "center";
      ctx.fillText("Dashboard", W * 0.875, H - 14);

      for (var n = 0; n < parts.length; n++) drawShape(parts[n]);

      if (counter && delivered !== shown) { shown = delivered; counter.textContent = delivered.toLocaleString("en-US"); }
    }

    function warm(seconds) {
      var n = Math.round(seconds * 60);
      for (var i = 0; i < n; i++) step(1 / 60);
    }

    resize();
    warm(9);
    draw();

    var running = false, last = 0, visible = true;
    function frame(ts) {
      if (!running) return;
      var dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
      last = ts;
      step(dt);
      draw();
      requestAnimationFrame(frame);
    }
    function start() { if (running || reduce) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
    function stop() { running = false; }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible && !document.hidden) start(); else stop();
      }, { threshold: 0.05 }).observe(canvas);
    } else { start(); }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else if (visible) start();
    });

    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () { resize(); if (reduce || !running) draw(); }, 120);
    });
  }

  /* ------------------------------------------------------------
     Project replay: 6 hours -> 2.5 hours
  ------------------------------------------------------------ */
  function adfDemo() {
    var root = $("#adfDemo");
    if (!root) return;
    var fullFill = $("#fullFill"), segsEl = $("#segs");
    var fullClock = $("#fullClock"), partClock = $("#partClock");
    var replay = $("#adfReplay");
    var N = 14, segs = [];
    for (var i = 0; i < N; i++) {
      var s = document.createElement("div"); s.className = "seg";
      var f = document.createElement("i"); s.appendChild(f); segsEl.appendChild(s); segs.push(f);
    }
    var SEC_PER_HOUR = 0.9;
    var FULL_H = 6, PART_H = 2.5;
    var raf = 0;

    function render(t) { // t = elapsed seconds
      var hFull = clamp(t / SEC_PER_HOUR, 0, FULL_H);
      var hPart = clamp(t / SEC_PER_HOUR, 0, PART_H);
      fullFill.style.width = (hFull / FULL_H * 100) + "%";
      fullClock.textContent = hFull.toFixed(1) + " h";
      partClock.textContent = hPart.toFixed(1) + " h";
      var p = hPart / PART_H;
      for (var i = 0; i < N; i++) {
        var start = i * (0.7 / (N - 1));
        segs[i].style.width = clamp((p - start) / 0.3, 0, 1) * 100 + "%";
      }
    }
    function run() {
      cancelAnimationFrame(raf);
      if (reduce) { render(FULL_H * SEC_PER_HOUR); return; }
      var t0 = performance.now();
      (function tick(now) {
        var t = (now - t0) / 1000;
        render(t);
        if (t < FULL_H * SEC_PER_HOUR) raf = requestAnimationFrame(tick);
      })(t0);
    }
    render(0);
    replay.addEventListener("click", run);
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { io.disconnect(); run(); }
      }, { threshold: 0.5 });
      io.observe(root);
    } else { run(); }
  }

  /* ------------------------------------------------------------
     Project demo: Slowly Changing Dimension Type 2
  ------------------------------------------------------------ */
  function scdDemo() {
    var body = $("#scdBody"), btn = $("#scdBtn"), note = $("#scdNote");
    if (!body || !btn) return;
    var changed = false;
    function row(city, from, to, current, cls) {
      return '<tr class="' + cls + '"><td>1042</td><td>' + city + "</td><td>" + from + "</td><td>" + to + "</td><td>" + current + "</td></tr>";
    }
    function paint(fresh) {
      if (!changed) {
        body.innerHTML = row("Lahore", "2024-01-01", "open", "true", "cur");
        note.textContent = "One row, still current.";
        btn.textContent = "Change the source record";
        btn.className = "btn btn-solid btn-small";
      } else {
        body.innerHTML =
          row("Lahore", "2024-01-01", "2025-06-30", "false", "old") +
          row("Karachi", "2025-07-01", "open", "true", "cur" + (fresh ? " fresh" : ""));
        note.textContent = "The old row was closed, not overwritten. A report as of 2025-03-01 still shows Lahore, and today it shows Karachi.";
        btn.textContent = "Reset";
        btn.className = "btn btn-line btn-small";
      }
    }
    paint(false);
    btn.addEventListener("click", function () { changed = !changed; paint(true); });
  }

  /* ------------------------------------------------------------
     Experience: a signal that travels down the timeline as you scroll
  ------------------------------------------------------------ */
  function timeline() {
    var pipe = $("#pipe");
    if (!pipe) return;
    var nodes = $$(".node", pipe);
    if (reduce) { pipe.style.setProperty("--p", "1"); nodes.forEach(function (n) { n.classList.add("on"); }); return; }
    var ticking = false;
    function update() {
      ticking = false;
      var r = pipe.getBoundingClientRect();
      var line = window.innerHeight * 0.55;
      var p = clamp((line - r.top) / r.height, 0, 1);
      pipe.style.setProperty("--p", p);
      nodes.forEach(function (n) {
        var nr = n.getBoundingClientRect();
        n.classList.toggle("on", nr.top + 14 < line);
      });
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  }

  pipeline();
  adfDemo();
  scdDemo();
  timeline();
})();
