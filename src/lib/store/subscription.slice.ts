import { TARIFF_FEATURES } from "../tariff";
import type { SliceCreator, SubscriptionSlice } from "./state";

/**
 * Тариф аккаунта и то, что от него зависит в кабинете: аналитика, менеджер,
 * резервные копии. Демо стартует на «Складе» — среднем тарифе, на котором
 * видно и полную аналитику, и копию на почту.
 */
export const createSubscriptionSlice: SliceCreator<SubscriptionSlice> = (set) => ({
  subscription: {
    tariff: "warehouse",
    backup: { remindEveryDays: 7, emailWeekly: false },
  },

  setTariff: (tariff) =>
    set((s) => ({
      subscription: {
        ...s.subscription,
        tariff,
        // Копия на почту не переживает переход на тариф без неё: иначе
        // настройка выглядела бы включённой, а писем не было бы.
        backup: TARIFF_FEATURES[tariff].weeklyEmailBackup
          ? s.subscription.backup
          : { ...s.subscription.backup, emailWeekly: false },
      },
    })),

  updateBackupSettings: (patch) =>
    set((s) => ({
      subscription: { ...s.subscription, backup: { ...s.subscription.backup, ...patch } },
    })),

  markBackupDone: (at) =>
    set((s) => ({
      subscription: {
        ...s.subscription,
        backup: { ...s.subscription.backup, lastBackupAt: at, snoozedUntil: undefined },
      },
    })),
});
