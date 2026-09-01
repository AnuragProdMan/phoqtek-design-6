import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const SILVER = new THREE.Color(0xC9CDD4);
const AMBER = new THREE.Color(0xE0A24A);
const TAU = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
function fbm(x, y) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < 5; i++) { v += a * noise2(x * f, y * f); f *= 2; a *= 0.5; }
  return v;
}

function earthCanvas() {
  const s = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(s, s);
  const d = img.data;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const lon = (x / s) * 6.2;
      const lat = (y / s) * 4.1;
      const n = fbm(lon, lat);
      const polar = Math.abs(y / s - 0.5) * 2;
      const land = n > 0.48 - polar * 0.08;
      const i = (y * s + x) * 4;
      if (land) {
        const k = 0.55 + n * 0.45;
        d[i] = 28 * k; d[i + 1] = 32 * k; d[i + 2] = 38 * k; d[i + 3] = 255;
      } else {
        d[i] = 8; d[i + 1] = 10; d[i + 2] = 14; d[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function lightsCanvas() {
  const s = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(s, s);
  const d = img.data;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const n = fbm(x / s * 9, y / s * 6);
      const land = n > 0.5;
      const spark = hash2(x * 0.37, y * 0.19);
      const i = (y * s + x) * 4;
      const on = land && spark > 0.978;
      d[i] = on ? 180 : 0; d[i + 1] = on ? 160 : 0; d[i + 2] = on ? 110 : 0; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function walkerPos(plane, sat, planes, per, radius) {
  const inc = 55 * Math.PI / 180;
  const raan = plane * TAU / planes;
  const u = sat * TAU / per + plane * 0.18;
  const x = radius * Math.cos(u);
  const y = radius * Math.sin(u) * Math.cos(inc);
  const z = radius * Math.sin(u) * Math.sin(inc);
  const xr = x * Math.cos(raan) - z * Math.sin(raan);
  const zr = x * Math.sin(raan) + z * Math.cos(raan);
  return new THREE.Vector3(xr, y, zr);
}

function makeSatGeometry() {
  const body = new THREE.BoxGeometry(1, 0.55, 1.25);
  const panel = new THREE.BoxGeometry(1.7, 0.035, 0.8);
  const dish = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 10);
  return { body, panel, dish };
}

export function createWorld(canvas, opts = {}) {
  const reduced = !!opts.reduced;
  const mobile = !!opts.mobile;
  const dprCap = mobile ? 1.25 : 1.75;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x020308, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));

  const clock = new THREE.Clock();
  const space = buildSpace(mobile);
  const gorge = buildGorge(mobile);
  const shadow = buildShadow(mobile);

  let composer = null;
  if (!mobile && !reduced) {
    try {
      composer = new EffectComposer(renderer);
      const rp = new RenderPass(space.scene, space.camera);
      const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.55, 0.7, 0.22);
      composer.addPass(rp);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      space._rp = rp;
      space._bloom = bloom;
    } catch (e) {
      console.warn('bloom disabled', e);
      composer = null;
    }
  }

  let pNow = 0;
  let fade = 0;
  let chapter = 0;
  let w = 1, h = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    const aspect = w / h;
    [space, gorge, shadow].forEach((wld) => {
      wld.camera.aspect = aspect;
      wld.camera.updateProjectionMatrix();
    });
    if (composer) {
      composer.setSize(w, h);
      space._bloom.resolution.set(w, h);
    }
  }
  resize();
  window.addEventListener('resize', resize);

  function setProgress(p) {
    pNow = reduced ? lerp(pNow, p, 1) : lerp(pNow, p, 0.085);
  }

  function chapterOf(p) {
    if (p < 0.36) return 0;
    if (p < 0.66) return 1;
    return 2;
  }
  function localOf(p) {
    if (p < 0.36) return p / 0.36;
    if (p < 0.66) return (p - 0.36) / 0.30;
    return (p - 0.66) / 0.34;
  }
  function fadeOf(p) {
    const d0 = Math.abs(p - 0.36);
    const d1 = Math.abs(p - 0.66);
    return 1 - smoothstep(0.0, 0.022, Math.min(d0, d1));
  }

  function applySpace(t, dt) {
    const shatter = smoothstep(0.18, 0.48, t);
    const dive = smoothstep(0.42, 1.0, t);
    space.group.rotation.y += dt * 0.015 * (1 - dive);
    space.update(t, shatter, dive, dt);
  }
  function applyGorge(t, dt) {
    gorge.update(t, dt);
  }
  function applyShadow(t, dt) {
    shadow.update(t, dt);
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const p = pNow;
    chapter = chapterOf(p);
    const t = localOf(p);
    fade = fadeOf(p);

    if (chapter === 0) applySpace(t, dt);
    else if (chapter === 1) applyGorge(t, dt);
    else applyShadow(t, dt);

    const world = chapter === 0 ? space : chapter === 1 ? gorge : shadow;
    if (chapter === 0 && composer) {
      space._rp.scene = space.scene;
      space._rp.camera = space.camera;
      composer.render();
    } else {
      renderer.render(world.scene, world.camera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    setProgress,
    fade: () => fade,
    chapter: () => chapterOf(pNow),
    local: () => localOf(pNow),
    resize
  };
}

function buildSpace(mobile) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020308, 0.012);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 80);
  const group = new THREE.Group();
  scene.add(group);

  scene.add(new THREE.AmbientLight(0x6a7380, 0.28));
  const sun = new THREE.DirectionalLight(0xf2f0ea, 2.1);
  sun.position.set(4, 2.2, 5);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x8892a0, 0.55);
  rim.position.set(-3, -1, -4);
  scene.add(rim);

  // stars
  const starN = mobile ? 1800 : 4200;
  const starPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const r = 18 + Math.random() * 28;
    const th = Math.acos(2 * Math.random() - 1);
    const ph = Math.random() * TAU;
    starPos[i * 3] = r * Math.sin(th) * Math.cos(ph);
    starPos[i * 3 + 1] = r * Math.cos(th);
    starPos[i * 3 + 2] = r * Math.sin(th) * Math.sin(ph);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9aa3ad, size: 0.035, sizeAttenuation: true })));

  const R = 1.38;
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(R, 64, 48),
    new THREE.MeshStandardMaterial({
      map: earthCanvas(),
      emissiveMap: lightsCanvas(),
      emissive: new THREE.Color(0xffd9a8),
      emissiveIntensity: 0.32,
      roughness: 0.92,
      metalness: 0.08
    })
  );
  group.add(earth);

  const atm = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.045, 48, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      uniforms: {},
      vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(normalMatrix * normal); vec4 w = modelViewMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * w; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vW; void main(){ float f = pow(0.72 - abs(dot(normalize(vN), normalize(-vW))), 2.4); gl_FragColor = vec4(0.72, 0.76, 0.82, 1.0) * f * 0.85; }`
    })
  );
  group.add(atm);

  // orbital rings
  const ringMat = new THREE.LineBasicMaterial({ color: 0x6d7580, transparent: true, opacity: 0.22 });
  for (let i = 0; i < 5; i++) {
    const curve = new THREE.EllipseCurve(0, 0, 2.02, 2.02 * (0.72 + i * 0.04), 0, TAU, false, 0);
    const pts = curve.getPoints(128).map((v) => new THREE.Vector3(v.x, 0, v.y));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const ring = new THREE.LineLoop(g, ringMat);
    ring.rotation.x = 0.55 + i * 0.08;
    ring.rotation.z = i * 0.35;
    group.add(ring);
  }

  const planes = mobile ? 4 : 6;
  const per = mobile ? 6 : 8;
  const homes = [];
  const flags = [];
  for (let p = 0; p < planes; p++) {
    for (let s = 0; s < per; s++) {
      const pos = walkerPos(p, s, planes, per, 2.08);
      homes.push(pos);
      flags.push(pos.x > 0.35 && pos.y > 0.05);
    }
  }
  const nSat = homes.length;
  const { body, panel, dish } = makeSatGeometry();
  const metal = new THREE.MeshStandardMaterial({ color: 0xd5dae0, metalness: 0.85, roughness: 0.28 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 0.9, roughness: 0.32 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a2740, metalness: 0.4, roughness: 0.45, emissive: 0x0a1a33, emissiveIntensity: 0.35 });
  const bodies = new THREE.InstancedMesh(body, metal, nSat);
  const dishes = new THREE.InstancedMesh(dish, gold, nSat);
  const panels = new THREE.InstancedMesh(panel, panelMat, nSat * 2);
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dishes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  panels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(bodies, dishes, panels);

  const dummy = new THREE.Object3D();
  const dummyP = new THREE.Object3D();

  // links
  const pairs = [];
  for (let i = 0; i < nSat; i++) {
    const dist = homes.map((h, j) => ({ j, d: i === j ? 1e9 : h.distanceTo(homes[i]) }));
    dist.sort((a, b) => a.d - b.d);
    for (let k = 0; k < 3; k++) {
      const j = dist[k].j;
      if (i < j) pairs.push([i, j]);
    }
  }
  const linkPos = new Float32Array(pairs.length * 6);
  const linkCol = new Float32Array(pairs.length * 6);
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPos, 3));
  linkGeo.setAttribute('color', new THREE.BufferAttribute(linkCol, 3));
  const links = new THREE.LineSegments(linkGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72 }));
  group.add(links);

  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();
  const camHome = new THREE.Vector3(0.15, 0.62, 4.65);
  const camMid = new THREE.Vector3(1.35, 0.42, 2.35);
  const camDive = new THREE.Vector3(0.18, 0.16, 1.58);
  const tgtHome = new THREE.Vector3(0, 0, 0);
  const tgtDive = new THREE.Vector3(0.55, 0.28, 0.2);

  function update(t, shatter, dive, dt) {
    const col = new THREE.Color();
    for (let i = 0; i < nSat; i++) {
      const sh = flags[i] ? shatter : shatter * 0.08;
      const burst = flags[i] ? 0.15 + hash2(i, 3) * 1.1 : 0.05;
      tmp.copy(homes[i]).addScaledVector(homes[i].clone().normalize(), sh * burst);
      dummy.position.copy(tmp);
      dummy.lookAt(0, 0, 0);
      dummy.rotateX(Math.PI / 2);
      dummy.scale.setScalar(0.12);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      dummy.updateMatrix();
      dishes.setMatrixAt(i, dummy.matrix);

      dummyP.position.copy(tmp);
      dummyP.quaternion.copy(dummy.quaternion);
      dummyP.scale.set(0.12, 0.12, 0.12);
      dummyP.translateX(-0.14);
      dummyP.updateMatrix();
      panels.setMatrixAt(i * 2, dummyP.matrix);
      dummyP.position.copy(tmp);
      dummyP.quaternion.copy(dummy.quaternion);
      dummyP.translateX(0.14);
      dummyP.updateMatrix();
      panels.setMatrixAt(i * 2 + 1, dummyP.matrix);

      homes[i]._cur = tmp.clone();
    }
    bodies.instanceMatrix.needsUpdate = true;
    dishes.instanceMatrix.needsUpdate = true;
    panels.instanceMatrix.needsUpdate = true;

    const cLive = SILVER;
    const cDead = AMBER;
    for (let i = 0; i < pairs.length; i++) {
      const a = pairs[i][0], b = pairs[i][1];
      const pa = homes[a]._cur || homes[a];
      const pb = homes[b]._cur || homes[b];
      const dead = (flags[a] || flags[b]) ? shatter : 0;
      col.copy(cLive).lerp(cDead, dead);
      linkPos[i * 6] = pa.x; linkPos[i * 6 + 1] = pa.y; linkPos[i * 6 + 2] = pa.z;
      linkPos[i * 6 + 3] = pb.x; linkPos[i * 6 + 4] = pb.y; linkPos[i * 6 + 5] = pb.z;
      linkCol[i * 6] = col.r; linkCol[i * 6 + 1] = col.g; linkCol[i * 6 + 2] = col.b;
      linkCol[i * 6 + 3] = col.r; linkCol[i * 6 + 4] = col.g; linkCol[i * 6 + 5] = col.b;
    }
    links.geometry.attributes.position.needsUpdate = true;
    links.geometry.attributes.color.needsUpdate = true;
    links.material.opacity = 0.78 - shatter * 0.45;

    const e1 = smooth(clamp(dive / 0.45, 0, 1));
    const e2 = smooth(clamp((dive - 0.35) / 0.65, 0, 1));
    camera.position.lerpVectors(camHome, camMid, e1);
    if (e2 > 0) camera.position.lerpVectors(camera.position, camDive, e2);
    look.lerpVectors(tgtHome, tgtDive, dive);
    camera.lookAt(look);
    camera.fov = lerp(42, 58, dive);
    camera.updateProjectionMatrix();
    camera.position.x += Math.sin(t * 2.2) * 0.01 * (1 - dive);
  }

  return { scene, camera, group, update };
}

function buildGorge(mobile) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x12151c);
  scene.fog = new THREE.Fog(0x12151c, 22, 78);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 140);
  scene.add(new THREE.HemisphereLight(0xb7c0cc, 0x2a241c, 0.55));
  const sun = new THREE.DirectionalLight(0xffd7b0, 1.55);
  sun.position.set(-10, 22, 8);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6e7c90, 0.35);
  fill.position.set(8, 5, -6);
  scene.add(fill);

  const gw = mobile ? 70 : 90;
  const gd = mobile ? 90 : 120;
  const geo = new THREE.PlaneGeometry(64, 86, gw, gd);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const color = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = fbm(x * 0.12, z * 0.1);
    const wall = smoothstep(1.8, 7.5, Math.abs(x));
    let y = n * 1.1 + wall * (14 + n * 7);
    if (Math.abs(x) < 1.8) y = -0.4 + n * 0.2;
    pos.setY(i, y);
    const rock = 0.28 + n * 0.12;
    if (Math.abs(x) < 2.4) { color[i * 3] = 0.18; color[i * 3 + 1] = 0.2; color[i * 3 + 2] = 0.22; }
    else { color[i * 3] = rock * 0.95; color[i * 3 + 1] = rock * 0.9; color[i * 3 + 2] = rock * 0.82; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.04, flatShading: false })));

  // river ribbon
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 86, 1, 20),
    new THREE.MeshStandardMaterial({ color: 0x3a4550, metalness: 0.7, roughness: 0.25, emissive: 0x1a2228, emissiveIntensity: 0.2 })
  );
  river.rotation.x = -Math.PI / 2;
  river.position.y = -0.4;
  scene.add(river);

  // frustum
  const frustum = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(3.4, 11, 4, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xc9cdd4, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  cone.rotation.x = Math.PI;
  cone.position.y = -5.2;
  frustum.add(cone);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.ConeGeometry(3.4, 11, 4, 1, true)),
    new THREE.LineBasicMaterial({ color: 0xe8eaee, transparent: true, opacity: 0.55 })
  );
  edges.rotation.x = Math.PI;
  edges.position.y = -5.2;
  frustum.add(edges);
  scene.add(frustum);

  // feature points
  const pn = mobile ? 280 : 640;
  const pPos = new Float32Array(pn * 3);
  for (let i = 0; i < pn; i++) {
    const z = (Math.random() - 0.5) * 80;
    const side = Math.random() > 0.5 ? 1 : -1;
    const x = side * (2.6 + Math.random() * 8);
    const y = 0.8 + Math.random() * 12;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xe6e9ee, size: 0.11, transparent: true, opacity: 0, depthWrite: false }));
  scene.add(pts);

  // GNSS rays from sky — die at rim
  const rayN = 12;
  const rayPos = new Float32Array(rayN * 6);
  const rayCol = new Float32Array(rayN * 6);
  for (let i = 0; i < rayN; i++) {
    const x = (i / (rayN - 1) - 0.5) * 28;
    rayPos[i * 6] = x * 0.4; rayPos[i * 6 + 1] = 22; rayPos[i * 6 + 2] = -8 + (i % 5) * 4;
    rayPos[i * 6 + 3] = x; rayPos[i * 6 + 4] = 11.2; rayPos[i * 6 + 5] = -6 + (i % 5) * 3.5;
    for (let k = 0; k < 6; k += 3) { rayCol[i * 6 + k] = 0.88; rayCol[i * 6 + k + 1] = 0.64; rayCol[i * 6 + k + 2] = 0.29; }
  }
  const rayGeo = new THREE.BufferGeometry();
  rayGeo.setAttribute('position', new THREE.BufferAttribute(rayPos, 3));
  rayGeo.setAttribute('color', new THREE.BufferAttribute(rayCol, 3));
  const rays = new THREE.LineSegments(rayGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.0 }));
  scene.add(rays);

  function update(t) {
    const z = lerp(28, -8, smooth(t));
    camera.position.set(-1.8, 3.6, z);
    camera.lookAt(0.4, 1.4, z - 18);
    frustum.position.set(-0.2, 3.1, z - 1.4);
    frustum.lookAt(3.8, 0.4, z - 9);
    pts.material.opacity = smoothstep(0.08, 0.4, t) * 0.95;
    pts.material.size = 0.16;
    rays.material.opacity = smoothstep(0.04, 0.22, t) * 0.8;
    cone.material.opacity = 0.11 + 0.05 * Math.sin(t * 7);
  }

  return { scene, camera, update };
}

function buildShadow(mobile) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x100e0c);
  scene.fog = new THREE.Fog(0x100e0c, 16, 52);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);
  scene.add(new THREE.HemisphereLight(0xc9b79a, 0x1a140e, 0.7));
  const sun = new THREE.DirectionalLight(0xffe1b8, 1.5);
  sun.position.set(6, 16, 8);
  scene.add(sun);
  const amberLite = new THREE.PointLight(0xE0A24A, 2.4, 28, 1.6);
  amberLite.position.set(0, 3, 2);
  scene.add(amberLite);

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a5b4a, roughness: 0.92, metalness: 0.05 });
  function wall(sign) {
    const g = new THREE.BoxGeometry(5, 16, 48, 1, 8, 20);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), z = pos.getZ(i);
      pos.setX(i, pos.getX(i) + (fbm(y * 0.2, z * 0.15) - 0.5) * 2.2);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, rockMat);
    m.position.set(sign * 7.2, 4, 0);
    scene.add(m);
  }
  wall(-1); wall(1);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 48), new THREE.MeshStandardMaterial({ color: 0x4a4036, roughness: 0.95 }));
  floor.position.y = -0.2;
  scene.add(floor);

  const ellMat = new THREE.MeshBasicMaterial({ color: 0xE0A24A, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const ell = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), ellMat);
  ell.scale.set(6.2, 5.1, 11.5);
  ell.position.set(0, 3.2, 3);
  scene.add(ell);
  const ellWire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 18, 12)),
    new THREE.LineBasicMaterial({ color: 0xE0A24A, transparent: true, opacity: 0.28 })
  );
  ellWire.scale.copy(ell.scale);
  ellWire.position.copy(ell.position);
  scene.add(ellWire);

  // vehicle
  const veh = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.38, 1.8), new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.75, roughness: 0.32 }));
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.7), new THREE.MeshStandardMaterial({ color: 0x2a2e34, metalness: 0.4, roughness: 0.5 }));
  cab.position.set(0, 0.28, -0.2);
  veh.add(hull, cab);
  const gyro = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.025, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0xc9cdd4, transparent: true, opacity: 0.85 })
  );
  gyro.rotation.x = Math.PI / 2;
  veh.add(gyro);
  const gyro2 = gyro.clone();
  gyro2.rotation.y = Math.PI / 2;
  veh.add(gyro2);
  veh.position.set(0, 0.45, -14);
  scene.add(veh);

  // wall ticks
  const tickN = mobile ? 18 : 32;
  const ticks = new THREE.Group();
  const tickMat = new THREE.LineBasicMaterial({ color: 0xe8eaee, transparent: true, opacity: 0 });
  for (let i = 0; i < tickN; i++) {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.18, 0, 0), new THREE.Vector3(0.18, 0, 0),
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.18, 0), new THREE.Vector3(0, -0.18, 0)
    ]);
    const ln = new THREE.Line(g, tickMat);
    const side = i % 2 ? 1 : -1;
    ln.position.set(side * 4.6, 1.2 + (i % 5) * 1.1, -16 + i * 1.15);
    ticks.add(ln);
  }
  scene.add(ticks);

  function update(t) {
    const enter = smooth(t);
    veh.position.z = lerp(-14.5, 6.5, enter);
    gyro.rotation.z = t * 8;
    gyro2.rotation.z = -t * 6;
    ell.material.opacity = 0.1 + enter * 0.1;
    ellWire.material.opacity = 0.18 + enter * 0.18;
    tickMat.opacity = smoothstep(0.25, 0.7, t);
    amberLite.intensity = 1.6 + enter * 1.6;
    camera.position.set(-2.8 + enter * 0.6, 3.4, veh.position.z + 7.5);
    camera.lookAt(veh.position.x, 1.2, veh.position.z + 1.5);
  }

  return { scene, camera, update };
}
