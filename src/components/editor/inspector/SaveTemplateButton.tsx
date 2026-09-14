import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { useEditor } from "@/lib/store";
import type { TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/** Сколько миллисекунд держится галочка «сохранено в библиотеку». */
const SAVED_FLASH_MS = 1600;

/**
 * «Сохранить раскладку» — одна кнопка на два места: редактор полок одной секции
 * и групповая панель. Обе кладут в библиотеку одно и то же — массив ячеек по
 * полкам — и обе показывают короткую галочку вместо тоста: подтверждение нужно
 * ровно на месте нажатия.
 */
export function SaveTemplateButton({ cells, t }: { cells: number[]; t: TFunc }) {
  const addTemplate = useEditor((s) => s.addTemplate);
  const [saved, setSaved] = useState(false);

  const save = () => {
    addTemplate(cells);
    setSaved(true);
    window.setTimeout(() => setSaved(false), SAVED_FLASH_MS);
  };

  return (
    <Button variant="outline" size="sm" className="w-full" onClick={save}>
      {saved ? (
        <>
          <BookmarkCheck className="size-3.5" />
          {t("insp.savedToLibrary")}
        </>
      ) : (
        <>
          <Bookmark className="size-3.5" />
          {t("insp.saveTemplate")}
        </>
      )}
    </Button>
  );
}
