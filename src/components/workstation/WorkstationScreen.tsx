import { useState } from "react";
import type { WorkstationKind } from "@/lib/types";
import {
  ArrowLeft,
  CloudOff,
  History,
  Gavel,
  LogOut,
  MonitorSmartphone,
  X,
  Printer,
  ScanLine,
  Scale,
} from "lucide-react";
import { boundDevice, useEditor } from "@/lib/store";
import { STUCK_MS, usePendingOps, workstationRepository } from "@/lib/data";
import { isSessionLive } from "@/lib/workstation";
import { isSenior } from "@/lib/docFlow";
import { sizeLabel, useLabelPrinter } from "@/lib/labelPrinter";
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
import { PrinterPanel } from "./PrinterPanel";
import { ShipStation } from "./ShipStation";
import { StaffLog } from "./StaffLog";
import { DisputesScreen } from "./DisputesScreen";
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

type Panel = "shift" | "log" | "printer" | "disputes" | null;

export function WorkstationScreen() {
  const t = useT();
  const now = useNow();
  const session = useEditor((s) => s.stationSession);
  const staff = useEditor((s) => s.warehouse.staff);
  const device = useEditor(boundDevice);
  const openDisputes = useEditor((s) => s.disputes.filter((d) => !d.resolution).length);
  const [opened, setOpened] = useState<{ panel: Panel; owner?: string }>({ panel: null });
  const [unbinding, setUnbinding] = useState(false);

  const live = isSessionLive(session, now);
  const member = live ? (staff ?? []).find((m) => m.id === session!.staffId) : undefined;

  // Панель принадлежит тому, кто её открыл: кончилась смена, вышел или вошёл
  // другой по бейджу — для него она закрыта, иначе следующий за столом увидит
  // чужое. Хранить владельца, а не сбрасывать эффектом, дешевле и без лишнего
  // рендера.
  const panel: Panel = opened.owner === member?.id ? opened.panel : null;
  const setPanel = (p: Panel) => setOpened({ panel: p, owner: member?.id });

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
        <Equipment onPrinter={() => setPanel("printer")} canOpen={!!member} />
        <PendingOps />
        {member && (
          <div className="ml-auto flex items-center gap-4">
            <ShiftBar staffId={member.id} onOpen={() => setPanel("shift")} />
            {isSenior(member) && (
              // Спорное решает старший, не отходя от стола: тара с недостачей
              // приходит к нему, и счётчик виден сразу.
              <Button variant="ghost" size="sm" onClick={() => setPanel("disputes")}>
                <Gavel />
                {t("disputes.title")}
                {openDisputes > 0 && (
                  <span className="rounded-full bg-orange-500 px-1.5 text-xs font-semibold text-white tabular-nums">
                    {openDisputes}
                  </span>
                )}
              </Button>
            )}
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
          <aside
            className={cn(
              "relative flex h-full w-full animate-slide-in-right flex-col gap-4 overflow-y-auto bg-background p-5 shadow-2xl",
              // Спорные — список с кнопками решения: ему нужна ширина шире смены.
              panel === "disputes" ? "max-w-2xl" : "max-w-md",
            )}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {t(
                  panel === "shift"
                    ? "ws.tab.shift"
                    : panel === "printer"
                      ? "ws.printer.title"
                      : panel === "disputes"
                        ? "disputes.title"
                        : "ws.history",
                )}
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
            ) : panel === "printer" ? (
              <PrinterPanel />
            ) : panel === "disputes" ? (
              <EmbeddedShell.Provider value={true}>
                <DisputesScreen />
              </EmbeddedShell.Provider>
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
function Equipment({ onPrinter, canOpen }: { onPrinter: () => void; canOpen: boolean }) {
  const t = useT();
  const printer = useLabelPrinter();
  // «Настроен» — не «подключён»: браузер принтер не видит, мы знаем только
  // имя и ленту, которые назвал сотрудник.
  const printerSet = printer.name !== "";
  const items: { key: MsgKey; icon: typeof ScanLine; ready: boolean }[] = [
    { key: "ws.equip.scanner", icon: ScanLine, ready: true },
    { key: "ws.equip.scales", icon: Scale, ready: false },
  ];
  const dot = (ready: boolean) => (
    <span
      className={cn("size-1.5 rounded-full", ready ? "bg-emerald-500" : "bg-muted-foreground/40")}
    />
  );
  return (
    <ul className="hidden flex-wrap items-center gap-3 text-xs text-muted-foreground md:flex">
      {items.slice(0, 1).map(({ key, icon: Icon, ready }) => (
        <li key={key} className="flex items-center gap-1" title={t("ws.equip.ready")}>
          <Icon className="size-3.5" />
          {t(key)}
          {dot(ready)}
        </li>
      ))}
      <li>
        <button
          type="button"
          disabled={!canOpen}
          onClick={onPrinter}
          title={t(printerSet ? "ws.equip.printerSet" : "ws.equip.off")}
          className="flex items-center gap-1 rounded hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground"
        >
          <Printer className="size-3.5" />
          {printerSet ? `${printer.name} · ${sizeLabel(printer)}` : t("ws.equip.printer")}
          {dot(printerSet)}
        </button>
      </li>
      {items.slice(1).map(({ key, icon: Icon, ready }) => (
        <li key={key} className="flex items-center gap-1" title={t("ws.equip.off")}>
          <Icon className="size-3.5" />
          {t(key)}
          {dot(ready)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Работа, которая ещё не дошла до сервера: появляется, только если очередь
 * не уходит дольше `STUCK_MS`, — короткий обрыв не должен мигать в шапке.
 */
function PendingOps() {
  const t = useT();
  const now = useNow(1000);
  const { count, since } = usePendingOps();
  if (count === 0 || since == null || now - since < STUCK_MS) return null;
  return (
    <p
      className="flex items-center gap-1.5 text-sm font-medium text-amber-600"
      title={t("ws.opPendingHint")}
      role="status"
    >
      <CloudOff className="size-4" />
      {t("ws.opPending", { n: count })}
    </p>
  );
}
