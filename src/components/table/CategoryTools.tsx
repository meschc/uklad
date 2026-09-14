import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ProductCategory } from "@/lib/types";
import { useEditor } from "@/lib/store";
import { catalogRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import type { TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Правка самого списка категорий (п.15): добавить, переименовать, удалить.
 * Живёт рядом с чипами категорий — там, где пользователь их и видит.
 *
 * Отдельным файлом от конструктора полей: это соседний по месту, но чужой по
 * смыслу инструмент — там атрибуты товара, здесь справочник категорий.
 */
export function CategoryTools({
  category,
  onPick,
  t,
}: {
  category: ProductCategory;
  onPick: (c: ProductCategory) => void;
  t: TFunc;
}) {
  const categories = useEditor((s) => s.categories);
  const [mode, setMode] = useState<"idle" | "add" | "rename">("idle");
  const [value, setValue] = useState("");
  /** Готовый текст отказа: сюда сходятся обе его причины (см. `submit`). */
  const [error, setError] = useState<string | null>(null);

  // Справочник категорий правится через репозиторий (п.3.2.1). Переименование
  // тянет за собой товары и доп.поля, поэтому на сервере это будет одна
  // транзакция — и один вызов здесь.
  const add = useCommand((name: string) => catalogRepository.addCategory(name));
  const rename = useCommand((from: ProductCategory, to: string) =>
    catalogRepository.renameCategory(from, to),
  );
  const remove = useCommand((name: ProductCategory) => catalogRepository.removeCategory(name));
  const busy = add.pending || rename.pending || remove.pending;

  /**
   * Два текста отказа держатся врозь: «имя занято» — местный, «связь не
   * вышла» — командный, и по нему же кнопка становится повтором. Гасить их
   * поодиночке значит рано или поздно забыть один из них.
   */
  const clearErrors = () => {
    setError(null);
    add.reset();
    rename.reset();
  };

  const close = () => {
    setValue("");
    clearErrors();
    setMode("idle");
  };

  const submit = async () => {
    const clean = value.trim();
    setError(null);
    // Переименование в то же самое имя — не отказ и не работа: стор такое
    // честно отвергает, но показывать за это ошибку было бы придиркой.
    if (mode === "rename" && clean === category) {
      close();
      return;
    }
    const res = mode === "add" ? await add.run(clean) : await rename.run(category, clean);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    // Домен отказал по имени — оно занято. Раньше форма просто молчала:
    // человек жал «Сохранить», ничего не происходило, и почему — неизвестно.
    if (!res.data) {
      setError(t("cats.err.dup", { name: clean }));
      return;
    }
    onPick(clean);
    close();
  };

  /** Сбой связи той команды, которую сейчас показывает форма. */
  const failed = mode === "add" ? add.error : rename.error;

  const alert = error && (
    <p role="alert" className="w-full pt-1.5 text-xs text-destructive">
      {error}
    </p>
  );

  if (mode !== "idle") {
    return (
      <>
        <div className="flex w-full items-center gap-2 pt-1.5">
          <Input
            // eslint-disable-next-line jsx-a11y/no-autofocus -- поле раскрыто по клику «добавить»: фокус обязан уйти в него
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") close();
            }}
            placeholder={t(mode === "add" ? "cats.newName" : "cats.renameTo")}
            className={cn("h-9 flex-1", error && "border-destructive")}
          />
          {/* Связь подвела — кнопка становится повтором (п.3.2.2). За отказ по
              имени повтор не предлагаем: то же имя занято и во второй раз. */}
          <Button size="sm" className="h-9" disabled={!value.trim() || busy} onClick={submit}>
            {busy ? t("data.busy") : failed ? t("data.retry") : t("common.save")}
          </Button>
          {/* Отмену не блокируем: если запрос повис, выход не должен быть
              заперт вместе с ним. */}
          <Button size="sm" variant="ghost" className="h-9" onClick={close}>
            {t("common.cancel")}
          </Button>
        </div>
        {alert}
      </>
    );
  }

  return (
    <>
      <div className="ml-auto flex items-center gap-0.5">
        <IconBtn
          title={t("cats.add")}
          disabled={busy}
          onClick={() => {
            setValue("");
            clearErrors();
            setMode("add");
          }}
        >
          <Plus className="size-3.5" />
        </IconBtn>
        <IconBtn
          title={t("cats.rename")}
          disabled={busy}
          onClick={() => {
            setValue(category);
            clearErrors();
            setMode("rename");
          }}
        >
          <Pencil className="size-3.5" />
        </IconBtn>
        <IconBtn
          title={t("cats.remove")}
          // Последнюю категорию не удаляем: товару всегда нужна какая-то.
          disabled={categories.length <= 1 || busy}
          danger
          onClick={async () => {
            // Удаляем ту категорию, что сейчас открыта, — значит после удаления
            // окно смотрит в пустоту. Стор переносит товары в первую из
            // оставшихся; переводим на неё и выбор, иначе форма добавления поля
            // осталась бы привязана к несуществующей категории.
            const fallback = categories.find((c) => c !== category);
            const res = await remove.run(category);
            if (!res.ok) {
              setError(t(res.error));
              return;
            }
            if (fallback) onPick(fallback);
          }}
        >
          <Trash2 className="size-3.5" />
        </IconBtn>
      </div>
      {alert}
    </>
  );
}

function IconBtn({
  title,
  disabled,
  danger,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded text-muted-foreground transition-colors disabled:pointer-events-none disabled:opacity-30",
        danger
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
