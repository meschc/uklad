/**
 * Звук подтверждения скана. Упаковщик смотрит на товар, а не на экран, поэтому
 * результат должен быть слышен: короткий высокий — принято, двойной низкий —
 * ошибка. Звук — дополнение к цвету, а не замена: на складе шумно, и без
 * пользовательского жеста браузер может его не пустить — тогда молчим.
 */
export type BeepTone = "ok" | "error";

let ctx: AudioContext | undefined;

export function beep(tone: BeepTone): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    const c = ctx;
    // Две ноты для ошибки, одна для успеха.
    const notes =
      tone === "ok"
        ? [{ f: 1040, at: 0, len: 0.09 }]
        : [
            { f: 330, at: 0, len: 0.14 },
            { f: 330, at: 0.2, len: 0.14 },
          ];
    for (const n of notes) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "square";
      osc.frequency.value = n.f;
      gain.gain.value = 0.06;
      osc.connect(gain).connect(c.destination);
      osc.start(c.currentTime + n.at);
      osc.stop(c.currentTime + n.at + n.len);
    }
  } catch {
    // Нет звука — остаётся цвет.
  }
}
