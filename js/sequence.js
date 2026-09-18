export function createReel(canvas, opts = {}) {
  const chapters = opts.chapters || [];
  const reduced = !!opts.reduced;
  const still = opts.still || null;
  const ctx = canvas.getContext('2d', { alpha: false });
  const slots = chapters.map((ch) => {
    const frames = [];
    for (let i = 1; i <= (ch.count || 36); i++) {
      frames.push({ url: ch.path(String(i).padStart(3, '0')), img: null });
    }
    return frames;
  });

  let chapter = 0;
  let target = 0;
  let shown = 0;
  let lastDrawn = '';
  let canvasW = 0;
  let canvasH = 0;

  function urlOf(ch, i) {
    const frames = slots[ch];
    if (!frames || !frames.length) return '';
    const idx = Math.max(0, Math.min(frames.length - 1, i));
    return frames[idx].url;
  }

  function load(ch, i) {
    const frames = slots[ch];
    if (!frames || i < 0 || i >= frames.length) return null;
    const slot = frames[i];
    if (slot.img) return slot.img;
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.src = slot.url;
    slot.img = img;
    return img;
  }

  function drop(ch) {
    const frames = slots[ch];
    if (!frames) return;
    frames.forEach((slot) => {
      if (slot.img) {
        slot.img.onload = null;
        slot.img.src = '';
        slot.img = null;
      }
    });
  }

  function preloadChapter(ch) {
    const frames = slots[ch];
    if (!frames) return;
    frames.forEach((_, i) => load(ch, i));
  }

  function size() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(r.width * dpr));
    const h = Math.max(1, Math.floor(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      lastDrawn = '';
    }
    canvasW = canvas.width;
    canvasH = canvas.height;
  }

  function paint(img) {
    if (!img || !img.complete || !img.naturalWidth) return false;
    size();
    const cw = canvas.width, ch = canvas.height;
    if (cw < 2 || ch < 2) return false;
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
    return true;
  }

  function nearestReady(ch, i) {
    const frames = slots[ch];
    if (!frames) return null;
    const tryAt = (idx) => {
      if (idx < 0 || idx >= frames.length) return null;
      const img = frames[idx].img;
      if (img && img.complete && img.naturalWidth) return { img, idx };
      return null;
    };
    const hit = tryAt(i);
    if (hit) return hit;
    for (let d = 1; d < frames.length; d++) {
      const a = tryAt(i - d);
      if (a) return a;
      const b = tryAt(i + d);
      if (b) return b;
    }
    return null;
  }

  function draw() {
    const frames = slots[chapter];
    if (!frames) return;
    const i = Math.max(0, Math.min(frames.length - 1, Math.round(shown)));
    load(chapter, i);
    load(chapter, i + 1);
    load(chapter, i - 1);
    const ready = nearestReady(chapter, i);
    if (!ready) return;
    const key = chapter + ':' + ready.idx + ':' + canvasW + 'x' + canvasH;
    if (key === lastDrawn) return;
    if (paint(ready.img)) lastDrawn = key;
  }

  function setStill(ch, i) {
    if (!still) return;
    const url = urlOf(ch, i);
    if (url && still.getAttribute('src') !== url) still.src = url;
  }

  function set(ch, local) {
    const next = Math.max(0, Math.min(slots.length - 1, ch | 0));
    const t = local < 0 ? 0 : local > 1 ? 1 : local;
    if (next !== chapter) {
      const prev = chapter;
      chapter = next;
      preloadChapter(chapter);
      setStill(chapter, 0);
      lastDrawn = '';
      shown = t * Math.max(0, (slots[chapter].length - 1));
      target = shown;
      draw();
      requestAnimationFrame(() => { if (prev !== chapter) drop(prev); });
    }
    const count = slots[chapter] ? slots[chapter].length : 1;
    target = t * Math.max(0, count - 1);
    const want = Math.round(target);
    load(chapter, want);
    if (reduced) setStill(chapter, want);
  }

  slots.forEach((_, ch) => load(ch, 0));
  preloadChapter(0);
  setStill(0, 0);
  size();

  function tick() {
    const count = slots[chapter] ? slots[chapter].length : 1;
    shown += (target - shown) * (reduced ? 1 : 0.34);
    if (shown < 0) shown = 0;
    if (shown > count - 1) shown = count - 1;
    if (!reduced) draw();
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', () => {
    lastDrawn = '';
    size();
    draw();
  });

  requestAnimationFrame(tick);
  return { set };
}
