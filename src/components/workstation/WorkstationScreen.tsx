import { useEffect, useState } from "react";
import type { ShiftMark, WorkstationKind } from "@/lib/types";
import {
  ArrowLeft,
  ChevronDown,
  FileText,
  Plug,
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
import { isSessionLive, STATION_KEY_LABEL } from "@/lib/workstation";
import { isSenior } from "@/lib/docFlow";
import { sizeLabel, useLabelPrinter } from "@/lib/labelPrinter";
import { useT, type MsgKey } from "@/lib/i18n";
import { allowedMarks, parseShiftMarkCode, shiftMarkCode, shiftState } from "@/lib/workstation";
import { QrSvg } from "@/components/table/QrSvg";
import { lastScanAt, SCAN_EVENT, SHIFT_SCAN_EVENT } from "@/components/fulfillment/ScanField";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmbeddedShell } from "@/components/fulfillment/embeddedShell";
import { ReceivingScreen } from "@/components/fulfillment/ReceivingScreen";
import { PickingScreen } from "@/components/fulfillment/PickingScreen";
import { EmptyState } from "@/components/fulfillment/ScreenShell";
import { BadgeLogin } from "./BadgeLogin";
import { UnbindDevice } from "./UnbindDevice";
import { KeyHint } from "./KeyHint";
import { useStationKeys } from "./useStationKeys";
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

  // Кнопки ТСД: F1 — смена, F2 — перерыв, F3 — журнал, F4 — конец смены.
  useStationKeys(member?.id, (p) => setPanel(panel === p ? null : p));
  const station = session?.station ?? "pack";

  return (
    // Оболочка как у кабинета (App.tsx): шапка на фоне меню, а рабочая область —
    // окном в рамке со скруглёнными углами. На узком экране ТСД рамки нет:
    // поля съели бы ширину, которой там и так мало, — шапку отделяет линия.
    <div className="flex h-full flex-col bg-card">
      {/* Высота шапки постоянная: кнопки и таймеры не должны двигать экран. */}
      <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-4 border-border px-4 md:border-0">
        <div className="flex min-w-0 items-center gap-3">
          {device ? (
            // Стол, привязанный к месту, в кабинет не уходит: вместо выхода —
            // имя места, чтобы по экрану было видно, какой это стол.
            <div className="flex items-center gap-2 text-sm font-medium">
              <MonitorSmartphone className="size-4 text-muted-foreground" />
              {device.name}
              {!member && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={unbinding}
                  onClick={() => setUnbinding(true)}
                >
                  {t("ws.kiosk.unbind")}
                </Button>
              )}
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => useEditor.getState().goToView("tasks")}
            >
              <ArrowLeft />
              {t("ws.exit")}
            </Button>
          )}
          {member && (
            // Процесс стола — заголовком: по нему видно, чьё это задание.
            <h1 className="hidden text-sm font-semibold sm:block">
              {t(`ws.station.${station}` as MsgKey)}
            </h1>
          )}
          <Equipment onPrinter={() => setPanel("printer")} canOpen={!!member} />
          <PendingOps />
        </div>
        {/* Смена и перерыв — по центру: их ищут взглядом чаще всего. */}
        {/* На телефоне и ТСД смена уходит вниз, под большой палец. */}
        <div className="hidden justify-center md:flex">
          {member && <ShiftBar staffId={member.id} onOpen={() => setPanel("shift")} />}
        </div>
        {member ? (
          <div className="flex min-w-0 items-center justify-end gap-3">
            {isSenior(member) && (
              // Спорное решает старший, не отходя от стола: тара с недостачей
              // приходит к нему, и счётчик виден сразу.
              <Button variant="ghost" size="sm" onClick={() => setPanel("disputes")}>
                <Gavel />
                <span className="hidden lg:inline">{t("disputes.title")}</span>
                {openDisputes > 0 && (
                  <span className="rounded-full bg-warning px-1.5 text-xs font-semibold text-white tabular-nums">
                    {openDisputes}
                  </span>
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => setPanel("log")}
            >
              <History />
              {t("ws.tab.log")}
              <KeyHint k={STATION_KEY_LABEL.log} />
            </Button>
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-medium leading-tight">{member.name}</p>
              <p className="hidden text-xs text-muted-foreground md:block">
                {t("ws.sessionUntil", { t: formatTime(session!.expiresAt, t.lang) })}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              aria-label={t("ws.logout")}
              onClick={() => void workstationRepository.logout()}
            >
              <LogOut />
              <span className="hidden sm:inline">{t("ws.logout")}</span>
            </Button>
          </div>
        ) : (
          <div />
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto bg-background md:mx-2 md:mb-2 md:rounded-2xl md:border md:border-border">
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
            <ShiftCodes staffId={member.id} />
          </div>
        )}
      </main>

      {member && (
        // Нижняя панель телефона и ТСД: смена, перерыв и журнал — крупно и
        // под большой палец, чтобы работать одной рукой.
        <nav className="flex shrink-0 items-center justify-center gap-2 border-t border-border bg-card px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] md:hidden">
          <ShiftBar staffId={member.id} onOpen={() => setPanel("shift")} />
          <button
            type="button"
            onClick={() => setPanel("log")}
            className="flex min-h-12 flex-col items-center justify-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <History className="size-5" />
            {t("ws.tab.log")}
          </button>
        </nav>
      )}

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
    { key: "ws.equip.docPrinter", icon: FileText, ready: false },
    { key: "ws.equip.scales", icon: Scale, ready: false },
  ];
  const dot = (ready: boolean) => (
    <span
      className={cn("size-1.5 rounded-full", ready ? "bg-success" : "bg-muted-foreground/40")}
    />
  );
  const [open, setOpen] = useState(false);
  const scanAt = useLastScan();
  return (
    // Оборудование — одной кнопкой с раскрывающимся списком: в шапке оно
    // нужно редко, а место там занимало постоянно.
    <div className="relative hidden md:block">
      <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Plug />
        {t("ws.equip.title")}
        <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <ul className="absolute left-0 top-full z-50 mt-1 flex w-80 flex-col rounded-[10px] bg-popover p-1 text-sm shadow-lg ring-1 ring-border">
          {items.slice(0, 1).map(({ key, icon: Icon, ready }) => (
            <li key={key} className="flex items-center gap-2 px-2.5 py-2">
              <Icon className="size-4 text-muted-foreground" />
              <span className="flex-1">{t(key)}</span>
              <span className="text-xs text-muted-foreground">
                {scanAt == null
                  ? t("ws.equip.waitScan")
                  : t("ws.equip.lastScan", { t: formatTime(scanAt, t.lang, true) })}
              </span>
              {dot(ready)}
            </li>
          ))}
          <li>
            <button
              type="button"
              disabled={!canOpen}
              onClick={() => {
                setOpen(false);
                onPrinter();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
            >
              <Printer className="size-4 text-muted-foreground" />
              <span className="flex-1 truncate">
                {printerSet ? `${printer.name} · ${sizeLabel(printer)}` : t("ws.equip.printer")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(printerSet ? "ws.equip.printerSet" : "ws.equip.off")}
              </span>
              {dot(printerSet)}
            </button>
          </li>
          {items.slice(1).map(({ key, icon: Icon, ready }) => (
            <li key={key} className="flex items-center gap-2 px-2.5 py-2">
              <Icon className="size-4 text-muted-foreground" />
              <span className="flex-1">{t(key)}</span>
              <span className="text-xs text-muted-foreground">{t("ws.equip.off")}</span>
              {dot(ready)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Коды отметок смены внизу экрана: сканер у стола читает их прямо с монитора,
 * и смена или перерыв отмечаются без мыши. Показываем только допустимые
 * сейчас отметки; результат — уведомлением справа.
 */
function ShiftCodes({ staffId }: { staffId: string }) {
  const t = useT();
  const events = useEditor((s) => s.staffEvents);
  const marks = allowedMarks(shiftState(events, staffId)).filter((m) => m !== "idle_start");

  useEffect(() => {
    const onScan = (e: Event) => {
      const mark = parseShiftMarkCode(String((e as CustomEvent).detail));
      void (async () => {
        const res = mark ? await workstationRepository.mark(mark as ShiftMark) : null;
        useEditor.getState().showToast(res?.ok ? (`ws.ev.${mark}` as MsgKey) : "ws.markRejected");
      })();
    };
    window.addEventListener(SHIFT_SCAN_EVENT, onScan);
    return () => window.removeEventListener(SHIFT_SCAN_EVENT, onScan);
  }, []);

  return (
    <ul className="mt-6 flex flex-wrap justify-center gap-6 border-t border-border pt-6">
      {marks.map((m) => (
        <li key={m} className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground">
          <QrSvg code={shiftMarkCode(m)} size={72} showCode={false} />
          {t(`ws.mark.${m}` as MsgKey)}
        </li>
      ))}
    </ul>
  );
}

/** Когда сканер последний раз прислал код: так видно, что он подключён. */
function useLastScan(): number | null {
  const [at, setAt] = useState<number | null>(lastScanAt);
  useEffect(() => {
    const on = () => setAt(lastScanAt);
    window.addEventListener(SCAN_EVENT, on);
    return () => window.removeEventListener(SCAN_EVENT, on);
  }, []);
  return at;
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
      className="flex items-center gap-1.5 text-sm font-medium text-warning"
      title={t("ws.opPendingHint")}
      role="status"
    >
      <CloudOff className="size-4" />
      {t("ws.opPending", { n: count })}
    </p>
  );
}
