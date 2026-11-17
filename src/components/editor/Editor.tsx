import { Suspense, lazy, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useShortcuts } from "@/lib/useShortcuts";
import { usePhone } from "@/lib/usePhone";
import { selectRole, useEditor } from "@/lib/store";
import { TableScreen } from "@/components/table/TableScreen";
import { SHOW_3D } from "./constants";
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";
import { StructurePanel } from "./StructurePanel";
import { Canvas } from "./Canvas";
import { HelpMenu } from "./HelpMenu";
import { OnboardingHint } from "./OnboardingHint";
import { ZoomControls } from "./ZoomControls";
import { RowProposalPanel } from "./RowProposalPanel";
import { Inspector } from "./Inspector";
import { GoodsConflictDialog } from "./GoodsConflictDialog";
import { PrintPlan } from "./PrintPlan";

/**
 * Трёхмерный вид — отдельным файлом сборки.
 *
 * Он тянет `three` (около 340 КБ), а режим за флагом `SHOW_3D` и сейчас
 * выключен. При обычном импорте движок всё равно уезжал бы в общий файл: его
 * качал бы кладовщик, открывающий приёмку, ради экрана, которого в интерфейсе
 * нет. Пока флаг выключен, импорта нет вовсе: чанк с `three` в сборку не
 * попадает. Включили флаг — динамический импорт скачает его, когда понадобится.
 */
const View3D = SHOW_3D
  ? lazy(() => import("@/components/three/View3D").then((m) => ({ default: m.View3D })))
  : null;

export function Editor() {
  useShortcuts();
  const stored = useEditor((s) => s.mode);
  // Продавцу план и таблица доступны только на чтение (п.26): инструменты
  // правки не прячутся «на всякий случай», их просто нет в его интерфейсе.
  const seller = useEditor((s) => selectRole(s) === "seller");
  // На телефоне план только смотрят (согласовано 16.11): панели правки
  // закрывали холст целиком (Кирилл 17.11).
  const phone = usePhone();
  const readOnly = seller || phone;
  // План на телефоне не нужен вовсе (Кирилл 18.11): только таблица товаров, а
  // загруженность — отдельной кнопкой в шапке. Выбранный режим не трогаем:
  // на компьютере человек вернётся в свой план.
  const mode = phone ? "table" : stored;

  // Приветственная подсказка обучения — при первом входе в редактор. Один раз
  // (showHint помнит показанные); «Пройти обучение заново» её возвращает.
  useEffect(() => {
    useEditor.getState().showHint("welcome");
  }, []);

  return (
    <div className="flex h-full flex-col bg-background">
      <TopBar />
      {/* Плавная смена экрана 2D / Таблица / 3D (key перезапускает fade-in). */}
      <div key={mode} className="flex min-h-0 flex-1 animate-fade-in flex-col">
        {mode === "table" ? (
          <TableScreen />
        ) : mode === "3d" && View3D ? (
          <Suspense
            fallback={
              <div className="grid min-h-0 flex-1 place-items-center bg-[hsl(var(--canvas-bg))]">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <View3D />
          </Suspense>
        ) : (
          <PlanScreen readOnly={readOnly} />
        )}
      </div>
      {/* Алерт «на полке товар» — над любым экраном (ТЗ, разд. 4) */}
      <GoodsConflictDialog />
      {/* Тост переехал в App: он нужен на всех экранах, а не только здесь. */}
      {/* Печатная версия плана — видна только принтеру (п.9). */}
      <PrintPlan />
    </div>
  );
}

/** Экран 2D-плана этажа (ТЗ, разд. 3.5). */
function PlanScreen({ readOnly }: { readOnly: boolean }) {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[hsl(var(--canvas-bg))]">
      {/* Холст — на всю ширину экрана, под плавающими панелями. Сайдбары плавают
          ПОВЕРХ него, а не «съедают» его ширину (п.3): фон редактора виден везде. */}
      <div className="absolute inset-0 z-0">
        <Canvas />
      </div>
      {/* Плавающий слой: сайдбары по краям, середина прозрачна — клики уходят на
          холст под ней (pointer-events-none), а сами панели/кнопки ловят свои. */}
      <div className="pointer-events-none absolute inset-0 z-10 flex">
        {!readOnly && <StructurePanel />}
        <main className="relative min-w-0 flex-1">
          {!readOnly && <ToolRail />}
          {!readOnly && <RowProposalPanel />}
          <HelpMenu />
          {/* Подсказка «стройте план» — про правку; на телефоне план только смотрят. */}
          {!readOnly && <OnboardingHint />}
          <ZoomControls />
        </main>
        {!readOnly && <Inspector />}
      </div>
    </div>
  );
}
