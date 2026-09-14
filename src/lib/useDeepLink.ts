import { useEffect, useRef } from "react";
import { deepLinkSearch, isHeatmapWindow, parseDeepLink } from "./appViews";
import { selectRole, useEditor } from "./store";

/**
 * Адрес кабинета в согласии с открытым экраном.
 *
 * Раньше `?role=&view=` читались один раз при запуске и обратно не писались:
 * человек уходил в приёмку, копировал адрес из строки — и присылал коллеге
 * ссылку на тот экран, с которого начал сам. Кнопка «назад» при этом уводила
 * с сайта целиком, потому что за весь поход по семнадцати экранам в истории
 * не появлялось ни одной записи.
 *
 * Теперь переход по рельсу — шаг истории, как и на любом другом сайте. Первая
 * запись адреса делается заменой, а не добавлением: она случается сразу после
 * запуска и означает не переход, а приведение адреса к тому, что и так на
 * экране. Иначе первое же «назад» возвращало бы на тот же самый экран.
 *
 * Маршрутизатора здесь по-прежнему нет: экраны живут в сторе, адрес — их
 * отражение, а не источник. Когда придёт настоящая маршрутизация, менять
 * придётся этот файл, а не семнадцать экранов.
 */
export function useDeepLink(): void {
  const view = useEditor((s) => s.appView);
  const role = useEditor(selectRole);
  const started = useRef(false);

  useEffect(() => {
    // Отдельное окно тепловой карты живёт своей жизнью: рельса в нём нет, а
    // экран стора остался тот же, что и в главном окне, — записав его в адрес,
    // окно объявило бы себя обычным кабинетом.
    if (isHeatmapWindow(window.location.search)) return;
    const first = !started.current;
    started.current = true;

    const search = deepLinkSearch(window.location.search, { role, view });
    // Совпало — писать нечего. Сюда же попадает возврат по «назад»: стор уже
    // приведён к адресу, и повторная запись только сломала бы историю.
    if (search === window.location.search) return;

    const url = `${window.location.pathname}${search}${window.location.hash}`;
    if (first) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }, [role, view]);

  useEffect(() => {
    if (isHeatmapWindow(window.location.search)) return;
    const back = () => {
      const link = parseDeepLink(window.location.search);
      // Роль первой: она сама уводит на «свой» стартовый экран, и обратный
      // порядок затёр бы тот экран, на который человек возвращается.
      if (link.role) useEditor.getState().setRole(link.role);
      if (link.view) useEditor.getState().goToView(link.view);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
}
