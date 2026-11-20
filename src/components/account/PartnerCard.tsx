import { useState } from "react";
import { Package, Store, Trash2, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useWarehouseProducts } from "@/lib/warehouseProducts";
import { formatPhone, PHONE_MAX_LENGTH } from "@/lib/phone";
import { useT } from "@/lib/i18n";
import type { Partner } from "@/lib/types";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmailInput } from "./EmailInput";
import { Field } from "@/components/ui/field";
import { checkPartner } from "@/lib/validate";
import { PartnerInvite } from "./PartnerInvite";
import { PartnerRequisites, type Requisites } from "./PartnerRequisites";

/** Сколько товаров партнёра показать в карточке: дальше — таблица товаров. */
const GOODS_SHOWN = 8;

type Draft = Requisites & { name: string; contact: string; person: string; phone: string };

const draftOf = (p: Partner | undefined): Draft => ({
  name: p?.name ?? "",
  contact: p?.contact ?? "",
  person: p?.person ?? "",
  phone: p?.phone ?? "",
  inn: p?.inn ?? "",
  legalName: p?.legalName ?? "",
  kpp: p?.kpp ?? "",
  ogrn: p?.ogrn ?? "",
  legalAddress: p?.legalAddress ?? "",
});

/**
 * Подробная карточка партнёра (Кирилл 12 ноя: «подробные карточки на каждого
 * партнёра должны быть»). Список партнёров стал строками для чтения, а правка —
 * здесь, со «Сохранить» и «Отмена»: раньше поля в строке писали в стор на
 * каждую букву, и отменить опечатку было нельзя.
 *
 * Без `partner` — новый партнёр (Кирилл 18.11): та же панель открывается и из
 * списка партнёров, и из подключения площадки, без ухода со страницы. После
 * «Добавить» панель становится карточкой этого партнёра — в ней сразу можно
 * позвать продавца в кабинет и видно, принял ли он приглашение.
 *
 * Контактное лицо стоит рядом с телефоном — это одна мысль «кому звонить».
 */
export function PartnerCard({
  partner,
  onClose,
  onCreated,
}: {
  partner?: Partner;
  onClose: () => void;
  /** Партнёр добавлен: подключение площадки сразу выбирает его. */
  onCreated?: (id: string) => void;
}) {
  const t = useT();
  const addPartner = useEditor((s) => s.addPartner);
  const updatePartner = useEditor((s) => s.updatePartner);
  const removePartner = useEditor((s) => s.removePartner);
  const restorePartner = useEditor((s) => s.restorePartner);
  const notify = useEditor((s) => s.notify);
  const [id, setId] = useState(partner?.id ?? null);
  const current = useEditor((s) => (s.warehouse.partners ?? []).find((p) => p.id === id));
  const goods = useWarehouseProducts().filter((x) => id && x.partnerId === id);
  const [draft, setDraft] = useState(() => draftOf(partner));
  const [tried, setTried] = useState(false);
  const errors = checkPartner(draft);
  const invalid = Object.keys(errors).length > 0;
  // Новая карточка не краснеет с первой буквы — только после «Добавить».
  const errOf = (f: keyof typeof errors) =>
    (current || tried) && errors[f] ? t(errors[f]) : undefined;
  const shown = current || tried ? errors : {};
  const base = draftOf(current);
  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== base[k]);

  const save = () => {
    setTried(true);
    if (invalid) return;
    const name = draft.name.trim();
    if (current) {
      updatePartner(current.id, draft);
      notify("success", "partners.saved", { vars: { name } });
      onClose();
      return;
    }
    const created = addPartner(draft);
    notify("success", "partners.added", { vars: { name } });
    setDraft(draftOf({ ...draft, id: created, name }));
    setId(created);
    onCreated?.(created);
  };

  return (
    <DialogShell size="md" scroll onClose={onClose}>
      <DialogHeader>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Store className="size-4 text-muted-foreground" />
          {current?.name ?? t("partners.new")}
        </h2>
        <Button variant="ghost" size="icon-sm" aria-label={t("support.close")} onClick={onClose}>
          <X className="size-4" />
        </Button>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
        <Field
          label={t("partners.ownName")}
          error={errOf("name")}
          hint={t("partners.ownName.hint")}
        >
          <Input
            value={draft.name}
            maxLength={120}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <PartnerRequisites
          value={draft}
          errors={shown}
          onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
          onLegalName={(legalName) =>
            setDraft((d) => (d.name.trim() ? d : { ...d, name: legalName }))
          }
        />
        <Field label={t("partners.contactPlaceholder")} error={errOf("contact")}>
          <EmailInput
            value={draft.contact}
            onValueChange={(contact) => setDraft({ ...draft, contact })}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("partners.personPlaceholder")} error={errOf("person")}>
            <Input
              value={draft.person}
              maxLength={120}
              onChange={(e) => setDraft({ ...draft, person: e.target.value })}
            />
          </Field>
          <Field label={t("partners.phone")} error={errOf("phone")}>
            <Input
              value={draft.phone}
              inputMode="tel"
              maxLength={PHONE_MAX_LENGTH}
              placeholder="+7 900 000-00-00"
              onChange={(e) => setDraft({ ...draft, phone: formatPhone(e.target.value) })}
            />
          </Field>
        </div>

        {current && (
          <>
            <PartnerGoods partner={current} goods={goods} onClose={onClose} />
            <PartnerInvite partner={current} />
          </>
        )}
      </div>
      <DialogFooter spread={!!current}>
        {current && (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              // Класс `undoable`: убираем сразу, вернуть можно из тоста.
              const index = (useEditor.getState().warehouse.partners ?? []).findIndex(
                (p) => p.id === current.id,
              );
              removePartner(current.id);
              notify("success", "partners.removed", {
                vars: { name: current.name },
                undo: () => restorePartner(current, Math.max(0, index)),
              });
              onClose();
            }}
          >
            <Trash2 className="size-4" />
            {t("partners.remove")}
          </Button>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {current ? (
            <Button onClick={save} disabled={!dirty || invalid}>
              {t("common.save")}
            </Button>
          ) : (
            <Button onClick={save} disabled={tried && invalid}>
              {t("partners.create")}
            </Button>
          )}
        </div>
      </DialogFooter>
    </DialogShell>
  );
}

/** Товары партнёра: первые несколько, остальные — ссылкой в таблицу. */
function PartnerGoods({
  partner,
  goods,
  onClose,
}: {
  partner: Partner;
  goods: { id: string; name: string; sku: string }[];
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Package className="size-4 text-muted-foreground" />
        {t("partners.goods", { n: goods.length })}
      </h3>
      {goods.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("partners.noGoods")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 text-sm">
          {goods.slice(0, GOODS_SHOWN).map((g) => (
            <li key={g.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate">{g.name}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{g.sku}</span>
            </li>
          ))}
          {goods.length > GOODS_SHOWN && (
            <li className="py-1.5 text-xs">
              {/* Ссылка, а не подпись (Кирилл 13.11): таблица товаров
                  сразу с фильтром по этому партнёру. */}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => {
                  const s = useEditor.getState();
                  s.setSearch("");
                  s.setTablePartner(partner.id);
                  s.goToEditor();
                  s.setMode("table");
                  onClose();
                }}
              >
                {t("partners.moreGoods", { n: goods.length - GOODS_SHOWN })}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
