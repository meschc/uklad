// Линтер. До этого `npm run lint` запускал только `tsc --noEmit` — проверку
// типов, а не линт, и четыре комментария `eslint-disable-line` по коду ничего
// не отключали, потому что отключать было нечего.
//
// Здесь намеренно нет правил, которые уже делает компилятор: неиспользуемые
// переменные и параметры ловит `noUnusedLocals`/`noUnusedParameters` в
// tsconfig, проваленные case — `noFallthroughCasesInSwitch`. Дублировать их
// линтером значит получать одну ошибку дважды.
//
// Форматирование линтер тоже не трогает: этим занят Prettier, а
// `eslint-config-prettier` в конце списка гасит все правила, которые могли бы
// с ним спорить.
//
// Версия ESLint — 9, не 10: `eslint-plugin-jsx-a11y` десятую ещё не
// поддерживает (в его peerDependencies потолок `^9`), а проверки доступности
// для сайта с формами и картой нужнее, чем свежий мажор.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

// Классы палитры Tailwind, которые обходят токены темы: `text-emerald-600`,
// `bg-sky-500/15` и т. п. Цвет по роли — токены `success`, `warning`,
// `primary`, `destructive` из src/index.css; так тёмная тема чинится в одном
// месте, а не `dark:`-парой на каждом экране.
const PALETTE =
  "/\\b(bg|text|border|ring|fill|stroke|from|to|via|outline|divide|decoration|accent)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]/";

export default tseslint.config(
  {
    // Собранное, отчёты и зависимости линтеру показывать незачем.
    ignores: [
      "dist/**",
      "dist-ssr/**",
      "dist-app/**",
      "coverage/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "refs/**",
      "docs/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      // Экспорт не-компонента рядом с компонентом ломает горячую замену:
      // правится Vite целым модулем, и состояние экрана слетает. Предупреждение,
      // не ошибка — в паре мест это осознанно.
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // Неиспользуемое ловит компилятор — здесь выключаем, чтобы не получать
      // одну и ту же ошибку от двух инструментов.
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",

      // `any` в проекте нет ни разу, и правило стоит ошибкой, чтобы так и
      // осталось: это первое, что появляется при спешке.
      "@typescript-eslint/no-explicit-any": "error",

      // Пустой catch — самый частый способ проглотить ошибку молча. Пустой
      // блок в других местах (заглушка в switch) допускаем.
      "no-empty": ["error", { allowEmptyCatch: false }],

      // Осталось от отладки — в собранный код попадать не должно.
      // `console.warn` и `console.error` разрешены: ими пользуются проверки
      // формы данных в src/lib/data.
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  {
    // Скрипты сборки и конфиги живут в Node и печатают в консоль по делу.
    files: ["scripts/**/*.mjs", "*.config.{js,ts}", "e2e/**/*.ts"],
    rules: { "no-console": "off" },
  },

  {
    // Дизайн-система (ADR 0007) — правилами, а не памятью: нарушение
    // ловится сразу в редакторе и на коммите, а не через неделю на ревью.
    files: ["src/components/**/*.{ts,tsx}", "src/site/**/*.{ts,tsx}"],
    ignores: [
      "src/components/ui/**",
      "**/__tests__/**",
      // Бумага: лист A4 и ярлык печатаются чёрным по белому в любой теме,
      // им нужны постоянные серые, а не токены, которые темнеют вместе с темой.
      "src/components/fulfillment/DocumentSheet.tsx",
      "src/components/fulfillment/LabelCard.tsx",
      "src/components/table/Code128Svg.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `Literal[value=${PALETTE}], TemplateElement[value.raw=${PALETTE}]`,
          message:
            "Цвет палитры Tailwind мимо токенов. Берите токен по роли: primary, success, warning, destructive, muted-foreground (src/index.css).",
        },
        {
          selector: "Literal[value=/\\bbg-muted p-0\\.5\\b/]",
          message: "Свой набор кнопок-табов. Переключатель — только ui/segmented.",
        },
        {
          // Пределы чисел (Кирилл 12 ноя: «уже не в первый раз»): числовое
          // поле без предела принимает 34223413242134 камер. Предел — из
          // lib/numberLimits (`{...limit("small")}`) или явный `max`.
          selector:
            'JSXOpeningElement[name.name=/^(input|Input)$/]:has(JSXAttribute[name.name="type"][value.value="number"]):not(:has(JSXAttribute[name.name="max"])):not(:has(JSXSpreadAttribute))',
          message:
            'Числовое поле без предела. Добавьте {...limit("…")} из lib/numberLimits или max.',
        },
        {
          selector:
            'JSXOpeningElement[name.name=/^(input|Input)$/]:has(JSXAttribute[name.name="inputMode"][value.value=/^(numeric|decimal)$/]):not(:has(JSXAttribute[name.name=/^(max|maxLength)$/])):not(:has(JSXSpreadAttribute))',
          message:
            "Числовое текстовое поле без maxLength. Возьмите digitsFor(…) из lib/numberLimits.",
        },
        {
          selector:
            'JSXOpeningElement[name.name=/^(input|Input)$/]:matches(:has(JSXAttribute[name.name=/^(type|inputMode)$/][value.value="tel"]), :has(CallExpression[callee.name="formatPhone"])):not(:has(JSXAttribute[name.name="maxLength"]))',
          message: "Телефон без maxLength. Возьмите PHONE_MAX_LENGTH из lib/phone.",
        },
        {
          selector: 'MemberExpression[object.name="localStorage"]',
          message:
            "localStorage напрямую. Настройки устройства — readLocal/writeLocal (lib/safeStorage), данные — через репозиторий.",
        },
      ],
    },
  },

  prettier,
);
