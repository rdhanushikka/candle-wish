// A real 3D cake in a flat cartoon style: toon shading with thick black outlines.
import * as THREE from "three";

const INK = 0x141014;
const TIER_SHAPES = {
  1: [{ radius: 1, height: 0.95 }],
  2: [{ radius: 1, height: 0.68 }, { radius: 0.7, height: 0.55 }],
  3: [{ radius: 1, height: 0.52 }, { radius: 0.74, height: 0.43 }, { radius: 0.5, height: 0.38 }],
};
const DRIP_DEPTHS = [0.9, 0.5, 1, 0.65, 0.4, 0.95, 0.6, 0.8, 0.45, 1, 0.7];
const CANDLE_HEIGHT = 0.46;
const CANDLE_RADIUS = 0.058;
const WICK_HEIGHT = 0.06;
const FLAME_SIZE = 0.3;

const toonSteps = new THREE.DataTexture(new Uint8Array([135, 205, 255]), 3, 1, THREE.RedFormat);
toonSteps.minFilter = toonSteps.magFilter = THREE.NearestFilter;
toonSteps.needsUpdate = true;

function toon(color, map) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonSteps, map: map || null });
}

const outlineMaterials = new Map();
function outlineMaterial(thickness) {
  if (!outlineMaterials.has(thickness)) {
    const material = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `vec3 transformed = position + normal * ${thickness.toFixed(4)};`
      );
    };
    material.customProgramCacheKey = () => `outline-${thickness}`;
    outlineMaterials.set(thickness, material);
  }
  return outlineMaterials.get(thickness);
}

function addOutlined(parent, geometry, material, thickness = 0.02) {
  const mesh = new THREE.Mesh(geometry, material);
  parent.add(mesh);
  parent.add(new THREE.Mesh(geometry, outlineMaterial(thickness)));
  return mesh;
}

function lathe(points, segments = 48) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

// A box whose normals fan out from its center, so the outline has no gaps at the corners.
function softBox(width, height, depth) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  const outline = geometry.clone();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).normalize();
    outline.attributes.normal.setXYZ(i, v.x, v.y, v.z);
  }
  return { geometry, outline };
}

function addBox(parent, width, height, depth, material, thickness = 0.018) {
  const { geometry, outline } = softBox(width, height, depth);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  group.add(new THREE.Mesh(outline, outlineMaterial(thickness)));
  parent.add(group);
  return group;
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function stripeTexture([a, b]) {
  const texture = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = "#141014";
    ctx.fillRect(0, 0, w, 8);
    ctx.fillRect(0, h / 2, w, 8);
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.center.set(0.5, 0.5);
  texture.rotation = -0.62;
  texture.repeat.set(3, 3);
  return texture;
}

function glowTexture() {
  return canvasTexture(128, 128, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, "rgba(255,176,92,.8)");
    g.addColorStop(1, "rgba(255,176,92,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
}

function shadowTexture() {
  return canvasTexture(128, 128, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, w * 0.2, w / 2, w / 2, w / 2);
    g.addColorStop(0, "rgba(20,16,20,.2)");
    g.addColorStop(1, "rgba(20,16,20,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
}

function daisyTexture(fill) {
  return canvasTexture(256, 256, (ctx, w) => {
    ctx.translate(w / 2, w / 2);
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#141014";
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 4);
      ctx.beginPath();
      ctx.ellipse(0, -72, 30, 44, 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.fillStyle = "#f6b73c";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-10, -11, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#fffaf6";
    ctx.fill();
  });
}

function citrusTexture() {
  return canvasTexture(256, 256, (ctx, w) => {
    ctx.translate(w / 2, w / 2);
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#141014";
    ctx.beginPath();
    ctx.arc(0, 0, 118, 0, Math.PI * 2);
    ctx.fillStyle = "#f28a2e";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 96, 0, Math.PI * 2);
    ctx.fillStyle = "#fff3d6";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 88, 0, Math.PI * 2);
    ctx.fillStyle = "#f4633c";
    ctx.fill();
    ctx.strokeStyle = "#fff3d6";
    ctx.lineWidth = 7;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(-92, 0);
      ctx.lineTo(92, 0);
      ctx.stroke();
    }
  });
}

function heartTexture() {
  return canvasTexture(128, 128, (ctx) => {
    ctx.translate(64, 68);
    ctx.beginPath();
    ctx.moveTo(0, 42);
    ctx.bezierCurveTo(-62, 2, -46, -46, -16, -40);
    ctx.bezierCurveTo(-6, -38, 0, -28, 0, -22);
    ctx.bezierCurveTo(0, -28, 6, -38, 16, -40);
    ctx.bezierCurveTo(46, -46, 62, 2, 0, 42);
    ctx.fillStyle = "#f4633c";
    ctx.fill();
    ctx.lineWidth = 9;
    ctx.strokeStyle = "#141014";
    ctx.stroke();
  });
}

function flameShape(width, height) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.04 * height);
  shape.bezierCurveTo(-width * 1.25, 0.12 * height, -width * 0.75, 0.62 * height, 0, height);
  shape.bezierCurveTo(width * 0.75, 0.62 * height, width * 1.25, 0.12 * height, 0, -0.04 * height);
  return new THREE.ShapeGeometry(shape, 14);
}

// Frosting: a closed shell whose lower edge runs in drips around the tier.
function icingGeometry(radius, seed) {
  const outer = radius * 1.035;
  const drips = Math.max(7, Math.round(radius * 13));
  const columns = drips * 18;
  const depthAt = (theta) => {
    const position = (theta / (Math.PI * 2)) * drips;
    const lobe = Math.floor(position) % drips;
    const pulse = Math.pow(Math.sin(Math.PI * (position - Math.floor(position))), 1.5);
    return 0.05 + DRIP_DEPTHS[(lobe + seed) % DRIP_DEPTHS.length] * 0.2 * Math.max(0.65, radius) * pulse;
  };
  const rows = (theta) => {
    const d = depthAt(theta);
    return [
      [0, 0.035], [outer * 0.45, 0.035], [outer * 0.8, 0.032], [outer * 0.95, 0.024], [outer, 0.002],
      [outer, -d * 0.33], [outer, -d * 0.66], [outer, -d], [outer - 0.008, -d - 0.008],
      [radius + 0.004, -d - 0.004], [radius + 0.004, 0.0],
    ];
  };
  const rowCount = rows(0).length;
  const positions = [];
  for (let i = 0; i < columns; i++) {
    const theta = (i / columns) * Math.PI * 2;
    for (const [r, y] of rows(theta)) positions.push(r * Math.cos(theta), y, r * Math.sin(theta));
  }
  const indices = [];
  for (let i = 0; i < columns; i++) {
    const next = (i + 1) % columns;
    for (let j = 0; j < rowCount - 1; j++) {
      const a = i * rowCount + j, b = next * rowCount + j, c = i * rowCount + j + 1, d = next * rowCount + j + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildTier(parent, shape, y, config, index) {
  const { radius, height } = shape;
  const tier = new THREE.Group();
  tier.position.y = y;
  parent.add(tier);

  const sponge = toon(config.sponge);
  const frosting = toon(config.frosting);
  addOutlined(tier, lathe([[0, 0], [radius - 0.03, 0], [radius, 0.03], [radius, height], [0, height]], 72), sponge);

  const bandCount = height >= 0.6 ? 2 : 1;
  for (let i = 0; i < bandCount; i++) {
    const at = height * (bandCount === 2 ? 0.2 + i * 0.28 : 0.3);
    const t = Math.max(0.035, height * 0.05);
    addOutlined(tier, lathe([[radius - 0.01, at], [radius + 0.008, at + 0.002], [radius + 0.008, at + t - 0.002], [radius - 0.01, at + t]], 72), frosting, 0.009);
  }

  const icing = new THREE.Group();
  icing.position.y = height;
  tier.add(icing);
  addOutlined(icing, icingGeometry(radius, index * 3), frosting);
  return y + height;
}

function buildPlate(parent) {
  const white = toon(0xfffaf6);
  addOutlined(parent, lathe([[0, 0], [1.14, 0], [1.26, 0.035], [1.28, 0.06], [1.2, 0.06], [1.08, 0.04], [0, 0.04]], 72), white);
}

function buildGift(parent, x, z, size, spin, box, ribbon) {
  const gift = new THREE.Group();
  gift.position.set(x, size / 2, z);
  gift.rotation.y = spin;
  parent.add(gift);
  const boxMaterial = toon(box), ribbonMaterial = toon(ribbon);
  addBox(gift, size, size, size, boxMaterial);
  addBox(gift, size * 0.2, size * 1.01, size * 1.01, ribbonMaterial, 0.008);
  addBox(gift, size * 1.01, size * 1.01, size * 0.2, ribbonMaterial, 0.008);
  const lid = addBox(gift, size * 1.1, size * 0.2, size * 1.1, boxMaterial);
  lid.position.y = size * 0.46;
  const lidBandA = addBox(gift, size * 0.2, size * 0.21, size * 1.11, ribbonMaterial, 0.006);
  lidBandA.position.y = size * 0.46;
  const lidBandB = addBox(gift, size * 1.11, size * 0.21, size * 0.2, ribbonMaterial, 0.006);
  lidBandB.position.y = size * 0.46;
  for (const direction of [-1, 1]) {
    const bow = new THREE.Group();
    bow.position.set(direction * size * 0.15, size * 0.66, 0);
    bow.rotation.set(Math.PI / 2 - 0.4, direction * 0.5, 0);
    gift.add(bow);
    addOutlined(bow, new THREE.TorusGeometry(size * 0.14, size * 0.05, 10, 24), ribbonMaterial, 0.009);
  }
  addShadow(parent, x, z, size * 1.2);
}

function buildCupcake(parent, x, z, size, frostingColor, cherry = 0xe63c4f) {
  const cupcake = new THREE.Group();
  cupcake.position.set(x, 0, z);
  cupcake.scale.setScalar(size);
  parent.add(cupcake);
  addOutlined(cupcake, lathe([[0, 0], [0.34, 0], [0.48, 0.42], [0.5, 0.48], [0, 0.48]], 16), toon(0xc9a3ee), 0.022);
  const profile = [[0.5, 0.46], [0.56, 0.56], [0.46, 0.66], [0.47, 0.72], [0.3, 0.86], [0.3, 0.92], [0.13, 1.08], [0, 1.14]];
  addOutlined(cupcake, lathe([[0, 0.46], ...profile], 32), toon(frostingColor), 0.022);
  const top = new THREE.Group();
  top.position.y = 1.2;
  cupcake.add(top);
  addOutlined(top, new THREE.SphereGeometry(0.11, 16, 12), toon(cherry), 0.022);
  addShadow(parent, x, z, size * 1.4);
}

const SHARED = {};
function shared(name, make) {
  return SHARED[name] || (SHARED[name] = make());
}

function addShadow(parent, x, z, size) {
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 1.5, size * 1.5),
    new THREE.MeshBasicMaterial({ map: shared("shadow", shadowTexture), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(x, -0.005, z);
  parent.add(shadow);
}

// Rings of candles over the top tier, in the same order on every device.
function layoutCandles(count, topRadius) {
  if (count === 1) return { scale: Math.min(1, topRadius * 1.3), spots: [{ x: 0, z: 0 }] };
  const rings = [];
  let left = count;
  let ringRadius = 0.78;
  const spacing = Math.min(0.5, 0.78 / Math.ceil(Math.sqrt(count / 3)));
  while (left > 0) {
    const fits = Math.max(1, Math.floor((Math.PI * 2 * ringRadius) / (spacing * 0.92)));
    const take = ringRadius < 0.12 ? left : Math.min(left, fits);
    rings.push({ radius: ringRadius < 0.12 ? 0 : ringRadius, take });
    left -= take;
    ringRadius -= spacing;
    if (ringRadius < 0) ringRadius = 0;
  }
  const spots = [];
  rings.forEach((ring, r) => {
    for (let i = 0; i < ring.take; i++) {
      const angle = (i / ring.take) * Math.PI * 2 + r * 0.6 + Math.PI / 2;
      spots.push({ x: Math.cos(angle) * ring.radius * topRadius, z: Math.sin(angle) * ring.radius * topRadius });
    }
  });
  const scale = Math.min(1, Math.max(0.26, topRadius * Math.sqrt(6 / count) * 1.05));
  return { scale, spots };
}

// Flowers and citrus stay beside the cake while it turns, so they never cover the candles.
const BLOOMS = [
  { kind: "daisy", x: -1.68, y: 0.72, size: 0.5, fill: "#f4a9c4" },
  { kind: "citrus", x: -1.92, y: 0.42, size: 0.42 },
  { kind: "daisy", x: -1.3, y: 0.98, size: 0.36, fill: "#ffd84d" },
  { kind: "daisy", x: -1.86, y: 0.16, size: 0.42, fill: "#fffaf6" },
  { kind: "citrus", x: 1.42, y: 0.96, size: 0.38 },
  { kind: "daisy", x: 1.8, y: 0.68, size: 0.48, fill: "#fffaf6" },
  { kind: "daisy", x: 1.94, y: 0.36, size: 0.36, fill: "#ffd84d" },
  { kind: "citrus", x: 1.72, y: 0.12, size: 0.36 },
];

export class CakeScene {
  constructor(host, config, { interactive = true, spin = true, props = true } = {}) {
    this.host = host;
    this.props = props;
    this.spin = spin && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.candles = [];
    this.yaw = 0.45;
    this.yawVelocity = 0;
    this.pitch = 0.32;
    this.celebrating = false;
    this.bloomLevel = 0;
    this.hop = 0;
    this.hopVelocity = 0;
    this.onPick = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    host.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.45);
    sun.position.set(-2.5, 5, 4);
    this.scene.add(sun);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.halo = new THREE.Group();
    this.scene.add(this.halo);
    this.raycaster = new THREE.Raycaster();
    this.billboard = new THREE.Quaternion();

    this.flameGeometry = {
      ink: flameShape(0.28, 1.1),
      outer: flameShape(0.23, 1),
      inner: flameShape(0.12, 0.58),
    };
    this.flameMaterial = {
      ink: new THREE.MeshBasicMaterial({ color: INK }),
      outer: new THREE.MeshBasicMaterial({ color: 0xc9281b }),
      inner: new THREE.MeshBasicMaterial({ color: 0xf58a2c }),
    };

    this.build(config);
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    if (interactive) this.bindPointer();
  }

  disposeContents() {
    this.root.traverse((object) => {
      object.geometry?.dispose?.();
      const material = object.material;
      const keep = [...outlineMaterials.values(), ...Object.values(this.flameMaterial)].includes(material);
      if (material && !keep) {
        if (material.map && !Object.values(SHARED).includes(material.map)) material.map.dispose();
        material.dispose();
      }
    });
    this.root.clear();
    this.flameGeometry = {
      ink: flameShape(0.28, 1.1),
      outer: flameShape(0.23, 1),
      inner: flameShape(0.12, 0.58),
    };
  }

  build(config) {
    this.disposeContents();
    this.config = config;
    const shapes = TIER_SHAPES[config.tiers];

    addShadow(this.root, 0, 0, 2.2);
    buildPlate(this.root);
    let y = 0.04;
    shapes.forEach((shape, i) => { y = buildTier(this.root, shape, y, config, i) + 0.002; });
    this.cakeTop = y;

    if (this.props) {
      buildGift(this.root, -1.72, 0.72, 0.5, 0.4, 0x4fb2ea, 0xf4a9c4);
      buildGift(this.root, 1.74, 0.5, 0.42, -0.35, 0xcdb8f0, 0xffd84d);
      buildGift(this.root, 0.3, -1.85, 0.46, 0.8, 0xffd84d, 0xf4633c);
      buildCupcake(this.root, 1.32, 1.42, 0.34, 0xf4a9c4);
      buildCupcake(this.root, -1.12, 1.56, 0.3, 0xfffaf6, 0x4fb2ea);
      buildCupcake(this.root, -1.55, -1.12, 0.34, 0x8a5a3c);
    }

    this.buildCandles(config, shapes[shapes.length - 1].radius);
    this.buildBlooms();
    this.fit();
  }

  buildCandles(config, topRadius) {
    const { scale, spots } = layoutCandles(config.candles, topRadius);
    const stripes = stripeTexture(config.candleColors);
    const waxMaterial = toon(0xffffff, stripes);
    const whipMaterial = toon(0xfffaf6);
    const body = lathe([[0, 0], [CANDLE_RADIUS, 0], [CANDLE_RADIUS, CANDLE_HEIGHT * 0.5], [CANDLE_RADIUS, CANDLE_HEIGHT], [0, CANDLE_HEIGHT]], 24);
    const whip = lathe([[0, 0], [0.12, 0], [0.145, 0.018], [0.12, 0.045], [0, 0.05]], 12);
    const wick = new THREE.CylinderGeometry(0.008, 0.008, WICK_HEIGHT, 6);
    const wickMaterial = new THREE.MeshBasicMaterial({ color: INK });
    const proxy = new THREE.CylinderGeometry(0.1, 0.1, CANDLE_HEIGHT + FLAME_SIZE, 8);
    const proxyMaterial = new THREE.MeshBasicMaterial();
    const glow = shared("glow", glowTexture);
    const heart = shared("heart", heartTexture);

    this.candles = spots.map((spot, index) => {
      const group = new THREE.Group();
      group.position.set(spot.x, this.cakeTop + 0.03, spot.z);
      group.scale.setScalar(scale);
      this.root.add(group);

      addOutlined(group, whip, whipMaterial, 0.012);
      addOutlined(group, body, waxMaterial, 0.012);
      const wickMesh = new THREE.Mesh(wick, wickMaterial);
      wickMesh.position.y = CANDLE_HEIGHT + WICK_HEIGHT / 2;
      group.add(wickMesh);

      const flame = new THREE.Group();
      flame.position.y = CANDLE_HEIGHT + WICK_HEIGHT * 0.7;
      group.add(flame);
      const layers = ["ink", "outer", "inner"].map((name, depth) => {
        const mesh = new THREE.Mesh(this.flameGeometry[name], this.flameMaterial[name]);
        mesh.matrixAutoUpdate = false;
        mesh.userData.depth = depth * 0.002;
        flame.add(mesh);
        return mesh;
      });
      const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false }));
      glowSprite.scale.setScalar(0.75);
      glowSprite.position.y = FLAME_SIZE * 0.4;
      flame.add(glowSprite);

      const ember = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xf0802c, transparent: true, opacity: 0 })
      );
      ember.position.y = CANDLE_HEIGHT + WICK_HEIGHT;
      group.add(ember);

      const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: heart, transparent: true }));
      mark.scale.setScalar(0.17);
      mark.position.set(CANDLE_RADIUS + 0.09, CANDLE_HEIGHT * 0.72, 0);
      mark.visible = false;
      group.add(mark);

      const hit = new THREE.Mesh(proxy, proxyMaterial);
      hit.visible = false;
      hit.position.y = (CANDLE_HEIGHT + FLAME_SIZE) / 2;
      hit.userData.candle = index;
      group.add(hit);

      return {
        index,
        group, flame, layers, glowSprite, ember, mark, hit,
        baseScale: scale,
        pop: 0,
        highlighted: false,
        seed: index * 7.3 + 1,
        toughness: 0.8 + ((index * 37) % 10) * 0.05,
        life: 1, grow: 0, lit: true, relightAt: 0, emberLevel: 0,
      };
    });
  }

  buildBlooms() {
    this.halo.clear();
    this.blooms = BLOOMS.map((b, i) => {
      const texture = b.kind === "daisy" ? shared(`daisy${b.fill}`, () => daisyTexture(b.fill)) : shared("citrus", citrusTexture);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
      sprite.scale.setScalar(0.0001);
      sprite.userData = { size: b.size, delay: i * 0.06, x: b.x, y: b.y };
      this.halo.add(sprite);
      return sprite;
    });
  }

  // Moves the camera back until the whole scene fits in the frame at the current tilt.
  fit() {
    const candleScale = this.candles[0]?.baseScale || 1;
    const reach = this.cakeTop + (CANDLE_HEIGHT + WICK_HEIGHT + FLAME_SIZE) * candleScale;
    const candleSpread = Math.max(0.2, ...this.candles.map((c) => Math.hypot(c.group.position.x, c.group.position.z)));
    const box = this.host.getBoundingClientRect();
    this.camera.aspect = Math.max(0.3, box.width / Math.max(1, box.height));
    this.camera.updateProjectionMatrix();

    const sceneRadius = this.props ? 2.2 : 1.45;
    // On narrow screens the gifts can run off the sides, but the cake and plate always fit.
    const widthRadius = this.camera.aspect < 0.75 ? 1.45 : sceneRadius;
    const rings = [
      { radius: sceneRadius, y: 0, width: false },
      { radius: sceneRadius, y: Math.min(reach, 0.7), width: false },
      { radius: widthRadius, y: 0, width: true },
      { radius: widthRadius, y: Math.min(reach, 0.7), width: true },
      // The tallest point of any candle, including its glow and when picked, at any turn.
      { radius: candleSpread + 0.14 * candleScale, y: reach + 0.28 * candleScale, width: false },
    ];
    const samples = rings.flatMap((ring) => Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 16) * Math.PI * 2;
      return { point: new THREE.Vector3(Math.cos(angle) * ring.radius, ring.y, Math.sin(angle) * ring.radius), width: ring.width };
    }));
    const projected = new THREE.Vector3();
    const measure = () => {
      this.placeCamera();
      this.camera.updateMatrixWorld();
      let top = -Infinity, bottom = Infinity, side = 0;
      for (const { point, width } of samples) {
        projected.copy(point).project(this.camera);
        if (width) side = Math.max(side, Math.abs(projected.x));
        top = Math.max(top, projected.y);
        bottom = Math.min(bottom, projected.y);
      }
      return { top, bottom, side };
    };

    this.centerY = reach / 2;
    let near = 2, far = 60;
    for (let i = 0; i < 18; i++) {
      this.distance = (near + far) / 2;
      const { top, bottom, side } = measure();
      this.centerY += ((top + bottom) / 2) * this.distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      if (Math.max((top - bottom) / 2, side) > 0.94) near = this.distance;
      else far = this.distance;
    }
    this.distance = far;
    measure();
    const spread = widthRadius / sceneRadius;
    for (const sprite of this.blooms) {
      const { x: bloomX, y: bloomY } = sprite.userData;
      sprite.position.set(bloomX * Math.max(spread, 0.72), reach * bloomY + 0.1, 0.1);
    }
  }

  placeCamera() {
    const { distance, pitch, centerY } = this;
    this.camera.position.set(0, centerY + Math.sin(pitch) * distance, Math.cos(pitch) * distance);
    this.camera.lookAt(0, centerY, 0);
  }

  resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.fit();
  }

  bindPointer() {
    const el = this.renderer.domElement;
    let drag = null;
    el.addEventListener("pointerdown", (event) => {
      drag = { x: event.clientX, y: event.clientY, moved: 0, lastX: event.clientX, lastY: event.clientY };
      el.setPointerCapture(event.pointerId);
      el.classList.add("dragging");
    });
    el.addEventListener("pointermove", (event) => {
      if (!drag) {
        el.classList.toggle("over-candle", this.pick(event.clientX, event.clientY) !== null);
        return;
      }
      const dx = event.clientX - drag.lastX, dy = event.clientY - drag.lastY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      this.yaw += dx * 0.009;
      this.yawVelocity = dx * 0.5;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, 0.12, 0.75);
      this.fit();
    });
    const release = (event) => {
      if (!drag) return;
      const clicked = drag.moved < 7;
      drag = null;
      el.classList.remove("dragging");
      if (clicked) {
        this.yawVelocity = 0;
        const index = this.pick(event.clientX, event.clientY);
        if (index !== null) this.onPick?.(index);
      }
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", () => { drag = null; el.classList.remove("dragging"); });
    this.dragging = () => drag !== null;
  }

  pick(clientX, clientY) {
    const box = this.renderer.domElement.getBoundingClientRect();
    const point = new THREE.Vector2(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1);
    this.raycaster.setFromCamera(point, this.camera);
    const hits = this.raycaster.intersectObjects(this.candles.map((c) => c.hit), false);
    return hits.length ? hits[0].object.userData.candle : null;
  }

  // Screen position of a candle's wick, for drawing smoke over the page.
  wickPoint(candle) {
    const box = this.renderer.domElement.getBoundingClientRect();
    const v = candle.ember.getWorldPosition(new THREE.Vector3()).project(this.camera);
    return { x: box.left + ((v.x + 1) / 2) * box.width, y: box.top + ((1 - v.y) / 2) * box.height };
  }

  setMarked(index, marked) {
    if (this.candles[index]) this.candles[index].mark.visible = marked;
  }

  setHighlight(index) {
    this.candles.forEach((c) => { c.highlighted = c.index === index; });
  }

  // Turns the cake so a chosen candle faces the viewer.
  faceCandle(index) {
    const candle = this.candles[index];
    if (!candle || (candle.group.position.x === 0 && candle.group.position.z === 0)) return;
    this.targetYaw = Math.atan2(-candle.group.position.x, candle.group.position.z);
  }

  setCelebrating(on, animated = true) {
    this.celebrating = on;
    if (on && animated) this.hopVelocity = 4.2;
    if (!animated) this.bloomLevel = on ? 3 : 0;
    this.bloomTime = 0;
  }

  render(time, dt, wind, calm = 1) {
    const dragging = this.dragging?.();
    if (!dragging) {
      if (this.targetYaw !== undefined) {
        const delta = Math.atan2(Math.sin(this.targetYaw - this.yaw), Math.cos(this.targetYaw - this.yaw));
        this.yaw += delta * Math.min(1, dt * 5);
        if (Math.abs(delta) < 0.01) this.targetYaw = undefined;
      } else {
        this.yaw += this.yawVelocity * dt;
        this.yawVelocity *= 1 - Math.min(1, dt * 3);
        if (this.spin && !this.paused) this.yaw += dt * 0.16;
      }
    }
    this.root.rotation.y = this.yaw;

    this.hopVelocity += (-this.hop * 60 - this.hopVelocity * 7) * dt;
    this.hop += this.hopVelocity * dt;
    this.root.position.y = Math.max(0, this.hop) * 0.3;
    this.root.scale.set(1 - this.hop * 0.12, 1 + this.hop * 0.16, 1 - this.hop * 0.12);

    this.bloomTime = (this.bloomTime || 0) + dt;
    for (const sprite of this.blooms) {
      const target = this.celebrating && this.bloomTime > sprite.userData.delay + 0.3 ? sprite.userData.size : 0.0001;
      const current = sprite.scale.x;
      const velocity = (sprite.userData.velocity || 0) + (target - current) * 90 * dt - (sprite.userData.velocity || 0) * 9 * dt;
      sprite.userData.velocity = velocity;
      sprite.scale.setScalar(Math.max(0.0001, current + velocity * dt));
      sprite.material.rotation = Math.sin(time * 0.8 + sprite.userData.delay * 20) * 0.12;
    }

    // Flames always face the camera, so undo the turn of everything above them.
    this.scene.updateMatrixWorld();
    const cameraQuaternion = this.camera.getWorldQuaternion(this.billboard);
    const parentQuaternion = new THREE.Quaternion();
    for (const c of this.candles) {
      c.pop += ((c.highlighted ? 1 : 0) - c.pop) * Math.min(1, dt * 10);
      c.group.scale.setScalar(c.baseScale * (1 + c.pop * 0.28));
      c.ember.material.opacity = c.emberLevel;
      this.drawFlame(c, time, c.lit ? wind : 0, calm, cameraQuaternion, parentQuaternion);
    }

    this.renderer.render(this.scene, this.camera);
  }

  drawFlame(c, time, gust, calm, cameraQuaternion, parentQuaternion) {
    if (c.grow <= 0.001) {
      c.flame.visible = false;
      return;
    }
    c.flame.visible = true;
    c.group.getWorldQuaternion(parentQuaternion);
    c.flame.quaternion.copy(parentQuaternion.invert().multiply(cameraQuaternion));

    const t = time + c.seed;
    const flicker = (Math.sin(t * 9.1) * 0.5 + Math.sin(t * 15.7 + 1.2) * 0.3 + Math.sin(t * 23.3) * 0.2) * calm;
    const sway = (Math.sin(t * 3.1) * 0.05 + Math.sin(t * 7.7) * 0.03) * calm;
    const shake = gust > 0 ? Math.sin(t * 41) * gust * 0.14 : 0;
    const lean = sway + shake + gust * 0.62;
    const size = FLAME_SIZE * c.grow * (0.42 + 0.58 * c.life) * (1 - gust * 0.22);
    const height = size * (1 + flicker * 0.09);
    const width = size * (1 - flicker * 0.08);

    for (const layer of c.layers) {
      layer.matrix.set(width, lean * height, 0, 0, 0, height, 0, 0, 0, 0, 1, layer.userData.depth, 0, 0, 0, 1);
      layer.matrixWorldNeedsUpdate = true;
    }
    c.glowSprite.material.opacity = (0.75 + flicker * 0.18) * c.grow * (0.4 + 0.6 * c.life);
  }
}
