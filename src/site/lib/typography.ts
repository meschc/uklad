import { useEffect } from "react";

const NBSP = " ";

/**
 * Короткие слова, которые нельзя оставлять в конце строки: одно-, двух- и
 * трёхбуквенные предлоги, союзы и частицы. Список закрытый и полный — в русском
 * языке таких слов конечное число, и перечислить их короче и честнее, чем
 * считать буквы: правило «склеиваем всё до трёх букв» утащило бы за собой «шт»,
 * «мм», «WB» и любую другую аббревиатуру.
 */
const GLUE_WORDS = new Set([
  // предлоги
  "в", "во", "к", "ко", "с", "со", "о", "об", "обо", "у", "из", "изо", "за",
  "на", "над", "от", "ото", "по", "до", "для", "при", "про", "под", "без",
  "близ", "меж", "ради", "чрез",
  // союзы и частицы
  "а", "и", "но", "да", "же", "ли", "бы", "не", "ни", "то", "что", "как",
  "чем", "или", "либо", "ибо", "ль", "уж",
]);

/** Открывающие кавычки и скобки, которые прилипают к слову слева. */
const OPENING = /^[«"„(\[{'‘“—–-]+/;

/** Тире, которому нельзя начинать строку. */
const DASHES = new Set(["—", "–", "—,", "–,"]);

/**
 * Ставит неразрывные пробелы по правилу висячих предлогов.
 *
 * Склеиваем три случая:
 *  1. короткое служебное слово со следующим за ним — «в», «на», «не» не должны
 *     висеть в конце строки;
 *  2. число со следующим словом — и чтобы «42 300» не разорвалось посреди
 *     числа, и чтобы «5 складов» не разъехалось по двум строкам;
 *  3. слово перед тире — иначе тире начинает строку и текст читается как
 *     реплика диалога.
 *
 * Функция чистая и работает со строкой: так её видно в тестах, а DOM-обход
 * ниже остаётся тонкой обёрткой. Склейка идёт только по одиночному пробелу —
 * переносы строк и отступы в разметке не трогаем, их браузер схлопывает сам.
 */
export function glueShortWords(text: string): string {
  return text.replace(/(\S+) (?=(\S+))/g, (match, word: string, next: string) => {
    const bare = word.replace(OPENING, "").toLowerCase();
    const glue = GLUE_WORDS.has(bare) || /^\d+$/.test(bare) || DASHES.has(next);
    return glue ? word + NBSP : match;
  });
}

/** Теги, внутри которых текст — это код или ввод пользователя, а не проза. */
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "KBD"]);

/**
 * Проходит по текстовым узлам и переписывает их по правилу выше.
 *
 * Обход DOM, а не правка каждой строки в исходниках, — сознательный выбор.
 * Текст витрины лежит в десятке файлов данных и полусотне компонентов, и
 * расставленные руками ` ` пришлось бы поддерживать в каждой новой строке
 * текста, что невозможно проверить на глаз. Здесь правило живёт в одном месте
 * и распространяется на всё, что попадёт на страницу потом.
 *
 * Ветку `data-nbsp="off"` можно отключить, если где-то склейка мешает.
 */
export function fixHangingPrepositions(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    applyToTextNode(root);
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue?.includes(" ")) return NodeFilter.FILTER_REJECT;
      if (parent.closest('[data-nbsp="off"]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Node[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
  nodes.forEach(applyToTextNode);
}

function applyToTextNode(node: Node): void {
  const value = node.nodeValue;
  if (!value) return;
  const fixed = glueShortWords(value);
  // Пишем только при настоящем изменении: лишняя запись — это лишняя мутация,
  // на которую наблюдатель ниже отреагировал бы новым проходом.
  if (fixed !== value) node.nodeValue = fixed;
}

const OBSERVED = { childList: true, subtree: true, characterData: true } as const;

/**
 * Держит правило висячих предлогов включённым на всей витрине.
 *
 * React перерисовывает текст своими средствами и о наших неразрывных пробелах
 * не знает, поэтому одного прохода после монтирования мало: смена вкладки,
 * фильтра или страницы вернула бы обычные пробелы. Наблюдатель ловит такие
 * перерисовки и проходит заново.
 *
 * Наблюдатель на время прохода отключается — иначе собственные правки узлов
 * вызвали бы его снова. Проход отложен до кадра отрисовки: за один кадр React
 * успевает разложить всё поддерево, и вместо сотни проходов получается один.
 */
export function useTypography(): void {
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;

    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    });

    const apply = () => {
      observer.disconnect();
      fixHangingPrepositions(root);
      observer.observe(root, OBSERVED);
    };

    apply();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
}
