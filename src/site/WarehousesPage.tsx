import { ConnectPath } from "./components/warehouses/ConnectPath";
import { Familiar } from "./components/warehouses/Familiar";
import { FinalConnect } from "./components/warehouses/FinalConnect";
import { HeroScreens } from "./components/warehouses/HeroScreens";
import { Inside } from "./components/warehouses/Inside";
import { Offer } from "./components/warehouses/Offer";
import { Questions } from "./components/warehouses/Questions";
import { Tariffs } from "./components/warehouses/Tariffs";

/**
 * Страница для складов — лендинг подключения и образец нового стиля витрины.
 * Перенесена с холста Claude Design 19 окт: белый фон, синий первый экран
 * во всю ширину с окном настоящего кабинета, светлые подложки только серые.
 * Токены — в `site.css` под `.wh`.
 *
 * Только по-русски: клиентов начинаем со складов в России. Порядок блоков:
 * боль → что внутри → условия → путь подключения → тарифы → вопросы → заявка.
 * Все призывы ведут к форме в конце страницы (`#connect`).
 */
export function WarehousesPage() {
  return (
    <div className="wh">
      <HeroScreens />
      <Familiar />
      <Inside />
      <Offer />
      <ConnectPath />
      <Tariffs />
      <Questions />
      <FinalConnect />
    </div>
  );
}
