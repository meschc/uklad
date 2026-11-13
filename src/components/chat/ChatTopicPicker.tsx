import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useEditor } from "@/lib/store";
import { visibleProducts } from "@/lib/warehouseProducts";
import { useT } from "@/lib/i18n";
import type { ChatTopic, ChatTopicKind } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Сколько строк мини-таблицы видно сразу: дальше — поиском. */
const ROWS = 6;

interface Row {
  id: string;
  title: string;
  cols: string[];
  topic: ChatTopic;
}

const day = (ms: number) => new Date(ms).toLocaleDateString("ru-RU");

/**
 * Выбор предмета темы: поиск и таблица в мини-формате, а не список названий
 * (Кирилл 12 ноя: «должно быть поле поиска товара и данные не только по
 * названию, а целая таблица»). Работает для всех тем, у которых есть предмет:
 * товар, заявка, поставка и рейс — раньше выбрать можно было только товар.
 *
 * Продавец видит только своё: товар, закреплённый за ним, и заявки по нему.
 */
export function ChatTopicPicker({
  kind,
  value,
  onPick,
}: {
  kind: Exclude<ChatTopicKind, "other">;
  value: ChatTopic | null;
  onPick: (topic: ChatTopic) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const products = useEditor((s) => s.products);
  const warehouse = useEditor((s) => s.warehouse);
  const user = useEditor((s) => s.session.user);
  const requests = useEditor((s) => s.requests);
  const inbound = useEditor((s) => s.expectedShipments);
  const trips = useEditor((s) => s.shipments);

  const rows = useMemo<Row[]>(() => {
    const mine = visibleProducts(products, warehouse, user);
    const nameOf = new Map(mine.map((p) => [p.id, p]));
    if (kind === "product")
      return mine.map((p) => ({
        id: p.id,
        title: p.name,
        cols: [p.sku, p.barcode],
        topic: { kind, productId: p.id, label: p.name },
      }));
    if (kind === "request")
      return requests
        .filter((r) => nameOf.has(r.productId))
        .map((r) => {
          const p = nameOf.get(r.productId)!;
          const label = `${r.externalId ?? r.id.slice(-6)} · ${p.name}`;
          return {
            id: r.id,
            title: p.name,
            cols: [
              r.externalId ?? "—",
              `${r.qty} ${t("chat.topic.pcs")}`,
              t(`req.status.${r.status}`),
            ],
            topic: { kind, refId: r.id, productId: p.id, label },
          };
        });
    if (kind === "receiving")
      return inbound.map((x) => ({
        id: x.id,
        title: x.title ?? day(x.createdAt),
        cols: [`${x.lines.length} ${t("chat.topic.lines")}`, day(x.createdAt)],
        topic: { kind, refId: x.id, label: x.title ?? day(x.createdAt) },
      }));
    return trips.map((x) => ({
      id: x.id,
      title: x.destination,
      cols: [x.vehicle ?? "—", day(x.shippedAt)],
      topic: { kind, refId: x.id, label: `${x.destination} · ${day(x.shippedAt)}` },
    }));
  }, [kind, products, warehouse, user, requests, inbound, trips, t]);

  const q = query.trim().toLowerCase();
  const found = q
    ? rows.filter((r) => [r.title, ...r.cols].some((c) => c.toLowerCase().includes(q)))
    : rows;
  const picked = value?.refId ?? value?.productId;

  return (
    <div className="flex animate-expand-in flex-col gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- поиск открыт нажатием на тему: курсор сразу в нём
          autoFocus
          value={query}
          maxLength={80}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(`chat.topic.search.${kind}`)}
          aria-label={t(`chat.topic.search.${kind}`)}
          className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {found.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">{t("chat.topic.notFound")}</p>
      ) : (
        <div className="flex flex-col">
          {found.slice(0, ROWS).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onPick(r.topic)}
              aria-pressed={picked === r.id}
              className={cn(
                "flex items-baseline gap-3 rounded-md px-1.5 py-1.5 text-left transition-colors duration-fast hover:bg-muted/60",
                picked === r.id && "bg-primary/10",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
              {r.cols.map((c, i) => (
                <span
                  key={i}
                  className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground"
                >
                  {c}
                </span>
              ))}
            </button>
          ))}
        </div>
      )}
      {found.length > ROWS && (
        <p className="px-1 text-2xs text-muted-foreground">
          {t("chat.topic.more", { n: found.length - ROWS })}
        </p>
      )}
    </div>
  );
}
