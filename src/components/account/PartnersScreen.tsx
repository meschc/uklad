import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { ScreenShell } from "@/components/fulfillment/ScreenShell";
import { PartnersSection } from "./PartnersSection";

/**
 * Партнёры-продавцы — отдельный экран меню (Кирилл 20.11: «партнёры — это не
 * персонал», вкладкой в «Персонале» их не находили). У фулфилмента продавец —
 * главный клиент: с ним связаны товар, подключения площадок, акты и чат.
 */
export function PartnersScreen() {
  const t = useT();
  const name = useEditor((s) => s.warehouse.name);
  const viewer = useEditor((s) => s.session.readOnly === true);
  return (
    <ScreenShell
      title={t("partners.screen.title")}
      subtitle={t("partners.screen.subtitle", { name })}
      wide
    >
      <PartnersSection readOnly={viewer} />
    </ScreenShell>
  );
}
