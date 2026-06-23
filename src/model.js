import * as THREE from './vendor/three.module.js';

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function colorRamp(t) {
  const stops = [
    new THREE.Color('#17d65f'),
    new THREE.Color('#f8f03b'),
    new THREE.Color('#ff8b18'),
    new THREE.Color('#e9151b')
  ];
  const scaled = clamp(t, 0, 1) * (stops.length - 1);
  const i = Math.floor(scaled);
  const f = scaled - i;
  return stops[i].clone().lerp(stops[Math.min(i + 1, stops.length - 1)], f);
}

function widthColorRamp(t) {
  const stops = [
    new THREE.Color('#ffe36a'),
    new THREE.Color('#ff9a1f'),
    new THREE.Color('#d43a12'),
    new THREE.Color('#6f0015')
  ];
  const scaled = clamp(t, 0, 1) * (stops.length - 1);
  const i = Math.floor(scaled);
  const f = scaled - i;
  return stops[i].clone().lerp(stops[Math.min(i + 1, stops.length - 1)], f);
}

export function buildFractureNetwork(params) {
  const random = mulberry32(params.nfSeed || 43891);
  const natural = [];
  const naturalCount = Math.round(180 * params.nfDensity);
  const area = 82;

  for (let i = 0; i < naturalCount; i += 1) {
    const cluster = random() < 0.45 ? 0 : random() < 0.7 ? 1 : 2;
    const baseAngle = cluster === 0 ? -0.25 : cluster === 1 ? Math.PI / 2 + 0.2 : Math.PI / 4;
    const angle = baseAngle + (random() - 0.5) * 0.9;
    const length = 2.1 + random() * 4.4;
    const x = (random() - 0.5) * area;
    const z = (random() - 0.5) * area;
    natural.push({
      x,
      z,
      angle,
      length,
      roughness: 0.35 + random() * 0.65,
      openness: random() * 0.28
    });
  }

  const branches = [];
  const events = { crossing: 0, diversion: 0, arrest: 0 };
  const seedDirs = [0, Math.PI, 0.08, Math.PI - 0.08];
  const rateFactor = clamp((params.injectionRate || 8) / 8, 0.25, 2.25);
  const sandFactor = clamp((params.sandAmount || 0) / 35, 0, 2.6);
  const fluidFactor = clamp((params.fluidVolume || 450) / 450, 0.2, 2.8);
  const youngModulus = params.youngModulus || 32;
  const poissonRatio = params.poissonRatio || 0.24;
  const fractureToughness = params.fractureToughness || 1.15;
  const leakoffCoeff = params.leakoffCoeff || 0.006;
  const layerContrast = params.layerContrast || 0;
  const planeStrainModulus = youngModulus / Math.max(0.2, 1 - poissonRatio * poissonRatio);
  const stiffnessFactor = clamp(planeStrainModulus / 34, 0.42, 2.2);
  const complianceFactor = clamp(1 / Math.sqrt(stiffnessFactor), 0.58, 1.55);
  const toughnessFactor = clamp(fractureToughness / 1.15, 0.3, 2.5);
  const leakoffFactor = clamp(leakoffCoeff / 0.006, 0.12, 4.2);
  const toughnessLoss = clamp((toughnessFactor - 0.7) * 0.16, -0.08, 0.34);
  const leakoffLoss = clamp((leakoffFactor - 0.5) * 0.07, 0, 0.28);
  const heightContainment = clamp(1.12 - layerContrast * 0.42 - Math.max(0, poissonRatio - 0.24) * 0.9, 0.48, 1.18);
  const lateralLayerGuide = clamp(1 + layerContrast * 0.16 - leakoffLoss * 0.25, 0.82, 1.18);
  const proppantSupport = smoothstep(0.15, 1.45, sandFactor);
  const screenoutRisk = clamp(sandFactor * 0.42 - rateFactor * 0.18 - fluidFactor * 0.12, 0, 0.42);
  const volumeDrive = clamp(0.72 + fluidFactor * 0.28, 0.75, 1.5);
  const rateDrive = clamp(0.78 + rateFactor * 0.22, 0.82, 1.35);
  const maxSteps = Math.round(
    18 + params.timeScale * 19 + fluidFactor * 7 + rateFactor * 3
    - screenoutRisk * 10 - toughnessLoss * 16 - leakoffLoss * 18
  );
  const acidSoftening = params.acidStrength * 0.72;
  const effectiveFriction = clamp(params.friction - acidSoftening * 0.48, 0.06, 0.86);
  const stressBarrier = params.stressDiff / 18;
  const pressureEfficiency = clamp(1 - toughnessLoss - leakoffLoss - layerContrast * 0.04, 0.48, 1.12);
  const pressureDrive = clamp(
    (params.netPressure / 26) * rateDrive * complianceFactor * pressureEfficiency * (1 - screenoutRisk * 0.45),
    0.05,
    1.45
  );
  const viscosityDrag = 1.2 - params.flowIndex;
  const maxBranches = Math.round(
    100 + fluidFactor * 18 + rateFactor * 8 + proppantSupport * 8
    - toughnessLoss * 40 - leakoffLoss * 34 + layerContrast * 8
  );
  const wingTips = [];

  for (const side of [-1, 1]) {
    let px = 0;
    let pz = 0;
    const segments = Math.round(7 + params.timeScale * 7);
    for (let i = 0; i < segments; i += 1) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const length = (
        39 * params.timeScale + 16 * pressureDrive
      ) * volumeDrive * lateralLayerGuide * (1 - screenoutRisk * 0.3 - toughnessLoss * 0.32 - leakoffLoss * 0.22);
      const nx = side * length * t1;
      const nz = side * 0.18 * Math.sin(t1 * Math.PI);
      const acid = clamp(params.acidStrength * (0.88 - t1 * 0.32), 0, 1);
      const hydraulicWidth = clamp(
        pressureDrive * (0.95 - t1 * 0.25) - stressBarrier * 0.06 + proppantSupport * 0.08,
        0.18,
        1.15
      );
      branches.push({
        from: { x: px, z: pz },
        to: { x: nx, z: nz },
        height: (7.2 + 8.5 * hydraulicWidth + 4.5 * acid + proppantSupport * 2.2) * heightContainment,
        width: (1.0 + 2.7 * hydraulicWidth + 1.7 * acid + proppantSupport * 0.85) * complianceFactor,
        generation: 0,
        event: 'primary',
        pathId: side < 0 ? 'primary-left' : 'primary-right',
        acid,
        pressure: hydraulicWidth,
        etchedWidth: acid * (0.65 + params.nfDensity * 0.22),
        stressShadow: 0.16 + t1 * 0.08
      });
      px = nx;
      pz = nz;
    }
    wingTips.push({ x: px, z: pz, dir: side > 0 ? 0.03 : Math.PI - 0.03 });
  }

  const queue = seedDirs.map((dir, index) => ({
    x: 0,
    z: 0,
    dir,
    energy: (1.0 - index * 0.08) * rateDrive * (1 - screenoutRisk * 0.35),
    generation: 0,
    id: `seed-${index}`
  })).concat(
    wingTips.map((tip, index) => ({
      ...tip,
      energy: 0.72 * volumeDrive * (1 - screenoutRisk * 0.35),
      generation: 1,
      id: `wing-${index}`
    }))
  );

  while (queue.length && branches.length < maxBranches) {
    const tip = queue.shift();
    let { x, z, dir, energy } = tip;
    const localSteps = Math.max(6, maxSteps - tip.generation * 5);

    for (let step = 0; step < localSteps; step += 1) {
      if (energy < 0.12) {
        events.arrest += 1;
        break;
      }

      const radius = Math.hypot(x, z);
      const stressShadow = params.showStress
        ? 0.18 * Math.exp(-Math.abs(radius - 14) / 18) * (1 + tip.generation * 0.18)
        : 0;
      const leakoff = (
        params.acidStrength * (0.06 + 0.1 * params.nfDensity) + leakoffFactor * 0.045
      ) * (0.5 + radius / 66) / rateDrive;
      const stepLength = (
        2.0 + pressureDrive * 2.2 + fluidFactor * 0.35
      ) * lateralLayerGuide * (1 - toughnessLoss * 0.45) * clamp(energy, 0.32, 1.35);
      const wobble = (random() - 0.5) * (0.16 + params.nfDensity * 0.08);
      const nextDir = dir + wobble - stressShadow * Math.sign(Math.sin(dir));
      const nx = x + Math.cos(nextDir) * stepLength;
      const nz = z + Math.sin(nextDir) * stepLength;

      const nearest = nearestNatural(natural, x, z, nx, nz);
      let event = 'propagate';
      let actualEnd = { x: nx, z: nz };
      let nextEnergy = energy - 0.025 - viscosityDrag * 0.015 - leakoff * 0.18 - stressShadow * 0.08 - screenoutRisk * 0.04;
      let branchAngle = null;

      if (nearest && nearest.distance < 2.4 + params.nfDensity * 0.55) {
        const approach = Math.abs(Math.atan2(Math.sin(nextDir - nearest.angle), Math.cos(nextDir - nearest.angle)));
        const theta = Math.abs(Math.PI / 2 - approach);
        const sigmaN = 0.5 + stressBarrier * (0.4 - 0.5 * Math.cos(2 * theta));
        const tau = stressBarrier * 0.5 * Math.sin(2 * theta);
        const noSlip = effectiveFriction * sigmaN + 0.2 * (1 - params.acidStrength) - Math.abs(tau);
        const reinitiation = pressureDrive + theta / Math.PI + rateFactor * 0.06 - 0.55 - viscosityDrag * 0.24 - toughnessLoss * 0.38;
        const crossScore = noSlip + reinitiation + nearest.roughness * 0.15;

        actualEnd = { x: nearest.x, z: nearest.z };
        if (crossScore > 0.18 || theta > 1.04) {
          event = 'crossing';
          events.crossing += 1;
          nextEnergy += 0.04 + pressureDrive * 0.06;
          branchAngle = nextDir + (random() - 0.5) * 0.24;
        } else {
          event = 'diversion';
          events.diversion += 1;
          nextEnergy -= 0.08 + params.acidStrength * 0.03;
          branchAngle = nearest.angle + (random() < 0.5 ? 0 : Math.PI);
        }

        if (
          tip.generation < 3
          && random() < 0.44 + params.acidStrength * 0.28 + params.nfDensity * 0.08 + fluidFactor * 0.04 - toughnessLoss * 0.36 - leakoffLoss * 0.18
        ) {
          queue.push({
            x: actualEnd.x,
            z: actualEnd.z,
            dir: branchAngle + (random() - 0.5) * 0.42,
            energy: nextEnergy * (event === 'crossing' ? 0.72 : 0.62),
            generation: tip.generation + 1,
            id: `branch-${branches.length}-${queue.length}`
          });
        }
      }

      const acid = clamp(params.acidStrength * (0.42 + energy * 0.52) * Math.exp(-radius / 74), 0, 1);
      const hydraulicWidth = Math.max(0.03, pressureDrive * energy - stressShadow * 0.32 + proppantSupport * 0.05);
      const etchedWidth = acid * (0.35 + nearestNaturalDensity(natural, x, z) * 0.75);
      const height = (2.2 + 7.8 * hydraulicWidth + 6.0 * acid + tip.generation * 0.45 + proppantSupport * 1.2) * heightContainment;
      const width = (0.38 + 2.2 * hydraulicWidth + 1.3 * etchedWidth + proppantSupport * 0.45) * complianceFactor * (1 - leakoffLoss * 0.35);

      branches.push({
        from: { x, z },
        to: actualEnd,
        height,
        width,
        generation: tip.generation,
        event,
        pathId: tip.id,
        acid,
        pressure: hydraulicWidth,
        etchedWidth,
        stressShadow
      });
      if (branches.length >= maxBranches) break;

      x = actualEnd.x;
      z = actualEnd.z;
      dir = event === 'diversion' && branchAngle !== null ? branchAngle : nextDir;
      energy = clamp(nextEnergy, 0, 1.2);

      if (Math.hypot(x, z) > 58) break;
    }
  }

  const primaryHeights = branches.filter((branch) => branch.event === 'primary').map((branch) => branch.height);
  const unifiedHeight = primaryHeights.length
    ? primaryHeights.reduce((sum, height) => sum + height, 0) / primaryHeights.length
    : 12;
  for (const branch of branches) {
    branch.height = unifiedHeight;
  }

  const srv = branches.reduce((sum, branch) => {
    const len = Math.hypot(branch.to.x - branch.from.x, branch.to.z - branch.from.z);
    return sum + len * branch.height * (branch.width + branch.etchedWidth);
  }, 0);
  const avgEtched = branches.length
    ? branches.reduce((sum, branch) => sum + branch.etchedWidth, 0) / branches.length
    : 0;
  const endpoints = branches.flatMap((branch) => [branch.from, branch.to]);
  const maxLength = endpoints.reduce((max, a, index) => {
    let localMax = max;
    for (let i = index + 1; i < endpoints.length; i += 1) {
      localMax = Math.max(localMax, Math.hypot(a.x - endpoints[i].x, a.z - endpoints[i].z));
    }
    return localMax;
  }, 0);
  const maxHeight = branches.reduce((max, branch) => {
    const top = branch.height * 0.55;
    const bottom = branch.height * 0.45;
    return Math.max(max, top + bottom);
  }, 0);

  return {
    natural,
    branches,
    events,
    metrics: {
      srv: Math.round(srv),
      branches: branches.length,
      crossRatio: events.diversion ? events.crossing / events.diversion : events.crossing,
      avgEtched: avgEtched * 7.5,
      maxLength,
      maxHeight,
      proppantIndex: proppantSupport * (1 - screenoutRisk) * (0.65 + pressureDrive * 0.35),
      containmentIndex: heightContainment,
      pressureEfficiency
    },
    effectiveFriction,
    mechanics: {
      planeStrainModulus,
      stiffnessFactor,
      complianceFactor,
      toughnessFactor,
      leakoffFactor,
      heightContainment,
      pressureEfficiency
    }
  };
}

function nearestNatural(natural, ax, az, bx, bz) {
  let best = null;
  let bestDistance = Infinity;
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;

  for (const fracture of natural) {
    const dx = mx - fracture.x;
    const dz = mz - fracture.z;
    const along = dx * Math.cos(fracture.angle) + dz * Math.sin(fracture.angle);
    if (Math.abs(along) > fracture.length * 0.72) continue;
    const normal = Math.abs(-dx * Math.sin(fracture.angle) + dz * Math.cos(fracture.angle));
    const distance = normal + Math.abs(along) * 0.08;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { ...fracture, distance };
    }
  }
  return best;
}

function nearestNaturalDensity(natural, x, z) {
  let count = 0;
  for (const fracture of natural) {
    const d = Math.hypot(fracture.x - x, fracture.z - z);
    if (d < 7.5) count += 1;
  }
  return clamp(count / 8, 0, 1);
}

export function createReservoirScene(scene, network, params) {
  const group = new THREE.Group();
  group.name = 'fracture-network';

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(92, 92, 1, 1),
    new THREE.MeshBasicMaterial({ color: '#020506', side: THREE.DoubleSide })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.05;
  group.add(floor);

  const grid = new THREE.GridHelper(92, 46, '#003839', '#001719');
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.34;
  group.add(grid);

  group.add(createLithologyLayers(params, network.metrics.maxHeight));
  if (params.showNF) group.add(createNaturalFractures(network.natural));
  if (params.showStress) group.add(createStressShadow(network.branches));
  if (params.showLeakoff) group.add(createLeakoffCloud(network.branches, params));
  group.add(createHydraulicFractures(network.branches));
  group.add(createWellbore());

  scene.add(group);
  return group;
}

function createLithologyLayers(params, maxHeight) {
  const group = new THREE.Group();
  const layerContrast = params.layerContrast || 0;
  const halfHeight = Math.max(8, maxHeight * 0.64);
  const panelZ = -46;
  const colors = ['#13282a', '#1f3c32', '#2b2f36', '#15313a', '#273824'];
  const layers = [
    { y0: -halfHeight, y1: -halfHeight * 0.48, barrier: 0.35 },
    { y0: -halfHeight * 0.48, y1: -halfHeight * 0.16, barrier: 0.72 },
    { y0: -halfHeight * 0.16, y1: halfHeight * 0.18, barrier: 0.18 },
    { y0: halfHeight * 0.18, y1: halfHeight * 0.5, barrier: 0.82 },
    { y0: halfHeight * 0.5, y1: halfHeight, barrier: 0.42 }
  ];

  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i];
    const height = layer.y1 - layer.y0;
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(92, height),
      new THREE.MeshBasicMaterial({
        color: colors[i],
        transparent: true,
        opacity: 0.12 + layerContrast * layer.barrier * 0.14,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    wall.position.set(0, (layer.y0 + layer.y1) / 2, panelZ);
    group.add(wall);

    if (i > 0) {
      const barrier = new THREE.Mesh(
        new THREE.PlaneGeometry(92, 92),
        new THREE.MeshBasicMaterial({
          color: '#7cffd9',
          transparent: true,
          opacity: layerContrast * layer.barrier * 0.035,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      barrier.rotation.x = -Math.PI / 2;
      barrier.position.y = layer.y0;
      group.add(barrier);
    }
  }

  return group;
}

function createNaturalFractures(natural) {
  const positions = [];
  const colors = [];
  const cyanA = new THREE.Color('#00f5ff');
  const cyanB = new THREE.Color('#006d78');

  for (const fracture of natural) {
    const half = fracture.length / 2;
    const dx = Math.cos(fracture.angle) * half;
    const dz = Math.sin(fracture.angle) * half;
    positions.push(fracture.x - dx, 0.05, fracture.z - dz, fracture.x + dx, 0.05, fracture.z + dz);
    const color = cyanA.clone().lerp(cyanB, 0.65 - fracture.roughness * 0.35);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.82 });
  return new THREE.LineSegments(geometry, material);
}

function createHydraulicFractures(branches) {
  const positions = [];
  const colors = [];
  const indices = [];
  let offset = 0;
  const groups = new Map();
  const widths = branches.map((branch) => branch.width);
  const minWidth = Math.min(...widths);
  const maxWidth = Math.max(...widths);

  for (const branch of branches) {
    const key = branch.pathId || `${branch.event}-${groups.size}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(branch);
  }

  for (const group of groups.values()) {
    appendPrimaryRibbon(group, positions, colors, indices, () => offset, minWidth, maxWidth);
    offset = positions.length / 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.96
  });
  return new THREE.Mesh(geometry, material);
}

function appendPrimaryRibbon(branches, positions, colors, indices, getOffset, minWidth, maxWidth) {
  if (!branches.length) return;

  const ordered = [...branches];
  const stations = [{ point: ordered[0].from, branch: ordered[0] }].concat(
    ordered.map((branch) => ({ point: branch.to, branch }))
  );
  const startOffset = getOffset();

  for (let i = 0; i < stations.length; i += 1) {
    const current = stations[i];
    const previous = stations[Math.max(0, i - 1)].point;
    const next = stations[Math.min(stations.length - 1, i + 1)].point;
    const dx = next.x - previous.x || current.branch.to.x - current.branch.from.x;
    const dz = next.z - previous.z || current.branch.to.z - current.branch.from.z;
    const len = Math.hypot(dx, dz) || 1;
    const top = current.branch.height * 0.55;
    const bottom = -current.branch.height * 0.45;
    const widthT = (current.branch.width - minWidth) / Math.max(0.001, maxWidth - minWidth);
    const wideColor = widthColorRamp(widthT);
    const narrowEdgeColor = widthColorRamp(widthT * 0.82).lerp(new THREE.Color('#fff06a'), 0.12);

    positions.push(current.point.x, bottom, current.point.z);
    colors.push(narrowEdgeColor.r, narrowEdgeColor.g, narrowEdgeColor.b);
    positions.push(current.point.x, top, current.point.z);
    colors.push(wideColor.r, wideColor.g, wideColor.b);

    if (i > 0) {
      const a = startOffset + (i - 1) * 2;
      const b = a + 1;
      const c = startOffset + i * 2 + 1;
      const d = startOffset + i * 2;
      indices.push(a, b, c, a, c, d);
    }
  }
}

function createLeakoffCloud(branches, params) {
  const positions = [];
  const colors = [];
  const colorA = new THREE.Color('#44ff76');
  const colorB = new THREE.Color('#ffee48');
  const leakoffFactor = clamp((params.leakoffCoeff || 0.006) / 0.006, 0.12, 4.2);

  for (const branch of branches) {
    if (branch.acid < 0.16) continue;
    const dots = Math.round(2 + branch.acid * 5 + leakoffFactor * 1.2);
    for (let i = 0; i < dots; i += 1) {
      const t = (i + 0.5) / dots;
      const plume = params.acidStrength * 1.2 + leakoffFactor * 0.45;
      const x = branch.from.x + (branch.to.x - branch.from.x) * t + Math.sin(i * 7.1) * plume;
      const z = branch.from.z + (branch.to.z - branch.from.z) * t + Math.cos(i * 5.3) * plume;
      const y = 0.2 + Math.sin(t * Math.PI) * branch.height * 0.12;
      positions.push(x, y, z);
      const color = colorA.clone().lerp(colorB, branch.acid);
      colors.push(color.r, color.g, color.b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.9,
    vertexColors: true,
    transparent: true,
    opacity: 0.76,
    depthWrite: false
  });
  return new THREE.Points(geometry, material);
}

function createStressShadow(branches) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: '#162d47',
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  for (const branch of branches.filter((item) => item.generation < 2 && item.pressure > 0.2).slice(0, 18)) {
    const len = Math.hypot(branch.to.x - branch.from.x, branch.to.z - branch.from.z);
    const ellipse = new THREE.Mesh(new THREE.CircleGeometry(1, 42), material);
    ellipse.scale.set(len * 0.34 + 4, len * 0.1 + 2.8, 1);
    ellipse.position.set((branch.from.x + branch.to.x) / 2, 0.025, (branch.from.z + branch.to.z) / 2);
    ellipse.rotation.x = -Math.PI / 2;
    ellipse.rotation.z = Math.atan2(branch.to.z - branch.from.z, branch.to.x - branch.from.x);
    group.add(ellipse);
  }
  return group;
}

function createWellbore() {
  const group = new THREE.Group();
  const casing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 34, 24),
    new THREE.MeshBasicMaterial({ color: '#0fb7ff' })
  );
  casing.position.y = 5;
  group.add(casing);

  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.48, 34, 24),
    new THREE.MeshBasicMaterial({ color: '#7ce9ff', transparent: true, opacity: 0.22, depthWrite: false })
  );
  glow.position.y = 5;
  group.add(glow);

  const perfMaterial = new THREE.MeshBasicMaterial({ color: '#fff35a' });
  for (let i = 0; i < 6; i += 1) {
    const perf = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.08), perfMaterial);
    perf.position.set(0, -0.6 + i * 0.42, 0);
    perf.rotation.y = (i % 2) * Math.PI * 0.5;
    group.add(perf);
  }
  return group;
}

export function describeRegime(params, network) {
  const ratio = network.metrics.crossRatio;
  if (params.fractureToughness > 2.0 || params.leakoffCoeff > 0.016) {
    return '断裂韧性或滤失系数偏高时，裂缝尖端能量消耗增加，远端延伸和分支数量下降，近井酸蚀/滤失显示更强。';
  }
  if (params.layerContrast > 0.65) {
    return '岩性分层和隔层强度较高，裂缝高度被明显约束，主裂缝更倾向沿有利层横向扩展，层间穿透能力减弱。';
  }
  if (params.youngModulus > 48) {
    return '杨氏模量较高代表岩石更硬，缝宽减小、净压力利用率降低；若排量不足，裂缝更容易表现为窄而长的形态。';
  }
  if (params.acidStrength > 0.72 && params.netPressure < 12) {
    return '酸蚀增强但净压力不足，近井滤失和蚓孔发育占优，远端水力裂缝容易出现停滞。';
  }
  if (ratio > 1.2 && params.stressDiff > 9) {
    return '高应力差与较高净压力提高穿越概率，主裂缝更稳定，天然缝主要作为局部导流增强带。';
  }
  if (params.acidStrength > 0.48 && params.friction < 0.45) {
    return '酸液软化缝面并降低摩擦，偏转与分叉增强，灰岩储层更易形成复杂三维缝网。';
  }
  return '当前参数下水力裂缝、天然缝和酸蚀缝处于混合控制，扩展路径受局部逼近角与应力阴影共同调节。';
}
