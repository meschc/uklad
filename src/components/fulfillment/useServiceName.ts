import { useCallback } from "react";
import { useEditor } from "@/lib/store";
import { customServiceName } from "@/lib/operations";
import { useT, type MsgKey } from "@/lib/i18n";
import type { ServiceKind } from "@/lib/types";

/**
 * Подпись услуги: встроенной — из словаря, своей — название, которое дал
 * склад. Своя услуга, которую уже убрали из каталога, в истории подписана
 * «Услуга удалена»: прошлое задание не должно показывать служебный код.
 */
export function useServiceName(): (kind: ServiceKind) => string {
  const t = useT();
  const settings = useEditor((s) => s.serviceSettings);
  return useCallback(
    (kind: ServiceKind) =>
      kind.startsWith("custom:")
        ? (customServiceName(settings, kind) ?? t("ops.svc.removed"))
        : t(`ops.svc.${kind}` as MsgKey),
    [settings, t],
  );
}
