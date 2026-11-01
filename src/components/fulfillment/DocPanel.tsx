import { useState } from "react";
import { BadgeCheck, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { documentsRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { isSenior } from "@/lib/docFlow";
import type { DocModel } from "@/lib/documents";
import type { DocEdits, DocRecord } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Backdrop } from "@/components/ui/backdrop";
import { eyebrow } from "@/components/ui/eyebrow";

/**
 * Панель документа справа — правка черновика и подтверждение. Не окно поверх
 * экрана: лист остаётся виден слева, правку сверяют с ним глазами.
 *
 * Правятся только поля, которых нет в операции: ответственный, машина, пломбы,
 * комментарий и факт по строке приёмки (пересчитали на рампе). Номер, дата и
 * план — из операции и не правятся никогда. Подтверждённый документ панель
 * показывает только на чтение.
 */
export function DocPanel({
  kind,
  sourceId,
  doc,
  record,
  onClose,
}: {
  kind: DocRecord["kind"];
  sourceId: string;
  doc: DocModel;
  record?: DocRecord;
  onClose: () => void;
}) {
  const t = useT();
  const warehouse = useEditor((s) => s.warehouse);
  const staff = warehouse.staff ?? [];
  const seniors = staff.filter(isSenior);
  const locked = record?.status === "confirmed";

  const [edits, setEdits] = useState<DocEdits>(() => ({
    // Как на листе: пока ответственного не задали, печатается контакт склада.
    responsible: doc.responsible ?? warehouse.contactPerson ?? warehouse.manager?.name ?? "",
    vehicle: doc.vehicle ?? "",
    seals: doc.seals ?? "",
    comment: doc.comment ?? "",
    facts: Object.fromEntries(
      doc.lines.filter((l) => l.fact != null).map((l) => [String(l.no), l.fact as number]),
    ),
  }));
  const [senior, setSenior] = useState(seniors[0]?.id ?? "");
  const save = useCommand(documentsRepository.saveDraft);
  const confirm = useCommand(documentsRepository.confirm);

  const set = (patch: DocEdits) => setEdits((e) => ({ ...e, ...patch }));
  // Пустое поле — «не задано», а не пустая строка на бумаге.
  const clean = (): DocEdits => ({
    responsible: edits.responsible?.trim() || undefined,
    vehicle: edits.vehicle?.trim() || undefined,
    seals: edits.seals?.trim() || undefined,
    comment: edits.comment?.trim() || undefined,
    facts: edits.facts,
  });

  const onConfirm = async () => {
    // Сначала черновик: подтверждают то, что видно в панели, а не то, что было
    // сохранено до последней правки.
    const saved = await save.run(kind, sourceId, clean());
    if (!saved.ok) return;
    const res = await confirm.run(kind, sourceId, senior);
    if (res.ok) onClose();
  };

  const who = staff.find((m) => m.id === record?.confirmedBy)?.name ?? "—";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <Backdrop onClose={onClose} />
      <aside className="relative flex h-full w-full max-w-md animate-slide-in-right flex-col gap-5 overflow-y-auto bg-background p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold leading-tight">{doc.number}</h2>
            <p className="text-sm text-muted-foreground">
              {t(locked ? "doc.status.confirmed" : "doc.status.draft")}
            </p>
          </div>
          <Button variant="ghost" size="sm" aria-label={t("doc.panel.close")} onClick={onClose}>
            <X />
          </Button>
        </div>

        <section className="flex flex-col gap-3">
          <Field label={t("doc.responsible")}>
            <Input
              value={edits.responsible ?? ""}
              disabled={locked}
              onChange={(e) => set({ responsible: e.target.value })}
            />
          </Field>
          <Field label={t("doc.vehicle")}>
            <Input
              value={edits.vehicle ?? ""}
              disabled={locked}
              onChange={(e) => set({ vehicle: e.target.value })}
            />
          </Field>
          <Field label={t("doc.seals")}>
            <Input
              value={edits.seals ?? ""}
              disabled={locked}
              onChange={(e) => set({ seals: e.target.value })}
            />
          </Field>
          <Field label={t("doc.comment")}>
            <Input
              value={edits.comment ?? ""}
              disabled={locked}
              onChange={(e) => set({ comment: e.target.value })}
            />
          </Field>
        </section>

        {kind === "receiving" && (
          <section className="flex flex-col gap-2">
            <h3 className={eyebrow({ tone: "muted" })}>{t("doc.facts")}</h3>
            <ul className="flex flex-col gap-1.5">
              {doc.lines.map((l) => (
                <li key={l.no} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {l.no}. {l.name}
                  </span>
                  <span className="w-10 text-right tabular-nums text-muted-foreground">
                    {l.qty}
                  </span>
                  <Input
                    className="w-20 text-right tabular-nums"
                    type="number"
                    min={0}
                    disabled={locked}
                    aria-label={`${l.name}: ${t("doc.col.fact")}`}
                    value={edits.facts?.[String(l.no)] ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const v = raw === "" ? NaN : Math.max(0, Math.round(Number(raw)));
                      const facts = { ...edits.facts };
                      if (Number.isNaN(v)) delete facts[String(l.no)];
                      else facts[String(l.no)] = v;
                      set({ facts });
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {locked ? (
          <p className="flex items-center gap-2 text-sm">
            <BadgeCheck className="size-4 text-emerald-600" />
            {t("doc.confirmedBy", {
              who,
              d: new Date(record?.confirmedAt ?? 0).toLocaleString(t.lang),
            })}
          </p>
        ) : (
          <>
            <Button
              variant="outline"
              disabled={save.pending}
              onClick={() => void save.run(kind, sourceId, clean())}
            >
              {t("doc.save")}
            </Button>
            {save.error && <p className="text-sm text-destructive">{t(save.error)}</p>}

            <section className="flex flex-col gap-2 border-t border-border pt-4">
              <h3 className={eyebrow({ tone: "muted" })}>{t("doc.confirmTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("doc.confirmHint")}</p>
              {seniors.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("doc.noSeniors")}</p>
              ) : (
                <div className="flex gap-2">
                  <select
                    aria-label={t("doc.confirmBy")}
                    value={senior}
                    onChange={(e) => setSenior(e.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {seniors.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.role}
                      </option>
                    ))}
                  </select>
                  <Button disabled={!senior || confirm.pending} onClick={() => void onConfirm()}>
                    <BadgeCheck />
                    {t("doc.confirm")}
                  </Button>
                </div>
              )}
              {confirm.error && <p className="text-sm text-destructive">{t(confirm.error)}</p>}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
