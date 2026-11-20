import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import { companyRepository } from "@/lib/data/companyRepository";
import { isValidInn } from "@/lib/company";
import { useT, type MsgKey } from "@/lib/i18n";
import type { PartnerErrors } from "@/lib/validate";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** Реквизиты в черновике карточки: строки, пустое — «не заполнено». */
export type Requisites = {
  inn: string;
  legalName: string;
  kpp: string;
  ogrn: string;
  legalAddress: string;
};

type Note = { key: MsgKey; tone: "muted" | "warning" };

/** Отказ справочника — своими словами: ИНН партнёра ещё не сохранён. */
const LOOKUP_ERRORS: Partial<Record<MsgKey, MsgKey>> = {
  "company.err.network": "partners.inn.err",
  "company.err.notConfigured": "partners.inn.err",
};

/**
 * ИНН продавца и реквизиты из справочника ФНС (DaData через сервер, ключ
 * только там). Ввели все цифры ИНН — реквизиты приходят сами, как в
 * карточке контрагента у МоегоСклада и 1С: склад не перепечатывает их из
 * письма. Своё название (`name`) карточка берёт из справочника, только если
 * оно ещё пустое: «Ромашка» склада важнее «ООО «РОМАШКА ТРЕЙД»» из ЕГРЮЛ.
 */
export function PartnerRequisites({
  value,
  errors,
  onChange,
  onLegalName,
}: {
  value: Requisites;
  errors: PartnerErrors;
  onChange: (next: Requisites) => void;
  /** Справочник нашёл юрназвание — карточка решает, ставить ли его своим. */
  onLegalName: (legalName: string) => void;
}) {
  const t = useT();
  const [note, setNote] = useState<Note | null>(null);
  // Ответ справочника на прежний ИНН, пришедший после правки, — не о нём.
  const asked = useRef(value.inn);
  const set = (patch: Partial<Requisites>) => onChange({ ...value, ...patch });
  const err = (f: keyof PartnerErrors) => (errors[f] ? t(errors[f]) : undefined);

  const lookup = (inn: string) => {
    asked.current = inn;
    setNote({ key: "profile.innFetching", tone: "muted" });
    void companyRepository.lookup(inn).then((res) => {
      if (asked.current !== inn) return;
      if (!res.ok) {
        return setNote({ key: LOOKUP_ERRORS[res.error] ?? res.error, tone: "warning" });
      }
      const info = res.data;
      if (!info) return setNote({ key: "profile.innNotFound", tone: "warning" });
      onChange({
        inn,
        legalName: info.name,
        kpp: info.kpp ?? "",
        ogrn: info.ogrn ?? "",
        // Адрес заготовки демо — подсказка, а не адрес: в поле его не кладём.
        legalAddress: info.mock ? value.legalAddress : (info.legalAddress ?? ""),
      });
      onLegalName(info.name);
      setNote(
        info.mock
          ? { key: "profile.innMock", tone: "muted" }
          : info.status && info.status !== "ACTIVE"
            ? { key: "partners.inn.inactive", tone: "warning" }
            : { key: "profile.innFetched", tone: "muted" },
      );
    });
  };

  const onInn = (raw: string) => {
    const inn = raw.replace(/\D/g, "").slice(0, 12);
    set({ inn });
    // 10 цифр — ещё и начало ИНН ИП: справочник спрашиваем, только когда
    // контрольная сумма сошлась.
    if (isValidInn(inn) && inn !== asked.current) lookup(inn);
    if (!inn) {
      asked.current = "";
      setNote(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <FileText className="size-4 text-muted-foreground" />
        {t("partners.requisites")}
      </h3>
      <Field label={t("profile.inn")} error={err("inn")} hint={t("partners.inn.hint")}>
        <Input
          value={value.inn}
          inputMode="numeric"
          maxLength={12}
          onChange={(e) => onInn(e.target.value)}
        />
      </Field>
      {note && (
        <p
          role="status"
          className={
            note.tone === "warning" ? "text-xs text-warning" : "text-xs text-muted-foreground"
          }
        >
          {t(note.key)}
        </p>
      )}
      <Field label={t("partners.legalName")}>
        <Input
          value={value.legalName}
          maxLength={300}
          onChange={(e) => set({ legalName: e.target.value })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("profile.kpp")} error={err("kpp")}>
          <Input
            value={value.kpp}
            maxLength={9}
            onChange={(e) => set({ kpp: e.target.value.toUpperCase() })}
          />
        </Field>
        <Field label={t("profile.ogrn")} error={err("ogrn")}>
          <Input
            value={value.ogrn}
            inputMode="numeric"
            maxLength={15}
            onChange={(e) => set({ ogrn: e.target.value.replace(/\D/g, "") })}
          />
        </Field>
      </div>
      <Field label={t("profile.legalAddress")}>
        <Input
          value={value.legalAddress}
          maxLength={500}
          onChange={(e) => set({ legalAddress: e.target.value })}
        />
      </Field>
    </div>
  );
}
