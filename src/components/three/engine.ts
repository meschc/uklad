import * as THREE from "three";
import { clamp } from "@/lib/utils";
import type { Box, CellBox, SceneData, SceneLabel } from "@/lib/scene3d";

/**
 * Движок 3D-вида (ТЗ, разд. 3.7): чистый Three.js + InstancedMesh.
 *
 * Камера — ортографическая с ЖЁСТКО заданным изометрическим направлением:
 * зум и панорама есть, свободного вращения нет by design.
 */

/**
 * Изометрия: наклон камеры к горизонту ФИКСИРОВАН (классические ~35.26°, как у
 * направления 1,1,1), а поворот вокруг вертикальной оси (yaw) пользователь
 * крутит правой кнопкой — влево-вправо, угол наклона при этом не меняется.
 */
const ISO_ELEV = Math.atan(1 / Math.SQRT2);
/** Стартовый yaw 45° даёт ровно исходное направление (1,1,1). */
const ISO_YAW_0 = Math.PI / 4;
/** Камера ортографическая, поэтому расстояние влияет только на клиппинг. */
const CAM_DIST = 400;
/** Высота видимой области в мировых единицах при zoom = 1. */
const FRUSTUM = 20;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 12;

/**
 * Предел одновременно рисуемых занятых ячеек (ТЗ, разд. 3.7: «при большом
 * количестве объектов показываем только ближайшие к камере, остальные
 * скрываем»). Значение демонстрационное: подобрано так, чтобы отсечение было
 * видно на тиражированном складе, а не осталось теорией.
 */
const MAX_VISIBLE_CELLS = 12000;

// Стиль «цифрового двойника» (рефы): белые стеллажи, светлая сцена; единый
// синий непрозрачный блок ячейки — как контейнеры на порт-рефе.
// `struct` — множитель для инстансных цветов структуры (пол, земля, балки,
// лестницы): в тёмной теме он гасит их, иначе площадка светит белым пятном.
const THEME = {
  light: {
    slab: 0xdfe6ef,
    shelf: 0xc4cfdd,
    section: 0xdbe3ec,
    wall: 0xffffff,
    struct: 0xffffff,
  },
  dark: {
    slab: 0x2b3648,
    shelf: 0x8b98ab,
    section: 0x9fb0c7,
    wall: 0x93a2b8,
    struct: 0x3f4a5c,
  },
};
/** Занятая ячейка — синий «контейнер», свободная — светлый пустой слот. */
const CELL_COLOR = 0x3b82f6;
const FREE_CELL_LIGHT = 0xdde4ed;
const FREE_CELL_DARK = 0x59657a;

export interface EngineCallbacks {
  onDensity: (shown: number, total: number) => void;
}

export class Engine {
  private host: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private raycaster = new THREE.Raycaster();
  private target = new THREE.Vector3();
  /** Текущий поворот вокруг вертикальной оси (правая кнопка мыши). */
  private yaw = ISO_YAW_0;
  private boxGeo = new THREE.BoxGeometry(1, 1, 1);

  private slabMat: THREE.MeshLambertMaterial;
  private shelfMat: THREE.MeshLambertMaterial;
  private sectionMat: THREE.MeshLambertMaterial;
  private structMat: THREE.MeshLambertMaterial;
  private productMat: THREE.MeshLambertMaterial;
  private buildingMat: THREE.MeshLambertMaterial;

  private key: THREE.DirectionalLight;
  private meshes: THREE.InstancedMesh[] = [];
  private lines: THREE.LineSegments[] = [];
  private sprites: THREE.Sprite[] = [];
  private cellsMesh: THREE.InstancedMesh | null = null;
  private selectionBox: THREE.LineSegments;

  private data: SceneData | null = null;
  /** instanceId → индекс в data.cells (порядок меняется при отсечении). */
  private order: number[] = [];

  private raf = 0;
  private dirty = true;
  private densityDirty = true;
  private ro: ResizeObserver;
  private cb: EngineCallbacks;
  private dark = false;

  constructor(host: HTMLElement, cb: EngineCallbacks) {
    this.host = host;
    this.cb = cb;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);

    // «Бумажное» освещение: ровный матовый свет с мягким тёплым верхом и
    // прохладным низом; направленный ключ приглушён, чтобы грани читались, но
    // сцена оставалась плоской и спокойной, без резких бликов.
    this.scene.add(new THREE.HemisphereLight(0xfffdf6, 0x9aa2b0, 2.1));
    this.key = new THREE.DirectionalLight(0xfff7ea, 1.25);
    this.key.position.set(6, 12, 8);
    this.scene.add(this.key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.3);
    rim.position.set(-8, 4, -6);
    this.scene.add(rim);

    this.slabMat = new THREE.MeshLambertMaterial({ color: THEME.light.slab });
    this.shelfMat = new THREE.MeshLambertMaterial({ color: THEME.light.shelf });
    // Корпус секции — стеклянный: не пишем глубину, иначе он скроет свой товар.
    this.sectionMat = new THREE.MeshLambertMaterial({
      color: THEME.light.section,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    this.structMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    // Цвет ячейки задаётся на инстанс (занята/свободна), поэтому базовый
    // цвет материала — белый множитель.
    this.productMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    // Стены корпуса — почти прозрачная плёнка поверх всего.
    this.buildingMat = new THREE.MeshLambertMaterial({
      color: THEME.light.wall,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    });

    const edges = new THREE.EdgesGeometry(this.boxGeo);
    this.selectionBox = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x0f172a, depthTest: false }),
    );
    this.selectionBox.visible = false;
    this.selectionBox.renderOrder = 999;
    this.scene.add(this.selectionBox);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();

    this.loop();
  }

  // --- размеры / камера -----------------------------------------------------

  private get width() {
    return Math.max(1, this.host.clientWidth);
  }
  private get height() {
    return Math.max(1, this.host.clientHeight);
  }

  private resize() {
    const w = this.width;
    const h = this.height;
    // updateStyle обязателен: при pixelRatio 2 канвас иначе растянется вдвое.
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.left = (-FRUSTUM * aspect) / 2;
    this.camera.right = (FRUSTUM * aspect) / 2;
    this.camera.top = FRUSTUM / 2;
    this.camera.bottom = -FRUSTUM / 2;
    this.applyCamera();
  }

  /** Направление на камеру при текущем повороте (наклон неизменный). */
  private isoDir() {
    const c = Math.cos(ISO_ELEV);
    return new THREE.Vector3(Math.sin(this.yaw) * c, Math.sin(ISO_ELEV), Math.cos(this.yaw) * c);
  }

  /** Поворот сцены вокруг вертикальной оси: dx в пикселях перетаскивания. */
  rotateBy(dx: number) {
    this.yaw += dx * 0.008;
    this.applyCamera();
  }

  private applyCamera() {
    this.camera.position.copy(this.target).addScaledVector(this.isoDir(), CAM_DIST);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.dirty = true;
    this.densityDirty = true;
  }

  fit() {
    if (!this.data) return;
    const [cx, cy, cz] = this.data.center;
    this.target.set(cx, cy, cz);
    // Изометрия растягивает габаритный куб по диагонали — отсюда запас.
    const s = Math.max(0.001, this.data.span * 1.15);
    const aspect = this.width / this.height;
    const zoom = Math.min(FRUSTUM / s, (FRUSTUM * aspect) / s);
    this.camera.zoom = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
    this.applyCamera();
  }

  get zoom() {
    return this.camera.zoom;
  }

  zoomBy(factor: number) {
    this.camera.zoom = clamp(this.camera.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    this.applyCamera();
  }

  /** Зум к точке под курсором: мир под курсором остаётся на месте. */
  zoomAt(clientX: number, clientY: number, factor: number) {
    const before = this.groundAt(clientX, clientY);
    this.camera.zoom = clamp(this.camera.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    const after = this.groundAt(clientX, clientY);
    if (before && after) this.target.add(before.sub(after));
    this.applyCamera();
  }

  panBy(dx: number, dy: number) {
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const perPx = FRUSTUM / this.camera.zoom / this.height;
    this.target.addScaledVector(right, -dx * perPx);
    this.target.addScaledVector(up, dy * perPx);
    this.applyCamera();
  }

  private ndc(clientX: number, clientY: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    );
  }

  /** Точка на горизонтальной плоскости уровня target — опора для зума. */
  private groundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.target.y);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, hit) ? hit : null;
  }

  // --- сборка сцены ---------------------------------------------------------

  setTheme(dark: boolean) {
    if (this.dark === dark) return;
    this.dark = dark;
    const t = dark ? THEME.dark : THEME.light;
    this.slabMat.color.setHex(t.slab);
    this.shelfMat.color.setHex(t.shelf);
    this.sectionMat.color.setHex(t.section);
    this.buildingMat.color.setHex(t.wall);
    this.structMat.color.setHex(t.struct);
    // Цвет свободных ячеек зависит от темы — пересчитываем инстансы.
    this.densityDirty = true;
    (this.selectionBox.material as THREE.LineBasicMaterial).color.setHex(
      dark ? 0xffffff : 0x0f172a,
    );
    this.dirty = true;
  }

  build(data: SceneData) {
    const first = !this.data;
    this.clearMeshes();
    this.data = data;

    const add = (boxes: Box[], mat: THREE.Material, colored: boolean, capacity = boxes.length) => {
      if (!boxes.length) return null;
      const mesh = new THREE.InstancedMesh(this.boxGeo, mat, capacity);
      mesh.frustumCulled = false;
      if (!colored) fillMatrices(mesh, boxes);
      this.scene.add(mesh);
      this.meshes.push(mesh);
      return mesh;
    };

    add(data.slabs, this.slabMat, false);
    add(data.shelves, this.shelfMat, false);
    const shells = add(data.sections, this.sectionMat, false);
    // Прозрачный корпус рисуем последним, поверх содержимого.
    if (shells) shells.renderOrder = 10;
    const building = add(data.building, this.buildingMat, false);
    if (building) building.renderOrder = 12;
    this.addBuildingEdges(data.building);
    this.addLabels(data.labels);

    const structure = add(data.structure, this.structMat, true);
    if (structure) {
      fillMatrices(structure, data.structure);
      data.structure.forEach((b, i) => structure.setColorAt(i, new THREE.Color(b.color)));
      if (structure.instanceColor) structure.instanceColor.needsUpdate = true;
    }

    // Ячейки — единственный слой с отсечением по дальности, поэтому их
    // вместимость ограничена, а матрицы заполняются в updateDensity().
    this.cellsMesh = add(
      data.cells,
      this.productMat,
      true,
      Math.min(data.cells.length, MAX_VISIBLE_CELLS),
    );
    this.densityDirty = true;
    this.dirty = true;
    if (first) this.fit();
  }

  /** Крепкий контур корпуса: на рефах здание читается рёбрами, не заливкой. */
  private addBuildingEdges(boxes: Box[]) {
    if (!boxes.length) return;
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b.cx - b.sx / 2);
      maxX = Math.max(maxX, b.cx + b.sx / 2);
      minY = Math.min(minY, b.cy - b.sy / 2);
      maxY = Math.max(maxY, b.cy + b.sy / 2);
      minZ = Math.min(minZ, b.cz - b.sz / 2);
      maxZ = Math.max(maxZ, b.cz + b.sz / 2);
    }
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.boxGeo),
      new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.5 }),
    );
    edges.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    edges.scale.set(maxX - minX, maxY - minY, maxZ - minZ);
    this.scene.add(edges);
    this.lines.push(edges);
  }

  /**
   * Отсечение по плотности (ТЗ, разд. 3.7): при большом числе занятых ячеек
   * рисуем только ближайшие к камере. Пересчитывается при движении камеры.
   */
  private updateDensity() {
    const mesh = this.cellsMesh;
    const boxes: CellBox[] = this.data?.cells ?? [];
    if (!mesh || !boxes.length) {
      this.order = [];
      this.cb.onDensity(0, boxes.length);
      return;
    }

    let order = boxes.map((_, i) => i);
    if (boxes.length > MAX_VISIBLE_CELLS) {
      const cam = this.camera.position;
      order.sort((a, b) => distSq(boxes[a], cam) - distSq(boxes[b], cam));
      order = order.slice(0, MAX_VISIBLE_CELLS);
    }
    this.order = order;

    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const busy = new THREE.Color(CELL_COLOR);
    const free = new THREE.Color(this.dark ? FREE_CELL_DARK : FREE_CELL_LIGHT);
    order.forEach((bi, i) => {
      const b = boxes[bi];
      m.compose(pos.set(b.cx, b.cy, b.cz), q, scl.set(b.sx, b.sy, b.sz));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, b.productId ? busy : free);
    });
    mesh.count = order.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    this.cb.onDensity(order.length, boxes.length);
  }

  // --- выбор ----------------------------------------------------------------

  pick(clientX: number, clientY: number): CellBox | null {
    const mesh = this.cellsMesh;
    if (!mesh || !this.data) return null;
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const hits = this.raycaster.intersectObject(mesh, false);
    for (const h of hits) {
      if (h.instanceId === undefined) continue;
      const bi = this.order[h.instanceId];
      if (bi === undefined) continue;
      return this.data.cells[bi];
    }
    return null;
  }

  setSelected(productId: string | null) {
    const box = productId ? this.data?.cells.find((p) => p.productId === productId) : undefined;
    if (!box) {
      this.selectionBox.visible = false;
    } else {
      this.selectionBox.visible = true;
      this.selectionBox.position.set(box.cx, box.cy, box.cz);
      this.selectionBox.scale.set(box.sx * 1.06, box.sy * 1.06, box.sz * 1.06);
    }
    this.dirty = true;
  }

  // --- жизненный цикл -------------------------------------------------------

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.dirty) return;
    this.dirty = false;
    if (this.densityDirty) {
      this.densityDirty = false;
      this.updateDensity();
    }
    this.renderer.render(this.scene, this.camera);
  };

  /** Плавающие чипы-подписи (ряды, этажи) — спрайты с канвас-текстурой. */
  private addLabels(labels: SceneLabel[]) {
    for (const l of labels) {
      const sprite = makeChipSprite(l.text);
      if (!sprite) continue;
      sprite.position.set(l.x, l.y, l.z);
      sprite.renderOrder = 20;
      this.scene.add(sprite);
      this.sprites.push(sprite);
    }
  }

  private clearMeshes() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.dispose();
    }
    this.meshes = [];
    for (const l of this.lines) {
      this.scene.remove(l);
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    }
    this.lines = [];
    for (const s of this.sprites) {
      this.scene.remove(s);
      s.material.map?.dispose();
      s.material.dispose();
    }
    this.sprites = [];
    this.cellsMesh = null;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.clearMeshes();
    this.boxGeo.dispose();
    this.selectionBox.geometry.dispose();
    (this.selectionBox.material as THREE.Material).dispose();
    this.slabMat.dispose();
    this.shelfMat.dispose();
    this.sectionMat.dispose();
    this.structMat.dispose();
    this.productMat.dispose();
    this.buildingMat.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/**
 * Спрайт-чип с текстом: белая скруглённая плашка с тёмной подписью — как
 * floating-метки на рефах. Размер в мировых единицах, всегда лицом к камере.
 */
function makeChipSprite(text: string): THREE.Sprite | null {
  const dpr = 2;
  const fontPx = 26;
  const padX = 18;
  const h = 46;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  const r = h / 2;
  ctx.beginPath();
  ctx.roundRect(1, 1, w - 2, h - 2, r);
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fill();
  ctx.strokeStyle = "rgba(148,163,184,0.55)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#334155";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 1);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }),
  );
  const worldH = 0.62;
  sprite.scale.set(worldH * (w / h), worldH, 1);
  return sprite;
}

function fillMatrices(mesh: THREE.InstancedMesh, boxes: Box[]) {
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const q = new THREE.Quaternion();
  boxes.forEach((b, i) => {
    m.compose(pos.set(b.cx, b.cy, b.cz), q, scl.set(b.sx, b.sy, b.sz));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

function distSq(b: Box, cam: THREE.Vector3) {
  const dx = b.cx - cam.x;
  const dy = b.cy - cam.y;
  const dz = b.cz - cam.z;
  return dx * dx + dy * dy + dz * dz;
}
