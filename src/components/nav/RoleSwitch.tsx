import { Store, Warehouse } from "lucide-react";
import { selectRole, useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Segmented } from "@/components/ui/segmented";

/**
 * Переключатель роли «Кладовщик / Продавец».
 *
 * Это НЕ второй аккаунт: backend в прототипе нет, данные общие и локальные —
 * меняется только набор экранов и права (продавец не правит структуру склада).
 * Дверь в будущее оставлена в модели: `FulfillmentRequest` ляжет в таблицу
 * Supabase почти без изменений, когда роли станут настоящими.
 *
 * На сервере роль настоящая — из учётной записи (продавец склада, миграция
 * 038), — и переключателя нет: продавец не переключится «в кладовщика».
 */
export function RoleSwitch() {
  const role = useEditor(selectRole);
  const setRole = useEditor((s) => s.setRole);
  const onServer = useEditor((s) => s.session.source === "server");
  const t = useT();
  if (onServer) return null;

  return (
    <Segmented
      value={role}
      onChange={setRole}
      ariaLabel={t("role.title")}
      options={[
        {
          value: "warehouse",
          label: t("role.warehouse"),
          icon: <Warehouse />,
        },
        { value: "seller", label: t("role.seller"), icon: <Store /> },
      ]}
    />
  );
}
