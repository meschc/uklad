import { useEditor } from "@/lib/store";
import type { ChatTopic } from "@/lib/types";

/**
 * Переход от темы сообщения к её предмету: товар — в таблицу с поиском по
 * нему, заявка и рейс — в «Задания», поставка — на приёмку.
 */
export function useOpenTopic(): (topic: ChatTopic) => void {
  const setSearch = useEditor((s) => s.setSearch);
  const goToEditor = useEditor((s) => s.goToEditor);
  const goToView = useEditor((s) => s.goToView);
  const setMode = useEditor((s) => s.setMode);
  return (topic) => {
    if (topic.kind === "product") {
      if (topic.label) setSearch(topic.label);
      goToEditor();
      setMode("table");
    } else if (topic.kind === "request" || topic.kind === "shipment") goToView("tasks");
    else if (topic.kind === "receiving") goToView("receiving");
  };
}
