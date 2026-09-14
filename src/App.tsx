import { Suspense, lazy, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isHeatmapWindow } from "@/lib/appViews";
import { selectRole, useEditor } from "@/lib/store";
import { applyTheme } from "@/lib/theme";
import { useDeepLink } from "@/lib/useDeepLink";
import { useT } from "@/lib/i18n";
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
const ReceivingScreen = lazy(() =>
  import("@/components/fulfillment/ReceivingScreen").then((m) => ({ default: m.ReceivingScreen })),
);
const TasksScreen = lazy(() =>
  import("@/components/fulfillment/TasksScreen").then((m) => ({ default: m.TasksScreen })),
);
const PickingScreen = lazy(() =>
  import("@/components/fulfillment/PickingScreen").then((m) => ({ default: m.PickingScreen })),
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
const ChatScreen = lazy(() =>
  import("@/components/chat/ChatScreen").then((m) => ({ default: m.ChatScreen })),
);

// Отдельное окно тепловой карты (`window.open` из TopBar): признак — в URL,
// вычисляется один раз при загрузке страницы.
const IS_HEATMAP = isHeatmapWindow(window.location.search);

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
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Роль ограничивает набор экранов: продавец не должен попасть в редактор
  // структуры склада, даже если состояние восстановилось из localStorage.
  // Экраны уровня аккаунта доступны всегда: их нет в рельсе (в кабинет ведёт
  // логотип, в профиль — шапка кабинета), но выкидывать с них по «не нашёл в
  // списке разрешённых» нельзя — иначе кабинет стал бы недостижим.
  const allowed = navFor(role).map((n) => n.view);
  const view = ACCOUNT_VIEWS.has(appView) || allowed.includes(appView) ? appView : allowed[0];

  useEffect(() => {
    if (view !== appView) useEditor.getState().goToView(view);
  }, [view, appView]);

  if (IS_HEATMAP) {
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
  const showNav = !ACCOUNT_VIEWS.has(view);

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
      <ChatWatcher />
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
    case "receiving":
      return <ReceivingScreen />;
    case "tasks":
      return <TasksScreen />;
    case "picking":
      return <PickingScreen />;
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
    case "login":
      return <LoginScreen />;
    default:
      return <Editor />;
  }
}
