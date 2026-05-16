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
// Match the device's pixel density and fill the window.
renderer.setPixelRatio(window.devicePixelRatio);
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
  '/models/cottage.glb',
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

      // Subtitles: smaller cream monospace, left-aligned.
      ctx.fillStyle = '#F2F2F0';
      ctx.font = 'bold 56px "Courier New", monospace';
      ctx.textAlign = 'left';
      const subX = canvas.width / 2 - 280;
      ctx.fillText('> FULL STACK DEVELOPER', subX, 280);
      ctx.fillText('> RESEARCHER', subX, 360);

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
      { name: 'sign-about',    label: 'ABOUT',    color: '#F2F2F0' }, // white
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

    // --- Camera poses for plaque navigation ---
    // Remember this opening pose so we can fly back to it later.
    _homeCamPos.copy(camera.position);
    _homeTarget.copy(modelCenter);
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
      _img.src = '/about-label.jpg';
    }

    // Alias kept for the lighting code below.
    const center = modelCenter;

    // Auto-rotation off at first; kicks in after 4s of the user just looking.
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.5;
    setTimeout(() => {
      controls.autoRotate = true;
    }, 4000);

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
      }
    });

    // Hide the loading indicator once everything above is set up.
    const loaderEl = document.getElementById('loader');
    if (loaderEl) loaderEl.style.display = 'none';
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
const _tmpTarget = new THREE.Vector3();
// Holds the active tween, or null when the camera is free.
let _camAnim = null;

// Start a camera tween from the current pose to (toPos, toTarget).
function flyCamera(toPos, toTarget, durMs, onDone) {
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

// ===== Plaque hover + click (raycaster) =====
// A raycaster shoots a ray from the camera through the cursor into the scene.
const _raycaster = new THREE.Raycaster();
// Cursor position in normalized device coords (-1..1 on each axis).
const _pointer = new THREE.Vector2();
// The plaque currently under the cursor (so we can revert it on mouse-out).
let _hoveredPlaque = null;
window.HOVER_COLOR = '#FF4FA8'; // contrasting neon highlight — tunable in console

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

// On click: if a plaque was hit, run its camera flight + open its panel.
renderer.domElement.addEventListener('click', (event) => {
  // Ignore clicks while a panel is open or the camera is mid-flight.
  if (_panelOpen || _camAnim) return;
  const p = _plaqueAtEvent(event);
  if (!p) return;
  console.log('Plaque clicked:', p.name);
  if (p.name === 'sign-about') {
    // Lock the controls so the user can't fight the camera animation.
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
    // Same two-phase pattern as Projects, but flying up to a top-of-carton
    // view then diving into a star. No panel yet, so re-enable controls when
    // the dive finishes (otherwise the user is stuck on the star).
    controls.enabled = false;
    controls.autoRotate = false;
    if (_hoveredPlaque) { _clearHover(_hoveredPlaque); _hoveredPlaque = null; }
    renderer.domElement.style.cursor = 'default';
    // Phase 1: pan up to the wide top-of-carton view.
    flyCamera(window.creditsCamPos, window.creditsCamTarget, 1500, () => {
      // Phase 2: zoom hard into the star, then hand control back to the user.
      // 0.93 = camera ends 93% of the way to the star (near-max without
      // landing inside it). Bump toward 1.0 for even closer.
      const innerPos = new THREE.Vector3().lerpVectors(
        window.creditsCamPos, window.creditsCamTarget, 0.93
      );
      flyCamera(innerPos, window.creditsCamTarget, 800, () => {
        controls.enabled = true;
        controls.autoRotate = true;
      });
    });
  }
});

// ===== Keep the render in sync with the window size =====
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;        // fix stretched view
  camera.updateProjectionMatrix();       // apply the new aspect
  renderer.setSize(width, height);       // resize the canvas
});

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
  // Render through the post-processing chain (RenderPass + bloom).
  composer.render();
}
animate();
