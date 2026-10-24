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
  "support.snapshot": "Прислать копию данных этого склада",
  "support.snapshot.hint":
    "Только открытый сейчас склад: товары, ячейки и операции, по ним видно ошибку. Других ваших складов в копии не будет. Имена людей заменятся метками вроде «Сотрудник 3», а контакты, реквизиты и ключи подключений будут удалены.",
  "support.snapshot.stats":
    "Заменено имён: {names} · удалено полей: {dropped} · скрыто текстов: {texts}",
  "support.preview.show": "Показать, что уйдёт",
  "support.preview.hide": "Скрыть",
  "support.preview.title": "Что уйдёт в копии",
  "support.preview.names":
    "Имена людей заменены метками «Сотрудник 1», «Продавец 2». Телефоны, почты, реквизиты и ключи подключений удалены.",
  "support.preview.raw": "Показать как файл",
  "support.preview.rawHide": "Скрыть файл",
  "support.preview.noSnapshot":
    "Копия данных склада не прикладывается: уйдут только текст обращения, журнал событий и сведения о браузере.",
  "support.sum.staff": "Сотрудники (метками, без имён)",
  "support.sum.products": "Товары",
  "support.sum.placements": "Размещения на полках",
  "support.sum.shipments": "Поставки",
  "support.sum.receiving": "Записи приёмки",
  "support.sum.boxes": "Тара",
  "support.sum.pallets": "Паллеты",
  "support.sum.requests": "Заявки",
  "support.sum.trips": "Рейсы",
  "support.sum.tasks": "Задания",
  "support.sum.chats": "Сообщения в чате (текст скрыт)",
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
  "support.snapshot": "Send a copy of this warehouse's data",
  "support.snapshot.hint":
    "Only the warehouse open now: goods, cells and operations, which show the error. Your other warehouses are not included. People's names become labels like “Staff 3”; contacts, company details and integration keys are removed.",
  "support.snapshot.stats":
    "Names replaced: {names} · fields removed: {dropped} · texts hidden: {texts}",
  "support.preview.show": "Show what will be sent",
  "support.preview.hide": "Hide",
  "support.preview.title": "What the copy contains",
  "support.preview.names":
    "People's names are replaced with labels like “Staff 1”, “Seller 2”. Phones, emails, company details and integration keys are removed.",
  "support.preview.raw": "Show as a file",
  "support.preview.rawHide": "Hide the file",
  "support.preview.noSnapshot":
    "No warehouse data copy is attached: only your message, the event log and browser details will be sent.",
  "support.sum.staff": "Staff (labels, no names)",
  "support.sum.products": "Products",
  "support.sum.placements": "Shelf placements",
  "support.sum.shipments": "Inbound shipments",
  "support.sum.receiving": "Receiving records",
  "support.sum.boxes": "Containers",
  "support.sum.pallets": "Pallets",
  "support.sum.requests": "Requests",
  "support.sum.trips": "Trips",
  "support.sum.tasks": "Tasks",
  "support.sum.chats": "Chat messages (text hidden)",
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
