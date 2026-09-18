export function createSequence(canvas, opts = {}) {
  const count = opts.count || 36;
  const path = opts.path || ((n) => `assets/drone/frame-${n}.jpg`);
  const reduced = !!opts.reduced;
  const ctx = canvas.getContext('2d', { alpha: true });
  const images = [];
  let target = 0;
  let shown = 0;
  let lastDrawn = -1;
  let dirty = true;

  for (let i = 1; i <= count; i++) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { dirty = true; };
    img.src = path(String(i).padStart(3, '0'));
    images.push(img);
  }

  function size() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(r.width * dpr));
    const h = Math.max(1, Math.floor(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      dirty = true;
    }
  }

  function nearestReady(i) {
    if (images[i] && images[i].complete && images[i].naturalWidth) return i;
    for (let d = 1; d < count; d++) {
      const lo = i - d;
      const hi = i + d;
      if (lo >= 0 && images[lo] && images[lo].complete && images[lo].naturalWidth) return lo;
      if (hi < count && images[hi] && images[hi].complete && images[hi].naturalWidth) return hi;
    }
    return -1;
  }

  function draw(i) {
    const idx = nearestReady(i);
    if (idx < 0) return;
    const img = images[idx];
    size();
    const cw = canvas.width, ch = canvas.height;
    if (cw < 2 || ch < 2) {
      dirty = true;
      return;
    }
    const ir = img.naturalWidth / img.naturalHeight;
    const cr = cw / ch;
    let dw, dh, dx, dy;
    if (ir > cr) {
      dh = ch; dw = ch * ir; dx = (cw - dw) / 2; dy = 0;
    } else {
      dw = cw; dh = cw / ir; dx = 0; dy = (ch - dh) / 2;
    }
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
    lastDrawn = idx;
    dirty = false;
  }

  function setProgress(p) {
    const t = p < 0 ? 0 : p > 1 ? 1 : p;
    target = t * (count - 1);
  }

  function invalidate() {
    dirty = true;
    lastDrawn = -1;
    size();
    draw(Math.round(shown));
  }

  function tick() {
    shown += (target - shown) * (reduced ? 1 : 0.28);
    const i = Math.max(0, Math.min(count - 1, Math.round(shown)));
    const on = canvas.classList.contains('is-on');
    if (on && (dirty || i !== lastDrawn)) draw(i);
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', () => {
    lastDrawn = -1;
    dirty = true;
    if (canvas.classList.contains('is-on')) draw(Math.round(shown));
  });
  canvas.addEventListener('transitionstart', () => {
    if (canvas.classList.contains('is-on')) invalidate();
  });

  requestAnimationFrame(tick);
  return { setProgress, invalidate };
}
