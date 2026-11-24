import { useState } from "react";
import { Check, X } from "lucide-react";
import type { ServiceKind } from "@/lib/types";
import { useEditor } from "@/lib/store";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { serviceNote } from "./serviceNote";

/**
 * Правка услуги панелью справа (Кирилл 22.11: «карандаш, и сайдбар для
 * редактирования; можно давать описание услуги»). Название встроенной услуги
 * можно заменить своим: пустое поле возвращает подпись по умолчанию.
 * Описание видно под названием в каталоге и продавцу.
 */
export function ServiceEditPanel({ kind, onClose }: { kind: ServiceKind; onClose: () => void }) {
  const t = useT();
  const settings = useEditor((s) => s.serviceSettings);
  const update = useEditor((s) => s.updateService);
  const custom = kind.startsWith("custom:");
  const fallback = custom ? "" : t(`ops.svc.${kind}` as MsgKey);
  const [name, setName] = useState(
    custom
      ? (settings.custom?.find((c) => c.kind === kind)?.name ?? "")
      : (settings.names?.[kind] ?? ""),
  );
  const [note, setNote] = useState(serviceNote(settings, kind, t) ?? "");
  // Своей услуге без названия быть нельзя — встроенная вернётся к словарю.
  const ok = !custom || name.trim().length >= 2;

  return (
    <DialogShell size="sm" onClose={onClose}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          update(kind, { name, note });
          onClose();
        }}
      >
        <DialogHeader>
          <h2 className="text-sm font-semibold">{t("ops.edit.title")}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("support.close")}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </DialogHeader>
        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="svc-edit-name">{t("ops.custom.name")}</Label>
            <Input
              id="svc-edit-name"
              value={name}
              maxLength={80}
              placeholder={fallback}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="svc-edit-note">{t("ops.edit.note")}</Label>
            <textarea
              id="svc-edit-note"
              value={note}
              maxLength={500}
              rows={4}
              placeholder={t("ops.edit.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
              className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:text-base"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!ok}>
            <Check /> {t("common.save")}
          </Button>
        </DialogFooter>
      </form>
    </DialogShell>
  );
}
