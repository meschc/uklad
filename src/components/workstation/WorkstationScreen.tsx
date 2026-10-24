import { useState } from "react";
import { ArrowLeft, ListChecks, LogOut, X, Package, Printer, ScanLine, Scale } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { isSessionLive } from "@/lib/workstation";
import type { WorkstationKind } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { BadgeLogin } from "./BadgeLogin";
import { ShiftMenu } from "./ShiftMenu";
import { ShiftBar } from "./ShiftBar";
import { PackStation } from "./PackStation";
import { StaffLog } from "./StaffLog";
import { formatTime, useNow } from "./useNow";

/**
 * Рабочее место у стола (узел карты cab-workstations): общий экран, за которым
 * сменяются люди. Вход — по QR-бейджу, дальше три вкладки: смена (она же меню
 * сотрудника на ТСД и телефоне — вёрстка одна, узкая), упаковка и свой журнал.
 *
 * Пока сделан только стол упаковки. Остальные столы перечислены в шапке как
 * «скоро»: приёмка, маркировка, возвраты и отгрузка лягут в ту же рамку —
 * бейдж, смена и журнал у них общие, меняется только средняя вкладка.
 */

type Tab = "pack" | "log";

const STATIONS: WorkstationKind[] = ["pack", "receiving", "marking", "returns", "shipping"];

export function WorkstationScreen() {
  const t = useT();
  const now = useNow();
  const session = useEditor((s) => s.stationSession);
  const staff = useEditor((s) => s.warehouse.staff);
  const [tab, setTab] = useState<Tab>("pack");
  const [shiftOpen, setShiftOpen] = useState(false);

  const live = isSessionLive(session, now);
  const member = live ? (staff ?? []).find((m) => m.id === session!.staffId) : undefined;

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2.5">
        <Button variant="ghost" size="sm" onClick={() => useEditor.getState().goToView("tasks")}>
          <ArrowLeft />
          {t("ws.exit")}
        </Button>
        <div className="hidden min-w-0 flex-wrap items-center gap-1.5 2xl:flex">
          {STATIONS.map((st) => (
            <span
              key={st}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs",
                st === "pack"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {t(`ws.station.${st}` as MsgKey)}
              {st !== "pack" && ` · ${t("ws.soon")}`}
            </span>
          ))}
        </div>
        <Equipment />
        {member && (
          <div className="ml-auto flex items-center gap-4">
            <ShiftBar staffId={member.id} onOpen={() => setShiftOpen(true)} />
            <div className="text-right">
              <p className="text-sm font-medium leading-tight">{member.name}</p>
              <p className="text-xs text-muted-foreground">
                {t("ws.sessionUntil", { t: formatTime(session!.expiresAt, t.lang) })}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void workstationRepository.logout()}>
              <LogOut />
              {t("ws.logout")}
            </Button>
          </div>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {!member ? (
          <BadgeLogin />
        ) : (
          // Ширина одна на все вкладки: иначе полоса вкладок прыгает при
          // переключении. Смена ушла в шапку — главное на экране товар.
          <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6">
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              grow
              size="md"
              ariaLabel={t("ws.title")}
              options={[
                { value: "pack", label: t("ws.tab.pack"), icon: <Package /> },
                { value: "log", label: t("ws.tab.log"), icon: <ListChecks /> },
              ]}
            />
            {tab === "pack" && (
              <PackStation staffId={member.id} onNeedShift={() => setShiftOpen(true)} />
            )}
            {tab === "log" && <StaffLog staffId={member.id} now={now} />}
          </div>
        )}
      </main>

      {member && shiftOpen && (
        // Смена — боковой панелью справа, а не вкладкой: она нужна пару раз за
        // смену, а основной экран отдан товару.
        <div className="fixed inset-0 z-40 flex justify-end">
          <button
            type="button"
            aria-label={t("ws.panel.close")}
            className="absolute inset-0 cursor-default bg-black/30"
            onClick={() => setShiftOpen(false)}
          />
          <aside className="relative flex h-full w-full max-w-md animate-slide-in-right flex-col gap-4 overflow-y-auto bg-background p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("ws.tab.shift")}</h2>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t("ws.panel.close")}
                onClick={() => setShiftOpen(false)}
              >
                <X />
              </Button>
            </div>
            <ShiftMenu member={member} now={now} />
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * Оборудование стола. Сканер работает всегда — он «печатает» в поле, как
 * клавиатура. Принтер и весы честно помечены «не подключено», а рисовать
 * зелёные лампочки впрок нельзя. Камеру стола не показываем, пока её нет.
 */
function Equipment() {
  const t = useT();
  const items: { key: MsgKey; icon: typeof ScanLine; ready: boolean }[] = [
    { key: "ws.equip.scanner", icon: ScanLine, ready: true },
    { key: "ws.equip.printer", icon: Printer, ready: false },
    { key: "ws.equip.scales", icon: Scale, ready: false },
  ];
  return (
    <ul className="hidden flex-wrap items-center gap-3 text-xs text-muted-foreground md:flex">
      {items.map(({ key, icon: Icon, ready }) => (
        <li
          key={key}
          className="flex items-center gap-1"
          title={t(ready ? "ws.equip.ready" : "ws.equip.off")}
        >
          <Icon className="size-3.5" />
          {t(key)}
          <span
            className={cn(
              "size-1.5 rounded-full",
              ready ? "bg-emerald-500" : "bg-muted-foreground/40",
            )}
          />
        </li>
      ))}
    </ul>
  );
}
