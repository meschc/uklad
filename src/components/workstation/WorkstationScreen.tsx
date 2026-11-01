import { useState } from "react";
import type { WorkstationKind } from "@/lib/types";
import {
  ArrowLeft,
  History,
  LogOut,
  MonitorSmartphone,
  X,
  Printer,
  ScanLine,
  Scale,
} from "lucide-react";
import { boundDevice, useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { isSessionLive } from "@/lib/workstation";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmbeddedShell } from "@/components/fulfillment/embeddedShell";
import { ReceivingScreen } from "@/components/fulfillment/ReceivingScreen";
import { PickingScreen } from "@/components/fulfillment/PickingScreen";
import { EmptyState } from "@/components/fulfillment/ScreenShell";
import { BadgeLogin } from "./BadgeLogin";
import { UnbindDevice } from "./UnbindDevice";
import { ShiftMenu } from "./ShiftMenu";
import { ShiftBar } from "./ShiftBar";
import { PackStation } from "./PackStation";
import { ShipStation } from "./ShipStation";
import { StaffLog } from "./StaffLog";
import { formatTime, useNow } from "./useNow";

/**
 * Рабочее место у стола (узел карты cab-workstations): общий экран, за которым
 * сменяются люди. Сотрудник сканирует свой бейдж — и сразу попадает в задание
 * своего стола: приёмка, сборка, упаковка или отгрузка. Других процессов он не
 * видит, вкладок нет: человек делает одно дело, а меню процессов ему мешает.
 *
 * Какой это стол, знает привязанное устройство; на свободном компьютере
 * процесс называют на входе. Смена и журнал — панелью справа: нужны пару раз
 * за смену, а главный экран отдан товару. Кабинету остаются задания,
 * документы и аналитика — контроль, а не работа.
 */

type Panel = "shift" | "log" | null;

export function WorkstationScreen() {
  const t = useT();
  const now = useNow();
  const session = useEditor((s) => s.stationSession);
  const staff = useEditor((s) => s.warehouse.staff);
  const device = useEditor(boundDevice);
  const [panel, setPanel] = useState<Panel>(null);
  const [unbinding, setUnbinding] = useState(false);

  const live = isSessionLive(session, now);
  const member = live ? (staff ?? []).find((m) => m.id === session!.staffId) : undefined;
  const station = session?.station ?? "pack";

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
        {member && (
          // Процесс стола — заголовком: по нему видно, чьё это задание.
          <h1 className="text-sm font-semibold">{t(`ws.station.${station}` as MsgKey)}</h1>
        )}
        <Equipment />
        {member && (
          <div className="ml-auto flex items-center gap-4">
            <ShiftBar staffId={member.id} onOpen={() => setPanel("shift")} />
            <Button variant="ghost" size="sm" onClick={() => setPanel("log")}>
              <History />
              {t("ws.tab.log")}
            </Button>
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
          <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6">
            <StationTask
              station={station}
              staffId={member.id}
              onNeedShift={() => setPanel("shift")}
            />
          </div>
        )}
      </main>

      {member && panel && (
        // Смена и журнал — боковой панелью справа, а не вкладкой: они нужны
        // пару раз за смену, а основной экран отдан товару.
        <div className="fixed inset-0 z-40 flex justify-end">
          <button
            type="button"
            aria-label={t("ws.panel.close")}
            className="absolute inset-0 cursor-default bg-black/30"
            onClick={() => setPanel(null)}
          />
          <aside className="relative flex h-full w-full max-w-md animate-slide-in-right flex-col gap-4 overflow-y-auto bg-background p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {t(panel === "shift" ? "ws.tab.shift" : "ws.history")}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t("ws.panel.close")}
                onClick={() => setPanel(null)}
              >
                <X />
              </Button>
            </div>
            {panel === "shift" ? (
              <ShiftMenu member={member} now={now} />
            ) : (
              <StaffLog staffId={member.id} now={now} />
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * Задание стола. Приёмка и сборка — те же мастера, что были экранами кабинета,
 * только без своей рамки: заголовок процесса уже в шапке.
 */
function StationTask({
  station,
  staffId,
  onNeedShift,
}: {
  station: WorkstationKind;
  staffId: string;
  onNeedShift: () => void;
}) {
  const t = useT();
  switch (station) {
    case "receiving":
      return (
        <EmbeddedShell.Provider value={true}>
          <ReceivingScreen staffId={staffId} />
        </EmbeddedShell.Provider>
      );
    case "picking":
      return (
        <EmbeddedShell.Provider value={true}>
          <PickingScreen autoStart />
        </EmbeddedShell.Provider>
      );
    case "shipping":
      return <ShipStation staffId={staffId} />;
    case "pack":
      return <PackStation staffId={staffId} onNeedShift={onNeedShift} />;
    default:
      return (
        <EmptyState
          icon={<MonitorSmartphone className="size-5" />}
          title={t(`ws.station.${station}` as MsgKey)}
          body={t("ws.soon")}
        />
      );
  }
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
