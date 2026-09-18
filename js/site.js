(function () {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function progressOf(el) {
    const r = el.getBoundingClientRect();
    const max = el.offsetHeight - window.innerHeight;
    return max <= 0 ? 0 : clamp(-r.top / max, 0, 1);
  }

  const header = document.getElementById('siteHeader');
  const nav = header && header.querySelector('nav');
  const menuBtn = header && header.querySelector('.menu-btn');
  let panel = document.getElementById('mobileNav');
  if (header && nav && menuBtn && !panel) {
    panel = document.createElement('div');
    panel.id = 'mobileNav';
    panel.className = 'mobile-nav';
    panel.innerHTML = nav.innerHTML;
    const cta = header.querySelector('.nav-cta');
    if (cta) panel.appendChild(cta.cloneNode(true));
    header.insertAdjacentElement('afterend', panel);
  }
  function setMenu(open) {
    if (!menuBtn || !panel) return;
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    panel.classList.toggle('is-open', open);
    header && header.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
  }
  if (menuBtn && panel) {
    menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
    panel.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    window.addEventListener('resize', () => { if (window.innerWidth > 900) setMenu(false); });
  }

  const pins = [];
  document.querySelectorAll('[data-pin]').forEach((root) => {
    const world = root.querySelector('[data-world]');
    const fog = root.querySelector('[data-fog]');
    const bar = root.querySelector('[data-bar]');
    const copies = root.querySelectorAll('[data-copy]');
    const acts = root.querySelectorAll('[data-a]');
    const live = root.querySelector('[data-live]');
    const dead = root.querySelector('[data-dead]');
    const vns = root.querySelector('[data-vns]');
    const video = root.querySelector('video');
    const poster = root.querySelector('img.poster');
    let pNow = 0;
    const cuts = (root.getAttribute('data-cuts') || '0.3,0.62').split(',').map(Number);
    if (video && poster) {
      video.addEventListener('playing', () => { poster.style.opacity = '0'; });
    }
    function zoomCurve(p) {
      if (p < 0.42) return lerp(1.02, 1.46, p / 0.42);
      if (p < 0.64) return 1.46;
      return lerp(1.46, 1.1, (p - 0.64) / 0.36);
    }
    pins.push({
      root,
      apply(p, instant) {
        pNow = instant ? p : lerp(pNow, p, reduce ? 1 : 0.1);
        if (world) world.style.transform = 'scale(' + zoomCurve(pNow) + ')';
        if (fog) fog.setAttribute('stroke-dashoffset', String(100 - clamp(pNow / 0.58, 0, 1) * 100));
        if (bar) bar.style.width = (pNow * 100).toFixed(1) + '%';
        let idx = 0;
        cuts.forEach((c, i) => { if (pNow >= c) idx = i + 1; });
        copies.forEach((el, i) => el.classList.toggle('is-on', i === idx));
        acts.forEach((el, i) => el.classList.toggle('on', i === idx));
        if (live) live.setAttribute('opacity', pNow < 0.3 ? '1' : '0');
        if (dead) dead.setAttribute('opacity', pNow >= 0.3 ? '1' : '0');
        if (vns) vns.setAttribute('opacity', (pNow > 0.38 && pNow < 0.84) ? '0.95' : '0');
      },
      progress() { return progressOf(root); }
    });
  });

  const track = document.getElementById('track');
  const canvas = document.getElementById('gl');
  const fadeEl = document.getElementById('glFade');
  const bar = document.querySelector('#stage [data-bar]');
  const copies = document.querySelectorAll('#stage [data-copy]');
  const acts = document.querySelectorAll('#stage [data-a]');
  const eye = document.getElementById('hudEye');
  const status = document.getElementById('hudStatus');
  const fallback = document.getElementById('glFallback');
  let world = null;

  const seqReel = document.getElementById('seqReel');
  const seqStill = document.getElementById('seqStill');
  const hud = document.querySelector('#stage .hud');
  const actsWrap = document.querySelector('#stage .acts');
  const cue = document.querySelector('#stage .scroll-cue');
  let reel = null;
  const chapterRanges = [
    [0, 0.144],
    [0.144, 0.288],
    [0.288, 0.432],
    [0.432, 0.576],
    [0.576, 0.72]
  ];
  const eyes = ['01 · The jet', '02 · The convoy', '03 · Constellation', '04 · The platform', '05 · Visual lock'];
  const statuses = [
    'RAFALE <b>NOSE DOWN</b>',
    'CONVOY <b>IN MOTION</b>',
    'GNSS <b class="warn">LOCK → DENIED</b>',
    'UAV <b>IN FLIGHT</b>',
    'GROUND · VNS <b>TERRAIN LOCK</b>'
  ];

  function copyIndex(p) {
    if (p < 0.072) return 0;
    if (p < 0.144) return 1;
    if (p < 0.216) return 2;
    if (p < 0.288) return 3;
    if (p < 0.360) return 4;
    if (p < 0.432) return 5;
    if (p < 0.504) return 6;
    if (p < 0.576) return 7;
    if (p < 0.648) return 8;
    return 9;
  }
  function chapterIndex(p) {
    if (p < 0.144) return 0;
    if (p < 0.288) return 1;
    if (p < 0.432) return 2;
    if (p < 0.576) return 3;
    return 4;
  }
  function localIn(p, a, b) {
    if (p <= a) return 0;
    if (p >= b) return 1;
    return (p - a) / (b - a);
  }

  if (track && canvas) {
    canvas.style.display = 'none';
    if (reduce && fallback) fallback.hidden = false;
  }
  if (track && seqReel) {
    import('./sequence.js').then((m) => {
      reel = m.createReel(seqReel, {
        reduced: reduce,
        still: seqStill,
        chapters: [
          { count: 36, path: (n) => `assets/rafale/frame-${n}.jpg` },
          { count: 36, path: (n) => `assets/gnss/frame-${n}.jpg` },
          { count: 36, path: (n) => `assets/constel/frame-${n}.jpg` },
          { count: 36, path: (n) => `assets/drone/frame-${n}.jpg` },
          { count: 36, path: (n) => `assets/visual/frame-${n}.jpg` }
        ]
      });
    }).catch((err) => console.error('sequence', err));
  }

  function applyTrack(p) {
    if (world) world.setProgress(p);
    if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
    if (fadeEl && world) fadeEl.style.opacity = String(world.fade());
    const problem = document.getElementById('problem');
    const overlay = problem ? problem.getBoundingClientRect().top < window.innerHeight * 0.92 : p >= 0.86;
    const ci = copyIndex(p);
    copies.forEach((el, i) => el.classList.toggle('is-on', i === ci && !overlay));
    const ch = chapterIndex(p);
    acts.forEach((el, i) => el.classList.toggle('on', i === ch));
    if (eye) eye.textContent = eyes[ch];
    if (status) status.innerHTML = statuses[ch];
    if (hud) hud.classList.toggle('is-away', overlay);
    if (actsWrap) actsWrap.classList.toggle('is-away', overlay);
    if (cue) cue.classList.toggle('is-away', overlay);
    if (canvas) canvas.classList.add('is-off');
    if (reel) {
      const range = chapterRanges[ch] || chapterRanges[0];
      reel.set(ch, localIn(p, range[0], range[1]));
    }
  }

  function frame() {
    if (header && !header.classList.contains('is-open')) {
      header.classList.toggle('is-solid', (window.scrollY || 0) > 24 && window.innerWidth > 900);
    }
    pins.forEach((p) => p.apply(p.progress()));
    if (track) applyTrack(progressOf(track));
    requestAnimationFrame(frame);
  }

  if (reduce && !track) {
    pins.forEach((p) => p.apply(0.25, true));
    return;
  }
  requestAnimationFrame(frame);

  const inq = document.getElementById('inqForm');
  if (inq) {
    inq.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(inq);
      const lines = [];
      fd.forEach((v, k) => { if (String(v).trim()) lines.push(k + ': ' + v); });
      const href = 'mailto:info@phoqtek.ai?subject=' + encodeURIComponent('GPS-denied navigation requirement') + '&body=' + encodeURIComponent(lines.join('\n'));
      window.location.href = href;
    });
  }
})();
