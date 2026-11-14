import { LogOut, Square } from "lucide-react";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { shiftStartedAt } from "@/lib/workstation";
import type { StaffMember } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { formatTime } from "./useNow";
import { FormError } from "@/components/ui/field";

/**
 * Выход со стола при открытой смене (Кирилл 13.11: «заканчивается ли смена
 * при выходе?»). Выход и конец смены — разные вещи: человек уходит к другому
 * столу или на ТСД, а смена идёт. Поэтому выход не закрывает смену молча, а
 * спрашивает: закончить её или оставить. Без открытой смены панель не нужна —
 * кнопка «Выйти» выходит сразу.
 */
export function LogoutPanel({ member }: { member: StaffMember }) {
  const t = useT();
  const start = useEditor((s) => shiftStartedAt(s.staffEvents, member.id));
  const mark = useCommand(workstationRepository.mark);
  const logout = useCommand(workstationRepository.logout);
  const pending = mark.pending || logout.pending;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        {t("ws.out.body", { t: start == null ? "—" : formatTime(start, t.lang) })}
      </p>
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          disabled={pending}
          onClick={async () => {
            const res = await mark.run("shift_end");
            if (res.ok) await logout.run();
          }}
        >
          <Square />
          {t("ws.out.end")}
        </Button>
        <Button size="lg" variant="outline" disabled={pending} onClick={() => void logout.run()}>
          <LogOut />
          {t("ws.out.keep")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("ws.out.hint")}</p>
      {(mark.error || logout.error) && <FormError>{t((mark.error ?? logout.error)!)}</FormError>}
    </div>
  );
}
