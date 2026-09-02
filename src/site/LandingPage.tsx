import { Hero } from "./components/landing/Hero";
import { Marquee } from "./components/landing/Marquee";
import { Problem } from "./components/landing/Problem";
import { HowItWorks } from "./components/landing/HowItWorks";
import { SellerView } from "./components/landing/SellerView";
import { Numbers } from "./components/landing/Numbers";
import { Slogan } from "./components/landing/Slogan";
import { WarehousesTeaser } from "./components/landing/WarehousesTeaser";
import { Operators } from "./components/landing/Operators";
import { Faq } from "./components/landing/Faq";
import { FinalCta } from "./components/landing/FinalCta";

/**
 * Порядок секций — это порядок вопросов, которые задаёт селлер: что это →
 * куда отгружают → почему сейчас плохо → как будет → что я увижу → сколько
 * этого есть → зачем это вообще → где смотреть склады → а мне-то, складу,
 * что → вопросы → кнопка.
 *
 * Слоган стоит между цифрами и витриной не для красоты: он объясняет, зачем
 * селлеру несколько площадок сразу, и ровно этим подводит к каталогу складов,
 * которые умеют отгружать на все.
 *
 * Тёмные блоки (шаги и финал) стоят через один: страница из десяти одинаково
 * светлых секций читается как бесконечная лента.
 */
export function LandingPage() {
  return (
    <main>
      <Hero />
      <Marquee />
      <Problem />
      <HowItWorks />
      <SellerView />
      <Numbers />
      <Slogan />
      <WarehousesTeaser />
      <Operators />
      <Faq />
      <FinalCta />
    </main>
  );
}
