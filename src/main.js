import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// Scene setup
const scene = new THREE.Scene();
// Near‑black background
scene.background = new THREE.Color('#0A0612');
// Dark fog for depth
scene.fog = new THREE.Fog(0x0A0612, 20, 80);

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

// Post‑processing Composer for bloom
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.7, 0.6);
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
    // Enable shadows and apply material overrides
    model.traverse((obj) => {
      if (obj.isMesh) {
        // Shadows
        obj.castShadow = true;
        obj.receiveShadow = true;
        // Clone material to avoid affecting other meshes
        const originalMat = obj.material;
        const mat = originalMat.clone();
        // Remove texture map where required
        mat.map = null;
        const name = originalMat.name;
        switch (name) {
          case 'wood':
            mat.color = new THREE.Color('#3D2848');
            mat.roughness = 0.6;
            mat.metalness = 0.1;
            break;
          case 'cake':
            mat.color = new THREE.Color('#FF4FA8');
            mat.emissive = new THREE.Color('#FF1A8A');
            mat.emissiveIntensity = 0.4;
            break;
          case 'cream':
            mat.color = new THREE.Color('#FFE0F0');
            mat.emissive = new THREE.Color('#FFC0E0');
            mat.emissiveIntensity = 0.3;
            break;
          case 'glass1':
            mat.color = new THREE.Color('#FFE066');
            mat.emissive = new THREE.Color('#FFD93D');
            mat.emissiveIntensity = 2.5;
            break;
          case 'bush':
            mat.color = new THREE.Color('#1A4D3A');
            mat.emissive = new THREE.Color('#4FE5FF');
            mat.emissiveIntensity = 0.3;
            break;
          case 'floor1':
            mat.color = new THREE.Color('#0F1F1A');
            mat.roughness = 0.9;
            break;
          case 'plate':
            mat.color = new THREE.Color('#1A0F2E');
            break;
          default:
            // leave material unchanged
            break;
        }
        obj.material = mat;
      }
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

      // Strawberry meshes – override color and emissive
      const strawberryMeshes = [
        'polySurface87_wood_0',
        'polySurface88_wood_0',
        'polySurface89_wood_0',
        'polySurface99_wood_0',
        'polySurface91_wood_0',
        'polySurface100_wood_0',
        'polySurface101_wood_0',
        'polySurface102_wood_0',
        'polySurface103_wood_0',
        'polySurface85_wood_0',
        'polySurface86_wood_0',
        'polySurface84_wood_0',
        'pCylinder5_cake_0'
      ];
      if (strawberryMeshes.includes(obj.name)) {
        obj.material = obj.material.clone();
        obj.material.color.set('#FF3366'); // hot strawberry red
        obj.material.emissive = new THREE.Color('#FF1A4D');
        obj.material.emissiveIntensity = 0.6;
        obj.material.map = null;
        obj.material.needsUpdate = true;
        console.log('Strawberry override:', obj.name);
      }

      // Sign mesh – neon hot pink glow
      if (obj.name === 'sign_wood_0') {
        obj.material = obj.material.clone();
        obj.material.color.set('#FFB4D6');
        obj.material.emissive = new THREE.Color('#FF4FA8');
        obj.material.emissiveIntensity = 1.5;
        obj.material.map = null;
        obj.material.needsUpdate = true;
        console.log('Sign override:', obj.name);
      }

      // Door mesh – visible muted pink-brown
      if (obj.name === 'doorwood_wood_0') {
        obj.material = obj.material.clone();
        obj.material.color.set('#8B4D6B');
        obj.material.map = null;
        obj.material.needsUpdate = true;
        console.log('Door override:', obj.name);
      }
    });

    // Fit camera to model
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.6; // 20% closer than previous factor
    camera.position.set(center.x + maxDim, center.y + maxDim, cameraZ + center.z);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();

    // Lighting (now inside model callback)
    const ambient = new THREE.AmbientLight(0x2D1F3D, 0.3); // dimmer ambient
    scene.add(ambient);
    // Offsets relative to cottage center
    const offsetPink = new THREE.Vector3(3, 4, 3);
    const offsetCyan = new THREE.Vector3(-3, 3, 3);
    const offsetMag = new THREE.Vector3(0, 2, -4);
    const pinkLight = new THREE.PointLight(0xFF4FA8, 50, 14, 1.5);
    pinkLight.position.copy(center).add(offsetPink);
    pinkLight.castShadow = true;
    scene.add(pinkLight);
    const cyanLight = new THREE.PointLight(0x4FE5FF, 40, 14, 1.5);
    cyanLight.position.copy(center).add(offsetCyan);
    cyanLight.castShadow = true;
    scene.add(cyanLight);
    const magentaLight = new THREE.PointLight(0xC84FFF, 30, 12, 1.5);
    magentaLight.position.copy(center).add(offsetMag);
    magentaLight.castShadow = true;
    scene.add(magentaLight);

    // Log materials and meshes
    model.traverse((obj) => {
      if (obj.material) {
        console.log('Material:', obj.material.name, 'Mesh:', obj.name);
      }
    });

    // Hide loading indicator
    const loaderEl = document.getElementById('loader');
    if (loaderEl) loaderEl.style.display = 'none';
  },
  undefined,
  (error) => {
    console.error('Error loading model:', error);
  }
);


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
  composer.render();
}
animate();
