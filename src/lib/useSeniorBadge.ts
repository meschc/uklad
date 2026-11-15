import { useEditor } from "./store";
import { serverBadges } from "./data/badgeRepository";
import { parseBadge } from "./workstation";
import { isDecider } from "./docFlow";
import type { StaffMember } from "./types/warehouse";

/**
 * Бейдж старшего, который снимает остановку на столе: повтор посылки на
 * сортировке и на погрузке. Ответ — сотрудник, если он вправе решать по
 * товару, иначе `null`.
 *
 * На сервере в QR лежит секрет, а не id, поэтому чей бейдж и есть ли у роли
 * `goods.decide`, отвечает сервер (`POST /desk/senior`). Список команды стол
 * не читает: у куки стола на него нет права, и ответ 401 выкидывал стол на
 * экран входа (обход столов 15.11). В демо — id из бейджа и должность.
 */
export function useSeniorBadge(): (raw: string) => Promise<StaffMember | null> {
  const staff = useEditor((s) => s.warehouse.staff);
  const onServer = useEditor((s) => s.session.source === "server");
  return async (raw) => {
    if (!onServer) {
      const id = parseBadge(raw);
      const m = id ? staff?.find((x) => x.id === id) : undefined;
      return m && isDecider(m, null, false) ? m : null;
    }
    const res = await serverBadges.senior(raw);
    if (!res.ok || !res.data) return null;
    const id = res.data;
    return staff?.find((x) => x.id === id) ?? null;
  };
}
