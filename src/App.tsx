import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { selectRole, useEditor } from "@/lib/store";
import { applyTheme } from "@/lib/theme";
import { Editor } from "@/components/editor/Editor";
import { Dashboard } from "@/components/account/Dashboard";
import { Profile } from "@/components/account/Profile";
import { StaffScreen } from "@/components/account/StaffScreen";
import { WarehouseSpecScreen } from "@/components/account/WarehouseSpecScreen";
import { LoginScreen } from "@/components/account/LoginScreen";
import { HeatmapView } from "@/components/heatmap/HeatmapView";
import { SideNav, navFor } from "@/components/nav/SideNav";
import type { AppView } from "@/lib/types";
import { ReceivingScreen } from "@/components/fulfillment/ReceivingScreen";
import { TasksScreen } from "@/components/fulfillment/TasksScreen";
import { PickingScreen } from "@/components/fulfillment/PickingScreen";
import { SellerScreen } from "@/components/fulfillment/SellerScreen";
import { AnalyticsScreen } from "@/components/fulfillment/AnalyticsScreen";
import { LabelsScreen } from "@/components/fulfillment/LabelsScreen";
import { DocumentsScreen } from "@/components/fulfillment/DocumentsScreen";
import { LookupScreen } from "@/components/fulfillment/LookupScreen";
import { IntegrationsScreen } from "@/components/fulfillment/IntegrationsScreen";
import { ChatScreen } from "@/components/chat/ChatScreen";
import { ChatWatcher } from "@/components/chat/ChatWatcher";
import { Toast } from "@/components/editor/Toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Отдельное окно тепловой карты (`window.open` из TopBar): признак — в URL,
// вычисляется один раз при загрузке страницы.
const IS_HEATMAP = new URLSearchParams(window.location.search).has("heatmap");

export default function App() {
  const appView = useEditor((s) => s.appView);
  const role = useEditor(selectRole);
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
  const view =
    ACCOUNT_VIEWS.has(appView) || allowed.includes(appView)
      ? appView
      : allowed[0];

  useEffect(() => {
    if (view !== appView) useEditor.getState().goToView(view);
  }, [view, appView]);

  if (IS_HEATMAP) {
    return (
      <div className="h-full animate-fade-in">
        <HeatmapView />
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
  const screen = (
    <ErrorBoundary key={view} label={view}>
      {renderView(view)}
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
