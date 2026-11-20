import { useWarehouseProducts } from "@/lib/warehouseProducts";
import { useState } from "react";
import { ChevronRight, Plus, Store } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { PartnerCard } from "./PartnerCard";

/**
 * Партнёры-продавцы склада (п.15). Товар на складе принадлежит разным
 * продавцам, и это отдельная сущность, а не поле в карточке товара: партнёра
 * заводят один раз, а дальше выбирают из списка.
 */
export function PartnersSection() {
  const partners = useEditor((s) => s.warehouse.partners);
  // id открытой карточки; "" — панель нового партнёра.
  const [openId, setOpenId] = useState<string | null>(null);
  const products = useWarehouseProducts();
  const t = useT();

  const list = partners ?? [];
  const open = list.find((p) => p.id === openId) ?? null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Store className="size-3.5 text-muted-foreground" />
          {t("partners.title")} · {list.length}
        </h2>
        <Button size="sm" onClick={() => setOpenId("")}>
          <Plus className="size-3.5" />
          {t("partners.add")}
        </Button>
      </div>

      {list.length === 0 ? (
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
                // На телефоне — карточкой: имя и число товаров сверху, контакты
                // под ними. В шесть колонок на 390 px от имени оставалось «О…».
                className="grid grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-3 gap-y-0.5 rounded-md px-2 py-3 text-left text-sm transition-colors duration-fast hover:bg-muted/60 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_9rem_6rem_1rem] md:gap-3 md:py-2"
              >
                <span className="truncate font-medium">{p.name}</span>
                <span className="col-start-2 row-start-1 text-right text-xs text-muted-foreground md:col-start-5">
                  {t("partners.goods", { n })}
                </span>
                <ChevronRight className="col-start-3 row-start-1 size-4 text-muted-foreground md:col-start-6" />
                <span className="col-span-3 truncate text-xs text-muted-foreground md:hidden">
                  {[p.person, p.phone, p.contact].filter(Boolean).join(" · ") || "—"}
                </span>
                <span className="hidden truncate text-muted-foreground md:col-start-2 md:row-start-1 md:block">
                  {p.contact || "—"}
                </span>
                <span className="hidden truncate md:col-start-3 md:row-start-1 md:block">
                  {p.person || "—"}
                </span>
                <span className="hidden truncate tabular-nums md:col-start-4 md:row-start-1 md:block">
                  {p.phone || "—"}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {(open || openId === "") && (
        <PartnerCard key={openId} partner={open ?? undefined} onClose={() => setOpenId(null)} />
      )}
    </section>
  );
}
