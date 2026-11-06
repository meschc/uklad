import { Scale } from "lucide-react";
import { useEditor } from "@/lib/store";
import { disputesRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { isSenior } from "@/lib/docFlow";
import type { Dispute, DisputeKind, DisputeResolution } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { EmptyState, ScreenShell } from "@/components/fulfillment/ScreenShell";

const KIND_KEY: Record<DisputeKind, MsgKey> = {
  shortage: "disputes.kind.shortage",
  not_in_tote: "disputes.kind.not_in_tote",
  extra: "disputes.kind.extra",
  not_packable: "disputes.kind.not_packable",
};

const RES_KEY: Record<DisputeResolution, MsgKey> = {
  returned: "disputes.res.returned",
  moved: "disputes.res.moved",
  written_off: "disputes.res.written_off",
};

const fmt = (at: number) =>
  new Date(at).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * «Спорные» (вид `disputes`): недостачи и ошибки скана, которые сотрудник у
 * стола не оформляет. Товар он откладывает, тара уходит старшему, а здесь
 * старший решает: вернуть на место, переложить или списать. Решить может
 * руководитель из кабинета или сотрудник на должности старшего, вошедший по
 * бейджу; рядовому сотруднику экран только показывает.
 */
export function DisputesScreen() {
  const t = useT();
  const disputes = useEditor((s) => s.disputes);
  const products = useEditor((s) => s.products);
  const staff = useEditor((s) => s.warehouse.staff) ?? [];
  const session = useEditor((s) => s.stationSession);
  const resolve = useCommand(disputesRepository.resolve);

  const badgeStaff = session ? staff.find((m) => m.id === session.staffId) : undefined;
  // Из кабинета (без бейджа) решает руководитель; у стола — только старший.
  const canResolve = !badgeStaff || isSenior(badgeStaff);
  const by = badgeStaff?.id ?? "manager";

  const open = disputes.filter((d) => !d.resolution);
  const done = disputes.filter((d) => d.resolution).slice(0, 20);

  const nameOf = (id?: string) => products.find((p) => p.id === id)?.name ?? "—";
  const who = (id: string) =>
    id === "manager" ? t("disputes.manager") : (staff.find((m) => m.id === id)?.name ?? "—");

  return (
    <ScreenShell title={t("disputes.title")} subtitle={t("disputes.lead")} wide>
      {open.length === 0 ? (
        <EmptyState
          icon={<Scale className="size-5" />}
          title={t("disputes.emptyTitle")}
          body={t("disputes.empty")}
        />
      ) : (
        <ul className="flex flex-col">
          {open.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-4 first:border-t-0 first:pt-0"
            >
              <Line d={d} name={nameOf(d.productId)} who={who(d.raisedBy)} />
              {canResolve && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void resolve.run(d.id, "returned", by)}>
                    {t("disputes.act.returned")}
                  </Button>
                  <Button variant="outline" onClick={() => void resolve.run(d.id, "moved", by)}>
                    {t("disputes.act.moved")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void resolve.run(d.id, "written_off", by)}
                  >
                    {t("disputes.act.written_off")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {resolve.error && (
        <p role="alert" className="text-sm text-destructive">
          {t(resolve.error)}
        </p>
      )}

      {done.length > 0 && (
        <section className="mt-10 flex flex-col gap-2">
          <h2 className={eyebrow({ tone: "muted" })}>{t("disputes.done")}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {done.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap justify-between gap-x-4 text-muted-foreground"
              >
                <span>
                  {t(KIND_KEY[d.kind])} · {nameOf(d.productId)} · {d.qty}
                </span>
                <span>
                  {t(RES_KEY[d.resolution!])} · {who(d.resolvedBy!)} · {fmt(d.resolvedAt!)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ScreenShell>
  );
}

function Line({ d, name, who }: { d: Dispute; name: string; who: string }) {
  const t = useT();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="flex flex-wrap items-baseline gap-x-3">
        <span
          className={cn(
            "text-sm font-semibold",
            d.kind === "shortage" ? "text-orange-500" : "text-destructive",
          )}
        >
          {t(KIND_KEY[d.kind])}
        </span>
        <span className="text-base font-medium">{name}</span>
        <span className="tabular-nums text-muted-foreground">× {d.qty}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        {d.toteCode && <span className="font-mono">{d.toteCode} · </span>}
        {t("disputes.raised", { who, at: fmt(d.raisedAt) })}
      </p>
    </div>
  );
}
