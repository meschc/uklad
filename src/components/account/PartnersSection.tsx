import { useState } from "react";
import { Plus, Store, Trash2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { formatPhone } from "@/lib/phone";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Партнёры-продавцы склада (п.15). Товар на складе принадлежит разным
 * продавцам, и это отдельная сущность, а не поле в карточке товара: партнёра
 * заводят один раз, а дальше выбирают из списка.
 */
export function PartnersSection() {
  const partners = useEditor((s) => s.warehouse.partners);
  const addPartner = useEditor((s) => s.addPartner);
  const updatePartner = useEditor((s) => s.updatePartner);
  const removePartner = useEditor((s) => s.removePartner);
  const products = useEditor((s) => s.products);
  const t = useT();
  const [draft, setDraft] = useState<{ name: string; contact: string } | null>(
    null,
  );

  const list = partners ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Store className="size-3.5 text-muted-foreground" />
          {t("partners.title")} · {list.length}
        </h2>
        {!draft && (
          <Button size="sm" onClick={() => setDraft({ name: "", contact: "" })}>
            <Plus className="size-3.5" />
            {t("partners.add")}
          </Button>
        )}
      </div>

      {draft && (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 sm:flex-row sm:items-center">
          <Input
            autoFocus
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={t("partners.namePlaceholder")}
            className="h-9"
          />
          <Input
            value={draft.contact}
            onChange={(e) => setDraft({ ...draft, contact: e.target.value })}
            placeholder={t("partners.contactPlaceholder")}
            className="h-9"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-9"
              disabled={!draft.name.trim()}
              onClick={() => {
                addPartner(draft);
                setDraft(null);
              }}
            >
              {t("common.save")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9"
              onClick={() => setDraft(null)}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}

      {list.length === 0 && !draft ? (
        <p className="text-xs text-muted-foreground">{t("partners.empty")}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {list.map((p) => {
            const n = products.filter((x) => x.partnerId === p.id).length;
            return (
              <div
                key={p.id}
                className="group flex items-center gap-2 rounded-lg border border-border px-3 py-2"
              >
                <Input
                  value={p.name}
                  onChange={(e) => updatePartner(p.id, { name: e.target.value })}
                  className="h-8 flex-1"
                />
                <Input
                  value={p.contact ?? ""}
                  onChange={(e) =>
                    updatePartner(p.id, {
                      // Телефон форматируем, почту оставляем как есть.
                      contact: /\d/.test(e.target.value) && !e.target.value.includes("@")
                        ? formatPhone(e.target.value)
                        : e.target.value,
                    })
                  }
                  placeholder={t("partners.contactPlaceholder")}
                  className="h-8 flex-1"
                />
                <span className="w-24 shrink-0 text-right text-[11px] text-muted-foreground">
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
