import { Component, type ErrorInfo, type ReactNode } from "react";

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

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="max-w-md">
          <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-muted-foreground">
            Сбой страницы
          </p>
          <h1 className="mt-3 font-display text-[26px] font-medium tracking-[-0.02em]">
            Витрина не открылась
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Это на нашей стороне. Обычно помогает перезагрузка — данные сайта
            никуда не денутся, их и нет: витрина ничего о вас не хранит.
          </p>
          {/*
           * Текст ошибки — мелко и без рамки-«аварии»: посетителю витрины он не
           * нужен, но именно его человек скопирует в письмо, если решит
           * написать нам. Без него сообщение «у вас что-то не работает»
           * невозможно проверить.
           */}
          <p className="mt-4 break-words font-mono text-[11px] leading-relaxed text-muted-foreground/70">
            {this.state.error.message}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center rounded-full border border-border px-6 text-sm font-medium transition-colors hover:bg-muted"
            >
              Обновить страницу
            </button>
            {/*
             * Кнопка, а не ссылка: смена одного хэша — переход внутри того же
             * документа, React при нём не перезапускается, и человек остался бы
             * на этом же экране сбоя. Поэтому адрес меняем и тут же
             * перезагружаем страницу — приложение поднимется уже на контактах.
             */}
            <button
              onClick={() => {
                window.location.hash = "/contacts";
                window.location.reload();
              }}
              className="inline-flex h-11 items-center px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Написать нам
            </button>
          </div>
        </div>
      </div>
    );
  }
}
