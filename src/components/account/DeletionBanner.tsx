import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { accountRepository } from "@/lib/data/accountRepository";
import { useEditor } from "@/lib/store";
import { useCommand } from "@/lib/useCommand";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { card } from "@/components/ui/card";

/**
 * Аккаунт назначен к удалению, а человек вошёл снова — первым делом на
 * главной говорим, когда его сотрут, и даём отменить одной кнопкой. Так
 * устроено у Google и Telegram: вход в срок не отменяет удаление сам, решает
 * человек.
 */
export function DeletionBanner() {
  const t = useT();
  const server = useEditor((s) => s.session.source === "server");
  const [deleteAt, setDeleteAt] = useState<string | null>(null);
  const restore = useCommand(accountRepository.restore);

  useEffect(() => {
    if (!server) return;
    void accountRepository.info().then((res) => {
      if (res.ok && res.data) setDeleteAt(res.data.deleteAt);
    });
  }, [server]);

  if (!deleteAt) return null;
  const date = new Date(deleteAt).toLocaleDateString(t.lang, {
    day: "numeric",
    month: "long",
  });

  const onRestore = async () => {
    const res = await restore.run();
    if (res.ok) setDeleteAt(null);
  };

  return (
    <div
      role="alert"
      className={card({
        className: "flex flex-wrap items-center gap-3 border-destructive/40",
      })}
    >
      <AlertTriangle className="size-5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t("account.banner.title", { date })}</p>
        <p className="text-xs text-muted-foreground">
          {restore.error ? t(restore.error) : t("account.banner.body")}
        </p>
      </div>
      <Button size="sm" disabled={restore.pending} onClick={onRestore}>
        {t("account.banner.restore")}
      </Button>
    </div>
  );
}
