import { useWarehouseProducts } from "@/lib/warehouseProducts";
import { useState } from "react";
import { Plus, Store, Trash2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { formatPhone, PHONE_MAX_LENGTH } from "@/lib/phone";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EmailInput } from "./EmailInput";

/** Почта латиницей: имя, «@», домен с точкой — без пробелов и кириллицы. */
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/**
 * Партнёры-продавцы склада (п.15). Товар на складе принадлежит разным
 * продавцам, и это отдельная сущность, а не поле в карточке товара: партнёра
 * заводят один раз, а дальше выбирают из списка.
 */
type Draft = { name: string; contact: string; person: string; phone: string };

export function PartnersSection() {
  const partners = useEditor((s) => s.warehouse.partners);
  const addPartner = useEditor((s) => s.addPartner);
  const updatePartner = useEditor((s) => s.updatePartner);
  const removePartner = useEditor((s) => s.removePartner);
  const products = useWarehouseProducts();
  const t = useT();
  const [draft, setDraft] = useState<Draft | null>(null);
  // Проверка — по нажатию «Сохранить», а не с первой буквы: красное поле до
  // того, как человек закончил ввод, только мешает.
  const [tried, setTried] = useState(false);
  const nameErr = (draft?.name.trim().length ?? 0) < 2;
  const emailErr = !EMAIL_RE.test(draft?.contact.trim() ?? "");

  const list = partners ?? [];

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
            <Input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- строка добавлена по клику пользователя: фокус обязан уйти в неё, иначе курсор остаётся на кнопке
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={t("partners.namePlaceholder")}
              className={cn("h-9", tried && nameErr && "border-destructive")}
            />
            <div className="flex w-full flex-col gap-1">
              <EmailInput
                value={draft.contact}
                onValueChange={(contact) => setDraft({ ...draft, contact })}
                placeholder={t("partners.contactPlaceholder")}
                className={cn("h-9", tried && emailErr && "border-destructive")}
              />
            </div>
            <Input
              value={draft.person}
              onChange={(e) => setDraft({ ...draft, person: e.target.value })}
              placeholder={t("partners.personPlaceholder")}
              className="h-9"
            />
            <Input
              value={draft.phone}
              inputMode="tel"
              maxLength={PHONE_MAX_LENGTH}
              onChange={(e) => setDraft({ ...draft, phone: formatPhone(e.target.value) })}
              placeholder="+7 900 000-00-00"
              className="h-9"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-9"
                onClick={() => {
                  setTried(true);
                  if (nameErr || emailErr) return;
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
          <p
            className={cn(
              "text-xs",
              tried && (nameErr || emailErr) ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {tried && nameErr
              ? t("partners.badName")
              : tried && emailErr
                ? t("partners.badEmail")
                : t("partners.inviteHint")}
          </p>
        </div>
      )}

      {list.length === 0 && !draft ? (
        <p className="text-xs text-muted-foreground">{t("partners.empty")}</p>
      ) : (
        <div className="flex flex-col divide-y divide-border/60">
          {list.map((p) => {
            const n = products.filter((x) => x.partnerId === p.id).length;
            return (
              <div key={p.id} className="group flex items-center gap-2 py-1.5">
                <Input
                  value={p.name}
                  onChange={(e) => updatePartner(p.id, { name: e.target.value })}
                  className="h-8 flex-1"
                />
                <Input
                  value={p.person ?? ""}
                  onChange={(e) => updatePartner(p.id, { person: e.target.value })}
                  placeholder={t("partners.personPlaceholder")}
                  className="h-8 flex-1"
                />
                <span className="w-48 shrink-0 truncate text-sm text-muted-foreground">
                  {p.contact || "—"}
                </span>
                <Input
                  value={p.phone ?? ""}
                  inputMode="tel"
                  maxLength={PHONE_MAX_LENGTH}
                  onChange={(e) => updatePartner(p.id, { phone: formatPhone(e.target.value) })}
                  placeholder="+7 900 000-00-00"
                  className="h-8 w-40 shrink-0"
                />
                <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                  {t("partners.goods", { n })}
                </span>
                <button
                  onClick={() => removePartner(p.id)}
                  title={t("partners.remove")}
                  className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
