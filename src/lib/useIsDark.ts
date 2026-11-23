import { useSyncExternalStore } from "react";
import { useEditor } from "@/lib/store";
import { resolveTheme } from "@/lib/theme";

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const q = window.matchMedia("(prefers-color-scheme: dark)");
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
}

/** Тёмная ли сейчас тема: в режиме «Авто» — по системе, и следит за ней. */
export function useIsDark(): boolean {
  const theme = useEditor((s) => s.profile.theme);
  useSyncExternalStore(
    subscribe,
    () => resolveTheme("system"),
    () => "light",
  );
  return resolveTheme(theme) === "dark";
}
