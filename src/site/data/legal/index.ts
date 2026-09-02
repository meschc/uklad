import { CONSENT } from "./consent";
import { COOKIES } from "./cookies";
import { OFFER } from "./offer";
import { PRIVACY } from "./privacy";
import { RECOMMENDATIONS } from "./recommendations";
import { REQUISITES } from "./requisites";
import { TERMS } from "./terms";
import type { LegalDoc } from "./types";

/**
 * Реестр правовых документов. Порядок — как их читают: сначала «кто вы такие»,
 * потом «на каких условиях», потом «что с моими данными».
 */
export const LEGAL_DOCS: LegalDoc[] = [
  REQUISITES,
  TERMS,
  OFFER,
  PRIVACY,
  CONSENT,
  COOKIES,
  RECOMMENDATIONS,
];

export const LEGAL_BY_SLUG: Record<string, LegalDoc> = Object.fromEntries(
  LEGAL_DOCS.map((d) => [d.slug, d]),
);

export type { LegalDoc } from "./types";
