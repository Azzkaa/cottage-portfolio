import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// Scene setup
const scene = new THREE.Scene();
// Near‑black background
// Dark fog for depth
scene.fog = new THREE.Fog(0x1A0612, 25, 90);

// Sky sphere with vertical gradient
const skyGeometry = new THREE.SphereGeometry(100, 32, 16);
const skyMaterial = new THREE.ShaderMaterial({
  uniforms: {
    topColor: { value: new THREE.Color('#1A0612') }, // deep wine, near‑black top
    bottomColor: { value: new THREE.Color('#3D1A2E') }, // dusty wine near horizon
    offset: { value: 33 },
    exponent: { value: 0.6 }
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    varying vec3 vWorldPosition;
    void main() {
      float h = normalize(vWorldPosition + offset).y;
      gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
    }
  `,
  side: THREE.BackSide
});
const sky = new THREE.Mesh(skyGeometry, skyMaterial);
scene.add(sky);

// Camera
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1, 3); // reasonable distance

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; // adjusted exposure for neon look
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Global array to hold sign meshes for label updates
let signMeshes = [];

// Post‑processing Composer for bloom
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.01, 0.7, 0.95);
composer.addPass(bloomPass);

document.body.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
// Enable slow auto-rotation
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

// Lights will be added after model loads

// Load cottage model
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
loader.load(
  '/models/cottage.glb',
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);
    // Compute model bounding box and size/center for camera setup
    const modelBox = new THREE.Box3().setFromObject(gltf.scene);
    const modelCenter = new THREE.Vector3();
    modelBox.getCenter(modelCenter);
    const modelSize = new THREE.Vector3();
    modelBox.getSize(modelSize);
    // Signpost Group
    const signpostGroup = new THREE.Group();
    scene.add(signpostGroup);

    const _mBox = new THREE.Box3().setFromObject(model);
    const _mCenter = new THREE.Vector3(); _mBox.getCenter(_mCenter);
    const _mSize = new THREE.Vector3(); _mBox.getSize(_mSize);
// Log bounding box sides for reference (front now defined as +X direction)
console.log('Shop bounds:', {
  front: _mCenter.x + _mSize.x/2,   // +X side
  back:  _mCenter.x - _mSize.x/2,   // -X side
  right: _mCenter.z + _mSize.z/2,   // +Z side
  left:  _mCenter.z - _mSize.z/2    // -Z side
});

    const _spX = _mCenter.x + _mSize.x * 1.5;  // pushed further right
    const _spZ = _mCenter.z + _mSize.z * 0.3;  // slight forward offset for visibility
    const _spBaseY = _mBox.min.y;
    const _spTopY = _mBox.max.y + 0.3;
// Ground plane — large beige/cream surface that picks up the colored lights
const groundGeometry = new THREE.PlaneGeometry(40, 40);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: '#E8D5B0',
  roughness: 0.85,
  metalness: 0.05,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2; // rotate to lie flat
ground.position.y = -0.02; // absolute positioning to close the gap
ground.receiveShadow = true;
scene.add(ground);

      // Ensure all model meshes cast and receive shadows
      model.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      // ===== Name text on the ground =====
      function makeTextTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Transparent background
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Style: white text with soft shadow
        ctx.fillStyle = '#FFE066'; // bright yellow for main name
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 14; // stronger shadow for better contrast
        ctx.textAlign = 'center';

        // Big name
        ctx.font = 'bold 120px "Arial", sans-serif';
        ctx.letterSpacing = '8px';
        ctx.fillText('AZKA AFTAB', canvas.width / 2, 160);

        // Subtitles in monospace, smaller, left-aligned within centered block
        ctx.fillStyle = '#F2F2F0'; // softer cream for subtitles
        ctx.font = 'bold 56px "Courier New", monospace';
        ctx.textAlign = 'left';
        const subX = canvas.width / 2 - 280;
        ctx.fillText('> FULL STACK DEVELOPER', subX, 280);
        ctx.fillText('> RESEARCHER', subX, 360);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        return texture;
      }

      const nameTexture = makeTextTexture();
      const nameTextGeometry = new THREE.PlaneGeometry(4, 2);
      const nameTextMaterial = new THREE.MeshStandardMaterial({
        map: nameTexture,
        transparent: true,
        roughness: 0.9,
        metalness: 0,
        alphaTest: 0.01,
      });
      const nameText = new THREE.Mesh(nameTextGeometry, nameTextMaterial);

      // Lay flat on the ground, slightly above it to avoid z-fighting
      // Lay flat on the ground, rotate around X axis only
nameText.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      nameText.position.set(_mCenter.x - 2.5, ground.position.y + 0.01, _mCenter.z - 3);
nameText.scale.set(0.7, 0.7, 0.7); // shrink text and move further back-left

      scene.add(nameText);

      // Expose to console for live positioning
      window.nameText = nameText;

    // Straw should be only as tall as needed to hold the 4 plaques + small margins
    const _strawTopMargin = 0.15;
    const _strawBottomMargin = 0.15;
    const _strawLength = (4 - 1) * 0.42 + _strawTopMargin + _strawBottomMargin + 0.32; // 3 gaps + top/bottom margin + 1 plaque height
    const _strawCenterY = _mCenter.y; // center it vertically on the carton

    const _pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, _strawLength, 16),
      new THREE.MeshStandardMaterial({
        color: '#F2F2F0',
        emissive: '#FFFFFF',
        emissiveIntensity: 0.15,
        roughness: 0.3,
        metalness: 0.1
      })
    );
    _pole.position.set(_spX, _strawCenterY, _spZ);
    signpostGroup.add(_pole);

    function _makeArrow(w, h) {
      const s = new THREE.Shape();
      const tip = -w/2, back = w/2, hh = h/2, nd = h*0.4;
      s.moveTo(tip, 0); s.lineTo(tip+nd, hh); s.lineTo(back, hh);
      s.lineTo(back, -hh); s.lineTo(tip+nd, -hh); s.lineTo(tip, 0);
      return s;
    }

    const _sCfg = [
      { name: 'sign-projects',   label: 'PROJECTS',   color: '#FFD93D' }, // yellow
      { name: 'sign-about',      label: 'ABOUT',      color: '#F2F2F0' }, // white
      { name: 'sign-experience', label: 'EXPERIENCE', color: '#FF8C42' }, // orange
      { name: 'sign-contact',    label: 'CONTACT',    color: '#7DC85B' }, // green
    ];
    const _pW = 0.9, _pH = 0.32, _pD = 0.06, _vSpace = 0.42;
    const _topY = _strawCenterY + (_strawLength / 2) - _strawTopMargin - 0.16; // top plaque just below the straw's top

    _sCfg.forEach((cfg, i) => {
      const geo = new THREE.ExtrudeGeometry(_makeArrow(_pW, _pH), { depth: _pD, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 });
      geo.center();
      const mat = new THREE.MeshStandardMaterial({ color: cfg.color, emissive: new THREE.Color(cfg.color), emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.1 });
      const m = new THREE.Mesh(geo, mat);
      m.name = cfg.name;
      m.userData.isInteractive = true;
      m.position.set(_spX - 0.05, _topY - i * _vSpace, _spZ);
      m.rotation.y = Math.PI / 2; // rotate plaque to face left, flush with straw
      signpostGroup.add(m);
      console.log('Plaque created:', cfg.name, 'at y =', (_topY - i * _vSpace).toFixed(2));
      signMeshes.push(m);
    });

    console.log('Signpost created. signMeshes:', signMeshes.length);
    // Hardcode signpost scale and position
    signpostGroup.scale.set(0.5, 0.5, 0.5);
    signpostGroup.position.set(-0.5, 0, 0.8);

    // Expose signpost and controls to console for live tweaking
    window.signpostGroup = signpostGroup;
    window.signMeshes = signMeshes;
    window.controls = controls;
      // Expose ground and scene for console debugging
      window.ground = ground;
      window.scene = scene;
    console.log('Tip: in console try: signpostGroup.position.set(-1.2, 0, 0.8); signpostGroup.scale.set(0.6,0.6,0.6); controls.autoRotate = false;');
    // Diagnostic mesh info (sorted by Y position)
    console.log('=== ALL MESHES (sorted by Y position, highest first) ===');
    const allMeshes = [];
    model.traverse((obj) => {
      if (!obj.isMesh) return;
      const bbox = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      bbox.getSize(size);
      bbox.getCenter(center);
      allMeshes.push({
        name: obj.name,
        mat: obj.material.name,
        centerY: center.y,
        sizeX: size.x,
        sizeY: size.y,
        sizeZ: size.z
      });
    });
    allMeshes.sort((a, b) => b.centerY - a.centerY);
    allMeshes.forEach(m => {
      console.log(`Y=${m.centerY.toFixed(3)} size=${m.sizeX.toFixed(3)}x${m.sizeY.toFixed(3)}x${m.sizeZ.toFixed(3)} mat=${m.mat} name=${m.name}`);
    });
    
    // Diagnostic mesh info (size and position)
    model.traverse((obj) => {
      if (!obj.isMesh) return;
      const bbox = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      console.log(`Mesh: ${obj.name}, material: ${obj.material.name}, size: ${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}, center Y: ${center.y.toFixed(2)}`);
    });

    // Additional overrides for specific meshes (strawberries, sign, door)
    model.traverse((obj) => {
      if (!obj.isMesh) return;


      // Sign mesh – neon hot pink glow
      if (obj.name === 'sign_wood_0') {
        obj.material = obj.material.clone();
        obj.material.color.set('#FFB4D6');
        obj.material.emissive = new THREE.Color('#FF4FA8');
        obj.material.emissiveIntensity = 1.5;
                obj.material.needsUpdate = true;
        console.log('Sign override:', obj.name);
      }

      // Door mesh – visible muted pink-brown
      if (obj.name === 'doorwood_wood_0') {
        obj.material = obj.material.clone();
        obj.material.color.set('#8B4D6B');
                obj.material.needsUpdate = true;
        console.log('Door override:', obj.name);
      }
    });

    // Initial camera angle: front 3/4 view, slightly above the carton
    // Initial camera angle: front 3/4 view, slightly above the carton
        const camDistance = Math.max(modelSize.x, modelSize.y, modelSize.z) * 1.6;

    camera.position.set(
      modelCenter.x + camDistance * 0.6,
      modelCenter.y + camDistance * 0.15,
      modelCenter.z + camDistance * 0.35
    );
    camera.lookAt(modelCenter);
    controls.target.copy(modelCenter);
    controls.update();

    // Keep a 'center' alias for later lighting code
    const center = modelCenter;

    // Auto-rotation: off initially, kicks in after 4 seconds of viewing
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.5;
    setTimeout(() => {
      controls.autoRotate = true;
    }, 4000);

    // Lighting (now inside model callback)
    const ambient = new THREE.AmbientLight(0x2D1F3D, 0.85); // brighter ambient
    scene.add(ambient);
    // Offsets relative to cottage center
    const offsetPink = new THREE.Vector3(2, 3, 2);
    const offsetCyan = new THREE.Vector3(-2, 3, 2);
    const offsetMag = new THREE.Vector3(0, 2, -3);
    const pinkLight = new THREE.PointLight(0xFF4FA8, 25, 14, 1.5);
    pinkLight.position.copy(center).add(offsetPink);
    pinkLight.castShadow = true;
    scene.add(pinkLight);
    const cyanLight = new THREE.PointLight(0x4FE5FF, 20, 14, 1.5);
    cyanLight.position.copy(center).add(offsetCyan);
    cyanLight.castShadow = true;
    scene.add(cyanLight);
    const magentaLight = new THREE.PointLight(0xC84FFF, 15, 12, 1.5);
    magentaLight.position.copy(center).add(offsetMag);
    magentaLight.castShadow = true;
    scene.add(magentaLight);

    // Log materials and meshes
    // Replace unlit star materials with MeshStandardMaterial for emissive glow
    model.traverse((obj) => {
      if (!obj.isMesh) return;

      // Stars: mesh name starts with "Star"
      if (obj.name.startsWith('Star')) {
        const oldMat = obj.material;
        const oldTexture = oldMat.map;
        const oldColor = oldMat.color ? oldMat.color.clone() : new THREE.Color(0xffffff);

        obj.material = new THREE.MeshStandardMaterial({
          map: oldTexture,
          color: oldColor,
          emissive: new THREE.Color('#FFD93D'),
          emissiveIntensity: 3.0,
          emissiveMap: oldTexture,
        });
        obj.material.needsUpdate = true;
      }
    });

    // Signpost setup and labels

// Hide loading indicator
    const loaderEl = document.getElementById('loader');
    if (loaderEl) loaderEl.style.display = 'none';
  },
  undefined,
  (error) => {
    console.error('Error loading model:', error);
  }
);


// Fireflies setup
const fireflyCount = 60;
const fireflyGeometry = new THREE.BufferGeometry();
const fireflyPositions = new Float32Array(fireflyCount * 3);
const fireflyOffsets = new Float32Array(fireflyCount);
for (let i = 0; i < fireflyCount; i++) {
  const radius = 2 + Math.random() * 4;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  fireflyPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  fireflyPositions[i * 3 + 1] = Math.random() * 4 + 0.5;
  fireflyPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  fireflyOffsets[i] = Math.random() * Math.PI * 2;
}
fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
fireflyGeometry.setAttribute('aOffset', new THREE.BufferAttribute(fireflyOffsets, 1));
const fireflyMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#FFE066') },
    uSize: { value: 30.0 }
  },
  vertexShader: `
    attribute float aOffset;
    uniform float uTime;
    uniform float uSize;
    varying float vFlicker;
    void main() {
      vec3 pos = position;
      pos.y += sin(uTime * 0.5 + aOffset) * 0.15;
      pos.x += sin(uTime * 0.3 + aOffset * 1.5) * 0.1;
      pos.z += cos(uTime * 0.4 + aOffset) * 0.1;
      vFlicker = 0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * 2.0 + aOffset * 3.0));
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = uSize * (1.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    varying float vFlicker;
    void main() {
      vec2 center = gl_PointCoord - vec2(0.5);
      float dist = length(center);
      if (dist > 0.5) discard;
      float strength = 1.0 - smoothstep(0.0, 0.5, dist);
      strength = pow(strength, 2.0);
      gl_FragColor = vec4(uColor, strength * vFlicker);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const fireflies = new THREE.Points(fireflyGeometry, fireflyMaterial);
scene.add(fireflies);

// Resize handling
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update(); // required when damping enabled
  fireflyMaterial.uniforms.uTime.value = performance.now() * 0.001;
  composer.render();
}
animate();
