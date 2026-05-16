import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// Scene setup
const scene = new THREE.Scene();
// Near‑black background
scene.background = new THREE.Color('#1F1830');
// Dark fog for depth
scene.fog = new THREE.Fog(0x1F1830, 20, 80);

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
renderer.outputColorSpace = THREE.SRGBColorSpace;

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
