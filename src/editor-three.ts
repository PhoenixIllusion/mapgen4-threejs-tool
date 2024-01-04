import { FlyControls } from 'three/examples/jsm/controls/FlyControls'
import {
  Scene, Vector3, DirectionalLight, PerspectiveCamera, WebGLRenderer,
  Mesh, MeshStandardMaterial, CanvasTexture, PlaneGeometry, AmbientLight, Object3D
} from 'three';


const RES = 512;

const threeCanvas: HTMLCanvasElement = document.querySelector('#mapgen4-three')!;
const heightcanvas: HTMLCanvasElement = document.querySelector('#mapgen4')!;

const renderer = new WebGLRenderer({ canvas: threeCanvas });
renderer.setClearColor(0xbfd1e5);
renderer.setPixelRatio(window.devicePixelRatio);

const viewportSize = { width: threeCanvas.width, height: threeCanvas.height };
const camera = new PerspectiveCamera(60, viewportSize.width / viewportSize.height, 0.2, 2000);
camera.position.set(0, 15, 30);
camera.lookAt(new Vector3(0, 0, 0));

const scene = new Scene();
const dirLight = new DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 10, 5);
scene.add(dirLight);
scene.add(new AmbientLight(0xFFFFFF, 0.2));

const controls = new FlyControls(camera, threeCanvas);
const displacementMap = new CanvasTexture(heightcanvas);

const material = new MeshStandardMaterial({
  displacementMap: displacementMap,
  color: 0xffffff,
  //map: displacementMap,
  displacementScale: 256 * 0.0125, // This should match the Y multiplier used on the ShapeSettings inScale.
  flatShading: true
})

const planeMesh = new Mesh(
  new PlaneGeometry(32, 32, RES, RES), material
);
planeMesh.rotation.x = -Math.PI / 2;
planeMesh.position.y -= 1.6;
planeMesh.geometry.computeVertexNormals();
material.needsUpdate = true;

window.addEventListener('on-map-update', (e: any) => {
  displacementMap.needsUpdate = true;
});

const oceanMat = new MeshStandardMaterial({
  color: 0x113388,
  transparent: true,
  opacity: 0.3
})
const ocean = new Mesh(
  new PlaneGeometry(32, 32, 1, 1), oceanMat
);
ocean.rotation.x = -Math.PI / 2;
ocean.position.y += 0;

const map = new Object3D();
map.add(planeMesh);
map.add(ocean);
map.scale.set(15,15,15);

scene.add(map);

let lastTime = 0;
const render: FrameRequestCallback = (time) => {
  const delta = lastTime > 0 ? time - lastTime : 0;
  lastTime = time;
  controls.update(delta/50);
  requestAnimationFrame(render);
  renderer.render(scene, camera);
};
requestAnimationFrame(render);