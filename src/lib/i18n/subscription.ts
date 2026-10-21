/**
 * Тариф, персональный менеджер и резервные копии: то, что сайт обещает по
 * тарифам и кабинет обязан выполнять.
 */

export const ru = {
  "tariff.title": "Тариф",
  "tariff.label": "Тариф",
  "tariff.operator": "Оператор",
  "tariff.warehouse": "Склад",
  "tariff.start": "Старт",
  "tariff.hint":
    "Оплаты в кабинете пока нет: тариф выбирается здесь, а после подключения придёт из договора.",
  "tariff.onlyIn": "Только в «{plan}е»",
  "tariff.onlyInMany": "В «Складе» и «Операторе»",

  "manager.label": "Менеджер",
  "manager.pending": "Назначим при подключении",

  "backup.title": "Резервная копия",
  "backup.archive": "Архив",
  "backup.download": "Скачать архив",
  "backup.never": "Копий ещё не было",
  "backup.last": "Последняя — {date}",
  "backup.restore": "Восстановить",
  "backup.pick": "Выбрать файл",
  "backup.restoreWarn": "Данные кабинета заменятся архивом от {date}",
  "backup.restoreConfirm": "Заменить данные",
  "backup.remind": "Напоминать",
  "backup.remind.0": "Нет",
  "backup.remind.7": "7 дн.",
  "backup.remind.14": "14 дн.",
  "backup.remind.30": "30 дн.",
  "backup.email": "Копия на почту",
  "backup.email.on": "Каждую неделю",
  "backup.email.off": "Выключена",
  "backup.emailNote": "Будет приходить на {email}. Письма начнут уходить, когда подключим сервер.",
  "backup.done": "Архив скачан",

  "backup.due.title": "Пора сделать резервную копию",
  "backup.due.never":
    "Копий ещё не было. Архив скачивается одним файлом и восстанавливается в профиле.",
  "backup.due.ago":
    "Последняя копия {date}. Архив скачивается одним файлом и восстанавливается в профиле.",
  "backup.due.later": "Напомнить завтра",

  "backup.err.notJson": "Это не файл архива Уклада",
  "backup.err.format": "Это не файл архива Уклада",
  "backup.err.version": "Архив сделан в более новой версии кабинета",
  "backup.err.empty": "В архиве нет данных склада",
  "backup.err.tooBig": "Файл больше 20 МБ — это не архив Уклада",
  "backup.err.write": "Не удалось записать данные. Освободите место в браузере и повторите",
  "backup.err.tariff": "Копия на почту есть в тарифах «Склад» и «Оператор»",
  "backup.err.noServer": "Отправка на почту заработает после подключения сервера",

  "an.basic.title": "Подробная аналитика — в тарифах «Склад» и «Оператор»",
  "an.basic.body": "Приёмка по дням, заявки по статусам, занятость по этажам и стоимость хранения.",
  "an.basic.cta": "Сменить тариф",
};

export const en: Record<keyof typeof ru, string> = {
  "tariff.title": "Plan",
  "tariff.label": "Plan",
  "tariff.operator": "Operator",
  "tariff.warehouse": "Warehouse",
  "tariff.start": "Start",
  "tariff.hint":
    "There is no billing in the app yet: the plan is chosen here and will come from the contract once connected.",
  "tariff.onlyIn": "Only in “{plan}”",
  "tariff.onlyInMany": "In Warehouse and Operator",

  "manager.label": "Manager",
  "manager.pending": "Assigned when you connect",

  "backup.title": "Backup",
  "backup.archive": "Archive",
  "backup.download": "Download archive",
  "backup.never": "No backups yet",
  "backup.last": "Last: {date}",
  "backup.restore": "Restore",
  "backup.pick": "Choose file",
  "backup.restoreWarn": "Your data will be replaced with the archive from {date}",
  "backup.restoreConfirm": "Replace data",
  "backup.remind": "Remind",
  "backup.remind.0": "Off",
  "backup.remind.7": "7 d",
  "backup.remind.14": "14 d",
  "backup.remind.30": "30 d",
  "backup.email": "Email backup",
  "backup.email.on": "Weekly",
  "backup.email.off": "Off",
  "backup.emailNote": "Will be sent to {email}. Emails start once the server is connected.",
  "backup.done": "Archive downloaded",

  "backup.due.title": "Time to make a backup",
  "backup.due.never":
    "No backups yet. The archive downloads as one file and is restored in your profile.",
  "backup.due.ago":
    "Last backup {date}. The archive downloads as one file and is restored in your profile.",
  "backup.due.later": "Remind me tomorrow",

  "backup.err.notJson": "This is not an Uklad archive",
  "backup.err.format": "This is not an Uklad archive",
  "backup.err.version": "The archive was made in a newer version of the app",
  "backup.err.empty": "The archive has no warehouse data",
  "backup.err.tooBig": "The file is over 20 MB, so it is not an Uklad archive",
  "backup.err.write": "Couldn't save the data. Free up browser storage and try again",
  "backup.err.tariff": "Email backups are in the Warehouse and Operator plans",
  "backup.err.noServer": "Email delivery will work once the server is connected",

  "an.basic.title": "Detailed analytics are in the Warehouse and Operator plans",
  "an.basic.body": "Receiving by day, requests by status, occupancy by floor and storage cost.",
  "an.basic.cta": "Change plan",
};
