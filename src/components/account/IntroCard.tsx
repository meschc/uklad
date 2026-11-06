import { useState } from "react";
import { UserRound } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { card } from "@/components/ui/card";

/**
 * «Как вас зовут?» — один раз после первого входа, на главной, а не в форме
 * регистрации (Кирилл 1 ноя: «странно, что не спрашиваем имя»). Регистрация
 * остаётся короткой — почта и пароль, — а имя и компания спрашиваются тут же,
 * когда человек уже внутри, как у Notion и Slack.
 *
 * Не окно поверх экрана: карточка на месте, её можно отложить. «Позже» прячет
 * её до следующего открытия кабинета — имя нужно складу (оно в документах и
 * в переписке с продавцами), поэтому совсем она не уходит, пока имени нет.
 */
export function IntroCard() {
  const t = useT();
  const name = useEditor((s) => s.profile.name);
  const account = useEditor((s) => s.account);
  const updateProfile = useEditor((s) => s.updateProfile);
  const updateAccount = useEditor((s) => s.updateAccount);
  const [draftName, setDraftName] = useState("");
  const [draftOrg, setDraftOrg] = useState(account.type === "company" ? (account.org ?? "") : "");
  const [later, setLater] = useState(false);

  if (name.trim() || later) return null;
  const company = account.type === "company";

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftName.trim()) return;
    updateProfile({ name: draftName.trim() });
    if (company && draftOrg.trim()) updateAccount({ org: draftOrg.trim() });
  };

  return (
    <form onSubmit={save} className={card({ className: "flex flex-col gap-4" })}>
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <UserRound className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("intro.title")}</p>
          <p className="text-xs text-muted-foreground">{t("intro.body")}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="intro-name" className="text-xs font-medium text-muted-foreground">
            {t("intro.name")}
          </Label>
          <Input
            id="intro-name"
            autoComplete="name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={t("profile.namePlaceholder")}
            className="h-9"
          />
        </div>
        {company && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="intro-org" className="text-xs font-medium text-muted-foreground">
              {t("intro.org")}
            </Label>
            <Input
              id="intro-org"
              autoComplete="organization"
              value={draftOrg}
              onChange={(e) => setDraftOrg(e.target.value)}
              placeholder={t("profile.companyPlaceholder")}
              className="h-9"
            />
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setLater(true)}>
          {t("intro.later")}
        </Button>
        <Button type="submit" size="sm" disabled={!draftName.trim()}>
          {t("intro.save")}
        </Button>
      </div>
    </form>
  );
}
