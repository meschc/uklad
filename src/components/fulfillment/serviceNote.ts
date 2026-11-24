import type { ServiceKind, ServiceSettings } from "@/lib/types";
import type { MsgKey, TFunc } from "@/lib/i18n";

/**
 * Описание по умолчанию — у услуг, где без него непонятно, что считается:
 * хранение (Кирилл 22.11: подпись «сутки с размещения до ухода с полки»
 * вынести в описание хранения, а не держать под отчётом).
 */
const DEFAULT_NOTE: Partial<Record<ServiceKind, MsgKey>> = {
  storage_pallet: "ops.svcNote.storage_pallet",
  storage_box: "ops.svcNote.storage_box",
};

/** Описание услуги: своё склада или по умолчанию; нет — `undefined`. */
export function serviceNote(
  settings: ServiceSettings,
  kind: ServiceKind,
  t: TFunc,
): string | undefined {
  const own = settings.notes?.[kind];
  if (own) return own;
  const key = DEFAULT_NOTE[kind];
  return key ? t(key) : undefined;
}
