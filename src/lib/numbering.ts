import type { Floor, PlacedModule, RowConfig, RowCandidate } from "./types";

/**
 * Автонумерация секций по складской классике: идём вдоль прохода, секции слева
 * получают НЕЧЁТНЫЕ номера, справа — ЧЁТНЫЕ. Пара стеллажей, стоящих друг
 * напротив друга через проход, получает соседние номера (5 и 6) — по адресу
 * сразу понятно, с какой стороны прохода стоять.
 *
 * Для горизонтального прохода «слева/справа» читается как «сверху/снизу».
 *
 * Номера, заданные пользователем вручную, не трогаем: они остаются на месте, а
 * автонумерация обходит их стороной, чтобы не было дублей.
 */

export interface AutoNumberResult {
  /** moduleId → присвоенный номер (только для изменившихся). */
  assigned: Map<string, number>;
  /** Сколько секций осталось с ручными номерами. */
  keptManual: number;
}

const isSection = (m: PlacedModule) => m.type === "section";

/** Шире этого зазор между линиями — уже не проход, а разделение зон склада. */
const AISLE_MAX_CELLS = 3;
/** Сторон у прохода две: ряд из трёх линий физически не бывает. */
const SIDES_PER_ROW = 2;

/**
 * Автоопределение рядов.
 *
 * Ряд — это НЕ одна линия стеллажей, а пара линий, смотрящих в один проход:
 * кладовщик идёт по проходу и берёт товар и слева, и справа, поэтому обе
 * стороны адресуются одним номером ряда. Соседние ряды стоят спинами друг к
 * другу вплотную — нулевой зазор как раз и означает границу между рядами, а
 * зазор в 1–3 клетки означает проход внутри ряда («пол как проход»).
 *
 * Раньше линия резалась по продольным разрывам и каждая колонка считалась
 * отдельным рядом: реальный план из 4 рядов разбирался на 26 (п.3).
 *
 * Результат НЕ применяется молча: показываем пользователю и спрашиваем.
 */
export function detectRows(floor: Floor): PlacedModule[][] {
  const sections = floor.modules.filter(isSection);
  if (!sections.length) return [];

  // Ориентация — у КАЖДОЙ секции своя, по её же форме: на одном плане
  // встречаются и вертикальные, и горизонтальные линии стеллажей.
  const isVert = (m: PlacedModule) => m.h >= m.w;
  const rows: PlacedModule[][] = [
    ...rowsOfOrientation(sections.filter(isVert), true),
    ...rowsOfOrientation(sections.filter((m) => !isVert(m)), false),
  ];

  // Порядок рядов на плане: слева направо, при равенстве — сверху вниз.
  rows.sort((a, b) => {
    const ax = Math.min(...a.map((m) => m.x));
    const bx = Math.min(...b.map((m) => m.x));
    const ay = Math.min(...a.map((m) => m.y));
    const by = Math.min(...b.map((m) => m.y));
    return ax - bx || ay - by;
  });
  return rows;
}

/**
 * Ряды среди секций одной ориентации. Линия = секции с одинаковой поперечной
 * координатой и глубиной; линии сливаются в ряд через проход.
 */
function rowsOfOrientation(
  sections: PlacedModule[],
  vertical: boolean,
): PlacedModule[][] {
  if (!sections.length) return [];
  // Поперечная ось — та, по которой стоят линии: X у вертикальных стеллажей.
  const crossStart = (m: PlacedModule) => (vertical ? m.x : m.y);
  const crossEnd = (m: PlacedModule) => (vertical ? m.x + m.w : m.y + m.h);
  const alongStart = (m: PlacedModule) => (vertical ? m.y : m.x);
  const alongEnd = (m: PlacedModule) => (vertical ? m.y + m.h : m.x + m.w);

  const lines = new Map<string, PlacedModule[]>();
  for (const m of sections) {
    const k = `${crossStart(m)}:${crossEnd(m)}`;
    if (!lines.has(k)) lines.set(k, []);
    lines.get(k)!.push(m);
  }

  const ordered = [...lines.values()].sort(
    (a, b) => crossStart(a[0]) - crossStart(b[0]),
  );

  const rows: PlacedModule[][] = [];
  let current: PlacedModule[][] = [];
  const flush = () => {
    if (current.length) rows.push(current.flat());
    current = [];
  };

  for (const line of ordered) {
    if (!current.length) {
      current = [line];
      continue;
    }
    const prev = current[current.length - 1];
    const gap = crossStart(line[0]) - crossEnd(prev[0]);
    // Перекрытие по длине: линии по разные стороны прохода должны идти рядом,
    // а не просто оказаться на одной оси в разных концах склада.
    const near = overlaps(
      Math.min(...line.map(alongStart)),
      Math.max(...line.map(alongEnd)),
      Math.min(...prev.map(alongStart)),
      Math.max(...prev.map(alongEnd)),
    );
    if (gap > 0 && gap <= AISLE_MAX_CELLS && near && current.length < SIDES_PER_ROW) {
      current.push(line);
    } else {
      flush();
      current = [line];
    }
  }
  flush();
  return rows;
}

/** Пересекаются ли отрезки [a1,a2) и [b1,b2). */
function overlaps(a1: number, a2: number, b1: number, b2: number) {
  return a1 < b2 && a2 > b1;
}

/** Прямоугольник в клетках — годится и объект-модуль, и виртуальный проход. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Секции, примыкающие к проходу с каждой стороны. «Примыкает» = касается ребра
 * прохода и перекрывается с ним по длине. Проход теперь виртуальный — это зазор
 * между рядами секций (модель «пол как проход»), поэтому принимаем прямоугольник.
 */
function sidesOf(aisle: Rect, sections: PlacedModule[]) {
  const vertical = aisle.h >= aisle.w;
  const near: PlacedModule[] = [];
  const far: PlacedModule[] = [];

  for (const s of sections) {
    if (vertical) {
      if (!overlaps(s.y, s.y + s.h, aisle.y, aisle.y + aisle.h)) continue;
      if (s.x + s.w === aisle.x) near.push(s); // слева от прохода
      else if (s.x === aisle.x + aisle.w) far.push(s); // справа
    } else {
      if (!overlaps(s.x, s.x + s.w, aisle.x, aisle.x + aisle.w)) continue;
      if (s.y + s.h === aisle.y) near.push(s); // сверху
      else if (s.y === aisle.y + aisle.h) far.push(s); // снизу
    }
  }
  // Вдоль прохода — по возрастанию координаты движения.
  const key = (m: PlacedModule) => (vertical ? m.y : m.x);
  near.sort((a, b) => key(a) - key(b));
  far.sort((a, b) => key(a) - key(b));
  return { near, far, vertical };
}

/**
 * Действующие номера рядов для всех секций этажа.
 *
 * Закреплённые пользователем ряды (`m.row`) — якоря: они остаются как есть, а
 * остальные ряды нумеруются вокруг них по порядку следования на плане. Значит,
 * достаточно сказать «вот это — ряд 1», и всё остальное перестроится само.
 *
 * Считается на лету и кэшируется по объекту этажа: любая правка плана создаёт
 * новый объект (иммутабельные апдейты), поэтому кэш инвалидируется сам.
 */
const rowCache = new WeakMap<Floor, Map<string, number>>();

export function rowNumbers(floor: Floor): Map<string, number> {
  const cached = rowCache.get(floor);
  if (cached) return cached;

  const groups = detectRows(floor);
  const map = new Map<string, number>();
  const taken = new Set<number>();

  // Сначала резервируем все закреплённые номера.
  const pinnedOf = groups.map(
    (g) => g.find((m) => m.row != null)?.row ?? null,
  );
  for (const p of pinnedOf) if (p != null) taken.add(p);

  let prev = 0;
  groups.forEach((g, i) => {
    const pinned = pinnedOf[i];
    let n: number;
    if (pinned != null) {
      n = pinned;
    } else {
      n = prev + 1;
      while (taken.has(n)) n++;
      taken.add(n);
    }
    for (const m of g) map.set(m.id, n);
    prev = n;
  });

  // Конструкции (лестницы/лифты) входят в ряд своей линии (п.13): берут номер
  // ряда секций, стоящих в том же поперечном «столбце». Нумерацию секций это не
  // трогает — rowSides/rowSectionNumbers работают только по секциям.
  const structural = floor.modules.filter(
    (m) => m.type === "stairs" || m.type === "elevator",
  );
  if (structural.length) {
    const secs = floor.modules.filter(isSection);
    const tall = secs.filter((m) => m.h >= m.w).length;
    const vertical = tall >= secs.length / 2;
    const crossOf = (m: PlacedModule) => (vertical ? m.x : m.y);
    const lineRow = new Map<number, number>();
    for (const s of secs) {
      const r = map.get(s.id);
      if (r != null && !lineRow.has(crossOf(s))) lineRow.set(crossOf(s), r);
    }
    for (const st of structural) {
      const r = lineRow.get(crossOf(st));
      if (r != null) map.set(st.id, r);
    }
  }

  rowCache.set(floor, map);
  return map;
}

/**
 * Разбор ряда на стороны прохода. Секции ряда группируются по поперечной
 * координате (для вертикальных стеллажей — X, иначе — Y): каждый уникальный
 * «столбец» = одна сторона. Две стороны = двусторонний ряд, одна = односторонний.
 * Стороны отсортированы по поперечной координате (ближняя → дальняя), внутри —
 * по продольной (вдоль прохода).
 */
export function rowSides(
  floor: Floor,
  row: number,
): { sides: PlacedModule[][]; vertical: boolean } {
  const sections = floor.modules.filter(
    (m) => isSection(m) && rowNumbers(floor).get(m.id) === row,
  );
  if (!sections.length) return { sides: [], vertical: true };

  const tall = sections.filter((m) => m.h >= m.w).length;
  const vertical = tall >= sections.length / 2;
  const cross = (m: PlacedModule) => (vertical ? m.x : m.y);
  const along = (m: PlacedModule) => (vertical ? m.y : m.x);

  const byCross = new Map<number, PlacedModule[]>();
  for (const m of sections) {
    const k = cross(m);
    if (!byCross.has(k)) byCross.set(k, []);
    byCross.get(k)!.push(m);
  }
  const sides = [...byCross.keys()]
    .sort((a, b) => a - b)
    .map((k) => byCross.get(k)!.sort((a, b) => along(a) - along(b)));
  return { sides, vertical };
}

/**
 * Номера секций ВНУТРИ одного ряда, с учётом его конфигурации (стороннность).
 *
 * Двусторонний: пара секций, стоящих друг напротив друга через проход, получает
 * соседние номера (n и n+1) — нечёт на выбранной стороне (`oddSide`), чёт на
 * другой. Пустой слот всё равно резервирует пару, чтобы визави держали чётность.
 * Односторонний: секции нумеруются подряд вдоль ряда. `auto` — двусторонний,
 * если сторон ровно две, иначе односторонний. Ручные номера здесь не участвуют:
 * их подставляет `sectionNumber` до вызова этой функции.
 */
export function rowSectionNumbers(
  floor: Floor,
  row: number,
  config?: RowConfig,
): Map<string, number> {
  const { sides, vertical } = rowSides(floor, row);
  const map = new Map<string, number>();
  const all = sides.flat();
  if (!all.length) return map;

  const along = (m: PlacedModule) => (vertical ? m.y : m.x);
  const cross = (m: PlacedModule) => (vertical ? m.x : m.y);

  const auto = sides.length === 2 ? "two" : "one";
  const sided =
    config?.sided && config.sided !== "auto" ? config.sided : auto;

  if (sided === "one" || sides.length !== 2) {
    all
      .slice()
      .sort((a, b) => along(a) - along(b) || cross(a) - cross(b))
      .forEach((m, i) => map.set(m.id, i + 1));
    return map;
  }

  // Двусторонний: [0] — ближняя сторона, [1] — дальняя.
  const near = sides[0];
  const far = sides[1];
  const oddArr = (config?.oddSide ?? "near") === "near" ? near : far;
  const evenArr = oddArr === near ? far : near;

  const slots = Array.from(new Set([...near, ...far].map(along))).sort(
    (a, b) => a - b,
  );
  let n = 1;
  for (const slot of slots) {
    const o = oddArr.find((m) => along(m) === slot);
    const e = evenArr.find((m) => along(m) === slot);
    if (o) map.set(o.id, n);
    if (e) map.set(e.id, n + 1);
    n += 2;
  }
  return map;
}

/**
 * Виртуальные проходы: зазоры в поперечной оси между рядами секций. Проход
 * больше не объект — это пол, проглядывающий между стеллажами (модель «пол как
 * проход»). Каждый зазор превращаем в прямоугольник во всю длину плана, чтобы
 * `sidesOf` нашёл секции по обе его стороны.
 */
function virtualPassages(sections: PlacedModule[]): Rect[] {
  if (!sections.length) return [];
  // Вертикальные и горизонтальные стеллажи ищут проходы по РАЗНЫМ осям,
  // поэтому разбираем их отдельно: на смешанном плане общая ориентация «по
  // большинству» просто теряла проходы меньшей группы.
  const vert = sections.filter((m) => m.h >= m.w);
  const horiz = sections.filter((m) => m.h < m.w);
  if (vert.length && horiz.length) {
    return [...passagesAlong(vert, true), ...passagesAlong(horiz, false)];
  }
  return passagesAlong(sections, vert.length >= horiz.length);
}

/** Проходы среди секций одной ориентации. */
function passagesAlong(sections: PlacedModule[], vertical: boolean): Rect[] {
  if (!sections.length) return [];

  // Поперечная ось (где ищем зазоры) и продольная (во всю длину прохода).
  const lo = (m: PlacedModule) => (vertical ? m.x : m.y);
  const hi = (m: PlacedModule) => (vertical ? m.x + m.w : m.y + m.h);
  const alongLo = Math.min(
    ...sections.map((m) => (vertical ? m.y : m.x)),
  );
  const alongHi = Math.max(
    ...sections.map((m) => (vertical ? m.y + m.h : m.x + m.w)),
  );

  // Объединяем занятые секциями интервалы поперечной оси; дырки между ними — это
  // проходы (секции есть с обеих сторон).
  const iv = sections.map((m) => [lo(m), hi(m)]).sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [];
  for (const [a, b] of iv) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }

  const passages: Rect[] = [];
  for (let i = 0; i < merged.length - 1; i++) {
    const g1 = merged[i][1];
    const g2 = merged[i + 1][0];
    if (g2 <= g1) continue;
    passages.push(
      vertical
        ? { x: g1, y: alongLo, w: g2 - g1, h: alongHi - alongLo }
        : { x: alongLo, y: g1, w: alongHi - alongLo, h: g2 - g1 },
    );
  }
  return passages;
}

/**
 * Авто-продолжение рядов по образцу (ТЗ, разд. 3.5).
 *
 * Образец — секции, уже закреплённые за рядом `anchorRow`. Их форма (набор
 * относительных смещений и габаритов) — сигнатура ряда. Ищем на этаже такие же
 * группы среди НЕраспределённых секций (без закреплённого ряда) — это копии
 * образца, сдвинутые по плану. Совпадение проверяется точным переносом: любую
 * свободную секцию с габаритом «якорной» примеряем как опорную и пытаемся
 * восстановить весь силуэт. Найденные группы возвращаются в порядке по плану
 * (слева направо, сверху вниз) — стор назначит им номера подряд.
 */
export function findRowContinuation(
  floor: Floor,
  anchorRow: number,
): RowCandidate[] {
  const sections = floor.modules.filter(isSection);
  const anchor = sections.filter((m) => m.row === anchorRow);
  if (!anchor.length) return [];

  const minX = Math.min(...anchor.map((m) => m.x));
  const minY = Math.min(...anchor.map((m) => m.y));
  const rels = anchor.map((m) => ({
    rx: m.x - minX,
    ry: m.y - minY,
    w: m.w,
    h: m.h,
  }));
  // Опорная ячейка образца — ближайшая к началу габарита.
  const handle = rels.reduce((a, b) =>
    b.rx < a.rx || (b.rx === a.rx && b.ry < a.ry) ? b : a,
  );

  const key = (x: number, y: number, w: number, h: number) =>
    `${x}:${y}:${w}:${h}`;
  const byFootprint = new Map<string, PlacedModule>();
  for (const m of sections) byFootprint.set(key(m.x, m.y, m.w, m.h), m);

  const free = (m: PlacedModule) => m.row == null;
  const anchorSet = new Set(anchor.map((m) => m.id));
  const used = new Set<string>();
  const candidates: RowCandidate[] = [];

  // Свободные секции — в порядке по плану, чтобы опорная примерялась первой.
  const probes = sections
    .filter(free)
    .sort((a, b) => a.x - b.x || a.y - b.y);

  for (const s of probes) {
    if (s.w !== handle.w || s.h !== handle.h) continue;
    if (used.has(s.id)) continue;
    const ox = s.x - handle.rx;
    const oy = s.y - handle.ry;

    const members: PlacedModule[] = [];
    let ok = true;
    for (const r of rels) {
      const m = byFootprint.get(key(ox + r.rx, oy + r.ry, r.w, r.h));
      if (!m || !free(m) || anchorSet.has(m.id) || used.has(m.id)) {
        ok = false;
        break;
      }
      members.push(m);
    }
    if (!ok) continue;

    members.forEach((m) => used.add(m.id));
    const xs = members.map((m) => m.x);
    const ys = members.map((m) => m.y);
    const rx = Math.min(...xs);
    const ry = Math.min(...ys);
    candidates.push({
      ids: members.map((m) => m.id),
      rect: {
        x: rx,
        y: ry,
        w: Math.max(...members.map((m) => m.x + m.w)) - rx,
        h: Math.max(...members.map((m) => m.y + m.h)) - ry,
      },
    });
  }

  candidates.sort((a, b) => a.rect.x - b.rect.x || a.rect.y - b.rect.y);
  return candidates;
}

export function autoNumberSections(floor: Floor): AutoNumberResult {
  const sections = floor.modules.filter(isSection);
  const passages = virtualPassages(sections);

  const assigned = new Map<string, number>();
  const taken = new Set<number>();
  let keptManual = 0;

  // Ручные номера — неприкосновенны и резервируют своё значение.
  for (const s of sections) {
    if (s.number != null) {
      taken.add(s.number);
      keptManual++;
    }
  }

  const done = new Set<string>(
    sections.filter((s) => s.number != null).map((s) => s.id),
  );

  /** Ближайшая свободная пара (нечёт, чёт), начиная с текущего курсора. */
  let cursor = 1;
  const nextPair = () => {
    while (taken.has(cursor) || taken.has(cursor + 1)) cursor += 2;
    const pair = { odd: cursor, even: cursor + 1 };
    taken.add(pair.odd);
    taken.add(pair.even);
    cursor += 2;
    return pair;
  };

  // Виртуальные проходы уже отсортированы по поперечной оси (слева направо /
  // сверху вниз), как строились из объединённых интервалов.
  for (const aisle of passages) {
    const { near, far, vertical } = sidesOf(aisle, sections);
    if (!near.length && !far.length) continue;

    // Позиции вдоль прохода: объединяем координаты обеих сторон.
    const key = (m: PlacedModule) => (vertical ? m.y : m.x);
    const slots = Array.from(
      new Set([...near, ...far].map(key)),
    ).sort((a, b) => a - b);

    for (const slot of slots) {
      const left = near.find((m) => key(m) === slot && !done.has(m.id));
      const right = far.find((m) => key(m) === slot && !done.has(m.id));
      if (!left && !right) continue;
      const pair = nextPair();
      if (left) {
        assigned.set(left.id, pair.odd);
        done.add(left.id);
      }
      if (right) {
        assigned.set(right.id, pair.even);
        done.add(right.id);
      }
    }
  }

  // Секции без прохода рядом — добираем подряд, сохраняя порядок по плану.
  const orphans = sections
    .filter((s) => !done.has(s.id))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  for (const s of orphans) {
    while (taken.has(cursor)) cursor++;
    taken.add(cursor);
    assigned.set(s.id, cursor);
    cursor++;
  }

  return { assigned, keptManual };
}
