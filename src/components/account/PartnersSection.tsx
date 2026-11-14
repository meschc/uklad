import { useWarehouseProducts } from "@/lib/warehouseProducts";
import { useState } from "react";
import { ChevronRight, Plus, Store } from "lucide-react";
import { useEditor } from "@/lib/store";
import { formatPhone, PHONE_MAX_LENGTH } from "@/lib/phone";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkPartner } from "@/lib/validate";
import { FieldError } from "@/components/ui/field";
import { EmailInput } from "./EmailInput";
import { PartnerCard } from "./PartnerCard";

/**
 * Партнёры-продавцы склада (п.15). Товар на складе принадлежит разным
 * продавцам, и это отдельная сущность, а не поле в карточке товара: партнёра
 * заводят один раз, а дальше выбирают из списка.
 */
type Draft = { name: string; contact: string; person: string; phone: string };

export function PartnersSection() {
  const partners = useEditor((s) => s.warehouse.partners);
  const addPartner = useEditor((s) => s.addPartner);
  const [openId, setOpenId] = useState<string | null>(null);
  const products = useWarehouseProducts();
  const t = useT();
  const [draft, setDraft] = useState<Draft | null>(null);
  // Проверка — по нажатию «Сохранить», а не с первой буквы: красное поле до
  // того, как человек закончил ввод, только мешает.
  const [tried, setTried] = useState(false);
  const errors = draft ? checkPartner(draft, true) : {};
  const errOf = (f: keyof typeof errors) => (tried && errors[f] ? t(errors[f]) : null);
  const under = (f: keyof typeof errors) => {
    const e = errOf(f);
    return e ? <FieldError>{e}</FieldError> : null;
  };

  const list = partners ?? [];
  const open = list.find((p) => p.id === openId) ?? null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Store className="size-3.5 text-muted-foreground" />
          {t("partners.title")} · {list.length}
        </h2>
        {!draft && (
          <Button
            size="sm"
            onClick={() => setDraft({ name: "", contact: "", person: "", phone: "" })}
          >
            <Plus className="size-3.5" />
            {t("partners.add")}
          </Button>
        )}
      </div>

      {draft && (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_10rem_auto] sm:items-start">
            <div className="flex w-full flex-col gap-1">
              <Input
                // eslint-disable-next-line jsx-a11y/no-autofocus -- строка добавлена по клику пользователя: фокус обязан уйти в неё, иначе курсор остаётся на кнопке
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder={t("partners.namePlaceholder")}
                aria-invalid={!!errOf("name") || undefined}
                className="h-9"
              />
              {under("name")}
            </div>
            <div className="flex w-full flex-col gap-1">
              <EmailInput
                value={draft.contact}
                onValueChange={(contact) => setDraft({ ...draft, contact })}
                placeholder={t("partners.contactPlaceholder")}
                aria-invalid={!!errOf("contact") || undefined}
                className="h-9"
              />
              {under("contact")}
            </div>
            <div className="flex w-full flex-col gap-1">
              <Input
                value={draft.person}
                onChange={(e) => setDraft({ ...draft, person: e.target.value })}
                placeholder={t("partners.personPlaceholder")}
                aria-invalid={!!errOf("person") || undefined}
                className="h-9"
              />
              {under("person")}
            </div>
            <div className="flex w-full flex-col gap-1">
              <Input
                value={draft.phone}
                inputMode="tel"
                maxLength={PHONE_MAX_LENGTH}
                onChange={(e) => setDraft({ ...draft, phone: formatPhone(e.target.value) })}
                placeholder="+7 900 000-00-00"
                aria-invalid={!!errOf("phone") || undefined}
                className="h-9"
              />
              {under("phone")}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-9"
                onClick={() => {
                  setTried(true);
                  if (Object.keys(errors).length) return;
                  addPartner({
                    name: draft.name.trim(),
                    contact: draft.contact.trim(),
                    person: draft.person,
                    phone: draft.phone,
                  });
                  setDraft(null);
                  setTried(false);
                }}
              >
                {t("common.save")}
              </Button>
              <Button size="sm" variant="ghost" className="h-9" onClick={() => setDraft(null)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("partners.inviteHint")}</p>
        </div>
      )}

      {list.length === 0 && !draft ? (
        <p className="text-xs text-muted-foreground">{t("partners.empty")}</p>
      ) : (
        <div className="flex flex-col divide-y divide-border/60">
          {/* Строки — для чтения, правка в карточке партнёра (Кирилл 12 ноя).
              Без полей и рамок в строке: контакт и телефон рядом — «кому
              звонить» читается одним взглядом. */}
          {list.map((p) => {
            const n = products.filter((x) => x.partnerId === p.id).length;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setOpenId(p.id)}
                className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_9rem_6rem_1rem] items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors duration-fast hover:bg-muted/60"
              >
                <span className="truncate font-medium">{p.name}</span>
                <span className="truncate text-muted-foreground">{p.contact || "—"}</span>
                <span className="truncate">{p.person || "—"}</span>
                <span className="truncate tabular-nums">{p.phone || "—"}</span>
                <span className="text-right text-xs text-muted-foreground">
                  {t("partners.goods", { n })}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
      {open && <PartnerCard partner={open} onClose={() => setOpenId(null)} />}
    </section>
  );
}
