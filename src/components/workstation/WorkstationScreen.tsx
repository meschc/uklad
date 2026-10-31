import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ListChecks,
  LogOut,
  MonitorSmartphone,
  X,
  Package,
  PackagePlus,
  Printer,
  ScanLine,
  Scale,
  Truck,
} from "lucide-react";
import { boundDevice, useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { isSessionLive } from "@/lib/workstation";
import type { StationTab, WorkstationKind } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { BadgeLogin } from "./BadgeLogin";
import { UnbindDevice } from "./UnbindDevice";
import { ShiftMenu } from "./ShiftMenu";
import { ShiftBar } from "./ShiftBar";
import { PackStation } from "./PackStation";
import { StaffLog } from "./StaffLog";
import { ShipStation } from "./ShipStation";
import { EmbeddedShell } from "@/components/fulfillment/embeddedShell";
import { ReceivingScreen } from "@/components/fulfillment/ReceivingScreen";
import { PickingScreen } from "@/components/fulfillment/PickingScreen";
import { formatTime, useNow } from "./useNow";

/**
 * Рабочее место у стола (узел карты cab-workstations): общий экран, за которым
 * сменяются люди. Вход — по QR-бейджу, дальше процессы склада вкладками:
 * приёмка, сборка, упаковка, отгрузка и свой журнал. Смена — в шапке, панелью
 * справа (она же меню сотрудника на ТСД и телефоне).
 *
 * Процессы живут здесь, а не в меню кабинета: работу делают за столом по
 * бейджу, и в факты пишется тот, кто вошёл. Кабинету остаются задания,
 * документы и аналитика — контроль, а не работа.
 */

/** Стол, привязанный к месту, открывается на своей вкладке. */
const DEVICE_TAB: Record<WorkstationKind, StationTab> = {
  pack: "pack",
  receiving: "receiving",
  shipping: "shipping",
  marking: "pack",
  returns: "receiving",
};

export function WorkstationScreen() {
  const t = useT();
  const now = useNow();
  const session = useEditor((s) => s.stationSession);
  const staff = useEditor((s) => s.warehouse.staff);
  const device = useEditor(boundDevice);
  const focus = useEditor((s) => s.stationTab);
  const [tab, setTab] = useState<StationTab>(
    focus ?? (device ? DEVICE_TAB[device.station] : "pack"),
  );
  const [shiftOpen, setShiftOpen] = useState(false);

  // Переход из заданий («Собрать», «Отгрузить») открывает нужную вкладку —
  // и когда рабочее место уже открыто. Дальше человек переключает сам.
  const [seenFocus, setSeenFocus] = useState(focus);
  if (focus && focus !== seenFocus) {
    setSeenFocus(focus);
    setTab(focus);
  }
  useEffect(() => {
    if (focus) useEditor.setState({ stationTab: null });
  }, [focus]);
  const [unbinding, setUnbinding] = useState(false);

  const live = isSessionLive(session, now);
  const member = live ? (staff ?? []).find((m) => m.id === session!.staffId) : undefined;

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2.5">
        {device ? (
          // Стол, привязанный к месту, в кабинет не уходит: вместо выхода —
          // имя места, чтобы по экрану было видно, какой это стол.
          <div className="flex items-center gap-2 text-sm font-medium">
            <MonitorSmartphone className="size-4 text-muted-foreground" />
            {device.name}
            {!member && !unbinding && (
              <Button variant="ghost" size="sm" onClick={() => setUnbinding(true)}>
                {t("ws.kiosk.unbind")}
              </Button>
            )}
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => useEditor.getState().goToView("tasks")}>
            <ArrowLeft />
            {t("ws.exit")}
          </Button>
        )}
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
        {!member && unbinding ? (
          // Вместо входа, а не поверх него: иначе бейдж руководителя прочитал
          // бы и вход и пустил его за стол.
          <UnbindDevice onDone={() => setUnbinding(false)} />
        ) : !member ? (
          <BadgeLogin />
        ) : (
          // Ширина одна на все вкладки: иначе полоса вкладок прыгает при
          // переключении. Смена ушла в шапку — главное на экране товар.
          <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6">
            <Segmented<StationTab>
              value={tab}
              onChange={setTab}
              grow
              size="md"
              ariaLabel={t("ws.title")}
              options={[
                { value: "receiving", label: t("ws.tab.receiving"), icon: <PackagePlus /> },
                { value: "picking", label: t("ws.tab.picking"), icon: <ScanLine /> },
                { value: "pack", label: t("ws.tab.pack"), icon: <Package /> },
                { value: "shipping", label: t("ws.tab.shipping"), icon: <Truck /> },
                { value: "log", label: t("ws.tab.log"), icon: <ListChecks /> },
              ]}
            />
            {/* Приёмка и сборка — те же мастера, что были экранами кабинета,
                только без своей рамки: заголовок уже на вкладке. */}
            <EmbeddedShell.Provider value={true}>
              {tab === "receiving" && <ReceivingScreen staffId={member.id} />}
              {tab === "picking" && <PickingScreen />}
            </EmbeddedShell.Provider>
            {tab === "pack" && (
              <PackStation staffId={member.id} onNeedShift={() => setShiftOpen(true)} />
            )}
            {tab === "shipping" && <ShipStation staffId={member.id} />}
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
