import { useSyncExternalStore } from "react";

/**
 * Состояние связи стола: есть, слабая, нет.
 *
 * Склад — это ангар со стеллажами, и Wi-Fi там пропадает чаще, чем в офисе.
 * Операции стола и так копятся в очереди (`opQueue`) и уходят при связи, но
 * человек должен знать, что сейчас он работает «в долг», а не гадать, почему
 * экран не грузится. «Слабая» — по оценке браузера (`navigator.connection`,
 * есть в Chrome и на Android-ТСД); где её нет, различаем только «есть/нет».
 */
export type NetworkState = "ok" | "weak" | "offline";

interface ConnectionInfo extends EventTarget {
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
}

const connection = (): ConnectionInfo | undefined =>
  typeof navigator === "undefined"
    ? undefined
    : (navigator as Navigator & { connection?: ConnectionInfo }).connection;

/** Чистое правило: по данным браузера — какая связь. */
export function networkState(
  online: boolean,
  c?: Pick<ConnectionInfo, "effectiveType" | "rtt" | "downlink">,
): NetworkState {
  if (!online) return "offline";
  if (!c) return "ok";
  if (c.effectiveType === "slow-2g" || c.effectiveType === "2g") return "weak";
  // rtt и downlink браузер округляет; 0 значит «не знаю», а не «мгновенно».
  if ((c.rtt ?? 0) >= 1200) return "weak";
  if (c.downlink != null && c.downlink > 0 && c.downlink < 0.25) return "weak";
  return "ok";
}

function read(): NetworkState {
  return networkState(navigator.onLine, connection());
}

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  const c = connection();
  c?.addEventListener("change", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
    c?.removeEventListener("change", cb);
  };
}

export function useNetwork(): NetworkState {
  return useSyncExternalStore(subscribe, read, () => "ok");
}
