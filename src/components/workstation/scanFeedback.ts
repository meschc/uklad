export type FlashKind = "ok" | "error";
export type Flash = { kind: FlashKind; n: number } | null;

/** Короткий сигнал: высокий — принято, низкий двойной — ошибка. */
export function beep(kind: FlashKind): void {
  try {
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tones = kind === "ok" ? [880] : [220, 180];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = kind === "ok" ? "sine" : "square";
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      const at = ctx.currentTime + i * 0.18;
      osc.start(at);
      osc.stop(at + 0.15);
    });
    window.setTimeout(() => void ctx.close(), 600);
  } catch {
    // Нет звука — остаётся вспышка: она и так главный сигнал.
  }
}
