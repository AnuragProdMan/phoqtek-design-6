export function createSequence(canvas, opts = {}) {
  const count = opts.count || 36;
  const path = opts.path || ((n) => `assets/drone/frame-${n}.jpg`);
  const reduced = !!opts.reduced;
  const ctx = canvas.getContext('2d', { alpha: false });
  const images = [];
  let target = 0;
  let shown = 0;
  let lastDrawn = -1;

  for (let i = 1; i <= count; i++) {
    const img = new Image();
    img.decoding = 'async';
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
      lastDrawn = -1;
    }
  }

  function draw(i) {
    const img = images[i];
    if (!img || !img.complete || !img.naturalWidth) return;
    size();
    const cw = canvas.width, ch = canvas.height;
    const ir = img.naturalWidth / img.naturalHeight;
    const cr = cw / ch;
    let dw, dh, dx, dy;
    if (ir > cr) {
      dh = ch; dw = ch * ir; dx = (cw - dw) / 2; dy = 0;
    } else {
      dw = cw; dh = cw / ir; dx = 0; dy = (ch - dh) / 2;
    }
    ctx.fillStyle = '#020308';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
    lastDrawn = i;
  }

  function setProgress(p) {
    const t = p < 0 ? 0 : p > 1 ? 1 : p;
    target = t * (count - 1);
  }

  function tick() {
    shown += (target - shown) * (reduced ? 1 : 0.28);
    const i = Math.max(0, Math.min(count - 1, Math.round(shown)));
    if (i !== lastDrawn) draw(i);
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', () => { lastDrawn = -1; draw(Math.round(shown)); });
  images[0].onload = () => draw(0);
  requestAnimationFrame(tick);

  return { setProgress };
}
