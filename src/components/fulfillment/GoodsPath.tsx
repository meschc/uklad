import { useEffect, useMemo, useState } from "react";
import { Route, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { journalRepository } from "@/lib/data";
import { isJournalError, type ActivityEntry } from "@/lib/activityJournal";
import { matchDirection, narrowMatches, resolvePathSearch, type PathMatch } from "@/lib/goodsPath";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { card } from "@/components/ui/card";
import { FormError } from "@/components/ui/field";
import { DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { EmptyState } from "./ScreenShell";
import { CodeTail, CodeText } from "./CodeTail";
import { actionKey, useEntryText } from "./journalText";

type Text = ReturnType<typeof useEntryText>;

/**
 * «Путь товара» (Кирилл 16.11), вкладка журнала действий: найти посылку по
 * коду отправления, «Честному знаку», EAN, артикулу, заказу или последним 4
 * цифрам и посмотреть её путь от приёмки до рейса — кто и когда делал каждый
 * шаг. Совпадений бывает несколько: список сужается днём и направлением.
 */
export function GoodsPath() {
  const t = useT();
  const products = useEditor((s) => s.products);
  const requests = useEditor((s) => s.requests);
  const text = useEntryText();
  const [find, setFind] = useState("");
  const [matches, setMatches] = useState<PathMatch[] | null>(null);
  const [failed, setFailed] = useState<MsgKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [day, setDay] = useState("");
  const [direction, setDirection] = useState("");
  const [open, setOpen] = useState<PathMatch | null>(null);

  const search = async () => {
    const s = resolvePathSearch(find, { products, requests });
    if (!s) return;
    setBusy(true);
    const res = await journalRepository.pathFind(s);
    setBusy(false);
    setFailed(res.ok ? null : (res.error as MsgKey));
    setMatches(res.ok ? res.data : null);
    setDay("");
    setDirection("");
  };

  const directions = useMemo(
    () =>
      [...new Set((matches ?? []).map((m) => matchDirection(m, requests)).filter(Boolean))].sort(),
    [matches, requests],
  );
  const shown = useMemo(
    () => narrowMatches(matches ?? [], { day, direction }, requests),
    [matches, day, direction, requests],
  );

  return (
    <>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input
          className="h-9 w-full sm:w-80"
          value={find}
          placeholder={t("goodsPath.find")}
          aria-label={t("goodsPath.find")}
          onChange={(e) => setFind(e.target.value)}
        />
        <Button type="submit" disabled={busy || !find.trim()}>
          {t("goodsPath.search")}
        </Button>
      </form>

      {matches && matches.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            className="h-8 w-44"
            value={day}
            aria-label={t("goodsPath.day")}
            title={t("goodsPath.day")}
            onChange={(e) => setDay(e.target.value)}
          />
          {directions.length > 1 && (
            <Select
              size="sm"
              value={direction}
              aria-label={t("goodsPath.direction")}
              onChange={(e) => setDirection(e.target.value)}
              className="w-52"
            >
              <option value="">{t("goodsPath.allDirections")}</option>
              {directions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          )}
          <span className="text-xs text-muted-foreground">
            {t("goodsPath.found", { n: shown.length, total: matches.length })}
          </span>
        </div>
      )}

      {failed ? (
        <FormError>{t(failed)}</FormError>
      ) : busy ? (
        <p className="text-sm text-muted-foreground">{t("data.busy")}</p>
      ) : !matches ? (
        <EmptyState
          icon={<Route className="size-5" />}
          title={t("goodsPath.start")}
          body={t("goodsPath.start.body")}
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={<Route className="size-5" />} title={t("goodsPath.none")} />
      ) : (
        <ul className={cn(card(), "divide-y divide-border")}>
          {shown.map((m) => (
            <li key={m.id}>
              <MatchRow m={m} text={text} onOpen={() => setOpen(m)} />
            </li>
          ))}
        </ul>
      )}

      {open && <PathPanel key={open.id} match={open} text={text} onClose={() => setOpen(null)} />}
    </>
  );
}

const stamp = (lang: string, ms: number) =>
  new Date(ms).toLocaleString(lang, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const ordersOf = (m: PathMatch, text: Text) =>
  m.requestIds
    .slice(0, 3)
    .map((id) => text.order(id))
    .join(", ") + (m.requestIds.length > 3 ? ` +${m.requestIds.length - 3}` : "");

function MatchRow({ m, text, onOpen }: { m: PathMatch; text: Text; onOpen: () => void }) {
  const t = useT();
  const requests = useEditor((s) => s.requests);
  const direction = matchDirection(m, requests);
  const goods = m.lines
    .slice(0, 3)
    .map((l) => `${text.product(l.productId)} × ${l.qty}`)
    .join(", ");
  const detail = [
    m.outboundCode && m.requestIds.length && t("goodsPath.orders", { list: ordersOf(m, text) }),
    goods,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-1 px-4 py-3 text-left text-sm hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-medium">
          {m.outboundCode ? (
            <CodeTail code={m.outboundCode} />
          ) : (
            t("goodsPath.order", { order: text.order(m.requestIds[0]) ?? "" })
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
        {m.code && (
          <span className="block text-xs text-muted-foreground">
            {t("goodsPath.byCode")} <CodeTail code={m.code} />
          </span>
        )}
      </span>
      {direction && <span className="text-xs text-muted-foreground">{direction}</span>}
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {stamp(t.lang, m.at)}
        {m.staffRef && ` · ${text.staffName(m.staffRef)}`}
      </span>
    </button>
  );
}

/** Лента посылки панелью справа: шаг за шагом, кто и когда. */
function PathPanel({
  match,
  text,
  onClose,
}: {
  match: PathMatch;
  text: Text;
  onClose: () => void;
}) {
  const t = useT();
  const [events, setEvents] = useState<ActivityEntry[] | null>(null);
  const [failed, setFailed] = useState<MsgKey | null>(null);
  useEffect(() => {
    let current = true;
    void journalRepository.pathSteps(match).then((res) => {
      if (!current) return;
      setFailed(res.ok ? null : (res.error as MsgKey));
      setEvents(res.ok ? res.data : []);
    });
    return () => {
      current = false;
    };
  }, [match]);
  return (
    <DialogShell size="lg" scroll onClose={onClose}>
      <DialogHeader align="start">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{t("goodsPath.panel")}</h2>
          <p className="text-sm text-muted-foreground">
            {match.outboundCode && <CodeTail code={match.outboundCode} />}
            {match.outboundCode && match.requestIds.length > 0 && " · "}
            {match.requestIds.length > 0 && t("goodsPath.orders", { list: ordersOf(match, text) })}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label={t("goodsPath.close")} onClick={onClose}>
          <X className="size-4" />
        </Button>
      </DialogHeader>
      <div className="px-5 py-4">
        {failed ? (
          <FormError>{t(failed)}</FormError>
        ) : !events ? (
          <p className="text-sm text-muted-foreground">{t("data.busy")}</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("goodsPath.noSteps")}</p>
        ) : (
          <ol className="flex flex-col gap-4 border-l border-border pl-5">
            {events.map((e) => (
              <Step key={e.id} e={e} text={text} />
            ))}
          </ol>
        )}
      </div>
    </DialogShell>
  );
}

function Step({ e, text }: { e: ActivityEntry; text: Text }) {
  const t = useT();
  const error = isJournalError(e);
  const what = text.what(e);
  return (
    <li className="relative text-sm">
      <span
        className={cn(
          "absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-background",
          error ? "bg-destructive" : "bg-primary",
        )}
      />
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {t(`journal.step.${e.step}`)}
        </span>
        <span className={cn("font-medium", error && "text-destructive")}>{t(actionKey(e))}</span>
      </p>
      {what && (
        <p className="mt-0.5 text-muted-foreground">
          <CodeText text={what} />
        </p>
      )}
      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
        {stamp(t.lang, e.at)} · {text.who(e)}
      </p>
      {e.flagged && <p className="mt-0.5 text-xs text-muted-foreground">{text.reason(e)}</p>}
    </li>
  );
}
