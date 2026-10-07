import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { c, pick } from "../lib/copy";
import { getLang } from "../lib/lang";
import { href } from "../lib/route";

/**
 * Язык берём функцией `getLang`, а не хуком: это классовый компонент, и хуки
 * тут недоступны. Экран сбоя показывается один раз и переключателя языка на нём
 * нет, поэтому подписка на смену языка ему и не нужна.
 */
const T = {
  eyebrow: c("Сбой страницы", "Page failure"),
  title: c("Витрина не открылась", "The site did not open"),
  lead: c(
    "Это на нашей стороне. Обычно помогает перезагрузка — витрина ничего о вас не хранит.",
    "This is on us. A reload usually fixes it — the site keeps nothing about you.",
  ),
  reload: c("Обновить страницу", "Reload the page"),
  write: c("Написать нам", "Write to us"),
};

/**
 * Последняя преграда витрины: страница, которую человек видит вместо белого
 * экрана.
 *
 * У статического сайта нет сервера, а значит не бывает и привычной «ошибки
 * 500». Её место занимает падение отрисовки: React снимает всё дерево целиком,
 * и вместо витрины остаётся пустой белый лист без единой ссылки — ни шапки, ни
 * подвала, ни телефона, по которому можно спросить. Для того, кто пришёл
 * выбирать склад, это выглядит как закрывшийся сервис.
 *
 * Поэтому граница стоит снаружи всего приложения, а не вокруг отдельных
 * экранов, как в системе: там падение одного экрана оставляет рабочим меню и
 * соседние разделы, здесь падать, кроме самой витрины, нечему.
 *
 * Своя вёрстка без Tailwind-компонентов и без иконок — намеренно: этот экран
 * показывают ровно тогда, когда что-то в приложении уже сломалось, и тянуть в
 * него общие компоненты значит рисковать вторым падением поверх первого.
 */
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class SiteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[uklad] витрина упала:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const lang = getLang();

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="max-w-md">
          <p className={eyebrow({ className: "font-mono" })}>{pick(lang, T.eyebrow)}</p>
          <h1 className="mt-3 font-display text-2xl font-heading tracking-tight">
            {pick(lang, T.title)}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{pick(lang, T.lead)}</p>
          {/*
           * Текст ошибки — мелко и без рамки-«аварии»: посетителю витрины он не
           * нужен, но именно его человек скопирует в письмо, если решит
           * написать нам. Без него сообщение «у вас что-то не работает»
           * невозможно проверить.
           */}
          <p className="mt-4 break-words font-mono text-xs leading-relaxed text-muted-foreground/70">
            {this.state.error.message}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="outline"
              size="lg"
              shape="pill"
              onClick={() => window.location.reload()}
            >
              {pick(lang, T.reload)}
            </Button>
            {/*
             * Обычная ссылка — и это как раз тот случай, когда полная
             * перезагрузка нужна: витрина уже сломана, и переводить её на
             * контакты внутри того же документа значит нести поломку с собой.
             * Перехватчик кликов тут не помешает: он живёт в `SiteApp`, а
             * `SiteApp` в этот момент уже снят с экрана.
             */}
            <Button asChild variant="ghost" size="lg" shape="pill">
              <a href={href("/contacts")}>{pick(lang, T.write)}</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
