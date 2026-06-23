import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { buildFractureNetwork, createReservoirScene, describeRegime } from './model.js';

const viewport = document.querySelector('#viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x020405, 1);
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x020405, 58, 135);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 220);
camera.position.set(32, 34, 46);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 22;
controls.maxDistance = 104;

const ui = {
  nfDensity: document.querySelector('#nfDensity'),
  stressDiff: document.querySelector('#stressDiff'),
  netPressure: document.querySelector('#netPressure'),
  injectionRate: document.querySelector('#injectionRate'),
  sandAmount: document.querySelector('#sandAmount'),
  fluidVolume: document.querySelector('#fluidVolume'),
  youngModulus: document.querySelector('#youngModulus'),
  poissonRatio: document.querySelector('#poissonRatio'),
  fractureToughness: document.querySelector('#fractureToughness'),
  leakoffCoeff: document.querySelector('#leakoffCoeff'),
  layerContrast: document.querySelector('#layerContrast'),
  acidStrength: document.querySelector('#acidStrength'),
  friction: document.querySelector('#friction'),
  flowIndex: document.querySelector('#flowIndex'),
  timeScale: document.querySelector('#timeScale'),
  showNF: document.querySelector('#showNF'),
  showLeakoff: document.querySelector('#showLeakoff'),
  showStress: document.querySelector('#showStress')
};

const outputs = {
  nfDensity: document.querySelector('#nfDensityOut'),
  stressDiff: document.querySelector('#stressDiffOut'),
  netPressure: document.querySelector('#netPressureOut'),
  injectionRate: document.querySelector('#injectionRateOut'),
  sandAmount: document.querySelector('#sandAmountOut'),
  fluidVolume: document.querySelector('#fluidVolumeOut'),
  youngModulus: document.querySelector('#youngModulusOut'),
  poissonRatio: document.querySelector('#poissonRatioOut'),
  fractureToughness: document.querySelector('#fractureToughnessOut'),
  leakoffCoeff: document.querySelector('#leakoffCoeffOut'),
  layerContrast: document.querySelector('#layerContrastOut'),
  acidStrength: document.querySelector('#acidStrengthOut'),
  friction: document.querySelector('#frictionOut'),
  flowIndex: document.querySelector('#flowIndexOut'),
  timeScale: document.querySelector('#timeScaleOut'),
  srv: document.querySelector('#srvValue'),
  branches: document.querySelector('#branchValue'),
  cross: document.querySelector('#crossValue'),
  etched: document.querySelector('#etchedValue'),
  maxLength: document.querySelector('#maxLengthValue'),
  maxHeight: document.querySelector('#maxHeightValue'),
  proppant: document.querySelector('#proppantValue'),
  stageMaxLength: document.querySelector('#stageMaxLength'),
  stageMaxHeight: document.querySelector('#stageMaxHeight'),
  containment: document.querySelector('#containmentValue'),
  pressureEfficiency: document.querySelector('#pressureEfficiencyValue'),
  rule: document.querySelector('#ruleText')
};

let activeGroup = null;
let isRunning = true;
let lastBuild = 0;
let network = null;
let nfSeed = 43891;

function readParams() {
  return {
    nfDensity: Number(ui.nfDensity.value),
    stressDiff: Number(ui.stressDiff.value),
    netPressure: Number(ui.netPressure.value),
    injectionRate: Number(ui.injectionRate.value),
    sandAmount: Number(ui.sandAmount.value),
    fluidVolume: Number(ui.fluidVolume.value),
    youngModulus: Number(ui.youngModulus.value),
    poissonRatio: Number(ui.poissonRatio.value),
    fractureToughness: Number(ui.fractureToughness.value),
    leakoffCoeff: Number(ui.leakoffCoeff.value),
    layerContrast: Number(ui.layerContrast.value),
    acidStrength: Number(ui.acidStrength.value),
    friction: Number(ui.friction.value),
    flowIndex: Number(ui.flowIndex.value),
    timeScale: Number(ui.timeScale.value),
    nfSeed,
    showNF: ui.showNF.checked,
    showLeakoff: ui.showLeakoff.checked,
    showStress: ui.showStress.checked
  };
}

function updateOutputs(params) {
  outputs.nfDensity.textContent = params.nfDensity.toFixed(2);
  outputs.stressDiff.textContent = params.stressDiff.toFixed(1);
  outputs.netPressure.textContent = params.netPressure.toFixed(1);
  outputs.injectionRate.textContent = params.injectionRate.toFixed(1);
  outputs.sandAmount.textContent = params.sandAmount.toFixed(0);
  outputs.fluidVolume.textContent = params.fluidVolume.toFixed(0);
  outputs.youngModulus.textContent = params.youngModulus.toFixed(0);
  outputs.poissonRatio.textContent = params.poissonRatio.toFixed(2);
  outputs.fractureToughness.textContent = params.fractureToughness.toFixed(2);
  outputs.leakoffCoeff.textContent = params.leakoffCoeff.toFixed(3);
  outputs.layerContrast.textContent = params.layerContrast.toFixed(2);
  outputs.acidStrength.textContent = params.acidStrength.toFixed(2);
  outputs.friction.textContent = params.friction.toFixed(2);
  outputs.flowIndex.textContent = params.flowIndex.toFixed(2);
  outputs.timeScale.textContent = `${Math.round(params.timeScale * 100)}%`;

  outputs.srv.textContent = network.metrics.srv.toLocaleString('zh-CN');
  outputs.branches.textContent = network.metrics.branches.toString();
  outputs.cross.textContent = network.metrics.crossRatio.toFixed(2);
  outputs.etched.textContent = network.metrics.avgEtched.toFixed(2);
  outputs.maxLength.textContent = `${network.metrics.maxLength.toFixed(1)} m`;
  outputs.maxHeight.textContent = `${network.metrics.maxHeight.toFixed(1)} m`;
  outputs.proppant.textContent = network.metrics.proppantIndex.toFixed(2);
  outputs.stageMaxLength.textContent = `${network.metrics.maxLength.toFixed(1)} m`;
  outputs.stageMaxHeight.textContent = `${network.metrics.maxHeight.toFixed(1)} m`;
  outputs.containment.textContent = network.metrics.containmentIndex.toFixed(2);
  outputs.pressureEfficiency.textContent = network.metrics.pressureEfficiency.toFixed(2);
  outputs.rule.textContent = describeRegime(params, network);
}

function rebuild() {
  const params = readParams();
  if (activeGroup) {
    scene.remove(activeGroup);
    activeGroup.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) object.material.forEach((mat) => mat.dispose());
        else object.material.dispose();
      }
    });
  }
  network = buildFractureNetwork(params);
  activeGroup = createReservoirScene(scene, network, params);
  updateOutputs(params);
  lastBuild = performance.now();
}

function resize() {
  const { clientWidth, clientHeight } = viewport;
  renderer.setSize(clientWidth, clientHeight);
  camera.aspect = clientWidth / Math.max(1, clientHeight);
  camera.updateProjectionMatrix();
}

for (const element of Object.values(ui)) {
  element.addEventListener('input', rebuild);
  element.addEventListener('change', rebuild);
}

document.querySelector('#toggleRun').addEventListener('click', (event) => {
  isRunning = !isRunning;
  event.currentTarget.textContent = isRunning ? '暂停' : '播放';
});

document.querySelector('#reset').addEventListener('click', () => {
  nfSeed = 43891;
  ui.nfDensity.value = 1.05;
  ui.stressDiff.value = 8.5;
  ui.netPressure.value = 15;
  ui.injectionRate.value = 8;
  ui.sandAmount.value = 35;
  ui.fluidVolume.value = 450;
  ui.youngModulus.value = 32;
  ui.poissonRatio.value = 0.24;
  ui.fractureToughness.value = 1.15;
  ui.leakoffCoeff.value = 0.006;
  ui.layerContrast.value = 0.38;
  ui.acidStrength.value = 0.56;
  ui.friction.value = 0.48;
  ui.flowIndex.value = 0.62;
  ui.timeScale.value = 0.74;
  ui.showNF.checked = true;
  ui.showLeakoff.checked = true;
  ui.showStress.checked = true;
  rebuild();
});

document.querySelector('#randomNF').addEventListener('click', () => {
  nfSeed = Math.floor(Math.random() * 2147483647) + 1;
  rebuild();
});

document.querySelector('#snapshot').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `limestone-fracture-${Date.now()}.png`;
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
});

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab));
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === tab.dataset.tab);
    });
  });
}

window.addEventListener('resize', resize);
resize();
rebuild();

function animate(now) {
  requestAnimationFrame(animate);
  if (isRunning && activeGroup) {
    const age = (now - lastBuild) / 1000;
    activeGroup.rotation.y = Math.sin(age * 0.16) * 0.028;
    const well = activeGroup.children.find((child) => child.type === 'Group' && child.children.length > 1);
    if (well) well.rotation.y += 0.004;
  }
  controls.update();
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
