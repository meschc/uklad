import type { OnboardingSlice, SliceCreator } from "./state";

/**
 * Разовые подсказки онбординга. Подсказываем в момент первого столкновения с
 * механикой, а не туром в начале: показанные ключи запоминаются в persist.
 */
export const createOnboardingSlice: SliceCreator<OnboardingSlice> = (set) => ({
  seenHints: [],
  activeHint: null,

  showHint: (key) =>
    set((s) =>
      s.activeHint || s.seenHints.includes(key) ? {} : { activeHint: key },
    ),

  dismissHint: () =>
    set((s) => ({
      activeHint: null,
      seenHints:
        s.activeHint && !s.seenHints.includes(s.activeHint)
          ? [...s.seenHints, s.activeHint]
          : s.seenHints,
    })),

  resetHints: () => set({ seenHints: [], activeHint: null }),
});
