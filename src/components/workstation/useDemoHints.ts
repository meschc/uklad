import { useEditor } from "@/lib/store";
import { DEMO_BADGES } from "@/lib/workstation";

/**
 * Показывать ли демо-подсказки стола: бейджи сотрудников на входе, бейджи
 * руководителей на отвязке, коды тары и машин рядом с полем скана. Это вход
 * за любого и работа без сканера одним кликом — поэтому только в демо в
 * браузере. Вошли паролем на сервер — подсказок нет, даже если сборка
 * демонстрационная: за этим столом работают настоящие люди.
 */
export function useDemoHints(): boolean {
  const server = useEditor((s) => s.session.source === "server");
  return DEMO_BADGES && !server;
}
