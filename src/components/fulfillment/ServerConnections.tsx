import { useEffect, useState } from "react";
import { getConnector } from "@/lib/connectors";
import {
  connectorsRepository,
  type ServerConnection,
  type ServerConnectorSystem,
} from "@/lib/data/connectorsRepository";
import type { IntegrationSpec } from "@/lib/integrations";
import type { MsgKey, TFunc } from "@/lib/i18n";
import { useCommand } from "@/lib/useCommand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eyebrow } from "@/components/ui/eyebrow";
import { FormError } from "@/components/ui/field";

/** Подпись второго поля: Client-Id у Ozon, номер кампании у Маркета, у WB нет. */
const CLIENT_LABEL: Partial<
  Record<ServerConnectorSystem, "integr.field.clientId" | "integr.field.campaignId">
> = {
  ozon: "integr.field.clientId",
  "yandex-market": "integr.field.campaignId",
};

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
  const [label, setLabel] = useState("");
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
    const res = await save.run({
      system,
      label,
      token,
      ...(clientLabel ? { clientId } : {}),
    });
    if (!res.ok) return;
    setToken("");
    setLabel("");
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
        : t(res.error);
    setChecks((c) => ({ ...c, [id]: text }));
  };

  const onRemove = async (id: string) => {
    if ((await remove.run(id)).ok) reload();
  };

  const error = loadError ?? save.error ?? remove.error;
  const canSave = !!label.trim() && !!token.trim() && (!clientLabel || !!clientId.trim());

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
              <span className="flex-1 text-xs text-muted-foreground">{checks[r.id]}</span>
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
          <span className={eyebrow()}>{t("integr.field.label")}</span>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-9" />
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
    </div>
  );
}
