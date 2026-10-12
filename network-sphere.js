import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const gate = document.getElementById('gate');
if (gate && !document.documentElement.classList.contains('gate-passed')) {
  try {
    initNetworkSphere(gate);
  } catch (err) {
    /* WebGL unavailable: the dark gradient + card remain on their own */
    console.warn('Network sphere disabled:', err);
  }
}

function initNetworkSphere(container) {
  const LABELS = [
    'Machine Learning', 'Deep Learning', 'Computer Vision', 'NLP',
    'PyTorch', 'XAI', 'Neural Net', 'Transformers',
    'Data Science', 'CNN', 'Embeddings', 'Attention'
  ];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const host = document.createElement('div');
  host.className = 'gate-sphere';
  container.insertBefore(host, container.firstChild);

  let W = host.clientWidth || window.innerWidth;
  let H = host.clientHeight || window.innerHeight;

  // ----- renderer -----
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  // ----- label renderer (HTML overlay) -----
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(W, H);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  host.appendChild(labelRenderer.domElement);

  // ----- scene / camera -----
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camera.position.z = 5.4;

  const group = new THREE.Group();
  scene.add(group);

  // ----- node positions on a sphere (Fibonacci distribution) -----
  const R = 2;
  const N = W < 700 ? 150 : 240;
  const nodes = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = golden * i;
    nodes.push(new THREE.Vector3(
      Math.cos(theta) * radius * R,
      y * R,
      Math.sin(theta) * radius * R
    ));
  }

  // ----- glowing node points (per-vertex size + brightness) -----
  const positions = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  const alphas = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    positions[i * 3] = nodes[i].x;
    positions[i * 3 + 1] = nodes[i].y;
    positions[i * 3 + 2] = nodes[i].z;
    const big = Math.random() < 0.18;
    sizes[i] = big ? 26 + Math.random() * 18 : 8 + Math.random() * 8;
    alphas[i] = big ? 1.0 : 0.45 + Math.random() * 0.4;
  }
  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  nodeGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  nodeGeo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

  const nodeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: makeGlowTexture() },
      uColor: { value: new THREE.Color(0x7fe3ff) }
    },
    vertexShader: `
      attribute float size;
      attribute float alpha;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uTex;
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec4 tex = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(uColor, 1.0) * tex * vAlpha;
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  group.add(new THREE.Points(nodeGeo, nodeMat));

  // ----- mesh lines between nearby nodes -----
  const linePos = [];
  const threshold = R * 0.62;
  for (let i = 0; i < N; i++) {
    let links = 0;
    for (let j = i + 1; j < N && links < 4; j++) {
      if (nodes[i].distanceTo(nodes[j]) < threshold) {
        linePos.push(nodes[i].x, nodes[i].y, nodes[i].z, nodes[j].x, nodes[j].y, nodes[j].z);
        links++;
      }
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x3aa6e0,
    transparent: true,
    opacity: 0.26,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  group.add(new THREE.LineSegments(lineGeo, lineMat));

  // ----- text labels attached to selected nodes -----
  const labelObjs = [];
  const step = Math.floor(N / LABELS.length);
  LABELS.forEach((word, k) => {
    const idx = (k * step + 7) % N;
    const el = document.createElement('div');
    el.className = 'node-label';
    el.textContent = word;
    const obj = new CSS2DObject(el);
    obj.position.copy(nodes[idx]);
    group.add(obj);
    labelObjs.push({ obj, el });
  });

  // ----- bloom post-processing -----
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.85, 0.55, 0.18);
  composer.addPass(bloom);

  // ----- resize -----
  function resize() {
    W = host.clientWidth || window.innerWidth;
    H = host.clientHeight || window.innerHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
    labelRenderer.setSize(W, H);
    composer.setSize(W, H);
  }
  window.addEventListener('resize', resize);

  // ----- animation loop -----
  const worldPos = new THREE.Vector3();
  let raf;
  function animate() {
    if (!gate.isConnected) {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      return;
    }
    raf = requestAnimationFrame(animate);

    if (!reduced) {
      group.rotation.y += 0.0016;
      group.rotation.x = Math.sin(Date.now() * 0.0001) * 0.18;
    }

    // fade labels that face away from the camera
    for (const { obj, el } of labelObjs) {
      obj.getWorldPosition(worldPos);
      const normal = worldPos.clone().normalize();
      const toCam = camera.position.clone().sub(worldPos).normalize();
      const facing = normal.dot(toCam);
      el.style.opacity = facing > 0 ? Math.min(1, facing * 1.7).toFixed(2) : '0.05';
    }

    composer.render();
    labelRenderer.render(scene, camera);
  }
  animate();
}

// radial-gradient sprite used as the soft glow for each node
function makeGlowTexture() {
  const size = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(160,235,255,0.9)');
  g.addColorStop(0.5, 'rgba(90,190,255,0.35)');
  g.addColorStop(1, 'rgba(40,120,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}
