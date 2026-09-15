import base from "../tailwind.config.js";

/**
 * Витрина наследует тему редактора целиком: цвета, шкалу скруглений, шрифты.
 * Копия конфига разъехалась бы с приложением на первой же правке палитры —
 * поэтому здесь только `content` (свои файлы) и то, что нужно лендингу и не
 * нужно редактору: длинные плавные появления секций при скролле.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  ...base,
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    ...base.theme,
    extend: {
      ...base.theme.extend,
      keyframes: {
        ...base.theme.extend.keyframes,
        // Карточка роадмапа въезжает снизу — витрина читается сверху вниз,
        // и движение должно совпадать с направлением чтения.
        "rise-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        ...base.theme.extend.animation,
        "rise-in": "rise-in 260ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
};
