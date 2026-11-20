import { useEffect, useState } from "react";
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

/** Пункт списка «Партнёр», который открывает панель нового партнёра. */
const NEW_PARTNER = "__new__";

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
 * «Проверить связь» — сервер сейчас же спрашивает площадку и заводит новые
 * заказы заявками (Кирилл 20.11): ответ площадки и есть доказательство, что
 * ключ рабочий. Без кнопки сервер делает то же сам раз в полторы минуты.
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
    const res = await connectorsRepository.pull(id);
    if (!res.ok) return setChecks((c) => ({ ...c, [id]: t(res.error) }));
    // Итог (заведено, незнакомый товар, отказ площадки) сервер записал в
    // подключение — строка покажет его из списка.
    setChecks(({ [id]: _, ...rest }) => rest);
    reload();
  };

  // Название подключения можно поменять; ключ — только заменой подключения.
  const rename = useCommand(connectorsRepository.rename);
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);
  const onRename = async () => {
    if (!editing?.label.trim()) return;
    if (!(await rename.run({ id: editing.id, label: editing.label.trim() })).ok) return;
    setEditing(null);
    reload();
  };

  const onRemove = async (id: string) => {
    if ((await remove.run(id)).ok) reload();
  };

  const error = loadError ?? save.error ?? remove.error ?? rename.error;
  const canSave = !!token.trim() && (!clientLabel || !!clientId.trim());

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              {editing?.id === r.id ? (
                <span className="flex items-center gap-2">
                  <Input
                    aria-label={t("integr.rename")}
                    value={editing.label}
                    maxLength={100}
                    onChange={(e) => setEditing({ id: r.id, label: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onRename();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="h-8 w-48"
                  />
                  <Button
                    size="sm"
                    disabled={!editing.label.trim() || rename.pending}
                    onClick={() => void onRename()}
                  >
                    {t("common.save")}
                  </Button>
                </span>
              ) : (
                <button
                  type="button"
                  className="font-medium hover:underline"
                  title={t("integr.rename")}
                  onClick={() => setEditing({ id: r.id, label: r.label })}
                >
                  {r.label}
                </button>
              )}
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className={eyebrow()}>{t("integr.field.partner")}</span>
          <Select
            value={partnerId}
            onChange={(e) =>
              e.target.value === NEW_PARTNER ? setAdding(true) : setPartnerId(e.target.value)
            }
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">{t("integr.ownGoods")}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value={NEW_PARTNER}>{t("integr.partner.new")}</option>
          </Select>
        </label>
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
      {rows.length > 0 && <p className="text-xs text-muted-foreground">{t("integr.pull.auto")}</p>}
      {adding && <PartnerCard onClose={() => setAdding(false)} onCreated={setPartnerId} />}
    </div>
  );
}
