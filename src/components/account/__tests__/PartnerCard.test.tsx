// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ok } from "@/lib/data/result";
import { useEditor } from "@/lib/store";

/**
 * Новый партнёр из панели (из списка партнёров и из подключения площадки):
 * ИНН тянет реквизиты, своё название не затирается юрназванием, партнёр
 * сохраняется сразу — без приглашения — и подключение получает его id.
 */
const repo = vi.hoisted(() => ({ lookup: vi.fn(), rename: vi.fn() }));
vi.mock("@/lib/data/companyRepository", () => ({ companyRepository: repo }));

const { PartnerCard } = await import("../PartnerCard");

const ROMASHKA = {
  inn: "7728451361",
  name: "ООО «РОМАШКА ТРЕЙД»",
  kpp: "772801001",
  ogrn: "1177746183922",
  legalAddress: "г. Москва",
  status: "ACTIVE",
  mock: false,
};

const partners = () => useEditor.getState().warehouse.partners ?? [];
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
  repo.lookup.mockReset();
  useEditor.setState((s) => ({ warehouse: { ...s.warehouse, partners: [] } }));
});

describe("Новый партнёр", () => {
  test("по ИНН: реквизиты и название приходят сами, партнёр выбран", async () => {
    repo.lookup.mockResolvedValue(ok(ROMASHKA));
    const onCreated = vi.fn();
    render(<PartnerCard onClose={() => {}} onCreated={onCreated} />);
    await userEvent.type(field("ИНН"), "7728451361");
    expect(repo.lookup).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Реквизиты получены из ФНС по ИНН.")).toBeTruthy();
    expect(field("Название в Укладе").value).toBe("ООО «РОМАШКА ТРЕЙД»");
    expect(field("КПП").value).toBe("772801001");

    await userEvent.click(screen.getByRole("button", { name: "Добавить" }));
    const [p] = partners();
    expect(p).toMatchObject({ inn: "7728451361", legalName: ROMASHKA.name, kpp: "772801001" });
    expect(p.contact).toBeUndefined();
    expect(onCreated).toHaveBeenCalledWith(p.id);
    // Панель стала карточкой партнёра — дальше в ней зовут продавца.
    expect(screen.getByRole("heading", { name: ROMASHKA.name })).toBeTruthy();
  });

  test("своё название остаётся своим, юрназвание — отдельно", async () => {
    repo.lookup.mockResolvedValue(ok(ROMASHKA));
    render(<PartnerCard onClose={() => {}} />);
    await userEvent.type(field("Название в Укладе"), "Ромашка");
    await userEvent.type(field("ИНН"), "7728451361");
    await screen.findByText("Реквизиты получены из ФНС по ИНН.");
    expect(field("Название в Укладе").value).toBe("Ромашка");
    expect(field("Юридическое название").value).toBe(ROMASHKA.name);
    await userEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(partners()[0]).toMatchObject({ name: "Ромашка", legalName: ROMASHKA.name });
  });

  test("недействующая компания — предупреждение", async () => {
    repo.lookup.mockResolvedValue(ok({ ...ROMASHKA, status: "LIQUIDATED" }));
    render(<PartnerCard onClose={() => {}} />);
    await userEvent.type(field("ИНН"), "7728451361");
    expect(await screen.findByText(/компания не действует/)).toBeTruthy();
  });

  test("ИНН с неверной контрольной суммой: справочник не спрашиваем, не сохраняем", async () => {
    render(<PartnerCard onClose={() => {}} />);
    await userEvent.type(field("Название в Укладе"), "Вася");
    await userEvent.type(field("ИНН"), "7728451362");
    expect(repo.lookup).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(partners()).toHaveLength(0);
    expect(screen.getByText(/контрольная сумма не сошлась/)).toBeTruthy();
  });

  test("без ИНН и почты — тоже можно, нужно только название", async () => {
    render(<PartnerCard onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(partners()).toHaveLength(0);
    await userEvent.type(field("Название в Укладе"), "Вася с WB");
    await userEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(partners()[0]).toMatchObject({ name: "Вася с WB" });
    expect(partners()[0].inn).toBeUndefined();
  });
});
