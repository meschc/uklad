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

export default tseslint.config(
  {
    // Собранное, отчёты и зависимости линтеру показывать незачем.
    ignores: [
      "dist/**",
      "dist-ssr/**",
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

  prettier,
);
