import { useState } from "react";
import { Package, Store, Trash2, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useWarehouseProducts } from "@/lib/warehouseProducts";
import { formatPhone, PHONE_MAX_LENGTH } from "@/lib/phone";
import { useT } from "@/lib/i18n";
import type { Partner } from "@/lib/types";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmailInput } from "./EmailInput";
import { Field } from "@/components/ui/field";
import { checkPartner } from "@/lib/validate";

/** Сколько товаров партнёра показать в карточке: дальше — таблица товаров. */
const GOODS_SHOWN = 8;

/**
 * Подробная карточка партнёра (Кирилл 12 ноя: «подробные карточки на каждого
 * партнёра должны быть»). Список партнёров стал строками для чтения, а правка —
 * здесь, со «Сохранить» и «Отмена»: раньше поля в строке писали в стор на
 * каждую букву, и отменить опечатку было нельзя.
 *
 * Контактное лицо стоит рядом с телефоном — это одна мысль «кому звонить».
 */
export function PartnerCard({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  const t = useT();
  const updatePartner = useEditor((s) => s.updatePartner);
  const removePartner = useEditor((s) => s.removePartner);
  const restorePartner = useEditor((s) => s.restorePartner);
  const notify = useEditor((s) => s.notify);
  const goods = useWarehouseProducts().filter((x) => x.partnerId === partner.id);
  const [draft, setDraft] = useState({
    name: partner.name,
    contact: partner.contact ?? "",
    person: partner.person ?? "",
    phone: partner.phone ?? "",
  });
  const errors = checkPartner(draft);
  const invalid = Object.keys(errors).length > 0;
  const errOf = (f: keyof typeof errors) => (errors[f] ? t(errors[f]) : undefined);
  const dirty =
    draft.name !== partner.name ||
    draft.contact !== (partner.contact ?? "") ||
    draft.person !== (partner.person ?? "") ||
    draft.phone !== (partner.phone ?? "");

  const save = () => {
    if (invalid) return;
    updatePartner(partner.id, { ...draft, name: draft.name.trim(), contact: draft.contact.trim() });
    notify("success", "partners.saved", { vars: { name: draft.name.trim() } });
    onClose();
  };

  return (
    <DialogShell size="md" scroll onClose={onClose}>
      <DialogHeader>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Store className="size-4 text-muted-foreground" />
          {partner.name}
        </h2>
        <Button variant="ghost" size="icon-sm" aria-label={t("support.close")} onClick={onClose}>
          <X className="size-4" />
        </Button>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
        <Field label={t("partners.namePlaceholder")} error={errOf("name")}>
          <Input
            value={draft.name}
            maxLength={120}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label={t("partners.contactPlaceholder")} error={errOf("contact")}>
          <EmailInput
            value={draft.contact}
            onValueChange={(contact) => setDraft({ ...draft, contact })}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("partners.personPlaceholder")} error={errOf("person")}>
            <Input
              value={draft.person}
              maxLength={120}
              onChange={(e) => setDraft({ ...draft, person: e.target.value })}
            />
          </Field>
          <Field label={t("partners.phone")} error={errOf("phone")}>
            <Input
              value={draft.phone}
              inputMode="tel"
              maxLength={PHONE_MAX_LENGTH}
              placeholder="+7 900 000-00-00"
              onChange={(e) => setDraft({ ...draft, phone: formatPhone(e.target.value) })}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Package className="size-4 text-muted-foreground" />
            {t("partners.goods", { n: goods.length })}
          </h3>
          {goods.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("partners.noGoods")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60 text-sm">
              {goods.slice(0, GOODS_SHOWN).map((g) => (
                <li key={g.id} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate">{g.name}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{g.sku}</span>
                </li>
              ))}
              {goods.length > GOODS_SHOWN && (
                <li className="py-1.5 text-xs">
                  {/* Ссылка, а не подпись (Кирилл 13.11): таблица товаров
                      сразу с фильтром по этому партнёру. */}
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => {
                      const s = useEditor.getState();
                      s.setSearch("");
                      s.setTablePartner(partner.id);
                      s.goToEditor();
                      s.setMode("table");
                      onClose();
                    }}
                  >
                    {t("partners.moreGoods", { n: goods.length - GOODS_SHOWN })}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
      <DialogFooter spread>
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            // Класс `undoable`: убираем сразу, вернуть можно из тоста.
            const index = (useEditor.getState().warehouse.partners ?? []).findIndex(
              (p) => p.id === partner.id,
            );
            removePartner(partner.id);
            notify("success", "partners.removed", {
              vars: { name: partner.name },
              undo: () => restorePartner(partner, Math.max(0, index)),
            });
            onClose();
          }}
        >
          <Trash2 className="size-4" />
          {t("partners.remove")}
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={!dirty || invalid}>
            {t("common.save")}
          </Button>
        </div>
      </DialogFooter>
    </DialogShell>
  );
}
