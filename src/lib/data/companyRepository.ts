import { apiRequest, hasCabinetServer } from "./api";
import { attempt, fail, ok, type Result } from "./result";
import { lookupCompany, type CompanyInfo } from "../company";

/** Реквизиты из справочника: что показывает профиль. */
export type CompanyDetails = Omit<CompanyInfo, "mock"> & { mock: boolean; status?: string };

/**
 * Реквизиты компании по ИНН.
 *
 * В сборке с сервером — справочник ФНС через `server/api` (`POST
 * /company/lookup`, ключ DaData живёт только на сервере). Демо без сервера
 * отвечает заготовкой `lookupCompany` с пометкой `mock`.
 * `null` — справочник такого ИНН не знает.
 */
export const companyRepository = {
  lookup: async (inn: string): Promise<Result<CompanyDetails | null>> => {
    if (!hasCabinetServer) return ok(lookupCompany(inn));
    const res = await attempt(
      () => apiRequest("POST", "/company/lookup", { inn }),
      "company.err.network",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 503) return fail("company.err.notConfigured");
    if (status === 429) return fail("company.err.tooOften");
    if (status !== 200) return fail("company.err.network");
    const c = body.company as Partial<CompanyDetails> | null | undefined;
    if (!c || typeof c.name !== "string") return ok(null);
    return ok({
      inn: typeof c.inn === "string" ? c.inn : inn,
      name: c.name,
      kpp: c.kpp,
      ogrn: c.ogrn,
      legalAddress: c.legalAddress,
      status: c.status,
      mock: false,
    });
  },

  /**
   * Название компании на сервере (`POST /company/name`, право `org.manage`).
   * Его видят письма-приглашения и список компаний при входе; снимок кабинета
   * хранит своё поле, но для людей вне кабинета правда — здесь. Демо без
   * сервера ничего не отправляет.
   */
  rename: async (name: string): Promise<Result<string>> => {
    if (!hasCabinetServer) return ok(name);
    const res = await attempt(
      () => apiRequest("POST", "/company/name", { name }),
      "company.name.err.network",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 403) return fail("company.name.err.forbidden");
    if (status === 400) return fail("company.name.err.bad");
    if (status !== 200) return fail("company.name.err.network");
    return ok(typeof body.name === "string" ? body.name : name);
  },
};
