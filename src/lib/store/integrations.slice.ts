import type { IntegrationsSlice, SliceCreator } from "./state";

/**
 * Подключения к внешним системам (п.22). Хранятся локально, как и всё
 * остальное в прототипе: настоящий обмен появится вместе с backend, а до тех
 * пор экран «Интеграции» — это заполненная и проверяемая заявка на подключение.
 */
export const createIntegrationsSlice: SliceCreator<IntegrationsSlice> = (set) => ({
  integrations: {},

  updateIntegration: (id, patch) =>
    set((s) => ({
      integrations: {
        ...s.integrations,
        [id]: { ...s.integrations[id], ...patch },
      },
    })),
});
