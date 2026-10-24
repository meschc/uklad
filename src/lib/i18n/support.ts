/**
 * Поддержка: «Сообщить о проблеме», журнал событий и обезличенная копия.
 * Про устройство типов см. `./common.ts`, сборка — в `./index.ts`.
 */

export const ru = {
  "support.nav": "Сообщить о проблеме",
  "support.title": "Сообщить о проблеме",
  "support.lead": "Опишите, что случилось. Мы разберём обращение и ответим.",
  "support.message": "Что случилось",
  "support.message.placeholder": "Например: после сканирования коробки пропала строка приёмки",
  "support.journal": "Журнал событий за 7 дней: {n}",
  "support.journal.hint":
    "Какие экраны открывались, какие действия и ошибки были. Без имён, телефонов и почт.",
  "support.snapshot": "Приложить копию данных склада без имён",
  "support.snapshot.hint":
    "Товары, ячейки и операции останутся — по ним видно ошибку. Имена людей заменятся метками вроде «Сотрудник 3», контакты, реквизиты и ключи подключений будут удалены.",
  "support.snapshot.stats":
    "Заменено имён: {names} · удалено полей: {dropped} · скрыто текстов: {texts}",
  "support.preview.show": "Показать, что уйдёт",
  "support.preview.hide": "Скрыть",
  "support.size": "Объём: {kb} КБ",
  "support.send": "Отправить",
  "support.sent.title": "Обращение № {id} отправлено",
  "support.sent.body":
    "Мы разберём его и ответим. Назовите этот номер, если захотите что-то дописать.",
  "support.close": "Закрыть",
  "support.error.failed": "Не удалось отправить. Проверьте связь и попробуйте ещё раз.",
  "support.error.tooLarge": "Слишком большой объём. Отправьте без копии данных.",
  "support.error.tooOften": "Слишком часто. Подождите минуту и отправьте снова.",
};

export const en: Record<keyof typeof ru, string> = {
  "support.nav": "Report a problem",
  "support.title": "Report a problem",
  "support.lead": "Tell us what happened. We will look into it and reply.",
  "support.message": "What happened",
  "support.message.placeholder": "For example: a receiving line disappeared after scanning a box",
  "support.journal": "Event log for 7 days: {n}",
  "support.journal.hint":
    "Which screens were opened, which actions and errors happened. No names, phones or emails.",
  "support.snapshot": "Attach a copy of warehouse data without names",
  "support.snapshot.hint":
    "Goods, cells and operations stay — they show the error. People's names become labels like “Staff 3”; contacts, company details and integration keys are removed.",
  "support.snapshot.stats":
    "Names replaced: {names} · fields removed: {dropped} · texts hidden: {texts}",
  "support.preview.show": "Show what will be sent",
  "support.preview.hide": "Hide",
  "support.size": "Size: {kb} KB",
  "support.send": "Send",
  "support.sent.title": "Report no. {id} sent",
  "support.sent.body":
    "We will look into it and reply. Mention this number if you want to add something.",
  "support.close": "Close",
  "support.error.failed": "Could not send. Check your connection and try again.",
  "support.error.tooLarge": "Too large. Send it without the data copy.",
  "support.error.tooOften": "Too often. Wait a minute and send again.",
};
