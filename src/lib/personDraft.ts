/**
 * Черновик карточки человека и его перевод в поля сотрудника. Отдельно от
 * формы: экран, который только пересчитывает ставку, не тянет за собой
 * компонент, а горячая замена формы не сбрасывает состояние экранов.
 */

export interface PersonDraft {
  name: string;
  role: string;
  phone: string;
  email: string;
  photoUrl: string;
  /** Ставка за час, ₽, как набрана. Есть только у сотрудника, не у ответственного лица. */
  rate?: string;
}

/**
 * Ставка как её набирают: целая часть не длиннее пяти цифр (до 99 999 ₽ в час,
 * полтора миллиона в час не бывает), тысячи через пробел, копейки через
 * запятую — не больше двух знаков.
 */
export function formatRate(raw: string): string {
  const clean = raw.replace(/\./g, ",").replace(/[^\d,]/g, "");
  const [int = "", ...rest] = clean.split(",");
  const whole = int
    .replace(/^0+(?=\d)/, "")
    .slice(0, 5)
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return rest.length ? `${whole},${rest.join("").slice(0, 2)}` : whole;
}

/**
 * Черновик → поля сотрудника. Ставка приходит строкой из поля ввода: пустая
 * или нулевая — значит «не задана», а не «работает бесплатно».
 */
export function draftToMember({ rate, ...person }: PersonDraft) {
  const n = Number((rate ?? "").replace(/\s/g, "").replace(",", "."));
  return { ...person, hourlyRate: Number.isFinite(n) && n > 0 ? n : undefined };
}
