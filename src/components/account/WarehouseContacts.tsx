import { useState } from "react";
import { Check } from "lucide-react";
import { useEditor } from "@/lib/store";
import { formatPhone, PHONE_MAX_LENGTH } from "@/lib/phone";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmailInput } from "./EmailInput";

/**
 * Телефон и почта самого склада — в паспорте, рядом с остальным, что видит
 * продавец (раньше жили в «Персонале» между людьми). Кнопка активна, только
 * когда есть что сохранять.
 */
export function WarehouseContacts() {
  const t = useT();
  const warehouse = useEditor((s) => s.warehouse);
  const updateWarehouseContacts = useEditor((s) => s.updateWarehouseContacts);
  const [c, setC] = useState({
    phone: warehouse.phone ?? "",
    email: warehouse.email ?? "",
    contactPerson: warehouse.contactPerson ?? "",
  });
  const [saved, setSaved] = useState(false);
  const dirty = c.phone !== (warehouse.phone ?? "") || c.email !== (warehouse.email ?? "");
  const save = () => {
    updateWarehouseContacts(warehouse.id, c);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };
  return (
    <section key={warehouse.id} className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{t("staff.contacts")}</h2>
      <div className="flex flex-wrap items-start gap-3">
        <Input
          value={c.phone}
          maxLength={PHONE_MAX_LENGTH}
          onChange={(e) => setC({ ...c, phone: formatPhone(e.target.value) })}
          placeholder="+7 495 000-00-00"
          aria-label={t("staff.phone")}
          inputMode="tel"
          className="h-9 w-48"
        />
        <div className="flex w-64 flex-col gap-1">
          <EmailInput
            value={c.email}
            onValueChange={(email) => setC({ ...c, email })}
            placeholder="sklad@example.com"
            aria-label={t("staff.email")}
            className="h-9"
          />
        </div>
        <Button
          size="sm"
          className="h-9"
          variant={saved ? "outline" : "default"}
          disabled={!dirty && !saved}
          onClick={save}
        >
          {saved && <Check className="size-3.5" />}
          {t(saved ? "staff.contactsSaved" : "common.save")}
        </Button>
      </div>
    </section>
  );
}
