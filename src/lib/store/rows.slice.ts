import { setAddressingConfig } from "../address";
import {
  autoNumberSections,
  detectRows,
  findRowContinuation,
  rowNumbers,
  rowSectionNumbers,
} from "../numbering";
import { DEFAULT_ADDRESSING } from "../types";
import type { RowsSlice, SliceCreator } from "./state";
import { cloneModules, mutateActiveFloor } from "./helpers";

/**
 * Ряды, адресация и автонумерация секций (ТЗ, разд. 2.1). Ряд — это линия
 * секций, отделённая проходом; номера рядов и секций участвуют в адресе места
 * хранения, поэтому пересчёт всегда идёт ОТ закреплённого пользователем якоря,
 * а не «как получится».
 */
export const createRowsSlice: SliceCreator<RowsSlice> = (set, get) => ({
  addressing: { ...DEFAULT_ADDRESSING },
  rowProposal: null,

  updateAddressing: (patch) =>
    set((s) => {
      const addressing = { ...s.addressing, ...patch };
      // Держим схему адресации в address.ts в актуальном состоянии.
      setAddressingConfig(addressing);
      return { addressing };
    }),

  applyRows: (rows) =>
    set((s) =>
      mutateActiveFloor(s, (f) => {
        const rowOf = new Map<string, number>();
        rows.forEach((ids, i) => ids.forEach((id) => rowOf.set(id, i + 1)));
        for (const m of f.modules) {
          const r = rowOf.get(m.id);
          if (r != null) m.row = r;
        }
      }),
    ),

  setModuleRow: (id, row) =>
    set((s) =>
      mutateActiveFloor(s, (f) => {
        const m = f.modules.find((x) => x.id === id);
        if (m) m.row = row;
      }),
    ),

  setRowConfig: (row, patch) =>
    set((s) =>
      mutateActiveFloor(s, (f) => {
        const rows = f.rows ? [...f.rows] : [];
        const i = rows.findIndex((r) => r.number === row);
        if (i >= 0) rows[i] = { ...rows[i], ...patch };
        else rows.push({ number: row, ...patch });
        f.rows = rows;
      }),
    ),

  cloneRow: (row, side = "after") => {
    const floor = get().activeFloor();
    const rowMap = rowNumbers(floor);
    // Ряд как единица — включая лестницы (п.13).
    const members = floor.modules.filter((m) => rowMap.get(m.id) === row);
    if (!members.length) return;

    // Ориентация ряда: вертикальные стеллажи растут по Y, параллельная копия
    // сдвигается по X (поперёк); горизонтальные — наоборот.
    const tall = members.filter((m) => m.h >= m.w).length;
    const vertical = tall >= members.length / 2;
    const crossMin = Math.min(...members.map((m) => (vertical ? m.x : m.y)));
    const crossMax = Math.max(...members.map((m) => (vertical ? m.x + m.w : m.y + m.h)));
    const extent = Math.max(1, crossMax - crossMin);

    // Направление копии по стороне: «before» — влево/вверх, «after» — вправо/вниз.
    const dir = side === "before" ? -1 : 1;

    // Первое свободное смещение вдоль поперечной оси в выбранную сторону:
    // сдвигаем на ширину ряда, пока копия не перестанет пересекать существующее.
    const others = floor.modules;
    const hits = (dx: number, dy: number) =>
      members.some((m) =>
        others.some(
          (o) =>
            o.x < m.x + dx + m.w &&
            o.x + o.w > m.x + dx &&
            o.y < m.y + dy + m.h &&
            o.y + o.h > m.y + dy,
        ),
      );
    let k = 1;
    while (k < 50 && hits(vertical ? extent * k * dir : 0, vertical ? 0 : extent * k * dir)) k++;
    const dx = vertical ? extent * k * dir : 0;
    const dy = vertical ? 0 : extent * k * dir;

    // Номер нового ряда берём ПО НАПРАВЛЕНИЮ нумерации, а не «максимум + 1»:
    // если ряды нумеруются слева направо по возрастанию, сосед слева должен
    // получить меньший номер, а не следующий свободный в конце.
    const crossOf = (r: number) => {
      const mods = floor.modules.filter((m) => rowMap.get(m.id) === r);
      if (!mods.length) return null;
      const vals = mods.map((m) => (vertical ? m.x : m.y));
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    // Знак связи «номер ряда ↔ поперечная координата»: +1 — номера растут
    // вправо/вниз, −1 — влево/вверх. Считаем по всем парам соседних номеров.
    const known = [...new Set([...rowMap.values()])]
      .map((r) => ({ r, c: crossOf(r) }))
      .filter((v): v is { r: number; c: number } => v.c != null)
      .sort((a, b) => a.r - b.r);
    let trend = 0;
    for (let i = 1; i < known.length; i++) {
      trend += Math.sign(known[i].c - known[i - 1].c);
    }
    const numbersGrowForward = trend >= 0;
    // Шаг в сторону клика: «after» — по направлению роста координаты.
    const step = (side === "after" ? 1 : -1) * (numbersGrowForward ? 1 : -1);
    const wanted = row + step;

    const used = new Set(rowMap.values());
    const newRow = wanted >= 1 && !used.has(wanted) ? wanted : null;
    // Номер занят (или ушёл ниже единицы) — раздвигаем нумерацию: всем рядам
    // от `wanted` и дальше по направлению роста прибавляем единицу.
    const shiftFrom = newRow == null ? Math.max(1, wanted) : null;

    const clones = cloneModules(members, dx, dy).map((m) => ({
      ...m,
      row: newRow ?? Math.max(1, wanted),
      number: undefined, // номера пересчитаются внутри нового ряда
    }));

    set((s) =>
      mutateActiveFloor(s, (f) => {
        if (shiftFrom != null) {
          for (const m of f.modules) {
            if (m.row != null && m.row >= shiftFrom) m.row += 1;
          }
          if (f.rows) {
            f.rows = f.rows.map((r) =>
              r.number >= shiftFrom ? { ...r, number: r.number + 1 } : r,
            );
          }
        }
        f.modules.push(...clones);
        // Копируем стороннность/нумерацию ряда-образца на новый ряд.
        const cfg = f.rows?.find(
          (r) => r.number === (shiftFrom != null && row >= shiftFrom ? row + 1 : row),
        );
        if (cfg) {
          const rows = f.rows ? [...f.rows] : [];
          rows.push({ ...cfg, number: clones[0].row! });
          f.rows = rows;
        }
      }),
    );
    set({ selection: clones.map((m) => m.id), activeShelf: null });
    get().showToast("toast.rowCloned", { row, newRow: clones[0].row! });
  },

  renumberFloorRows: () => {
    const floor = get().activeFloor();
    const groups = detectRows(floor);
    if (!groups.length) return 0;
    const oldOf = rowNumbers(floor);

    // Пересчёт идёт ОТ ряда, заданного пользователем: его номер — точка
    // отсчёта, остальные ряды выстраиваются вокруг по порядку на плане.
    // Якорь — выделенный ряд; если выделения нет, берём ряд с наименьшим
    // номером, чтобы существующая разметка сохранила своё начало.
    const sel = new Set(get().selection);
    let anchor = groups.findIndex((g) => g.some((m) => sel.has(m.id)));
    if (anchor < 0) {
      let best = Infinity;
      groups.forEach((g, i) => {
        const n = g.map((m) => oldOf.get(m.id)).find((x) => x != null);
        if (n != null && n < best) {
          best = n;
          anchor = i;
        }
      });
      if (anchor < 0) anchor = 0;
    }
    const anchorNum = groups[anchor].map((m) => oldOf.get(m.id)).find((n) => n != null) ?? 1;

    // Номер ряда = номер якоря ± смещение по плану. Если левее якоря номера
    // ушли бы ниже единицы — сдвигаем всю шкалу вверх.
    const raw = (i: number) => anchorNum + (i - anchor);
    const shift = raw(0) < 1 ? 1 - raw(0) : 0;
    const numberFor = (i: number) => raw(i) + shift;

    const remap = new Map<number, number>();
    const idRow = new Map<string, number>();
    groups.forEach((g, i) => {
      const old = g.map((m) => oldOf.get(m.id)).find((n) => n != null);
      if (old != null) remap.set(old, numberFor(i));
      g.forEach((m) => idRow.set(m.id, numberFor(i)));
    });

    set((s) =>
      mutateActiveFloor(s, (f) => {
        for (const m of f.modules) {
          const n = idRow.get(m.id);
          if (n != null) m.row = n;
          if (m.type === "section" && n != null) m.number = undefined;
        }
        if (f.rows) {
          f.rows = f.rows.map((r) => {
            const n = remap.get(r.number);
            return n == null ? r : { ...r, number: n };
          });
        }
      }),
    );
    get().showToast("toast.rowsRenumbered", {
      n: groups.length,
      row: anchorNum,
    });
    return groups.length;
  },

  resetRowNumbers: (row) => {
    const rowMap = rowNumbers(get().activeFloor());
    // Сброс ручных номеров ряда — первый шаг. Раньше на этом всё и кончалось:
    // если ручных номеров не было, кнопка «Обновить адресацию» не меняла
    // ничего. Теперь вторым шагом пересчитываем авто-номера по текущей схеме
    // (стороннность/направление) и записываем их, чтобы правка была видна.
    set((s) =>
      mutateActiveFloor(s, (f) => {
        for (const m of f.modules) {
          if (m.type === "section" && rowMap.get(m.id) === row) m.number = undefined;
        }
      }),
    );

    // Пересчитываем номера ИМЕННО правилами ряда (`rowSectionNumbers`), а не
    // общей автонумерацией этажа: только они знают про стороннность ряда и
    // сторону нечёта.
    const floorNow = get().activeFloor();
    const cfg = floorNow.rows?.find((r) => r.number === row);
    const nums = rowSectionNumbers(floorNow, row, cfg);
    let changed = 0;
    set((s) =>
      mutateActiveFloor(s, (f) => {
        for (const m of f.modules) {
          if (m.type !== "section" || rowMap.get(m.id) !== row) continue;
          const n = nums.get(m.id);
          if (n != null && m.number !== n) {
            m.number = n;
            changed++;
          }
        }
      }),
    );
    get().showToast("toast.rowNumbersReset", { row, n: changed });
  },

  setRowForSelection: (row) => {
    const floorNow = get().activeFloor();
    const picked = floorNow.modules.filter(
      (m) => m.type === "section" && get().selection.includes(m.id),
    );
    const n = picked.length;

    // Ряд — это линия секций, разделённая проходом. Если выделенные секции
    // стоят вплотную к другим секциям того же ряда, отдельным рядом они не
    // станут: автоматика снова склеит их в одну линию. Раньше назначение молча
    // «не срабатывало» — теперь объясняем, что нужен проход.
    if (row != null && n > 0) {
      const rowMapNow = rowNumbers(floorNow);
      const pickedIds = new Set(picked.map((m) => m.id));
      const touchesRowmate = picked.some((m) =>
        floorNow.modules.some((o) => {
          if (o.type !== "section" || pickedIds.has(o.id)) return false;
          if (rowMapNow.get(o.id) !== rowMapNow.get(m.id)) return false;
          // Касание: прямоугольники смежны хотя бы одной стороной (зазора нет).
          const overlapX = o.x < m.x + m.w && o.x + o.w > m.x;
          const overlapY = o.y < m.y + m.h && o.y + o.h > m.y;
          const touchX = o.x === m.x + m.w || o.x + o.w === m.x;
          const touchY = o.y === m.y + m.h || o.y + o.h === m.y;
          return (overlapY && touchX) || (overlapX && touchY);
        }),
      );
      if (touchesRowmate) {
        get().showToast("toast.rowNeedsAisle");
        return;
      }
    }
    set((s) =>
      mutateActiveFloor(s, (f) => {
        for (const m of f.modules) {
          if (m.type === "section" && s.selection.includes(m.id)) m.row = row;
        }
      }),
    );
    get().showToast(
      row == null ? "toast.rowUnpinned" : "toast.rowAssigned",
      row == null ? { n } : { row, n },
    );

    // Продолжение по образцу: ищем такие же нераспределённые ряды и предлагаем
    // пронумеровать их подряд. При откреплении — снимаем висящее предложение.
    if (row == null) {
      set({ rowProposal: null });
      return;
    }
    const floor = get().activeFloor();
    const found = findRowContinuation(floor, row);
    if (!found.length) {
      set({ rowProposal: null });
      return;
    }
    const taken = new Set(
      floor.modules
        .filter((m) => m.type === "section" && m.row != null)
        .map((m) => m.row as number),
    );
    let next = row + 1;
    const candidates = found.map((c) => {
      while (taken.has(next)) next++;
      const number = next;
      taken.add(number);
      next++;
      return { ...c, number, checked: true };
    });
    set({ rowProposal: { anchor: row, candidates } });
  },

  toggleRowProposal: (index) =>
    set((s) => {
      if (!s.rowProposal) return {};
      const candidates = s.rowProposal.candidates.map((c, i) =>
        i === index ? { ...c, checked: !c.checked } : c,
      );
      return { rowProposal: { ...s.rowProposal, candidates } };
    }),

  applyRowProposal: () => {
    const proposal = get().rowProposal;
    if (!proposal) return;
    const picked = proposal.candidates.filter((c) => c.checked);
    if (!picked.length) {
      set({ rowProposal: null });
      return;
    }
    set((s) =>
      mutateActiveFloor(s, (f) => {
        const rowOf = new Map<string, number>();
        for (const c of picked) for (const id of c.ids) rowOf.set(id, c.number);
        for (const m of f.modules) {
          const r = rowOf.get(m.id);
          if (r != null) m.row = r;
        }
      }),
    );
    set({ rowProposal: null });
    get().showToast("toast.rowsContinued", { n: picked.length });
  },

  dismissRowProposal: () => set({ rowProposal: null }),

  setModuleNumber: (id, number) =>
    set((s) =>
      mutateActiveFloor(s, (f) => {
        const m = f.modules.find((x) => x.id === id);
        if (m) m.number = number;
      }),
    ),

  autoNumberFloor: () => {
    const floor = get().activeFloor();
    const { assigned, keptManual } = autoNumberSections(floor);
    if (assigned.size) {
      set((s) =>
        mutateActiveFloor(s, (f) => {
          for (const m of f.modules) {
            const n = assigned.get(m.id);
            if (n != null) m.number = n;
          }
        }),
      );
    }
    return { changed: assigned.size, keptManual };
  },
});
