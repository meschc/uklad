import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { getConnector } from "@/lib/connectors";
import { lastConnectorFailure } from "@/lib/connectors/transport";
import {
  connectorsRepository,
  type OrderPullResult,
  type ServerConnection,
  type ServerConnectorSystem,
} from "@/lib/data/connectorsRepository";
import type { IntegrationSpec } from "@/lib/integrations";
import type { MsgKey, TFunc } from "@/lib/i18n";
import { useCommand } from "@/lib/useCommand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useEditor } from "@/lib/store";
import { eyebrow } from "@/components/ui/eyebrow";
import { FormError } from "@/components/ui/field";
import { PartnerCard } from "@/components/account/PartnerCard";

/** Подпись второго поля: Client-Id у Ozon, номер кампании у Маркета, у WB нет. */
const CLIENT_LABEL: Partial<
  Record<ServerConnectorSystem, "integr.field.clientId" | "integr.field.campaignId">
> = {
  ozon: "integr.field.clientId",
  "yandex-market": "integr.field.campaignId",
};

/** Коды отказа подкачки на сервере → текст (`orderPull.js`). */
const PULL_ERROR: Record<string, MsgKey> = {
  rejected: "integr.error.rejected",
  rate_limit: "integr.error.rateLimit",
  warehouse: "integr.pull.error.warehouse",
  partner: "integr.pull.error.partner",
};

/** Итог последней подкачки подключения одной строкой. */
function lastPullText(r: OrderPullResult, t: TFunc): string {
  const time = new Date(r.at).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (r.error) {
    const text = t(PULL_ERROR[r.error] ?? "integr.error.upstream");
    return t("integr.pull.lastFailed", { time, text: withPlatformReply(text, r.detail ?? null) });
  }
  const lines = [t("integr.pull.last", { time, n: r.created ?? 0 })];
  if (r.unknown?.length) lines.push(t("integr.pull.unknown", { list: r.unknown.join(", ") }));
  return lines.join(". ");
}

/** Текст отказа + что ответила площадка, если она ответила. */
const withPlatformReply = (text: string, reply: string | null) =>
  reply ? `${text} (${reply})` : text;

/**
 * Подключения площадки, ключи которых хранит сервер. Магазинов у склада
 * много (у каждого селлера свой WB), поэтому это список, а не одна форма.
 * Ключ после сохранения не показывается: его нет даже в браузере.
 * «Проверить связь» спрашивает у площадки новые заказы — это и есть
 * доказательство, что ключ рабочий.
 */
export function ServerConnections({ spec, t }: { spec: IntegrationSpec; t: TFunc }) {
  const system = spec.id as ServerConnectorSystem;
  const clientLabel = CLIENT_LABEL[system];
  const [rows, setRows] = useState<ServerConnection[]>([]);
  const partners = useEditor((s) => s.warehouse.partners) ?? [];
  const warehouseId = useEditor((s) => s.warehouse.id);
  // "" — свой товар склада (склад без продавцов), иначе id партнёра.
  const [partnerId, setPartnerId] = useState("");
  // Продавца ещё нет в списке — заводим тут же, не уходя со страницы
  // (Кирилл 18.11): панель справа, после «Добавить» он выбран.
  const [adding, setAdding] = useState(false);
  const [clientId, setClientId] = useState("");
  const [token, setToken] = useState("");
  const [checks, setChecks] = useState<Record<string, string>>({});

  const save = useCommand(connectorsRepository.save);
  const remove = useCommand(connectorsRepository.remove);

  const [loadError, setLoadError] = useState<MsgKey | null>(null);
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);
  useEffect(() => {
    let alive = true;
    void connectorsRepository.list().then((res) => {
      if (!alive) return;
      setLoadError(res.ok ? null : res.error);
      if (res.ok) setRows(res.data.filter((r) => r.system === system));
    });
    return () => {
      alive = false;
    };
  }, [system, version]);

  const onSave = async () => {
    const label = partners.find((p) => p.id === partnerId)?.name ?? t("integr.ownGoods");
    const res = await save.run({
      system,
      label,
      token,
      ...(partnerId ? { partnerId } : {}),
      // Заказы магазина приходят заявками на склад, где его подключили.
      warehouseId,
      ...(clientLabel ? { clientId } : {}),
    });
    if (!res.ok) return;
    setToken("");
    setPartnerId("");
    setClientId("");
    reload();
  };

  const onCheck = async (id: string) => {
    setChecks((c) => ({ ...c, [id]: t("integr.check.running") }));
    const res = (await getConnector(system, id)?.fetchOrders?.()) ?? null;
    const text = !res
      ? t("integr.error.unsupported")
      : res.ok
        ? t("integr.check.ok", { n: res.data.length })
        : withPlatformReply(t(res.error), lastConnectorFailure());
    setChecks((c) => ({ ...c, [id]: text }));
  };

  const [pulled, setPulled] = useState<string | null>(null);
  const onPull = async () => {
    setPulled(t("integr.check.running"));
    const res = await connectorsRepository.pull();
    if (!res.ok) return setPulled(t(res.error));
    const { created, unknown } = res.data;
    const lines = [t("integr.pull.ok", { n: created })];
    if (unknown.length) lines.push(t("integr.pull.unknown", { list: unknown.join(", ") }));
    setPulled(lines.join(". "));
    // Итог по каждому подключению сервер записал — показать его в строках.
    reload();
  };

  const onRemove = async (id: string) => {
    if ((await remove.run(id)).ok) reload();
  };

  const error = loadError ?? save.error ?? remove.error;
  const canSave = !!token.trim() && (!clientLabel || !!clientId.trim());

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{r.label}</span>
              {r.clientId && (
                <span className="text-xs tabular-nums text-muted-foreground">{r.clientId}</span>
              )}
              <span className="flex-1 text-xs text-muted-foreground">
                {checks[r.id] ?? (r.lastPull ? lastPullText(r.lastPull, t) : null)}
              </span>
              <Button size="sm" variant="outline" onClick={() => void onCheck(r.id)}>
                {t("integr.check")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={remove.pending}
                onClick={() => void onRemove(r.id)}
              >
                {t("integr.remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void onPull()}>
              {t("integr.pull")}
            </Button>
            {pulled && <span className="text-xs text-muted-foreground">{pulled}</span>}
          </div>
          <p className="text-xs text-muted-foreground">{t("integr.pull.hint")}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          {/* Кнопка рядом с подписью, а не пунктом списка (Кирилл 20.11):
              пункт «+ Новый партнёр» среди продавцов не замечали. */}
          <div className="flex items-baseline justify-between gap-2">
            <span className={eyebrow()}>{t("integr.field.partner")}</span>
            <button
              type="button"
              className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
              onClick={() => setAdding(true)}
            >
              <Plus className="size-3" />
              {t("integr.partner.new")}
            </button>
          </div>
          <Select
            aria-label={t("integr.field.partner")}
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">{t("integr.ownGoods")}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        {clientLabel && (
          <label className="flex flex-col gap-1">
            <span className={eyebrow()}>{t(clientLabel)}</span>
            <Input value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-9" />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className={eyebrow()}>{t("integr.field.apiKey")}</span>
          <Input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="h-9"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={!canSave || save.pending} onClick={() => void onSave()}>
          {t("integr.saveToServer")}
        </Button>
        {error && <FormError>{t(error)}</FormError>}
      </div>
      {adding && <PartnerCard onClose={() => setAdding(false)} onCreated={setPartnerId} />}
    </div>
  );
}
