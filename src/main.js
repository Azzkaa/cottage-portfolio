import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a1f3d'); // soft dark purple

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
document.body.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
// Enable slow auto-rotation
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

// Lights
const ambient = new THREE.AmbientLight(0xffe0b0, 0.3); // warm low intensity
scene.add(ambient);

const directional = new THREE.DirectionalLight(0xffffff, 1);
directional.position.set(0, 5, 5);
scene.add(directional);

// Load cottage model
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
loader.load(
  '/models/cottage.glb',
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    // Fit camera to model
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 2; // distance factor
    camera.position.set(center.x + maxDim, center.y + maxDim, cameraZ + center.z);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();

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
  renderer.render(scene, camera);
}
animate();
