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
    // Set transform early so the straw length can be computed against the
    // ground in this group's local space.
    signpostGroup.scale.set(0.6, 0.6, 0.6);
    signpostGroup.position.set(-1.6, 0, 0.8);

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
        emissive: 0xffffff,
        emissiveMap: nameTexture,
        emissiveIntensity: 2.0,
        transparent: true,
        roughness: 0.9,
        metalness: 0,
        alphaTest: 0.01,
      });
      const nameText = new THREE.Mesh(nameTextGeometry, nameTextMaterial);

      // Lay flat on the ground, slightly above it to avoid z-fighting
      // Lay flat on the ground, rotate around X axis only
nameText.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      nameText.position.set(_mCenter.x + 2.6, ground.position.y + 0.02, _mCenter.z - 1.5);
nameText.scale.set(0.7, 0.7, 0.7); // shrink text and move further back-left

      scene.add(nameText);

      // Expose to console for live positioning
      window.nameText = nameText;

    // Straw should be only as tall as needed to hold the 4 plaques + small margins
    const _strawTopMargin = 0.15;
    const _strawBottomMargin = 0.15;
    const _plaqueStack = (4 - 1) * 0.42 + _strawTopMargin + _strawBottomMargin + 0.32; // 3 gaps + top/bottom margin + 1 plaque height
    const _strawCenterY = _mCenter.y; // vertical center of the plaque stack on the carton

    // Keep the top of the straw exactly where it was, but extend the bottom
    // down until it reaches (and slightly sinks into) the ground.
    const _strawTopLocalY = _strawCenterY + _plaqueStack / 2; // unchanged top
    const _groundLocalY = (ground.position.y - signpostGroup.position.y) / signpostGroup.scale.y - 0.1; // ground in group-local space, sunk a touch
    const _strawLength = _strawTopLocalY - _groundLocalY;
    const _poleCenterY = (_strawTopLocalY + _groundLocalY) / 2;

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
    _pole.position.set(_spX, _poleCenterY, _spZ);
    signpostGroup.add(_pole);

    function _makeArrow(w, h) {
      const s = new THREE.Shape();
      const tip = -w/2, back = w/2, hh = h/2, nd = h*0.4;
      s.moveTo(tip, 0); s.lineTo(tip+nd, hh); s.lineTo(back, hh);
      s.lineTo(back, -hh); s.lineTo(tip+nd, -hh); s.lineTo(tip, 0);
      return s;
    }

    const _sCfg = [
      { name: 'sign-projects', label: 'PROJECTS', color: '#FFD93D' }, // yellow
      { name: 'sign-about',    label: 'ABOUT',    color: '#F2F2F0' }, // white
      { name: 'sign-articles', label: 'ARTICLES', color: '#FF8C42' }, // orange
      { name: 'sign-credits',  label: 'CREDITS',  color: '#7DC85B' }, // green
    ];
    const _pW = 0.9, _pH = 0.32, _pD = 0.06, _vSpace = 0.42;
    const _topY = _strawCenterY + (_plaqueStack / 2) - _strawTopMargin - 0.16; // top plaque just below the straw's top

    _sCfg.forEach((cfg, i) => {
      const geo = new THREE.ExtrudeGeometry(_makeArrow(_pW, _pH), { depth: _pD, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 });
      geo.center();
      const mat = new THREE.MeshStandardMaterial({ color: cfg.color, emissive: new THREE.Color(cfg.color), emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.1 });
      const m = new THREE.Mesh(geo, mat);
      m.name = cfg.name;
      m.userData.isInteractive = true;
      m.userData.baseColor = cfg.color; // remembered so hover can revert
      // Stagger each plaque left/right (toward the side its arrow points) so the
      // stack zigzags into an X-ish criss-cross instead of a straight column.
      const _zig = (i % 2 === 0) ? 0.35 : -0.35;
      m.position.set(_spX + 0.05, _topY - i * _vSpace, _spZ + _zig);
      // Point each arrow outward — away from the pole, matching its stagger side.
      m.rotation.y = (i % 2 === 0) ? Math.PI / 2 : -Math.PI / 2;

      // Label text drawn to a canvas, placed on the plaque's camera-facing face.
      const _lc = document.createElement('canvas');
      _lc.width = 640; _lc.height = 192;
      const _lx = _lc.getContext('2d');
      _lx.clearRect(0, 0, _lc.width, _lc.height);
      _lx.fillStyle = '#2A0A1E'; // dark wine — reads against the bright neon plaque
      _lx.textAlign = 'center';
      _lx.textBaseline = 'middle';
      // Start big, then shrink to fit so long words (EXPERIENCE) don't clip.
      let _fs = 112;
      const _maxLblW = _lc.width * 0.84;
      do {
        _lx.font = `bold ${_fs}px "Arial", sans-serif`;
        _fs -= 4;
      } while (_lx.measureText(cfg.label).width > _maxLblW && _fs > 28);
      _lx.fillText(cfg.label, _lc.width / 2, _lc.height / 2);
      const _lblTex = new THREE.CanvasTexture(_lc);
      _lblTex.colorSpace = THREE.SRGBColorSpace;
      const _lbl = new THREE.Mesh(
        new THREE.PlaneGeometry(_pW * 0.74, _pH * 0.74),
        new THREE.MeshStandardMaterial({
          map: _lblTex, emissive: 0xffffff, emissiveMap: _lblTex, emissiveIntensity: 0.5,
          transparent: true, alphaTest: 0.01, roughness: 0.6, metalness: 0,
        })
      );
      const _zoff = _pD / 2 + 0.02;
      if (i % 2 === 0) { _lbl.position.set(0, 0, _zoff); }
      else { _lbl.position.set(0, 0, -_zoff); _lbl.rotation.y = Math.PI; }
      m.add(_lbl);

      signpostGroup.add(m);
      console.log('Plaque created:', cfg.name, 'at y =', (_topY - i * _vSpace).toFixed(2));
      signMeshes.push(m);
    });

    console.log('Signpost created. signMeshes:', signMeshes.length);

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

    // --- Camera poses for plaque navigation ---
    _homeCamPos.copy(camera.position);
    _homeTarget.copy(modelCenter);
    // About: orbit round to the rear of the shop and dolly toward the base box.
    // Tunable live: window.aboutCamPos / window.aboutCamTarget (Vector3s).
    window.aboutCamPos = new THREE.Vector3(
      modelCenter.x - camDistance * 0.42,
      modelCenter.y - modelSize.y * 0.15,
      modelCenter.z + camDistance * 0.13
    );
    window.aboutCamTarget = new THREE.Vector3(
      modelCenter.x - modelSize.x * 0.30,
      modelCenter.y - modelSize.y * 0.30,
      modelCenter.z + modelSize.z * 0.10
    );
    // Phase-2 dive depth: 0 = stop at aboutCamPos, 1 = all the way to the box.
    window.aboutDiveLerp = 0.6;
    window.flyHome = () => flyCamera(_homeCamPos, _homeTarget, 1200, () => {
      controls.enabled = true;
      controls.autoRotate = true;
    });

    // Projects: fly to the front and zoom into the hanging menu board.
    // Tunable live: window.projectsCamPos / window.projectsCamTarget.
    window.projectsCamTarget = new THREE.Vector3(
      modelCenter.x + modelSize.x * 0.42,
      modelCenter.y + modelSize.y * 0.18,
      modelCenter.z + modelSize.z * 0.12
    );
    window.projectsCamPos = new THREE.Vector3(
      modelCenter.x + camDistance * 0.55,
      modelCenter.y + modelSize.y * 0.10,
      modelCenter.z + modelSize.z * 0.05
    );

    // --- About label: the image stuck on the box, with rounded corners ---
    {
      const _lc = document.createElement('canvas');
      const _lx = _lc.getContext('2d');
      const _ltex = new THREE.CanvasTexture(_lc);
      _ltex.colorSpace = THREE.SRGBColorSpace;
      const aboutLabel = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({
          map: _ltex, emissive: 0xffffff, emissiveMap: _ltex, emissiveIntensity: 0.25,
          transparent: true, alphaTest: 0.02, roughness: 0.7, metalness: 0,
        })
      );
      // Default: sit on the box face near the dive target, facing the camera.
      const _baseH = modelSize.x * 0.08; // smaller label height (world units)
      // Pick the box face the dive camera actually sees and stick the label
      // flat onto it — axis-aligned to the box, NOT billboarding the camera.
      const _d = new THREE.Vector3().subVectors(window.aboutCamPos, window.aboutCamTarget);
      let _ry, _nx = 0, _nz = 0;
      if (Math.abs(_d.x) >= Math.abs(_d.z)) {
        _nx = Math.sign(_d.x) || 1;
        _ry = _nx > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        _nz = Math.sign(_d.z) || 1;
        _ry = _nz > 0 ? 0 : Math.PI;
      }
      aboutLabel.position.set(
        window.aboutCamTarget.x + _nx * modelSize.x * 0.05,
        window.aboutCamTarget.y - 0.1,
        window.aboutCamTarget.z + _nz * modelSize.z * 0.05
      );
      aboutLabel.rotation.set(0, _ry, -0.05); // flat on the chosen face, slight askew roll
      aboutLabel.scale.set(_baseH, _baseH, 1);
      scene.add(aboutLabel);
      window.aboutLabel = aboutLabel;
      aboutLabel.visible = false; // hidden only until the image finishes loading

      const _img = new Image();
      _img.onload = () => {
        const cap = 720;
        const k = Math.min(1, cap / Math.max(_img.naturalWidth, _img.naturalHeight));
        const w = Math.round(_img.naturalWidth * k);
        const h = Math.round(_img.naturalHeight * k);
        const r = Math.min(w, h) * 0.08; // rounded corner radius
        _lc.width = w; _lc.height = h;
        _lx.clearRect(0, 0, w, h);
        _lx.beginPath();
        _lx.moveTo(r, 0);
        _lx.arcTo(w, 0, w, h, r);
        _lx.arcTo(w, h, 0, h, r);
        _lx.arcTo(0, h, 0, 0, r);
        _lx.arcTo(0, 0, w, 0, r);
        _lx.closePath();
        _lx.clip();
        _lx.drawImage(_img, 0, 0, w, h);
        _ltex.needsUpdate = true;
        aboutLabel.scale.set(_baseH * (w / h), _baseH, 1); // match image aspect
        aboutLabel.visible = true;
      };
      _img.src = '/about-label.jpg';
    }

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

// ===== Camera fly animation =====
const _homeCamPos = new THREE.Vector3();
const _homeTarget = new THREE.Vector3();
const _tmpTarget = new THREE.Vector3();
let _camAnim = null;

function flyCamera(toPos, toTarget, durMs, onDone) {
  _camAnim = {
    fromPos: camera.position.clone(),
    toPos: toPos.clone(),
    fromTarget: controls.target.clone(),
    toTarget: toTarget.clone(),
    start: performance.now(),
    dur: durMs,
    onDone: onDone || null,
  };
}

// ===== About panel =====
const _panel = document.getElementById('about-panel');
let _panelOpen = false;

function _setPanelView(view) {
  if (!_panel) return;
  _panel.querySelectorAll('.panel-tabs button').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === view));
  _panel.querySelectorAll('.panel-view').forEach((s) =>
    s.classList.toggle('active', s.dataset.view === view));
}

function openAboutPanel() {
  if (!_panel) return;
  _panelOpen = true;
  _setPanelView('about');
  _panel.classList.add('open');
  _panel.setAttribute('aria-hidden', 'false');
}

function closeAboutPanel() {
  if (!_panelOpen) return;
  _panelOpen = false;
  _panel.classList.remove('open');
  _panel.setAttribute('aria-hidden', 'true');
  if (window.flyHome) window.flyHome();
}

if (_panel) {
  _panel.querySelector('.panel-back').addEventListener('click', closeAboutPanel);
  _panel.querySelectorAll('.panel-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => _setPanelView(btn.dataset.view));
  });
}

// ===== Projects panel =====
const _pPanel = document.getElementById('projects-panel');

function openProjectsPanel() {
  if (!_pPanel) return;
  _panelOpen = true;
  _pPanel.classList.add('open');
  _pPanel.setAttribute('aria-hidden', 'false');
}

function closeProjectsPanel() {
  if (!_pPanel || !_pPanel.classList.contains('open')) return;
  _panelOpen = false;
  _pPanel.classList.remove('open');
  _pPanel.setAttribute('aria-hidden', 'true');
  if (window.flyHome) window.flyHome();
}

if (_pPanel) {
  _pPanel.querySelector('.panel-back').addEventListener('click', closeProjectsPanel);
}

// ===== Plaque hover + click (raycaster) =====
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
let _hoveredPlaque = null;
window.HOVER_COLOR = '#FF4FA8'; // contrasting neon highlight — tunable in console

function _plaqueAtEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  _pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_pointer, camera);
  const hits = _raycaster.intersectObjects(signMeshes, false);
  return hits.length ? hits[0].object : null;
}

function _applyHover(p) {
  p.material.color.set(window.HOVER_COLOR);
  p.material.emissive.set(window.HOVER_COLOR);
  p.material.emissiveIntensity = 2.6;
}

function _clearHover(p) {
  p.material.color.set(p.userData.baseColor);
  p.material.emissive.set(p.userData.baseColor);
  p.material.emissiveIntensity = 1.6;
}

renderer.domElement.addEventListener('pointermove', (event) => {
  const p = _plaqueAtEvent(event);
  if (p === _hoveredPlaque) return;
  if (_hoveredPlaque) _clearHover(_hoveredPlaque);
  if (p) {
    _applyHover(p);
    _hoveredPlaque = p;
    renderer.domElement.style.cursor = 'pointer';
  } else {
    _hoveredPlaque = null;
    renderer.domElement.style.cursor = 'default';
  }
});

renderer.domElement.addEventListener('click', (event) => {
  if (_panelOpen || _camAnim) return;
  const p = _plaqueAtEvent(event);
  if (!p) return;
  console.log('Plaque clicked:', p.name);
  if (p.name === 'sign-about') {
    controls.enabled = false;
    controls.autoRotate = false;
    if (_hoveredPlaque) { _clearHover(_hoveredPlaque); _hoveredPlaque = null; }
    renderer.domElement.style.cursor = 'default';
    // Phase 1: orbit around to the rear base box.
    flyCamera(window.aboutCamPos, window.aboutCamTarget, 1500, () => {
      // Phase 2: short dive deeper into the box, then reveal the panel.
      const innerPos = new THREE.Vector3().lerpVectors(
        window.aboutCamPos, window.aboutCamTarget, window.aboutDiveLerp
      );
      flyCamera(innerPos, window.aboutCamTarget, 800, openAboutPanel);
    });
  }
  if (p.name === 'sign-projects') {
    controls.enabled = false;
    controls.autoRotate = false;
    if (_hoveredPlaque) { _clearHover(_hoveredPlaque); _hoveredPlaque = null; }
    renderer.domElement.style.cursor = 'default';
    // Phase 1: fly to the front, facing the hanging menu.
    flyCamera(window.projectsCamPos, window.projectsCamTarget, 1500, () => {
      // Phase 2: short dive toward the menu, then reveal the panel.
      const innerPos = new THREE.Vector3().lerpVectors(
        window.projectsCamPos, window.projectsCamTarget, 0.55
      );
      flyCamera(innerPos, window.projectsCamTarget, 800, openProjectsPanel);
    });
  }
});

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
  if (_camAnim) {
    const k = Math.min((performance.now() - _camAnim.start) / _camAnim.dur, 1);
    const e = k * k * (3 - 2 * k); // smoothstep ease
    camera.position.lerpVectors(_camAnim.fromPos, _camAnim.toPos, e);
    _tmpTarget.lerpVectors(_camAnim.fromTarget, _camAnim.toTarget, e);
    camera.lookAt(_tmpTarget);
    controls.target.copy(_tmpTarget);
    if (k >= 1) { const done = _camAnim.onDone; _camAnim = null; if (done) done(); }
  } else {
    controls.update(); // required when damping enabled
  }
  fireflyMaterial.uniforms.uTime.value = performance.now() * 0.001;
  composer.render();
}
animate();
