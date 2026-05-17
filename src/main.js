// Stylesheet for the HTML overlay panels (Vite bundles this CSS).
import './style.css';
// Core Three.js library — scene graph, cameras, meshes, math, etc.
import * as THREE from 'three';
// Add-on: lets the user orbit/zoom the camera with mouse/touch.
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// Post-processing pipeline: renders the scene through a chain of passes.
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
// First pass — renders the raw scene before effects are applied.
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
// Bloom pass — makes bright/emissive pixels glow (the neon look).
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
// Self-contained Snake mini-game shown inside the Credits panel.
import { createSnakeGame } from './snake.js';
// Self-contained Darts mini-game shown inside the Darts panel.
import { createDartsGame } from './darts.js';
// Self-contained "Carrot Blaster" shooter — opened by clicking a star.
import { createShooterGame } from './shooter.js';
// Self-contained "Bunny Hop" runner — opened by clicking the ground rabbit.
import { createRunnerGame } from './runner.js';

// Base path for runtime-loaded assets in public/ (audio, glTF models,
// images, the résumé PDF). Vite sets this to '/' in dev and to the
// configured base ('/cottage-portfolio/') in the GitHub Pages build, so
// hardcoded '/foo' paths don't 404 when served from a sub-path.
const ASSET = import.meta.env.BASE_URL;

// Baked world position + radius of the round medallion's click-target,
// derived from live console clicks on the medallion. To re-tune: nudge
// window.dartTarget in the console, then re-bake these numbers.
const DART_TARGET = { x: 0.672, y: 1.787, z: -0.476, r: 0.14 };

// Baked world position + radius of the IN-SHOP bunny's click-target,
// captured via captureBunny() in the console. Re-tune with window.bunnyTarget
// (or re-run captureBunny()), then re-bake these numbers.
const BUNNY_TARGET = { x: 0.501, y: 0.796, z: 0.369, r: 0.28 };

// The scene is the root container holding every 3D object, light and camera.
const scene = new THREE.Scene();
// Fog fades distant geometry to a deep wine colour, adding depth.
// Args: colour, near distance (fog starts), far distance (fully fogged).
scene.fog = new THREE.Fog(0x1A0612, 25, 90);

// Sky: a huge sphere we sit inside, painted with a vertical gradient shader.
const skyGeometry = new THREE.SphereGeometry(100, 32, 16);
// ShaderMaterial lets us write custom GLSL for the gradient.
const skyMaterial = new THREE.ShaderMaterial({
  // Uniforms are values passed from JS into the shader.
  uniforms: {
    topColor: { value: new THREE.Color('#1A0612') }, // deep wine, near-black top
    bottomColor: { value: new THREE.Color('#3D1A2E') }, // dusty wine near horizon
    offset: { value: 33 },   // shifts where the gradient midpoint sits
    exponent: { value: 0.6 } // curve of the gradient blend
  },
  // Vertex shader: passes each vertex's world position to the fragment shader.
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // Fragment shader: colour each pixel by mixing the two colours by height (y).
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    varying vec3 vWorldPosition;
    void main() {
      // h is the vertical component of the normalized position (0..1-ish).
      float h = normalize(vWorldPosition + offset).y;
      gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
    }
  `,
  // BackSide so the sphere is painted on the inside (we view it from within).
  side: THREE.BackSide
});
// Build the sky mesh and add it to the scene.
const sky = new THREE.Mesh(skyGeometry, skyMaterial);
scene.add(sky);

// Perspective camera: (field of view, aspect ratio, near clip, far clip).
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
// Initial placement; the real framing is set once the model loads.
camera.position.set(0, 1, 3); // reasonable distance

// WebGL renderer with antialiasing for smoother edges.
const renderer = new THREE.WebGLRenderer({ antialias: true });
// Match the device's pixel density and fill the window. Capped at 2 so
// high-DPR phones (often 3x) don't render ~2x the pixels for no visible
// gain — the single biggest mobile perf lever here.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
// ACES tone mapping gives a filmic, balanced response to bright neon.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; // adjusted exposure for neon look
// Enable soft shadows.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Correct colour space so textures aren't washed out.
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Holds the 4 clickable arrow plaque meshes (filled once the model loads).
let signMeshes = [];

// EffectComposer drives the post-processing chain.
const composer = new EffectComposer(renderer);
// Pass 1: render the scene normally.
composer.addPass(new RenderPass(scene, camera));
// Pass 2: bloom — (resolution, strength, radius, threshold). Low strength +
// high threshold so only the brightest emissive bits glow, not everything.
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.01, 0.7, 0.95);
composer.addPass(bloomPass);

// Attach the renderer's <canvas> to the page.
document.body.appendChild(renderer.domElement);

// OrbitControls: drag to rotate, scroll to zoom around controls.target.
const controls = new OrbitControls(camera, renderer.domElement);
// Damping adds inertia so movement eases instead of stopping abruptly.
controls.enableDamping = true;
controls.dampingFactor = 0.05;
// Slowly auto-rotate when the user isn't interacting (re-tuned after load).
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

// Lights are created inside the model callback (positioned by its bounds).

// GLTFLoader loads the .glb 3D model. Imported here, used just below.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
loader.load(
  `${ASSET}models/cottage.glb`,
  // Success callback — runs once the model has downloaded and parsed.
  (gltf) => {
    // gltf.scene is the loaded model's root object; add it to our scene.
    const model = gltf.scene;
    scene.add(model);
    // Box3 = an axis-aligned bounding box around the whole model.
    const modelBox = new THREE.Box3().setFromObject(gltf.scene);
    // Its centre point — used to aim the camera at the model.
    const modelCenter = new THREE.Vector3();
    modelBox.getCenter(modelCenter);
    // Its size (width/height/depth) — used to scale camera distance.
    const modelSize = new THREE.Vector3();
    modelBox.getSize(modelSize);
    // A Group lets us move/scale the whole signpost as one unit.
    const signpostGroup = new THREE.Group();
    scene.add(signpostGroup);
    // Set transform early so the straw length can be computed against the
    // ground in this group's local space.
    signpostGroup.scale.set(0.6, 0.6, 0.6);
    signpostGroup.position.set(-1.6, 0, 0.8);

    // Re-measure the model into local helper vars for signpost placement.
    const _mBox = new THREE.Box3().setFromObject(model);
    const _mCenter = new THREE.Vector3(); _mBox.getCenter(_mCenter);
    const _mSize = new THREE.Vector3(); _mBox.getSize(_mSize);
    // Log the shop's edges (front is defined as the +X direction).
    console.log('Shop bounds:', {
      front: _mCenter.x + _mSize.x/2,   // +X side
      back:  _mCenter.x - _mSize.x/2,   // -X side
      right: _mCenter.z + _mSize.z/2,   // +Z side
      left:  _mCenter.z - _mSize.z/2    // -Z side
    });

    // Signpost X/Z: pushed out to the right and slightly forward of the shop.
    const _spX = _mCenter.x + _mSize.x * 1.5;  // pushed further right
    const _spZ = _mCenter.z + _mSize.z * 0.3;  // slight forward offset for visibility
    const _spBaseY = _mBox.min.y; // model's lowest point (≈ ground)
    const _spTopY = _mBox.max.y + 0.3; // a little above the model's top

    // Ground plane — large beige/cream surface that catches the coloured lights.
    const groundGeometry = new THREE.PlaneGeometry(40, 40);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: '#E8D5B0',
      roughness: 0.85, // mostly matte
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    // A plane is created vertical; rotate it -90° to lie flat.
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02; // nudge down to close the gap with the model
    ground.receiveShadow = true; // let shadows land on it
    scene.add(ground);

    // Walk every mesh in the model and let it cast + receive shadows.
    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    // ===== Name text on the ground =====
    // Draws the name to a 2D canvas, which we then use as a texture.
    function makeTextTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      // Start fully transparent so only the text shows.
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Main name styling: bright yellow with a soft drop shadow.
      ctx.fillStyle = '#FFE066';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 14; // stronger shadow for better contrast
      ctx.textAlign = 'center';

      // Draw the big name near the top of the canvas.
      ctx.font = 'bold 120px "Arial", sans-serif';
      ctx.letterSpacing = '8px';
      ctx.fillText('AZKA AFTAB', canvas.width / 2, 160);

      // The 3 subtitle lines (FULL STACK DEVELOPER / RESEARCHER / CONTACT ME)
      // are NO LONGER baked into this texture — they are now separate,
      // individually clickable meshes (see "Clickable floor lines" below),
      // so this texture holds only the big name.

      // Wrap the canvas as a Three.js texture and return it.
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    }

    // Build the texture and a flat plane to show it on.
    const nameTexture = makeTextTexture();
    const nameTextGeometry = new THREE.PlaneGeometry(4, 2);
    // emissiveMap = same texture, so the text glows on its own (readable on
    // the dim floor) while the transparent background stays dark.
    const nameTextMaterial = new THREE.MeshStandardMaterial({
      map: nameTexture,
      emissive: 0xffffff,
      emissiveMap: nameTexture,
      emissiveIntensity: 2.0,
      transparent: true,
      roughness: 0.9,
      metalness: 0,
      alphaTest: 0.01, // discard fully transparent pixels (clean edges)
    });
    const nameText = new THREE.Mesh(nameTextGeometry, nameTextMaterial);

    // Lay it flat on the ground and rotate within the plane so it reads right.
    nameText.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    // Place it in front of the shop, just above the ground (avoids z-fighting).
    nameText.position.set(_mCenter.x + 2.6, ground.position.y + 0.02, _mCenter.z - 1.5);
    nameText.scale.set(0.7, 0.7, 0.7); // shrink it down a touch
    scene.add(nameText);

    // Exposed to the browser console for live position tweaking.
    window.nameText = nameText;

    // ===== Clickable floor lines (replace the old baked subtitles) =====
    // Each subtitle is now its own small plane parented to nameText, so it
    // inherits the same flat-on-ground orientation + 0.7 scale. We push them
    // into signMeshes so the EXISTING plaque raycaster gives them
    // hover-recolour + click for free (no raycaster changes). The positions
    // are reasoned starting guesses in nameText's LOCAL space — nudge
    // window.floorLines[i].position in the console, then ask to bake.
    function _makeLineTexture(label) {
      const c = document.createElement('canvas');
      const ctx2 = c.getContext('2d');
      const fs = 52; // same size as the old subtitles
      ctx2.font = `bold ${fs}px "Courier New", monospace`;
      const tw = Math.ceil(ctx2.measureText(label).width);
      c.width = tw + 40;
      c.height = fs + 18;                  // tight padding → less transparent area
      ctx2.font = `bold ${fs}px "Courier New", monospace`; // resize wipes ctx state
      ctx2.clearRect(0, 0, c.width, c.height);
      ctx2.fillStyle = '#FFFFFF';          // white so material.color can tint it
      ctx2.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx2.shadowBlur = 12;
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.fillText(label, c.width / 2, c.height / 2);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return { tex: t, aspect: c.width / c.height };
    }

    // label, raycaster name, and starting Y in nameText-local space.
    const _floorCfg = [
      { label: '> FULL STACK DEVELOPER', name: 'floor-fullstack',  y: -0.10 },
      { label: '> RESEARCHER',           name: 'floor-researcher', y: -0.42 },
      { label: '> CONTACT ME',           name: 'floor-contact',    y: -0.74 },
    ];
    const _lineH = 0.27;                   // plane height in local units
    window.floorLines = [];
    _floorCfg.forEach((cfg) => {
      const { tex, aspect } = _makeLineTexture(cfg.label);
      const lmat = new THREE.MeshStandardMaterial({
        map: tex, emissive: 0xffffff, emissiveMap: tex,
        emissiveIntensity: 1.6, transparent: true, alphaTest: 0.01,
        roughness: 0.9, metalness: 0,
      });
      lmat.color.set('#F2F2F0');           // cream by default (matches baseColor)
      const lm = new THREE.Mesh(
        new THREE.PlaneGeometry(_lineH * aspect, _lineH), lmat
      );
      lm.name = cfg.name;                  // raycaster routes the click by this
      lm.userData.isInteractive = true;
      lm.userData.baseColor = '#F2F2F0';   // _clearHover reverts to this
      lm.position.set(0, cfg.y, 0.001);    // centred under the name, just proud
      nameText.add(lm);                    // inherit the name's flat orientation
      signMeshes.push(lm);                 // join the plaque raycast set
      window.floorLines.push(lm);
    });

    // ===== Cute rabbit prop on the ground, in front of the name text =====
    // Loaded after the shop so we can place it relative to nameText/ground.
    loader.load(
      `${ASSET}models/cute_rabbit.glb`,
      (rgltf) => {
        const rabbit = rgltf.scene;
        rabbit.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          // Clone so the hover-brighten can't leak into shared materials,
          // and remember the base look so it can be restored on mouse-out.
          o.material = o.material.clone();
          const m = o.material;
          m.userData._baseEI =
            m.emissiveIntensity !== undefined ? m.emissiveIntensity : 1;
          if (m.emissive) m.userData._baseEmis = m.emissive.clone();
          if (m.color) m.userData._baseCol = m.color.clone();
          _rabbitMeshes.push(o);
        });
        scene.add(rabbit);
        // Normalise to a small ~0.45-unit-tall prop regardless of the
        // file's native scale (measure → scale → re-measure to sit on floor).
        rabbit.updateMatrixWorld(true);
        const _rSize = new THREE.Vector3();
        new THREE.Box3().setFromObject(rabbit).getSize(_rSize);
        rabbit.scale.setScalar(0.45 / (_rSize.y || 1));
        rabbit.updateMatrixWorld(true);
        const _rBox = new THREE.Box3().setFromObject(rabbit);
        // Starting guess: just in front of the AZKA AFTAB text, on the
        // ground. Tune live via window.rabbit, then bake the values here.
        rabbit.position.set(
          nameText.position.x - 1.0,               // above the AZKA AFTAB text (-X = back)
          ground.position.y - _rBox.min.y + 0.001, // bottom flush with floor
          nameText.position.z
        );
        rabbit.rotation.y = Math.PI / 2; // face back toward the viewer
        window.rabbit = rabbit;
        // Give it its soft resting glow straight away.
        _setRabbitGlow(false);

        // ----- Hover fireflies: a small swarm that fades in around the
        // rabbit only while it's hovered (animated in _updateRabbitFlies). -----
        const _ffTex = (() => {
          const fc = document.createElement('canvas');
          fc.width = fc.height = 64;
          const fx = fc.getContext('2d');
          const gg = fx.createRadialGradient(32, 32, 0, 32, 32, 32);
          gg.addColorStop(0.0, 'rgba(255, 255, 255, 1)');
          gg.addColorStop(0.3, 'rgba(255, 224, 102, 0.85)');
          gg.addColorStop(1.0, 'rgba(255, 224, 102, 0)');
          fx.fillStyle = gg;
          fx.fillRect(0, 0, 64, 64);
          const t = new THREE.CanvasTexture(fc);
          t.colorSpace = THREE.SRGBColorSpace;
          return t;
        })();
        _rabbitFlies = new THREE.Group();
        for (let i = 0; i < 12; i++) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: _ffTex, color: 0xffe066, blending: THREE.AdditiveBlending,
            transparent: true, depthWrite: false, opacity: 0,
          }));
          sp.scale.setScalar(0.06 + Math.random() * 0.04);
          sp.userData = {
            ox: (Math.random() - 0.5) * 0.7,        // scatter around the rabbit
            oy: (Math.random() - 0.5) * 0.55 + 0.06, // wrap the body, slight up
            oz: (Math.random() - 0.5) * 0.7,
            ph: Math.random() * 6.28,           // desynced bob/flicker phase
          };
          _rabbitFlies.add(sp);
        }
        _rabbitFlies.visible = false;
        _rabbitFlies.position.copy(rabbit.position);
        scene.add(_rabbitFlies);
      },
      undefined,
      (err) => console.error('cute_rabbit.glb failed to load:', err)
    );

    // ===== Signpost straw (pole) =====
    // Small margins above/below the plaque stack on the pole.
    const _strawTopMargin = 0.15;
    const _strawBottomMargin = 0.15;
    // Total height the 4 plaques + margins occupy (3 gaps + 1 plaque height).
    const _plaqueStack = (4 - 1) * 0.42 + _strawTopMargin + _strawBottomMargin + 0.32;
    const _strawCenterY = _mCenter.y; // vertical centre of the plaque stack

    // Keep the top of the straw where it was, but extend the bottom down
    // until it reaches (and slightly sinks into) the ground.
    const _strawTopLocalY = _strawCenterY + _plaqueStack / 2; // unchanged top
    // Convert the world ground Y into this group's local space, then sink a bit.
    const _groundLocalY = (ground.position.y - signpostGroup.position.y) / signpostGroup.scale.y - 0.1;
    const _strawLength = _strawTopLocalY - _groundLocalY;        // full pole length
    const _poleCenterY = (_strawTopLocalY + _groundLocalY) / 2;  // its midpoint

    // The pole: a thin glowing white cylinder.
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
    // Position the pole and parent it to the signpost group.
    _pole.position.set(_spX, _poleCenterY, _spZ);
    signpostGroup.add(_pole);

    // Builds a 2D arrow outline (a Shape) we later extrude into 3D.
    function _makeArrow(w, h) {
      const s = new THREE.Shape();
      // tip = pointed end, back = flat end, hh = half height, nd = notch depth.
      const tip = -w/2, back = w/2, hh = h/2, nd = h*0.4;
      // Trace the arrow outline point by point.
      s.moveTo(tip, 0); s.lineTo(tip+nd, hh); s.lineTo(back, hh);
      s.lineTo(back, -hh); s.lineTo(tip+nd, -hh); s.lineTo(tip, 0);
      return s;
    }

    // The 4 plaques: internal name, displayed label, and neon colour.
    const _sCfg = [
      { name: 'sign-projects', label: 'PROJECTS', color: '#FFD93D' }, // yellow
      { name: 'sign-about',    label: 'ABOUT ME', color: '#F2F2F0' }, // white
      { name: 'sign-articles', label: 'ARTICLES', color: '#FF8C42' }, // orange
      { name: 'sign-credits',  label: 'CREDITS',  color: '#7DC85B' }, // green
    ];
    // Plaque width, height, depth, and vertical spacing between plaques.
    const _pW = 0.9, _pH = 0.32, _pD = 0.06, _vSpace = 0.42;
    // Y of the top plaque, just below the top of the straw.
    const _topY = _strawCenterY + (_plaqueStack / 2) - _strawTopMargin - 0.16;

    // Build each plaque in turn.
    _sCfg.forEach((cfg, i) => {
      // Extrude the 2D arrow into a 3D plaque with a small bevel.
      const geo = new THREE.ExtrudeGeometry(_makeArrow(_pW, _pH), { depth: _pD, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 });
      geo.center(); // recentre geometry so it rotates about its own middle
      // Emissive material so the plaque glows in its neon colour.
      const mat = new THREE.MeshStandardMaterial({ color: cfg.color, emissive: new THREE.Color(cfg.color), emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.1 });
      const m = new THREE.Mesh(geo, mat);
      m.name = cfg.name; // used by the raycaster to know which plaque was hit
      m.userData.isInteractive = true;
      m.userData.baseColor = cfg.color; // remembered so hover can revert
      // Stagger each plaque left/right (toward the side its arrow points) so the
      // stack zigzags into an X-ish criss-cross instead of a straight column.
      const _zig = (i % 2 === 0) ? 0.35 : -0.35;
      m.position.set(_spX + 0.05, _topY - i * _vSpace, _spZ + _zig);
      // Point each arrow outward — away from the pole, matching its stagger side.
      m.rotation.y = (i % 2 === 0) ? Math.PI / 2 : -Math.PI / 2;

      // ----- Plaque label text (drawn to a canvas, used as a texture) -----
      const _lc = document.createElement('canvas');
      _lc.width = 640; _lc.height = 192;
      const _lx = _lc.getContext('2d');
      _lx.clearRect(0, 0, _lc.width, _lc.height);
      _lx.fillStyle = '#2A0A1E'; // dark wine — reads against the bright neon plaque
      _lx.textAlign = 'center';
      _lx.textBaseline = 'middle';
      // Start big, then shrink the font until the word fits (so EXPERIENCE,
      // ARTICLES etc. don't clip on the edges).
      let _fs = 112;
      const _maxLblW = _lc.width * 0.84;
      do {
        _lx.font = `bold ${_fs}px "Arial", sans-serif`;
        _fs -= 4;
      } while (_lx.measureText(cfg.label).width > _maxLblW && _fs > 28);
      _lx.fillText(cfg.label, _lc.width / 2, _lc.height / 2);
      // Turn the label canvas into a texture and a small plane.
      const _lblTex = new THREE.CanvasTexture(_lc);
      _lblTex.colorSpace = THREE.SRGBColorSpace;
      const _lbl = new THREE.Mesh(
        new THREE.PlaneGeometry(_pW * 0.74, _pH * 0.74),
        new THREE.MeshStandardMaterial({
          map: _lblTex, emissive: 0xffffff, emissiveMap: _lblTex, emissiveIntensity: 0.5,
          transparent: true, alphaTest: 0.01, roughness: 0.6, metalness: 0,
        })
      );
      // Sit the label just proud of the plaque's camera-facing cap. Odd
      // plaques face the other way, so flip the label 180° to stay readable.
      const _zoff = _pD / 2 + 0.02;
      if (i % 2 === 0) { _lbl.position.set(0, 0, _zoff); }
      else { _lbl.position.set(0, 0, -_zoff); _lbl.rotation.y = Math.PI; }
      m.add(_lbl); // parent the label to the plaque so they move together

      // Add the finished plaque to the signpost and track it for raycasting.
      signpostGroup.add(m);
      console.log('Plaque created:', cfg.name, 'at y =', (_topY - i * _vSpace).toFixed(2));
      signMeshes.push(m);
    });

    console.log('Signpost created. signMeshes:', signMeshes.length);

    // Expose key objects to the console for live tweaking during development.
    window.signpostGroup = signpostGroup;
    window.signMeshes = signMeshes;
    window.controls = controls;
    window.camera = camera;          // needed for live camera-pose tuning
    window.ground = ground;
    window.scene = scene;
    console.log('Tip: in console try: signpostGroup.position.set(-1.2, 0, 0.8); signpostGroup.scale.set(0.6,0.6,0.6); controls.autoRotate = false;');

    // ----- Diagnostic: list every mesh, sorted by height (debug aid) -----
    console.log('=== ALL MESHES (sorted by Y position, highest first) ===');
    const allMeshes = [];
    model.traverse((obj) => {
      if (!obj.isMesh) return;
      // Measure each mesh's own bounding box.
      const bbox = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      bbox.getSize(size);
      bbox.getCenter(center);
      // Record the bits we care about for the printout.
      allMeshes.push({
        name: obj.name,
        mat: obj.material.name,
        centerY: center.y,
        sizeX: size.x,
        sizeY: size.y,
        sizeZ: size.z
      });
    });
    // Sort tallest-first and print each one.
    allMeshes.sort((a, b) => b.centerY - a.centerY);
    allMeshes.forEach(m => {
      console.log(`Y=${m.centerY.toFixed(3)} size=${m.sizeX.toFixed(3)}x${m.sizeY.toFixed(3)}x${m.sizeZ.toFixed(3)} mat=${m.mat} name=${m.name}`);
    });

    // Second diagnostic pass: same info in a flatter, per-mesh log line.
    model.traverse((obj) => {
      if (!obj.isMesh) return;
      const bbox = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      console.log(`Mesh: ${obj.name}, material: ${obj.material.name}, size: ${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}, center Y: ${center.y.toFixed(2)}`);
    });

    // ----- Round medallion → invisible Darts click-target -----
    // The medallion is baked into the big merged Juice_Box mesh, so it can't
    // be picked by mesh name. Instead an invisible sphere proxy sits exactly
    // over it; the click handler raycasts this proxy to open the Darts game.
    // Tune live:  dartTarget.position.set(x, y, z); dartTarget.scale.setScalar(s);
    // (dartTarget.visible = true shows it while tuning) — then re-bake DART_TARGET.
    {
      const _dtMat = new THREE.MeshBasicMaterial({
        color: 0xff4fa8, transparent: true, opacity: 0.35,
      });
      _dartTarget = new THREE.Mesh(
        new THREE.SphereGeometry(DART_TARGET.r, 16, 12), _dtMat
      );
      _dartTarget.position.set(DART_TARGET.x, DART_TARGET.y, DART_TARGET.z);
      _dartTarget.visible = false;        // invisible; raycast still hits it
      _dartTarget.name = 'dart-target';
      scene.add(_dartTarget);
      window.dartTarget = _dartTarget;    // console-tunable, then re-bake

      // Visible additive halo on the medallion: always softly glowing so
      // it reads as clickable, brighter on hover (see the pointermove).
      const _dgC = document.createElement('canvas');
      _dgC.width = _dgC.height = 128;
      const _dgX = _dgC.getContext('2d');
      const _dgG = _dgX.createRadialGradient(64, 64, 0, 64, 64, 64);
      _dgG.addColorStop(0.0, 'rgba(255, 255, 255, 1)');
      _dgG.addColorStop(0.3, 'rgba(255, 233, 150, 0.85)');
      _dgG.addColorStop(1.0, 'rgba(255, 217, 61, 0)');
      _dgX.fillStyle = _dgG;
      _dgX.fillRect(0, 0, 128, 128);
      const _dgTex = new THREE.CanvasTexture(_dgC);
      _dgTex.colorSpace = THREE.SRGBColorSpace;
      _dartGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: _dgTex,
        color: new THREE.Color(window.DART_GLOW.color),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: window.DART_GLOW.rest,
      }));
      _dartGlow.position.copy(_dartTarget.position);
      _dartGlow.scale.setScalar(DART_TARGET.r * window.DART_GLOW.scale);
      _dartGlow.renderOrder = 2;
      scene.add(_dartGlow);
      window.dartGlow = _dartGlow;        // console-tunable
    }

    // ----- In-shop bunny → invisible click-target (zoom + speech bubble) ---
    // Same story as the medallion: the shop's bunny is painted into the
    // merged geometry, so it can't be picked by name. An invisible sphere
    // proxy sits over it; the click handler raycasts it.
    // Tune live: bunnyTarget.position.set(x,y,z); bunnyTarget.scale.setScalar(s);
    // (bunnyTarget.visible = true to see it) — then re-bake BUNNY_TARGET.
    {
      _bunnyTarget = new THREE.Mesh(
        new THREE.SphereGeometry(BUNNY_TARGET.r, 16, 12),
        new THREE.MeshBasicMaterial({
          color: 0xffc6de, transparent: true, opacity: 0.35,
        })
      );
      _bunnyTarget.position.set(
        BUNNY_TARGET.x, BUNNY_TARGET.y, BUNNY_TARGET.z
      );
      _bunnyTarget.visible = false;       // invisible; raycast still hits it
      _bunnyTarget.name = 'bunny-target';
      scene.add(_bunnyTarget);
      window.bunnyTarget = _bunnyTarget;  // console-tunable, then re-bake
      // How close the camera ends up from the bunny on click (world units).
      window.BUNNY_ZOOM = 1.8;            // tune live, then re-bake
    }

    // ----- Recolour a couple of specific model meshes by name -----
    model.traverse((obj) => {
      if (!obj.isMesh) return;

      // The shop sign: give it a neon hot-pink glow.
      if (obj.name === 'sign_wood_0') {
        obj.material = obj.material.clone(); // clone so we don't affect shared mats
        obj.material.color.set('#FFB4D6');
        obj.material.emissive = new THREE.Color('#FF4FA8');
        obj.material.emissiveIntensity = 1.5;
        obj.material.needsUpdate = true;
        console.log('Sign override:', obj.name);
      }

      // The door: a visible muted pink-brown.
      if (obj.name === 'doorwood_wood_0') {
        obj.material = obj.material.clone();
        obj.material.color.set('#8B4D6B');
        obj.material.needsUpdate = true;
        console.log('Door override:', obj.name);
      }
    });

    // ===== Initial camera framing: front 3/4 view, slightly above =====
    // Camera distance scales with the model's largest dimension.
    const camDistance = Math.max(modelSize.x, modelSize.y, modelSize.z) * 1.6;
    // Offset from the model centre: out front (+X), up a bit, around (+Z).
    camera.position.set(
      modelCenter.x + camDistance * 0.6,
      modelCenter.y + camDistance * 0.15,
      modelCenter.z + camDistance * 0.35
    );
    camera.lookAt(modelCenter);          // aim the camera at the model
    controls.target.copy(modelCenter);   // orbit around the model centre
    controls.update();                   // apply the changes
    // Cap how far the user can dolly out so the 40×40 ground's edge never
    // comes into view (relative to the opening orbit radius; only constrains
    // free orbiting — scripted camera flies bypass controls.update()).
    // Tunable live via controls.maxDistance, then re-bake the factor.
    controls.maxDistance = camera.position.distanceTo(modelCenter) * 1.18;

    // --- Camera poses for plaque navigation ---
    // Remember this opening pose so we can fly back to it later.
    _homeCamPos.copy(camera.position);
    _homeTarget.copy(modelCenter);
    // Cinematic intro: start far BEHIND + above the shop, then sweep in to
    // this opening pose when the user presses START.
    _introStartPos.set(
      modelCenter.x - camDistance * 1.4,   // behind (the front is +X)
      modelCenter.y + camDistance * 0.95,  // high above
      modelCenter.z - camDistance * 1.15   // and around the back
    );
    // About: orbit round to the rear of the shop and dolly toward the base box.
    // Tunable live: window.aboutCamPos / window.aboutCamTarget (Vector3s).
    window.aboutCamPos = new THREE.Vector3(
      modelCenter.x - camDistance * 0.42,
      modelCenter.y - modelSize.y * 0.15,
      modelCenter.z + camDistance * 0.13
    );
    // The point the camera looks at during the About dive (the box).
    window.aboutCamTarget = new THREE.Vector3(
      modelCenter.x - modelSize.x * 0.30,
      modelCenter.y - modelSize.y * 0.30,
      modelCenter.z + modelSize.z * 0.10
    );
    // Phase-2 dive depth: 0 = stop at aboutCamPos, 1 = all the way to the box.
    window.aboutDiveLerp = 0.6;
    // Helper: fly the camera back to the opening pose, then re-enable controls.
    window.flyHome = () => flyCamera(_homeCamPos, _homeTarget, 1200, () => {
      controls.enabled = true;
      controls.autoRotate = true;
    });

    // Projects: fly to the front and zoom into the hanging menu board.
    // Tunable live: window.projectsCamPos / window.projectsCamTarget.
    // Baked absolute world coords from live tuning (replaces the old
    // modelSize-coefficient guesses). NOTE: the camera doesn't stop at
    // projectsCamPos — phase 2 dives 55% toward the target, so the visible
    // resting pose is lerp(projectsCamPos, projectsCamTarget, 0.55). These
    // numbers were back-solved so that post-dive landing frames the menu.
    // To re-aim: nudge projectsCamTarget (what it looks at) — +Z = left,
    // -Z = right, +Y = up, -Y = down — then re-tune projectsCamPos.
    window.projectsCamTarget = new THREE.Vector3(1.113, 1.605, -0.227);
    window.projectsCamPos = new THREE.Vector3(2.346, 1.605, -0.211);

    // Credits: pan up to a wide top-of-carton view, then dive into a star.
    // Tunable live: window.creditsCamPos / window.creditsCamTarget — STARTING
    // GUESSES ONLY, console-tune then bake exactly like projects above.
    // creditsCamTarget should sit ON the chosen star; creditsCamPos is the
    // pulled-back top view it flies to first (phase 1).
    window.creditsCamTarget = new THREE.Vector3(1.0, 3.6, 0.2);
    window.creditsCamPos = new THREE.Vector3(3.2, 3.4, 1.6);

    // --- About label: the image stuck on the box, with rounded corners ---
    {
      // A canvas we'll draw the rounded image into, used as a texture.
      const _lc = document.createElement('canvas');
      const _lx = _lc.getContext('2d');
      const _ltex = new THREE.CanvasTexture(_lc);
      _ltex.colorSpace = THREE.SRGBColorSpace;
      // A plane to show the label; emissiveMap so it stays readable in the dim box.
      const aboutLabel = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({
          map: _ltex, emissive: 0xffffff, emissiveMap: _ltex, emissiveIntensity: 0.25,
          transparent: true, alphaTest: 0.02, roughness: 0.7, metalness: 0,
          side: THREE.DoubleSide, // visible from either side — it's a flat sticker
        })
      );
      // Default: sit on the box face near the dive target, facing the camera.
      const _baseH = modelSize.x * 0.13; // label size on the box (world units)
      // Absolute world placement on the carton's front box face (replaces the
      // old aboutCamTarget-relative math, which flung the label to x ~ -6).
      // First guess — being dialled in via screenshot feedback, then baked.
      // rotation.y = Math.PI/2 makes the plane face +X (the front the camera
      // approaches from). Use 0/Math.PI for a +Z/-Z (front/back) face instead.
      aboutLabel.position.set(-1.23, 0.38, 0.55);
      // y = face the box; z = roll the image 90° in-plane so it fills the face.
      aboutLabel.rotation.set(0, Math.PI / 2, Math.PI / 2);
      aboutLabel.scale.set(_baseH, _baseH, 1);
      scene.add(aboutLabel);
      window.aboutLabel = aboutLabel; // tunable in the console
      aboutLabel.visible = false; // hidden only until the image finishes loading

      // Load the image asynchronously; draw it with rounded corners on load.
      const _img = new Image();
      _img.onload = () => {
        // Cap the canvas size for performance, keeping aspect ratio.
        const cap = 720;
        const k = Math.min(1, cap / Math.max(_img.naturalWidth, _img.naturalHeight));
        const w = Math.round(_img.naturalWidth * k);
        const h = Math.round(_img.naturalHeight * k);
        const r = Math.min(w, h) * 0.08; // rounded corner radius
        _lc.width = w; _lc.height = h;
        _lx.clearRect(0, 0, w, h);
        // Build a rounded-rectangle clip path using arcTo for each corner.
        _lx.beginPath();
        _lx.moveTo(r, 0);
        _lx.arcTo(w, 0, w, h, r);
        _lx.arcTo(w, h, 0, h, r);
        _lx.arcTo(0, h, 0, 0, r);
        _lx.arcTo(0, 0, w, 0, r);
        _lx.closePath();
        _lx.clip();
        // Draw the image inside the rounded clip and push it to the texture.
        _lx.drawImage(_img, 0, 0, w, h);
        _ltex.needsUpdate = true;
        aboutLabel.scale.set(_baseH * (w / h), _baseH, 1); // match image aspect
        aboutLabel.visible = true; // now safe to show (no blank flash)
      };
      _img.src = `${ASSET}about-label.jpg`;
    }

    // Alias kept for the lighting code below.
    const center = modelCenter;

    // Locked + still until the user presses START on the intro overlay.
    // After the intro pan finishes, controls re-enable and auto-rotate
    // kicks in 4s later (see _beginAfterIntro).
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.5;
    controls.enabled = false;

    // ===== Lighting (created here so it can use the model's bounds) =====
    // Dim purple ambient so nothing is pure black.
    const ambient = new THREE.AmbientLight(0x2D1F3D, 0.85);
    scene.add(ambient);
    // Three coloured point lights placed around the shop centre.
    const offsetPink = new THREE.Vector3(2, 3, 2);
    const offsetCyan = new THREE.Vector3(-2, 3, 2);
    const offsetMag = new THREE.Vector3(0, 2, -3);
    // PointLight args: (colour, intensity, distance, decay).
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

    // ----- Make the star meshes glow -----
    // The model's stars are "unlit" and can't glow, so swap their material
    // for a Standard one with an emissive yellow that bloom can pick up.
    model.traverse((obj) => {
      if (!obj.isMesh) return;

      // Star meshes are named "Star001", "Star002", etc.
      if (obj.name.startsWith('Star')) {
        // Keep the original texture + colour from the old material.
        const oldMat = obj.material;
        const oldTexture = oldMat.map;
        const oldColor = oldMat.color ? oldMat.color.clone() : new THREE.Color(0xffffff);

        // Rebuild as an emissive material so the star shines.
        obj.material = new THREE.MeshStandardMaterial({
          map: oldTexture,
          color: oldColor,
          emissive: new THREE.Color('#FFD93D'),
          emissiveIntensity: 3.0,
          emissiveMap: oldTexture, // glow follows the star shape, not a square
        });
        obj.material.needsUpdate = true;
        // Group meshes by star number (body + outline share e.g. "Star001")
        // and collect them so a hover can light up just that one star.
        obj.userData.starGroup = (obj.name.match(/^Star\d+/) || [obj.name])[0];
        _starMeshes.push(obj);
      }
    });

    // ----- Per-star hover glow (additive halo sprites) -----
    // A soft radial-gradient sprite per star reads as light spilling
    // OUTWARD (additive blend, always camera-facing) rather than a surface
    // colour change. Hidden (opacity 0) until that star is hovered.
    const _glowTex = (() => {
      const gc = document.createElement('canvas');
      gc.width = gc.height = 128;
      const gx = gc.getContext('2d');
      const g = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0.00, 'rgba(255, 255, 255, 1)');
      g.addColorStop(0.25, 'rgba(255, 235, 150, 0.8)');
      g.addColorStop(1.00, 'rgba(255, 224, 102, 0)');
      gx.fillStyle = g;
      gx.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(gc);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    // Group the star meshes, then drop one halo sprite at each star's centre.
    const _byGroup = new Map();
    _starMeshes.forEach((m) => {
      const k = m.userData.starGroup;
      if (!_byGroup.has(k)) _byGroup.set(k, []);
      _byGroup.get(k).push(m);
    });
    _byGroup.forEach((meshes, key) => {
      const box = new THREE.Box3();
      meshes.forEach((m, i) => {
        const b = new THREE.Box3().setFromObject(m);
        if (i === 0) box.copy(b); else box.union(b);
      });
      const c = box.getCenter(new THREE.Vector3());
      const s = box.getSize(new THREE.Vector3());
      const base = Math.max(s.x, s.y, s.z) || 0.3;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: _glowTex,
        color: new THREE.Color(window.STAR_GLOW.color),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      }));
      spr.position.copy(c);
      spr.userData.base = base;
      spr.scale.setScalar(base * window.STAR_GLOW.scale);
      spr.renderOrder = 2;
      scene.add(spr);
      _starGlows.set(key, spr);
    });
    window.starGlows = _starGlows; // console: starGlows.get('Star001').material…

    // Scene is fully built — reveal the START button on the intro overlay.
    _introReady();
  },
  // Progress callback (unused).
  undefined,
  // Error callback — log if the model fails to load.
  (error) => {
    console.error('Error loading model:', error);
  }
);


// ===== Fireflies =====
// 60 glowing points that drift and flicker around the scene.
const fireflyCount = 60;
// BufferGeometry holds raw per-point data (positions + a random offset).
const fireflyGeometry = new THREE.BufferGeometry();
const fireflyPositions = new Float32Array(fireflyCount * 3);
const fireflyOffsets = new Float32Array(fireflyCount);
// Scatter each firefly randomly on a sphere-ish volume around the origin.
for (let i = 0; i < fireflyCount; i++) {
  const radius = 2 + Math.random() * 4;
  const theta = Math.random() * Math.PI * 2;       // around
  const phi = Math.acos(2 * Math.random() - 1);    // up/down (even spread)
  fireflyPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  fireflyPositions[i * 3 + 1] = Math.random() * 4 + 0.5; // height
  fireflyPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  // Random phase so they don't all bob/flicker in sync.
  fireflyOffsets[i] = Math.random() * Math.PI * 2;
}
// Upload the arrays as named attributes the shader can read.
fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
fireflyGeometry.setAttribute('aOffset', new THREE.BufferAttribute(fireflyOffsets, 1));
// Custom shader: animates each point and draws it as a soft glowing dot.
const fireflyMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },                          // advanced every frame
    uColor: { value: new THREE.Color('#FFE066') }, // warm yellow
    uSize: { value: 30.0 }                         // base point size
  },
  // Vertex shader: bob each point on sine waves and compute flicker.
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
      gl_PointSize = uSize * (1.0 / -mvPosition.z); // smaller when far away
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  // Fragment shader: round soft dot that fades at the edges, times flicker.
  fragmentShader: `
    uniform vec3 uColor;
    varying float vFlicker;
    void main() {
      vec2 center = gl_PointCoord - vec2(0.5);
      float dist = length(center);
      if (dist > 0.5) discard;                       // clip to a circle
      float strength = 1.0 - smoothstep(0.0, 0.5, dist);
      strength = pow(strength, 2.0);                  // tighter glow falloff
      gl_FragColor = vec4(uColor, strength * vFlicker);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending, // overlapping fireflies add up brighter
  depthWrite: false                 // don't occlude things behind them
});
// Points = render the geometry as individual sprites/dots.
const fireflies = new THREE.Points(fireflyGeometry, fireflyMaterial);
scene.add(fireflies);

// ===== Camera fly animation =====
// Reusable vectors so the animation loop doesn't allocate every frame.
const _homeCamPos = new THREE.Vector3();
const _homeTarget = new THREE.Vector3();
const _introStartPos = new THREE.Vector3(); // pulled-back/behind intro pose
const _tmpTarget = new THREE.Vector3();
// Holds the active tween, or null when the camera is free.
let _camAnim = null;

// Start a camera tween from the current pose to (toPos, toTarget).
function flyCamera(toPos, toTarget, durMs, onDone) {
  _playWhooshSfx();                       // whoosh on every scripted zoom/fly
  _camAnim = {
    fromPos: camera.position.clone(),     // where we start
    toPos: toPos.clone(),                 // where we end up
    fromTarget: controls.target.clone(),  // current look-at
    toTarget: toTarget.clone(),           // final look-at
    start: performance.now(),             // timestamp for easing
    dur: durMs,                           // duration in ms
    onDone: onDone || null,               // callback when finished
  };
}

// ===== About panel (dark wine-glass overlay) =====
const _panel = document.getElementById('about-panel');
// Shared flag: true while ANY panel is open (blocks new plaque clicks).
let _panelOpen = false;

// Switch which tab/section of the About panel is visible.
function _setPanelView(view) {
  if (!_panel) return;
  // Highlight the matching tab button.
  _panel.querySelectorAll('.panel-tabs button').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === view));
  // Show only the matching section.
  _panel.querySelectorAll('.panel-view').forEach((s) =>
    s.classList.toggle('active', s.dataset.view === view));
}

// Open the About panel (called when the camera dive finishes).
function openAboutPanel() {
  if (!_panel) return;
  _panelOpen = true;
  _setPanelView('about');                     // always start on the About tab
  _panel.classList.add('open');               // CSS fades/slides it in
  _panel.setAttribute('aria-hidden', 'false');
}

// Close the About panel and fly the camera home.
function closeAboutPanel() {
  if (!_panelOpen) return;
  _panelOpen = false;
  _panel.classList.remove('open');
  // Drop focus out of the panel before hiding it: the browser blocks
  // aria-hidden on an ancestor of the focused element (the Back button).
  if (_panel.contains(document.activeElement)) document.activeElement.blur();
  _panel.setAttribute('aria-hidden', 'true');
  if (window.flyHome) window.flyHome();
}

// Wire the Back button and the tab buttons.
if (_panel) {
  _panel.querySelector('.panel-back').addEventListener('click', closeAboutPanel);
  _panel.querySelectorAll('.panel-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => _setPanelView(btn.dataset.view));
  });
}

// ===== Projects panel (white/orange overlay) =====
const _pPanel = document.getElementById('projects-panel');

// Open the Projects panel.
function openProjectsPanel() {
  if (!_pPanel) return;
  _panelOpen = true;
  _pPanel.classList.add('open');
  _pPanel.setAttribute('aria-hidden', 'false');
}

// Close the Projects panel and fly the camera home.
function closeProjectsPanel() {
  if (!_pPanel || !_pPanel.classList.contains('open')) return;
  _panelOpen = false;
  _pPanel.classList.remove('open');
  // Drop focus out of the panel before hiding it: the browser blocks
  // aria-hidden on an ancestor of the focused element (the Back button).
  if (_pPanel.contains(document.activeElement)) document.activeElement.blur();
  _pPanel.setAttribute('aria-hidden', 'true');
  if (window.flyHome) window.flyHome();
}

// Wire the Projects panel's Back button.
if (_pPanel) {
  _pPanel.querySelector('.panel-back').addEventListener('click', closeProjectsPanel);
}

// ===== Credits panel (Snake mini-game) =====
const _cPanel = document.getElementById('credits-panel');
let _snake = null; // game instance, built lazily on first open

// Open the Credits panel and (re)start a fresh Snake round.
function openCreditsPanel() {
  if (!_cPanel) return;
  _panelOpen = true;
  _cPanel.classList.add('open');
  _cPanel.setAttribute('aria-hidden', 'false');
  // Build the game once (bound to the panel), then start a clean round.
  if (!_snake) _snake = createSnakeGame(_cPanel);
  _snake.start();
}

// Close the Credits panel, stop the game, and fly the camera home.
function closeCreditsPanel() {
  if (!_cPanel || !_cPanel.classList.contains('open')) return;
  _panelOpen = false;
  if (_snake) _snake.stop(); // kills the RAF loop + input listeners
  _cPanel.classList.remove('open');
  // Drop focus out of the panel before hiding it: the browser blocks
  // aria-hidden on an ancestor of the focused element (the Back button).
  if (_cPanel.contains(document.activeElement)) document.activeElement.blur();
  _cPanel.setAttribute('aria-hidden', 'true');
  if (window.flyHome) window.flyHome();
}

// Wire the Credits panel's Back button.
if (_cPanel) {
  _cPanel.querySelector('.panel-back').addEventListener('click', closeCreditsPanel);
}

// ===== Contact panel (dark overlay — opened by the CONTACT ME floor line) =====
const _ctPanel = document.getElementById('contact-panel');

// Open the Contact panel. No camera flight — the floor line just reveals it.
function openContactPanel() {
  if (!_ctPanel) return;
  _panelOpen = true;
  _ctPanel.classList.add('open');
  _ctPanel.setAttribute('aria-hidden', 'false');
}

// Close it. No flyHome() here — opening it never moved the camera.
function closeContactPanel() {
  if (!_ctPanel || !_ctPanel.classList.contains('open')) return;
  _panelOpen = false;
  _ctPanel.classList.remove('open');
  // Drop focus before hiding (browser blocks aria-hidden over focus).
  if (_ctPanel.contains(document.activeElement)) document.activeElement.blur();
  _ctPanel.setAttribute('aria-hidden', 'true');
}

// Wire the Contact panel's Back button.
if (_ctPanel) {
  _ctPanel.querySelector('.panel-back').addEventListener('click', closeContactPanel);
}

// ===== Darts panel (full-bleed mini-game, opened by the round medallion) =====
const _dPanel = document.getElementById('darts-panel');
let _darts = null; // game instance, built lazily on first open

// Open the Darts panel and (re)start a fresh game. No camera flight.
function openDartsPanel() {
  if (!_dPanel) return;
  _panelOpen = true;
  _dPanel.classList.add('open');
  _dPanel.setAttribute('aria-hidden', 'false');
  if (!_darts) _darts = createDartsGame(_dPanel);
  _darts.start();
}

// Close the Darts panel and stop the game. No flyHome() — opening it never
// moved the camera.
function closeDartsPanel() {
  if (!_dPanel || !_dPanel.classList.contains('open')) return;
  _panelOpen = false;
  if (_darts) _darts.stop();
  _dPanel.classList.remove('open');
  if (_dPanel.contains(document.activeElement)) document.activeElement.blur();
  _dPanel.setAttribute('aria-hidden', 'true');
}

// Wire the Darts panel's Back button. openDartsPanel is also exposed to the
// console so the game can be tested before the medallion mesh name is baked.
if (_dPanel) {
  _dPanel.querySelector('.panel-back').addEventListener('click', closeDartsPanel);
}
window.openDartsPanel = openDartsPanel;

// ===== Shooter panel (full-bleed Carrot Blaster, opened by a star click) =====
const _shPanel = document.getElementById('shooter-panel');
let _shooter = null; // game instance, built lazily on first open

// Open the Shooter panel and (re)start a fresh game. No camera flight.
function openShooterPanel() {
  if (!_shPanel) return;
  _panelOpen = true;
  _shPanel.classList.add('open');
  _shPanel.setAttribute('aria-hidden', 'false');
  if (!_shooter) _shooter = createShooterGame(_shPanel);
  _shooter.start();
}

// Close the Shooter panel and stop the game. No flyHome() — opening it
// never moved the camera.
function closeShooterPanel() {
  if (!_shPanel || !_shPanel.classList.contains('open')) return;
  _panelOpen = false;
  if (_shooter) _shooter.stop();
  _shPanel.classList.remove('open');
  if (_shPanel.contains(document.activeElement)) document.activeElement.blur();
  _shPanel.setAttribute('aria-hidden', 'true');
}

// Wire the Shooter panel's Back button. Also exposed to the console so the
// game can be opened/tested directly.
if (_shPanel) {
  _shPanel.querySelector('.panel-back').addEventListener('click', closeShooterPanel);
}
window.openShooterPanel = openShooterPanel;

// ===== Runner panel (full-bleed Bunny Hop, opened by the ground rabbit) =====
const _rnPanel = document.getElementById('runner-panel');
let _runner = null; // game instance, built lazily on first open

// Open the Runner panel and (re)start a fresh game. No camera flight.
function openRunnerPanel() {
  if (!_rnPanel) return;
  _panelOpen = true;
  _rnPanel.classList.add('open');
  _rnPanel.setAttribute('aria-hidden', 'false');
  if (!_runner) _runner = createRunnerGame(_rnPanel);
  _runner.start();
}

// Close the Runner panel and stop the game. No flyHome() — opening it
// never moved the camera.
function closeRunnerPanel() {
  if (!_rnPanel || !_rnPanel.classList.contains('open')) return;
  _panelOpen = false;
  if (_runner) _runner.stop();
  _rnPanel.classList.remove('open');
  if (_rnPanel.contains(document.activeElement)) document.activeElement.blur();
  _rnPanel.setAttribute('aria-hidden', 'true');
}

// Wire the Runner panel's Back button. Also exposed to the console so the
// game can be opened/tested directly.
if (_rnPanel) {
  _rnPanel.querySelector('.panel-back').addEventListener('click', closeRunnerPanel);
}
window.openRunnerPanel = openRunnerPanel;

// ===== In-shop bunny → cute welcome speech bubble =====
// Shown after the click-zoom finishes; dismiss flies the camera home.
const _bunnyEl = document.getElementById('bunny-speech');
function _showBunnySpeech() {
  if (!_bunnyEl) return;
  _bunnyEl.classList.add('show');
  _bunnyEl.setAttribute('aria-hidden', 'false');
}
function _hideBunnySpeech() {
  if (!_bunnyEl || !_bunnyEl.classList.contains('show')) return;
  _bunnyEl.classList.remove('show');
  if (_bunnyEl.contains(document.activeElement)) document.activeElement.blur();
  _bunnyEl.setAttribute('aria-hidden', 'true');
  _panelOpen = false;                  // unblock scene clicks
  if (window.flyHome) window.flyHome();
}
if (_bunnyEl) {
  // Click anywhere on the bubble (incl. the "got it!" button) dismisses it.
  _bunnyEl.addEventListener('click', _hideBunnySpeech);
}

// ===== Coordinate capture helper (console) =====
// Run `captureBunny()` in the console, then click the bunny in the shop:
// it logs a ready-to-bake BUNNY_TARGET line and snaps the (now visible)
// proxy onto the hit point so you can confirm placement. Re-run to re-pick.
// Capture-phase + stopImmediatePropagation so this one click doesn't also
// trigger the normal scene routing.
let _captureArmed = false;
window.captureBunny = function captureBunny() {
  _captureArmed = true;
  console.log('%c[captureBunny] armed — now click the bunny in the shop…',
              'color:#ff4fa8;font-weight:bold');
};
renderer.domElement.addEventListener('click', (event) => {
  if (!_captureArmed) return;
  event.stopImmediatePropagation();
  _captureArmed = false;
  const r = renderer.domElement.getBoundingClientRect();
  _pointer.x = ((event.clientX - r.left) / r.width) * 2 - 1;
  _pointer.y = -((event.clientY - r.top) / r.height) * 2 + 1;
  _raycaster.setFromCamera(_pointer, camera);
  const hit = _raycaster.intersectObjects(scene.children, true).find((h) =>
    h.object && h.object.type === 'Mesh' &&
    h.object.name !== 'bunny-target' && h.object.name !== 'dart-target'
  );
  if (!hit) { console.warn('[captureBunny] nothing hit — re-run and retry'); return; }
  const x = +hit.point.x.toFixed(3);
  const y = +hit.point.y.toFixed(3);
  const z = +hit.point.z.toFixed(3);
  if (_bunnyTarget) {
    _bunnyTarget.position.set(x, y, z);
    _bunnyTarget.visible = true;       // show where it landed
  }
  console.log(
    `%c[captureBunny] const BUNNY_TARGET = { x: ${x}, y: ${y}, z: ${z}, r: ${BUNNY_TARGET.r} };`,
    'color:#16a34a;font-weight:bold'
  );
  console.log('Paste that line to the assistant to bake it (re-run captureBunny() to re-pick).');
}, true);

// ===== Plaque hover + click (raycaster) =====
// A raycaster shoots a ray from the camera through the cursor into the scene.
const _raycaster = new THREE.Raycaster();
// Cursor position in normalized device coords (-1..1 on each axis).
const _pointer = new THREE.Vector2();
// The plaque currently under the cursor (so we can revert it on mouse-out).
let _hoveredPlaque = null;
// Invisible click-target over the round medallion; a hit opens Darts.
let _dartTarget = null;
// Invisible click-target over the in-shop bunny; a hit zooms in + greets.
let _bunnyTarget = null;
let _dartGlow = null;      // additive halo sprite on the dart medallion
let _dartHot = false;      // pointer currently over the medallion
// Dart medallion glow — tweak live then re-bake. rest = always-on glow,
// hover = brighter on hover, scale = halo size vs the target radius.
window.DART_GLOW = { color: '#FFD93D', scale: 3.4, rest: 0.4, hover: 0.95 };
// Star meshes (filled on model load) + one additive glow sprite per star.
let _starMeshes = [];
const _starGlows = new Map(); // star group key -> glow Sprite
window.HOVER_COLOR = '#FF4FA8'; // contrasting neon highlight — tunable in console
// Hover-glow look — tweak live then re-bake. color = halo tint, scale =
// halo size vs the star, opacity = peak brightness of the spill.
window.STAR_GLOW = { color: '#FFE066', scale: 1.2, opacity: 0.95 };
// The added cute_rabbit prop's meshes + how bright it goes on hover.
let _rabbitMeshes = [];
// rest = the soft glow it always has; intensity = extra added on hover.
window.RABBIT_HOVER = { color: '#FFE9B0', intensity: 0.9, lighten: 0.4, rest: 0.35 };

// Return the plaque under the given mouse event, or null.
function _plaqueAtEvent(event) {
  // Convert pixel coords to normalized device coords for the raycaster.
  const rect = renderer.domElement.getBoundingClientRect();
  _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  _pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  // Aim the ray and test it against just the plaque meshes.
  _raycaster.setFromCamera(_pointer, camera);
  const hits = _raycaster.intersectObjects(signMeshes, false);
  return hits.length ? hits[0].object : null;
}

// Highlight a hovered plaque with the contrast colour + brighter glow.
function _applyHover(p) {
  p.material.color.set(window.HOVER_COLOR);
  p.material.emissive.set(window.HOVER_COLOR);
  p.material.emissiveIntensity = 2.6;
}

// Revert a plaque back to its stored base colour/glow.
function _clearHover(p) {
  p.material.color.set(p.userData.baseColor);
  p.material.emissive.set(p.userData.baseColor);
  p.material.emissiveIntensity = 1.6;
}

// On mouse move: update which plaque is highlighted + the cursor style.
renderer.domElement.addEventListener('pointermove', (event) => {
  const p = _plaqueAtEvent(event);
  if (p === _hoveredPlaque) return;                 // nothing changed
  if (_hoveredPlaque) _clearHover(_hoveredPlaque);  // un-highlight the old one
  if (p) {
    _applyHover(p);
    _hoveredPlaque = p;
    renderer.domElement.style.cursor = 'pointer';
  } else {
    _hoveredPlaque = null;
    renderer.domElement.style.cursor = 'default';
  }
});

// Hover a star → ONLY that star's halo lights up (additive glow sprite),
// reverting when the pointer leaves it. Separate from the plaque hover so
// that logic stays untouched; both raycast sets are tiny.
let _hotStar = null;
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!_starMeshes.length) return;
  const rect = renderer.domElement.getBoundingClientRect();
  _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  _pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_pointer, camera);
  const hit = _raycaster.intersectObjects(_starMeshes, false)[0];
  const grp = hit ? hit.object.userData.starGroup : null;
  if (grp === _hotStar) return;            // nothing changed
  if (_hotStar) {                          // dim the previously-lit star
    const prev = _starGlows.get(_hotStar);
    if (prev) prev.material.opacity = 0;
  }
  if (grp) {                               // light up the hovered star
    _playHoverSfx();
    const spr = _starGlows.get(grp);
    if (spr) {
      // Re-read window.STAR_GLOW so console tweaks apply without a reload.
      spr.material.color.set(window.STAR_GLOW.color);
      spr.scale.setScalar(spr.userData.base * window.STAR_GLOW.scale);
      spr.material.opacity = window.STAR_GLOW.opacity;
    }
  }
  _hotStar = grp;
});

// Hover the dart medallion → its halo brightens, back to the soft resting
// glow on mouse-out. Tiny single-object raycast.
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!_dartTarget || !_dartGlow) return;
  const rect = renderer.domElement.getBoundingClientRect();
  _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  _pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_pointer, camera);
  const over = _raycaster.intersectObject(_dartTarget, true).length > 0;
  if (over === _dartHot) return;          // nothing changed
  _dartHot = over;
  if (over) _playHoverSfx();
  // Re-read window.DART_GLOW so console tweaks apply without a reload.
  _dartGlow.material.color.set(window.DART_GLOW.color);
  _dartGlow.scale.setScalar(DART_TARGET.r * window.DART_GLOW.scale);
  _dartGlow.material.opacity =
    over ? window.DART_GLOW.hover : window.DART_GLOW.rest;
});

// Hover the cute_rabbit prop → it brightens (emissive lift, with an unlit
// colour-lighten fallback), reverting on mouse-out. Its own pass so it
// stays independent of the plaque/star hover logic.
let _rabbitHot = false;
let _rabbitFlies = null;   // hover firefly swarm Group (built on rabbit load)
let _rabbitFlyA = 0;       // eased 0..1 visibility for the swarm
const _ffBox = new THREE.Box3();    // reused: rabbit world-bounds for centring
const _ffCtr = new THREE.Vector3();
function _setRabbitGlow(on) {
  _rabbitMeshes.forEach((o) => {
    const m = o.material;
    // Lighten the diffuse toward white — this only ever brightens.
    if (m.color && m.userData._baseCol) {
      if (on) m.color.copy(m.userData._baseCol)
        .lerp(new THREE.Color('#ffffff'), window.RABBIT_HOVER.lighten);
      else m.color.copy(m.userData._baseCol);
    }
    // ADD glow on top of the base emissive (intensity = base + boost) so a
    // rabbit that's already self-lit can never end up dimmer than at rest.
    if (m.emissive && m.userData._baseEmis) {
      // Always a soft resting glow (rest); hover adds more on top of the
      // base, so a self-lit rabbit can never end up dimmer than at rest.
      const add = on ? window.RABBIT_HOVER.intensity : window.RABBIT_HOVER.rest;
      m.emissive.copy(m.userData._baseEmis)
        .lerp(new THREE.Color(window.RABBIT_HOVER.color), on ? 0.7 : 0.5);
      m.emissiveIntensity = m.userData._baseEI + add;
    }
  });
}
// Per-frame: ease the hover firefly swarm in/out and drift+flicker each
// mote. Cheap; guarded until the rabbit (and its swarm) have loaded.
function _updateRabbitFlies() {
  if (!_rabbitFlies) return;
  const target = _rabbitHot ? 1 : 0;
  _rabbitFlyA += (target - _rabbitFlyA) * 0.08;     // smooth fade in/out
  if (_rabbitFlyA < 0.01 && target === 0) { _rabbitFlies.visible = false; return; }
  _rabbitFlies.visible = true;
  // Centre the swarm on the rabbit's VISIBLE body (its bbox centre), not
  // its model origin — the glb's geometry is offset from its pivot, which
  // made the motes bunch to one side. Also follows console position tuning.
  if (window.rabbit) {
    _ffBox.setFromObject(window.rabbit);
    _ffBox.getCenter(_ffCtr);
    _rabbitFlies.position.copy(_ffCtr);
  }
  const t = performance.now() * 0.001;
  _rabbitFlies.children.forEach((sp) => {
    const u = sp.userData;
    sp.position.set(
      u.ox + Math.sin(t * 0.8 + u.ph) * 0.06,
      u.oy + Math.sin(t * 1.3 + u.ph) * 0.05,
      u.oz + Math.cos(t * 0.7 + u.ph) * 0.06
    );
    const fl = 0.45 + 0.55 * Math.sin(t * 3 + u.ph); // gentle flicker
    sp.material.opacity = _rabbitFlyA * Math.max(0, fl);
  });
}
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!_rabbitMeshes.length) return;
  const rect = renderer.domElement.getBoundingClientRect();
  _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  _pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_pointer, camera);
  const over = _raycaster.intersectObjects(_rabbitMeshes, true).length > 0;
  if (over === _rabbitHot) return;          // nothing changed
  _rabbitHot = over;
  if (over) _playHoverSfx();
  _setRabbitGlow(over);
});

// Fly the camera to the rear base box (two-phase) then open the About
// panel. Shared by the ABOUT ME plaque AND the about-label sticker.
function _flyToAbout() {
  controls.enabled = false;       // lock controls during the animation
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

// On click: if a plaque was hit, run its camera flight + open its panel.
renderer.domElement.addEventListener('click', (event) => {
  // Ignore clicks while a panel is open or the camera is mid-flight.
  if (_panelOpen || _camAnim) return;
  // The round medallion isn't a plaque (different material type, so it's
  // raycast separately here) — a hit on it opens the Darts game.
  if (_dartTarget) {
    const r = renderer.domElement.getBoundingClientRect();
    _pointer.x = ((event.clientX - r.left) / r.width) * 2 - 1;
    _pointer.y = -((event.clientY - r.top) / r.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, camera);
    if (_raycaster.intersectObject(_dartTarget, true).length) {
      _playClickSfx();
      openDartsPanel();
      return;
    }
  }
  // Clicking any star opens the Carrot Blaster shooter.
  if (_starMeshes.length) {
    const r = renderer.domElement.getBoundingClientRect();
    _pointer.x = ((event.clientX - r.left) / r.width) * 2 - 1;
    _pointer.y = -((event.clientY - r.top) / r.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, camera);
    if (_raycaster.intersectObjects(_starMeshes, false).length) {
      _playClickSfx();
      openShooterPanel();
      return;
    }
  }
  // Clicking the cute ground rabbit opens the Bunny Hop runner.
  if (_rabbitMeshes.length) {
    const r = renderer.domElement.getBoundingClientRect();
    _pointer.x = ((event.clientX - r.left) / r.width) * 2 - 1;
    _pointer.y = -((event.clientY - r.top) / r.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, camera);
    if (_raycaster.intersectObjects(_rabbitMeshes, true).length) {
      _playClickSfx();
      openRunnerPanel();
      return;
    }
  }
  // Clicking the bunny INSIDE the shop → zoom in + a cute welcome bubble.
  if (_bunnyTarget) {
    const r = renderer.domElement.getBoundingClientRect();
    _pointer.x = ((event.clientX - r.left) / r.width) * 2 - 1;
    _pointer.y = -((event.clientY - r.top) / r.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, camera);
    if (_raycaster.intersectObject(_bunnyTarget, true).length) {
      _playClickSfx();
      _panelOpen = true;               // block other scene clicks until done
      controls.enabled = false;
      controls.autoRotate = false;
      if (_hoveredPlaque) { _clearHover(_hoveredPlaque); _hoveredPlaque = null; }
      renderer.domElement.style.cursor = 'default';
      // Zoom straight in along the current view toward the bunny.
      const bp = _bunnyTarget.position;
      const dir = camera.position.clone().sub(bp).normalize();
      const toPos = bp.clone().addScaledVector(dir, window.BUNNY_ZOOM);
      flyCamera(toPos, bp, 1200, _showBunnySpeech);
      return;
    }
  }
  // The about-label sticker on the rear box also opens the About panel
  // (same camera flow as the ABOUT ME plaque).
  if (window.aboutLabel && window.aboutLabel.visible) {
    const r = renderer.domElement.getBoundingClientRect();
    _pointer.x = ((event.clientX - r.left) / r.width) * 2 - 1;
    _pointer.y = -((event.clientY - r.top) / r.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, camera);
    if (_raycaster.intersectObject(window.aboutLabel, true).length) {
      _playClickSfx();
      _flyToAbout();
      return;
    }
  }
  const p = _plaqueAtEvent(event);
  if (!p) return;
  _playClickSfx();                 // every plaque/floor route does something
  console.log('Plaque clicked:', p.name);
  if (p.name === 'sign-about') _flyToAbout();
  if (p.name === 'sign-projects') {
    // Same pattern as About, but flying to the hanging menu.
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
  if (p.name === 'sign-articles') {
    // No panel/camera flow yet — just open the articles link in a new tab.
    // noopener,noreferrer so the opened page can't reach back via window.opener.
    window.open(
      'https://drive.google.com/file/d/1olnkJDiDQcGs08bzECpi2MKp7ifIjYd7/view',
      '_blank',
      'noopener,noreferrer'
    );
  }
  if (p.name === 'sign-credits') {
    // Same two-phase pattern as Projects: fly up to a top-of-carton view,
    // dive into the star, then open the Credits panel (the Snake game).
    // Controls stay locked until the panel's Back button flies home.
    controls.enabled = false;
    controls.autoRotate = false;
    if (_hoveredPlaque) { _clearHover(_hoveredPlaque); _hoveredPlaque = null; }
    renderer.domElement.style.cursor = 'default';
    // Phase 1: pan up to the wide top-of-carton view.
    flyCamera(window.creditsCamPos, window.creditsCamTarget, 1500, () => {
      // Phase 2: zoom hard into the star, then reveal the Snake panel.
      // 0.93 = camera ends 93% of the way to the star (near-max without
      // landing inside it). Bump toward 1.0 for even closer.
      const innerPos = new THREE.Vector3().lerpVectors(
        window.creditsCamPos, window.creditsCamTarget, 0.93
      );
      flyCamera(innerPos, window.creditsCamTarget, 800, openCreditsPanel);
    });
  }
  if (p.name === 'floor-fullstack' || p.name === 'floor-researcher') {
    // Résumé lines: open the PDF in a new tab (noopener,noreferrer so the
    // opened page can't reach back via window.opener).
    window.open(`${ASSET}Azka_Resume_18_1.pdf`, '_blank', 'noopener,noreferrer');
  }
  if (p.name === 'floor-contact') {
    // CONTACT ME: open the dark Contact overlay (no camera move).
    openContactPanel();
  }
});

// ===== Keep the render in sync with the window size =====
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;        // fix stretched view
  camera.updateProjectionMatrix();       // apply the new aspect
  renderer.setSize(width, height);       // resize the canvas
  composer.setSize(width, height);       // keep post-processing in sync
                                         // (mobile rotate / URL-bar resize)
});

// ===== Intro overlay: loading → START → cinematic camera pan =====
const _introEl = document.getElementById('intro');
const _introPctEl = _introEl && _introEl.querySelector('.intro-pct');
const _introStartBtn = _introEl && _introEl.querySelector('.intro-start');
let _introPct = 0, _introDone = false;

// Climb a friendly fake % until the scene reports ready (real download
// time is unknown — Content-Length isn't guaranteed — so ease toward ~92).
const _introTick = setInterval(() => {
  if (_introDone) return;
  _introPct = Math.min(92, _introPct + Math.random() * 7 + 2);
  if (_introPctEl) _introPctEl.textContent = Math.round(_introPct);
}, 180);

// Called from the model success callback once the scene is built.
function _introReady() {
  _introDone = true;
  clearInterval(_introTick);
  if (_introPctEl) _introPctEl.textContent = '100';
  if (_introEl) _introEl.classList.add('ready'); // CSS swaps loader → START
}

// After the intro pan lands on the opening pose: hand control back and let
// auto-rotate kick in after a short idle (the original 4s behaviour).
function _beginAfterIntro() {
  controls.enabled = true;
  setTimeout(() => { controls.autoRotate = true; }, 4000);
}

// Audio: soft looping background music + a one-shot START chime. Both are
// kicked off from the START click — a user gesture, which is what browsers
// require before they'll allow audio to play.
const _bgm = new Audio(`${ASSET}backgr0und.mpeg`);
_bgm.loop = true;
_bgm.volume = 0.06;            // very low — it sits quietly under everything
const _startSfx = new Audio(`${ASSET}start.mpeg`);
_startSfx.volume = 0.6;
// Soft UI tick shared by the star / ground-rabbit / dart-medallion hovers.
const _hoverSfx = new Audio(`${ASSET}butt0n_1.mpeg`);
_hoverSfx.volume = 0.03;
let _lastHoverSfx = 0;
function _playHoverSfx() {
  const now = performance.now();
  if (now - _lastHoverSfx < 80) return;   // throttle rapid re-hovers
  _lastHoverSfx = now;
  _hoverSfx.currentTime = 0;
  _hoverSfx.play().catch(() => {});
}

// Generic UI click — plays for any DOM button/link that does something,
// and for the 3D scene actions (wired into the canvas click handler). The
// intro START button has its own chime, so it's skipped here.
const _clickSfx = new Audio(`${ASSET}CIick.mpeg`);
_clickSfx.volume = 0.4;
let _lastClickSfx = 0;
function _playClickSfx() {
  const now = performance.now();
  if (now - _lastClickSfx < 60) return;   // dedupe double-fires
  _lastClickSfx = now;
  _clickSfx.currentTime = 0;
  _clickSfx.play().catch(() => {});
}
document.addEventListener('click', (e) => {
  const el = e.target.closest && e.target.closest('button, a[href]');
  if (!el || el.classList.contains('intro-start')) return;
  _playClickSfx();
});

// Camera-move whoosh — plays on every scripted fly (zoom in/out, dive,
// flyHome, the START sweep). Wired into flyCamera() so it's a single hook.
const _whooshSfx = new Audio(`${ASSET}wh00sh.mpeg`);
_whooshSfx.volume = 0.25;
let _lastWhooshSfx = 0;
function _playWhooshSfx() {
  const now = performance.now();
  if (now - _lastWhooshSfx < 120) return;  // dedupe back-to-back flies
  _lastWhooshSfx = now;
  _whooshSfx.currentTime = 0;
  _whooshSfx.play().catch(() => {});
}

// START → play the chime, fade the overlay out, jump the camera far
// behind/above, then sweep it in to the opening pose. The looping music
// starts 1s later and sits quietly under everything.
if (_introStartBtn) {
  _introStartBtn.addEventListener('click', () => {
    _startSfx.currentTime = 0;
    _startSfx.play().catch(() => {});
    setTimeout(() => { _bgm.play().catch(() => {}); }, 1000);
    if (_introEl) {
      _introEl.classList.add('hidden');
      setTimeout(() => { _introEl.style.display = 'none'; }, 800);
    }
    camera.position.copy(_introStartPos);
    controls.target.copy(_homeTarget);
    camera.lookAt(_homeTarget);
    flyCamera(_homeCamPos, _homeTarget, 2600, _beginAfterIntro);
  });
}

// ===== Animation loop (runs ~60x per second) =====
function animate() {
  requestAnimationFrame(animate); // schedule the next frame
  if (_camAnim) {
    // A camera tween is active: progress 0..1, eased with smoothstep.
    const k = Math.min((performance.now() - _camAnim.start) / _camAnim.dur, 1);
    const e = k * k * (3 - 2 * k); // smoothstep ease
    // Interpolate both the camera position and its look-at target.
    camera.position.lerpVectors(_camAnim.fromPos, _camAnim.toPos, e);
    _tmpTarget.lerpVectors(_camAnim.fromTarget, _camAnim.toTarget, e);
    camera.lookAt(_tmpTarget);
    controls.target.copy(_tmpTarget);
    // When finished, clear the tween and run its callback (if any).
    if (k >= 1) { const done = _camAnim.onDone; _camAnim = null; if (done) done(); }
  } else {
    controls.update(); // required each frame when damping is enabled
  }
  // Advance the firefly shader's clock so they keep moving/flickering.
  fireflyMaterial.uniforms.uTime.value = performance.now() * 0.001;
  // Fade/animate the rabbit's hover firefly swarm.
  _updateRabbitFlies();
  // Render through the post-processing chain (RenderPass + bloom).
  composer.render();
}
animate();
