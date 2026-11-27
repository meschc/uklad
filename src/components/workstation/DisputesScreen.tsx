import { useState } from "react";
import { Scale } from "lucide-react";
import { useEditor } from "@/lib/store";
import { selectRole } from "@/lib/store/session.slice";
import { isSessionLive } from "@/lib/workstation";
import { disputesRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { mayDecideGoods, mayWriteOffGoods } from "@/lib/docFlow";
import {
  inTote,
  isInventoryDispute,
  moveTargets,
  needsSecondPair,
  resolutionsFor,
} from "@/lib/disputes";
import type { Dispute, DisputeKind, DisputeResolution } from "@/lib/types";
import { kindKey, fmtAt as fmt } from "./disputeLabels";
import { DisputesDone } from "./DisputesDone";
import { TableScroll, TABLE_HEAD, TABLE_HEAD_ROW, TABLE_ROW } from "@/components/ui/table-scroll";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState, ScreenShell } from "@/components/fulfillment/ScreenShell";
import { formatAddress } from "@/lib/address";
import { useNow } from "./useNow";
import { FormError } from "@/components/ui/field";
import { CodeTail } from "@/components/fulfillment/CodeTail";

/** Поле причины открывается под рукой: сразу в него и печатают. */
const focusOnMount = (el: HTMLInputElement | null) => el?.focus();

/** Что написать на кнопке решения: у пересчёта свои слова, чем у остального спорного. */
function actKey(d: Dispute, r: DisputeResolution): MsgKey {
  if (isInventoryDispute(d)) {
    if (r === "returned") return "disputes.act.inventoryClose";
    if (r === "accepted") return "disputes.act.inventoryAdopt";
    return "disputes.act.inventoryWriteOff";
  }
  if (r === "written_off") {
    return d.kind === "receive_overage" ? "disputes.act.overageOff" : "disputes.act.written_off";
  }
  return ACT_KEY[r];
}

const ACT_KEY: Record<Exclude<DisputeResolution, "written_off">, MsgKey> = {
  returned: "disputes.act.returned",
  moved: "disputes.act.moved",
  accepted: "disputes.act.accepted",
};

/**
 * «Спорные» (вид `disputes`): недостачи и ошибки скана, которые сотрудник у
 * стола не оформляет. Товар он откладывает, тара уходит старшему, а здесь
 * старший решает: вернуть на место, переложить или списать. Решить может
 * руководитель из кабинета или сотрудник на должности старшего, вошедший по
 * бейджу; рядовому сотруднику экран только показывает.
 */
export function DisputesScreen({
  kinds,
  query = "",
  inApprovals = false,
  show = "both",
}: {
  /** Что показать: «Подтверждения» делят на вкладки «Ждут решения» и «Решённые». */
  show?: "open" | "done" | "both";
  /** Только эти виды — фильтр страницы «Подтверждения». */
  kinds?: readonly DisputeKind[];
  /** Поиск по товару и сотруднику — со страницы «Подтверждения». */
  query?: string;
  /** Внутри «Подтверждений»: без своей подписи и пустого состояния. */
  inApprovals?: boolean;
} = {}) {
  const t = useT();
  const disputes = useEditor((s) => s.disputes);
  const products = useEditor((s) => s.products);
  const boxes = useEditor((s) => s.boxes);
  const warehouse = useEditor((s) => s.warehouse);
  const staff = useEditor((s) => s.warehouse.staff) ?? [];
  const session = useEditor((s) => s.stationSession);
  const onServer = useEditor((s) => s.session.source === "server");
  const resolve = useCommand(disputesRepository.resolve);

  const role = useEditor(selectRole);
  const now = useNow();
  const [writing, setWriting] = useState<{
    id: string;
    resolution: DisputeResolution;
    /** Без права начальника списание только просят. */
    request?: boolean;
    /** «Переложить»: выбранная тара. */
    to?: string;
  } | null>(null);
  const [reason, setReason] = useState("");

  // Решает тот, кто явно вправе: руководитель склада из кабинета (роль склада,
  // бейджа нет) или сотрудник с правом роли на решения (в демо — должность
  // старшего) и живым входом по бейджу.
  // Просроченный вход и роль продавца кнопок не дают, а не «открывают по
  // умолчанию».
  const live = isSessionLive(session, now);
  const badgeStaff = live ? staff.find((m) => m.id === session!.staffId) : undefined;
  const canResolve =
    role === "warehouse" &&
    (session ? !!badgeStaff && mayDecideGoods(session, badgeStaff, onServer) : true);
  const by = badgeStaff?.id ?? "manager";
  // Правка учёта по инвентаризации в кабинете — право роли `goods.decide`;
  // за столом его уже проверил `mayDecideGoods`.
  const perms = useEditor((s) => s.session.permissions);
  const mayAdjust = (d: Dispute) =>
    !isInventoryDispute(d) || !!badgeStaff || !perms || perms.includes("goods.decide");
  // Списание подтверждает начальник склада (Кирилл 13.11): право роли
  // `goods.writeoff`, в демо — должность. Старший без него только просит.
  const mayWriteOff = badgeStaff
    ? mayWriteOffGoods(session, badgeStaff, onServer)
    : !perms || perms.includes("goods.writeoff");

  const nameOf = (id?: string) => products.find((p) => p.id === id)?.name ?? "—";
  const who = (id: string) =>
    id === "manager" ? t("disputes.manager") : (staff.find((m) => m.id === id)?.name ?? "—");
  const q = query.trim().toLowerCase();
  const shown = disputes.filter(
    (d) =>
      (!kinds || kinds.includes(d.kind)) &&
      (!q ||
        nameOf(d.productId).toLowerCase().includes(q) ||
        who(d.raisedBy).toLowerCase().includes(q) ||
        (d.toteCode ?? "").toLowerCase().includes(q)),
  );
  const open = shown.filter((d) => !d.resolution);
  // Лишнее с приёмки списывают «вернули поставщику»: руководитель должен
  // видеть, сколько так ушло, — иначе списание прячет пересорт и кражу.
  const monthAgo = now - 30 * 24 * 3600 * 1000;
  const overageOff = disputes
    .filter(
      (d) =>
        d.kind === "receive_overage" &&
        d.resolution === "written_off" &&
        (d.resolvedAt ?? 0) >= monthAgo,
    )
    .reduce((n, d) => n + d.qty, 0);
  const done = shown.filter((d) => d.resolution);

  return (
    <ScreenShell
      title={t("disputes.title")}
      subtitle={inApprovals ? undefined : t("disputes.lead")}
      wide
    >
      {show !== "done" &&
        canResolve &&
        overageOff > 0 &&
        (!kinds || kinds.includes("receive_overage")) && (
          <p className="mb-4 text-sm text-muted-foreground">
            {t("disputes.overageOff", { n: overageOff })}
          </p>
        )}
      {show === "done" ? null : open.length === 0 ? (
        inApprovals ? null : (
          <EmptyState
            icon={<Scale className="size-5" />}
            title={t("disputes.emptyTitle")}
            body={t("disputes.empty")}
          />
        )
      ) : (
        <TableScroll>
          <table className="table-stack w-auto border-collapse text-sm">
            <thead className={TABLE_HEAD}>
              <tr className={TABLE_HEAD_ROW}>
                <th className="px-3 py-2 font-normal">{t("disputes.col.product")}</th>
                <th className="px-3 py-2 font-normal">{t("disputes.col.kind")}</th>
                <th className="px-3 py-2 text-right font-normal">{t("disputes.col.qty")}</th>
                <th className="px-3 py-2 font-normal">{t("disputes.found")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {open.map((d) => (
                <tr key={d.id} className={TABLE_ROW}>
                  <Line
                    d={d}
                    name={nameOf(d.productId)}
                    who={who(d.raisedBy)}
                    askedBy={d.writeOffRequest && who(d.writeOffRequest.by)}
                  />
                  <td className="px-3 py-2">
                    {canResolve &&
                      mayAdjust(d) &&
                      (writing?.id === d.id && writing.resolution === "moved" ? (
                        // Переложить — с выбором тары и подтверждением (Кирилл 13.11).
                        <form
                          className="flex flex-wrap items-center gap-2"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (!writing.to) return;
                            const res = await resolve.run(d.id, "moved", by, undefined, {
                              to: writing.to,
                            });
                            if (res.ok) setWriting(null);
                          }}
                        >
                          <Select
                            className="w-64"
                            aria-label={t("disputes.moveTo")}
                            value={writing.to ?? ""}
                            onChange={(e) =>
                              setWriting({ ...writing, to: e.target.value || undefined })
                            }
                          >
                            <option value="">{t("disputes.moveTo")}</option>
                            {moveTargets(boxes, d).map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.barcode}
                                {b.address ? ` · ${formatAddress(warehouse, b.address) ?? ""}` : ""}
                              </option>
                            ))}
                          </Select>
                          <Button type="submit" disabled={!writing.to}>
                            {t("disputes.confirmMove")}
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => setWriting(null)}>
                            {t("disputes.cancel")}
                          </Button>
                        </form>
                      ) : writing?.id === d.id ? (
                        <form
                          className="flex flex-wrap items-center gap-2"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const res = await resolve.run(d.id, writing.resolution, by, reason, {
                              request: writing.request,
                            });
                            if (res.ok) {
                              setWriting(null);
                              setReason("");
                            }
                          }}
                        >
                          <Input
                            ref={focusOnMount}
                            className="h-9 w-64"
                            value={reason}
                            placeholder={t("disputes.reason")}
                            onChange={(e) => setReason(e.target.value)}
                          />
                          <Button
                            type="submit"
                            variant={
                              writing.resolution === "written_off" ? "destructive" : "default"
                            }
                            disabled={!reason.trim()}
                          >
                            {t(
                              writing.request
                                ? "disputes.sendWriteOffRequest"
                                : writing.resolution === "written_off"
                                  ? "disputes.confirmWriteOff"
                                  : "disputes.confirmAdopt",
                            )}
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => setWriting(null)}>
                            {t("disputes.cancel")}
                          </Button>
                        </form>
                      ) : (
                        <div className="flex flex-wrap gap-2 md:flex-nowrap">
                          {resolutionsFor(d).map((r) =>
                            r === "written_off" && d.writeOffRequest ? (
                              // Просьба уже есть: начальник подтверждает одним
                              // нажатием (причина — из просьбы), остальным ждать.
                              mayWriteOff && d.writeOffRequest.by !== by ? (
                                <Button
                                  key={r}
                                  variant="destructive"
                                  onClick={() => void resolve.run(d.id, r, by)}
                                >
                                  {t("disputes.approveWriteOff")}
                                </Button>
                              ) : null
                            ) : r === "written_off" && !mayWriteOff ? (
                              <Button
                                key={r}
                                variant="outline"
                                onClick={() => {
                                  setReason("");
                                  setWriting({ id: d.id, resolution: r, request: true });
                                }}
                              >
                                {t("disputes.askWriteOff")}
                              </Button>
                            ) : r === "moved" ? (
                              // Перекладывать можно только то, что лежит в таре.
                              inTote(boxes, d) ? (
                                <Button
                                  key={r}
                                  variant="outline"
                                  onClick={() => setWriting({ id: d.id, resolution: r })}
                                >
                                  {t(actKey(d, r))}
                                </Button>
                              ) : null
                            ) : needsSecondPair(d, r) ? (
                              <Button
                                key={r}
                                variant={r === "written_off" ? "destructive" : "default"}
                                onClick={() => {
                                  setReason("");
                                  setWriting({ id: d.id, resolution: r });
                                }}
                              >
                                {t(actKey(d, r))}
                              </Button>
                            ) : (
                              <Button
                                key={r}
                                variant="outline"
                                onClick={() => void resolve.run(d.id, r, by)}
                              >
                                {t(actKey(d, r))}
                              </Button>
                            ),
                          )}
                        </div>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
      {resolve.error && <FormError>{t(resolve.error)}</FormError>}

      {show === "done" ? (
        <DisputesDone items={done} nameOf={nameOf} who={who} />
      ) : (
        show === "both" &&
        done.length > 0 && (
          <section className="mt-10 flex flex-col gap-2">
            <h2 className="text-base font-semibold">{t("disputes.done")}</h2>
            <DisputesDone items={done} nameOf={nameOf} who={who} />
          </section>
        )
      )}
    </ScreenShell>
  );
}

function Line({
  d,
  name,
  who,
  askedBy,
}: {
  d: Dispute;
  name: string;
  who: string;
  askedBy?: string;
}) {
  const t = useT();
  return (
    <>
      <td className="px-3 py-2">
        <p className="font-medium">{name}</p>
        {d.writeOffRequest && (
          <p className="text-xs font-medium">
            {t("disputes.writeOffAsked", { who: askedBy ?? "—", note: d.writeOffRequest.note })}
          </p>
        )}
      </td>
      <td className="px-3 py-2" data-label={t("disputes.col.kind")}>
        <span
          className={cn(
            "whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-semibold",
            d.kind === "shortage" || isInventoryDispute(d)
              ? "bg-warning-fill text-warning-foreground"
              : "bg-destructive text-destructive-foreground",
          )}
        >
          {t(kindKey(d))}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums" data-label={t("disputes.col.qty")}>
        {d.qty}
      </td>
      <td className="px-3 py-2 text-muted-foreground" data-label={t("disputes.found")}>
        {d.toteCode && (
          <span>
            <CodeTail code={d.toteCode} /> ·{" "}
          </span>
        )}
        {who} · {fmt(d.raisedAt)}
      </td>
    </>
  );
}
