import { Suspense, lazy, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isEmbed, isHeatmapWindow } from "@/lib/appViews";
import { boundDevice, selectRole, useEditor } from "@/lib/store";
import { applyTheme, systemTheme } from "@/lib/theme";
import { useDeepLink } from "@/lib/useDeepLink";
import { useT } from "@/lib/i18n";
import { authRepository } from "@/lib/data/authRepository";
import { hasCabinetServer, setUnauthorizedHandler } from "@/lib/data/api";
import { holdsCompanyCopy, startServerSync } from "@/lib/store/serverSync";
import { demoRepository } from "@/lib/data/demoRepository";
import { SideNav } from "@/components/nav/SideNav";
import { navFor } from "@/components/nav/navItems";
import type { AppView } from "@/lib/types";
import { ChatWatcher } from "@/components/chat/ChatWatcher";
import { Toast } from "@/components/editor/Toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/**
 * Экраны загружаются по одному, отдельными файлами.
 *
 * Пунктов меню семнадцать, а открыт всегда ровно один. При обычном импорте
 * браузер скачивал бы все семнадцать сразу: кладовщик, которому нужна приёмка,
 * ждал бы заодно редактор плана, аналитику и конструктор ярлыков. Разделение
 * даёт ему первый экран заметно раньше, а остальное подтягивается в момент
 * перехода — за то время, что человек ведёт мышь к пункту меню.
 *
 * Обёртка `.then` — из-за именованных экспортов: `lazy` ждёт модуль с `default`,
 * а в проекте компоненты экспортируются по имени.
 */
const Editor = lazy(() =>
  import("@/components/editor/Editor").then((m) => ({ default: m.Editor })),
);
const Dashboard = lazy(() =>
  import("@/components/account/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const Profile = lazy(() =>
  import("@/components/account/Profile").then((m) => ({ default: m.Profile })),
);
const StaffScreen = lazy(() =>
  import("@/components/account/StaffScreen").then((m) => ({ default: m.StaffScreen })),
);
const WarehouseSpecScreen = lazy(() =>
  import("@/components/account/WarehouseSpecScreen").then((m) => ({
    default: m.WarehouseSpecScreen,
  })),
);
const LoginScreen = lazy(() =>
  import("@/components/account/LoginScreen").then((m) => ({ default: m.LoginScreen })),
);
const HeatmapView = lazy(() =>
  import("@/components/heatmap/HeatmapView").then((m) => ({ default: m.HeatmapView })),
);
const TasksScreen = lazy(() =>
  import("@/components/fulfillment/TasksScreen").then((m) => ({ default: m.TasksScreen })),
);
const OperationsScreen = lazy(() =>
  import("@/components/fulfillment/OperationsScreen").then((m) => ({
    default: m.OperationsScreen,
  })),
);
const SellerScreen = lazy(() =>
  import("@/components/fulfillment/SellerScreen").then((m) => ({ default: m.SellerScreen })),
);
const AnalyticsScreen = lazy(() =>
  import("@/components/fulfillment/AnalyticsScreen").then((m) => ({ default: m.AnalyticsScreen })),
);
const LabelsScreen = lazy(() =>
  import("@/components/fulfillment/LabelsScreen").then((m) => ({ default: m.LabelsScreen })),
);
const DocumentsScreen = lazy(() =>
  import("@/components/fulfillment/DocumentsScreen").then((m) => ({ default: m.DocumentsScreen })),
);
const LookupScreen = lazy(() =>
  import("@/components/fulfillment/LookupScreen").then((m) => ({ default: m.LookupScreen })),
);
const IntegrationsScreen = lazy(() =>
  import("@/components/fulfillment/IntegrationsScreen").then((m) => ({
    default: m.IntegrationsScreen,
  })),
);
const WorkstationScreen = lazy(() =>
  import("@/components/workstation/WorkstationScreen").then((m) => ({
    default: m.WorkstationScreen,
  })),
);
const DevicesScreen = lazy(() =>
  import("@/components/workstation/DevicesScreen").then((m) => ({
    default: m.DevicesScreen,
  })),
);
const ChatScreen = lazy(() =>
  import("@/components/chat/ChatScreen").then((m) => ({ default: m.ChatScreen })),
);

// Отдельное окно тепловой карты (`window.open` из TopBar): признак — в URL,
// вычисляется один раз при загрузке страницы.
const IS_HEATMAP = isHeatmapWindow(window.location.search);
const IS_EMBED = isEmbed(window.location.search);

/**
 * Открыт ли этому браузеру демо-кабинет. Спрашиваем один раз при загрузке и
 * только в сборке с сервером, когда входа нет: вошедшему пропуск не нужен.
 * Сбой связи демо не открывает — закрытая дверь безопаснее.
 */
function useDemoPass(signedIn: boolean): "checking" | "open" | "closed" {
  const ask = hasCabinetServer && !signedIn && !holdsCompanyCopy();
  const [state, setState] = useState<"checking" | "open" | "closed">(ask ? "checking" : "closed");
  useEffect(() => {
    if (!ask) return;
    let live = true;
    void demoRepository.pass().then((res) => {
      if (live) setState(res.ok && res.data ? "open" : "closed");
    });
    return () => {
      live = false;
    };
  }, [ask]);
  return ask ? state : "closed";
}

export default function App() {
  const appView = useEditor((s) => s.appView);
  const role = useEditor(selectRole);

  // Открытый экран — в адресе: ссылку на приёмку можно скинуть коллеге, а
  // «назад» возвращает на предыдущий экран, а не уводит с сайта.
  useDeepLink();
  const theme = useEditor((s) => s.profile.theme);
  const language = useEditor((s) => s.profile.language);

  // Тема и язык — глобально на <html> (ТЗ, разд. 3.3). Первый прогон повторяет
  // то, что уже сделал скрипт в app/index.html, — это нормально: он ставит тему
  // до отрисовки, а этот эффект держит её дальше, когда человек переключает.
  // Встроенный в витрину кабинет (`?embed=1`) идёт за темой системы, как сама
  // витрина, а не за сохранённой темой профиля (Кирилл 1 ноя): иначе на светлом
  // лендинге открывались тёмные экраны того, кто когда-то включил тёмную тему в
  // кабинете на этом же адресе. Профиль при этом не трогаем.
  useEffect(() => {
    if (!isEmbed(window.location.search)) {
      applyTheme(theme);
      return;
    }
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyTheme(systemTheme());
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Вход через сервер живёт в куке, а стор помнит только пометку о нём.
  // Правило одно: любой ответ 401 на запрос с сессией — сессии больше нет
  // (истекла, отозвана, сменён пароль), и кабинет закрывается экраном входа.
  // Данные при этом не стираются (`sessionLost`): других копий у них пока нет.
  // Чтобы долго открытая вкладка узнала об отзыве, не дожидаясь запроса,
  // сессия сверяется при открытии кабинета и каждый раз, когда вкладка снова
  // на экране. Сбой связи сессию не гасит.
  const serverSession = useEditor((s) => s.session.source === "server");
  // Данные компании без живого входа закрыты: ни ссылка на экран, ни демо не
  // откроют их, пока владелец не войдёт.
  // В сборке с сервером кабинет без входа закрыт целиком: демо открывается
  // только по ссылке из письма-заявки, а не ссылкой на экран. Ссылка оставляет
  // браузеру куку-пропуск, кабинет спрашивает о ней сервер (`demoRepository`).
  // Пока в браузере лежит копия компании, демо не открывается: под ним
  // оказался бы не демо-склад, а её данные.
  // Превью на витрине (`?embed=1`) — исключение: это снимок демо-склада в
  // памяти, нажать и ввести там ничего нельзя (`main.tsx`), так что кабинетом
  // в обход заявки он не служит, а чужих данных в нём нет (`store/index.ts`).
  const demo = useDemoPass(serverSession || IS_EMBED);
  const locked = useEditor((s) =>
    IS_EMBED
      ? false
      : hasCabinetServer
        ? s.session.source !== "server" && (demo !== "open" || !!s.session.orgId)
        : !!s.session.orgId && s.session.source !== "server",
  );
  // Данные вошедшей компании живут на сервере: загрузка при входе и запись
  // правок сами (`serverSync.ts`, ADR 0010).
  const syncOrg = useEditor((s) => (s.session.source === "server" ? s.session.orgId : undefined));
  useEffect(() => (syncOrg ? startServerSync(syncOrg) : undefined), [syncOrg]);
  useEffect(() => {
    if (!serverSession) return;
    setUnauthorizedHandler(() => useEditor.getState().sessionLost());
    const check = () => {
      if (document.visibilityState === "visible") void authRepository.me();
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => {
      setUnauthorizedHandler(null);
      document.removeEventListener("visibilitychange", check);
    };
  }, [serverSession]);

  // Роль ограничивает набор экранов: продавец не должен попасть в редактор
  // структуры склада, даже если состояние восстановилось из localStorage.
  // Экраны уровня аккаунта доступны всегда: их нет в рельсе (в кабинет ведёт
  // логотип, в профиль — шапка кабинета), но выкидывать с них по «не нашёл в
  // списке разрешённых» нельзя — иначе кабинет стал бы недостижим.
  const allowed = navFor(role).map((n) => n.view);
  // Компьютер, привязанный к месту, — это стол, а не кабинет: он открывает
  // только рабочее место, куда бы ни вела ссылка. Отвязать его можно бейджем
  // руководителя на самом столе или с экрана «Устройства» с другого компьютера.
  const kiosk = useEditor((s) => boundDevice(s) !== null) && role === "warehouse";
  const legacyStation = role === "warehouse" && STATION_VIEWS.has(appView);
  const view = locked
    ? "login"
    : kiosk || legacyStation
      ? "workstation"
      : ACCOUNT_VIEWS.has(appView) || allowed.includes(appView)
        ? appView
        : allowed[0];

  useEffect(() => {
    // Пока сервер не ответил про пропуск, экран не трогаем: иначе демо
    // открылось бы на экране входа, куда его успело увести ожидание.
    if (demo !== "checking" && view !== appView) useEditor.getState().goToView(view);
  }, [view, appView, demo]);
  // Пришёл по ссылке из письма, а сохранение помнит экран входа с прошлого
  // визита без пропуска — открываем кабинет. Вход по прямой ссылке
  // (`?view=login`, так ведёт и выход) остаётся входом.
  useEffect(() => {
    if (demo !== "open" || useEditor.getState().appView !== "login") return;
    if (new URLSearchParams(window.location.search).get("view") === "login") return;
    useEditor.getState().goToView("dashboard");
  }, [demo]);

  if (demo === "checking") return <ScreenFallback />;

  if (IS_HEATMAP && !locked) {
    return (
      <div className="h-full animate-fade-in">
        <Suspense fallback={<ScreenFallback />}>
          <HeatmapView />
        </Suspense>
      </div>
    );
  }

  // Боковой рельс — навигация ВНУТРИ выбранного склада, поэтому на экранах
  // уровня аккаунта его нет: на списке складов склад ещё не выбран, а в
  // профиле и на входе рельсу нечего показывать. Появляется он ровно тогда,
  // когда склад открыт.
  // Рабочее место — тоже без рельса: это общий экран у стола, за ним стоит
  // сотрудник по бейджу, и уводить его в настройки склада одним кликом незачем.
  const showNav = !ACCOUNT_VIEWS.has(view) && view !== "workstation";

  // Каждый экран — под своей границей ошибки: падение одного не должно ронять
  // приложение целиком и мешать уйти в соседний пункт меню. Ключ по виду
  // сбрасывает границу при переходе, иначе старая ошибка залипла бы на новом.
  // Ожидание файла экрана — внутри границы ошибки, а не снаружи: сеть может
  // оборваться на полпути, и тогда это ошибка конкретного экрана, из которой
  // человек уходит в соседний пункт меню, а не поломка всего приложения.
  const screen = (
    <ErrorBoundary key={view} label={view}>
      <Suspense fallback={<ScreenFallback />}>{renderView(view)}</Suspense>
    </ErrorBoundary>
  );

  // Тост и наблюдатель за чатом — на уровне приложения, а не экрана. Тост
  // раньше жил внутри редактора и потому был не виден на остальных экранах: о
  // событии, случившемся на приёмке, приложение молчало. А уведомление о новом
  // сообщении вообще имеет смысл только тогда, когда человек не в чате (п.3).
  const chrome = (
    <>
      {/* За столом сообщения продавцов не всплывают: экран общий, переписка
          — дело руководителя. */}
      {!kiosk && !locked && <ChatWatcher />}
      <Toast />
    </>
  );

  if (!showNav) {
    return (
      <TooltipProvider>
        <div key={view} className="h-full animate-fade-in">
          {screen}
        </div>
        {chrome}
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-full">
        <SideNav />
        <div key={view} className="min-w-0 flex-1 animate-fade-in">
          {screen}
        </div>
      </div>
      {chrome}
    </TooltipProvider>
  );
}

/**
 * Бывшие экраны процессов: приёмка и сборка теперь живут на рабочем месте,
 * а старая ссылка (`?view=receiving`) должна вести туда же, а не в никуда.
 */
const STATION_VIEWS = new Set<AppView>(["receiving", "picking"]);

/** Экраны уровня аккаунта: живут вне контекста конкретного склада. */
const ACCOUNT_VIEWS = new Set<AppView>(["login", "dashboard", "profile"]);

/**
 * Что видно, пока файл экрана едет по сети. Тот же кружок, что и на карте в
 * карточке склада: в приложении уже есть этот знак ожидания, и второго
 * изобретать незачем.
 *
 * Роль `status` — для читалки: без неё смена экрана у незрячего человека
 * выглядит как пустота без объяснения.
 */
function ScreenFallback() {
  const t = useT();

  return (
    <div role="status" className="grid h-full place-items-center bg-background">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}

function renderView(view: string) {
  switch (view) {
    case "dashboard":
      return <Dashboard />;
    case "profile":
      return <Profile />;
    case "tasks":
      return <TasksScreen />;
    case "operations":
      return <OperationsScreen />;
    case "staff":
      return <StaffScreen />;
    case "analytics":
      return <AnalyticsScreen />;
    case "labels":
      return <LabelsScreen />;
    case "documents":
      return <DocumentsScreen />;
    case "lookup":
      return <LookupScreen />;
    case "integrations":
      return <IntegrationsScreen />;
    case "spec":
      return <WarehouseSpecScreen />;
    case "seller":
      return <SellerScreen />;
    case "chat":
      return <ChatScreen />;
    case "workstation":
      return <WorkstationScreen />;
    case "devices":
      return <DevicesScreen />;
    case "login":
      return <LoginScreen />;
    default:
      return <Editor />;
  }
}
