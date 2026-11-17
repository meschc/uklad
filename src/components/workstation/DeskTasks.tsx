import { useState } from "react";
import { Check, Wrench } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useCommand } from "@/lib/useCommand";
import { deskTasks } from "@/lib/workTasks";
import { workTasksRepository } from "@/lib/data/workTasksRepository";
import type { WarehouseTask } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { FormError } from "@/components/ui/field";
import { QtyStepper } from "@/components/fulfillment/QtyStepper";
import { useServiceName } from "@/components/fulfillment/useServiceName";

/** Сколько свободных работ видно у стола. */
const FREE_SHOWN = 2;

/**
 * Работы склада у стола (Кирилл 13.11: «процессы есть, а задания только на
 * сборку»). После бейджа сотрудник видит свои работы и свободные: маркировку,
 * переупаковку, свою услугу склада — берёт и закрывает их здесь же, не уходя
 * со своего процесса. Нет работ — блока нет.
 */
export function DeskTasks({ staffId }: { staffId: string }) {
  const t = useT();
  const tasks = useEditor((s) => s.tasks);
  const all = deskTasks(tasks, staffId);
  if (all.length === 0) return null;
  // Своё — всё, свободных — пара: главное у стола всё равно его процесс.
  const own = all.filter((x) => x.staffId === staffId);
  const free = all.filter((x) => x.staffId !== staffId);
  const list = [...own, ...free.slice(0, FREE_SHOWN)];
  const more = free.length - FREE_SHOWN;
  return (
    <section className="flex flex-col gap-2" aria-label={t("ws.tasks.title")}>
      <h2 className={eyebrow({ tone: "current" })}>
        <Wrench className="mr-1.5 inline size-3.5" />
        {t("ws.tasks.title")}
      </h2>
      <ul className="flex flex-col">
        {list.map((task) => (
          <DeskTaskRow key={task.id} task={task} staffId={staffId} />
        ))}
      </ul>
      {more > 0 && (
        <p className="text-xs text-muted-foreground">{t("ws.tasks.moreFree", { n: more })}</p>
      )}
    </section>
  );
}

function DeskTaskRow({ task, staffId }: { task: WarehouseTask; staffId: string }) {
  const t = useT();
  const svcName = useServiceName();
  const partners = useEditor((s) => s.warehouse.partners);
  const [qty, setQty] = useState(task.qty);
  const take = useCommand(workTasksRepository.take);
  const done = useCommand(workTasksRepository.done);
  const partner = partners?.find((p) => p.id === task.partnerId)?.name;
  const active = task.status === "in_progress";
  const error = take.error ?? done.error;
  return (
    <li className="flex flex-col gap-2 border-t border-border/60 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{svcName(task.kind)}</span>
        <span className="tabular-nums text-muted-foreground">× {task.qty}</span>
        {partner && <span className="text-sm text-muted-foreground">{partner}</span>}
        <span className={active ? "text-xs text-primary" : "text-xs text-muted-foreground"}>
          {t(
            active
              ? "ws.tasks.active"
              : task.staffId === staffId
                ? "ws.tasks.assigned"
                : "ws.tasks.free",
          )}
        </span>
      </div>
      {task.note && <p className="text-sm text-muted-foreground">{task.note}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {active ? (
          <>
            <span className="text-sm text-muted-foreground">{t("ws.tasks.qty")}</span>
            <QtyStepper value={qty} onChange={setQty} max={task.qty} />
            <Button disabled={done.pending || qty < 1} onClick={() => void done.run(task.id, qty)}>
              <Check />
              {t("ws.tasks.done")}
            </Button>
          </>
        ) : (
          <Button variant="outline" disabled={take.pending} onClick={() => void take.run(task.id)}>
            {t("ws.tasks.take")}
          </Button>
        )}
      </div>
      {error && <FormError>{t(error)}</FormError>}
    </li>
  );
}
