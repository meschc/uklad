import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { journalRepository } from "@/lib/data";
import type { ActivityEntry } from "@/lib/activityJournal";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { Step } from "./GoodsPath";
import { useEntryText } from "./journalText";

/**
 * История своего товара у продавца (п. 2.1г, 28.11): что с ним делали на
 * складе — приёмка, размещение, сборка, упаковка, отгрузка, правка остатка.
 * Кто из людей склада — не показываем: продавцу это «Склад» (вопрос 1 треда).
 * Сервер сам режет чужое (`sellerJournal.js`), здесь только лента.
 */
export function SellerProductHistory({ productId }: { productId: string }) {
  const t = useT();
  const text = useEntryText();
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState<MsgKey | null>(null);
  const [busy, setBusy] = useState(false);

  /** Ответ страницы → лента; `before` — дописать к уже показанному. */
  const apply = (
    res: Awaited<ReturnType<typeof journalRepository.productStory>>,
    more: boolean,
  ) => {
    if (!res.ok) {
      setError(res.error as MsgKey);
      return;
    }
    setError(null);
    setNext(res.data.next);
    setEntries((was) => {
      // Граница страницы включительно: строка той же миллисекунды приходит дважды.
      const kept = more ? (was ?? []) : [];
      const seen = new Set(kept.map((e) => e.id));
      return [...kept, ...res.data.entries.filter((e) => !seen.has(e.id))];
    });
  };

  useEffect(() => {
    let current = true;
    void journalRepository.productStory(productId).then((res) => {
      if (current) apply(res, false);
    });
    return () => {
      current = false;
    };
  }, [productId]);

  const more = async (before: number) => {
    setBusy(true);
    const res = await journalRepository.productStory(productId, before);
    setBusy(false);
    apply(res, true);
  };

  return (
    <section className="flex flex-col gap-2 border-t border-border px-5 py-4">
      <p className="text-sm font-semibold">{t("journal.seller.title")}</p>
      {error && <FormError>{t(error)}</FormError>}
      {entries === null && busy && (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      )}
      {entries?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("journal.seller.empty")}</p>
      )}
      {entries && entries.length > 0 && (
        <ol className="ml-1 flex flex-col gap-4 border-l border-border pl-5">
          {entries.map((e) => (
            <Step key={e.id} e={e} text={text} by={t("journal.seller.by")} />
          ))}
        </ol>
      )}
      {next !== null && (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          disabled={busy}
          onClick={() => void more(next)}
        >
          {busy && <Loader2 className="animate-spin" />}
          {t("journal.more")}
        </Button>
      )}
    </section>
  );
}
