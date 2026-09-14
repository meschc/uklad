import { useMemo, useRef, useState } from "react";
import { Activity, Check, Download, Plus, Upload, UserRound, Users } from "lucide-react";
import { selectRole, useEditor } from "@/lib/store";
import { staffRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { formatPhone, telHref } from "@/lib/phone";
import { staffWorkload } from "@/lib/fulfillment";
import { csvToStaff, staffToCsv } from "@/lib/staffIO";
import { BOM } from "@/lib/utils";
import type { StaffMember } from "@/lib/types";
import { useT, type TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScreenShell, EmptyState } from "@/components/fulfillment/ScreenShell";
import { eyebrow } from "@/components/ui/eyebrow";
import { card } from "@/components/ui/card";
import { PartnersSection } from "./PartnersSection";
import { PersonForm, type PersonDraft } from "./PersonForm";
import { StaffRow } from "./StaffRow";

/**
 * Склад и персонал (п.6, 24, 25): контакты склада, ответственное лицо отдельной
 * карточкой и список сотрудников с правкой на месте, фото, маской телефона и
 * импортом/экспортом CSV.
 */

/** Кликабельный контакт: тот же вид, что у ссылок витрины. */
const contactLink = "text-primary underline-offset-4 hover:underline";

const EMPTY_DRAFT: PersonDraft = {
  name: "",
  role: "",
  phone: "",
  email: "",
  photoUrl: "",
};

export function StaffScreen() {
  const warehouse = useEditor((s) => s.warehouse);
  const showToast = useEditor((s) => s.showToast);
  const updateWarehouseContacts = useEditor((s) => s.updateWarehouseContacts);
  const updateManager = useEditor((s) => s.updateManager);
  // Продавцу список персонала виден, но не редактируется (п.27).
  const readOnly = useEditor((s) => selectRole(s) === "seller");
  const t = useT();

  const staff = warehouse.staff ?? [];
  // Нагрузка считается из фактов приёмки и отгрузки (см. fulfillment.ts).
  const events = useEditor((s) => s.receivingEvents);
  const trips = useEditor((s) => s.shipments);
  const workload = useMemo(() => staffWorkload(events, trips), [events, trips]);
  const [draft, setDraft] = useState<PersonDraft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [contacts, setContacts] = useState({
    phone: warehouse.phone ?? "",
    email: warehouse.email ?? "",
    contactPerson: warehouse.contactPerson ?? "",
  });
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Кнопка активна только когда есть что сохранять: вечно активная «Сохранить»
  // читалась как «данные всё время меняются» (п.24).
  const dirty =
    contacts.phone !== (warehouse.phone ?? "") || contacts.email !== (warehouse.email ?? "");

  const saveContacts = () => {
    updateWarehouseContacts(warehouse.id, contacts);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  // Персонал правится через репозиторий (п.3.2.1). Заведение и загрузка из
  // файла — команды экрана; правка и удаление строки принадлежат самой строке.
  const create = useCommand((member: Omit<StaffMember, "id">) => staffRepository.create(member));
  const load = useCommand((members: Omit<StaffMember, "id">[]) =>
    staffRepository.importMany(members),
  );

  /**
   * Черновик и отказ по нему живут и гаснут вместе. Иначе сбой связи переживёт
   * закрытие формы, и на пустой, только что открытой карточке кнопка встретит
   * человека надписью «Повторить» — повторить неизвестно что.
   */
  const setDraftTo = (next: PersonDraft | null) => {
    create.reset();
    setDraft(next);
  };

  const submitDraft = async () => {
    if (!draft?.name.trim()) return;
    const res = await create.run(draft);
    if (res.ok) setDraft(null);
  };

  const exportStaff = () => {
    // BOM в начале — иначе Excel читает кириллицу как кракозябры (см. utils).
    const blob = new Blob([`${BOM}${staffToCsv(staff)}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staff-${warehouse.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importStaff = async (file: File) => {
    // Разбор — дело чистой функции, и пустой файл до репозитория не доходит:
    // отправлять «загрузите ноль человек» бессмысленно даже локально.
    const parsed = csvToStaff(await file.text());
    if (!parsed.length) {
      showToast("staff.importEmpty");
      return;
    }
    const res = await load.run(parsed);
    if (res.ok) showToast("staff.imported", { n: parsed.length });
    else showToast(res.error);
  };

  if (readOnly) {
    return (
      <ScreenShell
        title={t("staff.title")}
        subtitle={t("staff.subtitle", { name: warehouse.name })}
        wide
      >
        <ReadOnlyContacts warehouse={warehouse} t={t} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      // Ключ по складу: контакты лежат в собственном состоянии экрана и сами
      // не пересоздаются — при переходе на другой склад в полях оставались
      // телефон и почта предыдущего.
      key={warehouse.id}
      title={t("staff.title")}
      subtitle={t("staff.subtitle", { name: warehouse.name })}
      wide
    >
      {/* Нагрузка: кто сколько сделал. Начальнику это нужно для распределения
          работы, сотруднику — чтобы видеть свой вклад. Считаем по фактам
          приёмки и отгрузки; сборка персонально не подписывается. */}
      {staff.length > 0 && (
        <section className={card({ className: "flex flex-col gap-2" })}>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Activity className="size-3.5 text-muted-foreground" />
            {t("staff.workloadTitle")}
          </h2>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">{t("staff.wlName")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("staff.wlReceipts")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("staff.wlUnits")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("staff.wlTrips")}</th>
                  <th className="px-3 py-2 font-medium">{t("staff.wlLast")}</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((m) => {
                  const w = workload.get(m.id);
                  return (
                    <tr key={m.id} className="border-t border-border/60">
                      <td className="px-3 py-1.5">{m.name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{w?.receipts ?? 0}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{w?.units ?? 0}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{w?.trips ?? 0}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {w?.lastAt ? new Date(w.lastAt).toLocaleDateString() : t("staff.wlNever")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Контакты склада — телефон и почта самого объекта, без людей */}
      <section className={card({ className: "flex flex-col gap-3" })}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{t("staff.contacts")}</h2>
          <Button
            size="sm"
            variant={saved ? "outline" : "default"}
            disabled={!dirty && !saved}
            onClick={saveContacts}
          >
            {saved ? <Check className="size-3.5" /> : null}
            {t(saved ? "staff.contactsSaved" : "common.save")}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labeled label={t("staff.phone")}>
            <Input
              value={contacts.phone}
              onChange={(e) => setContacts((c) => ({ ...c, phone: formatPhone(e.target.value) }))}
              placeholder="+7 495 000-00-00"
              inputMode="tel"
              className="h-9"
            />
          </Labeled>
          <Labeled label={t("staff.email")}>
            <Input
              type="email"
              value={contacts.email}
              onChange={(e) => setContacts((c) => ({ ...c, email: e.target.value }))}
              placeholder="sklad@example.com"
              className="h-9"
            />
          </Labeled>
        </div>
      </section>

      {/* Ответственное лицо — тот же шаблон, что и у сотрудника (п.24) */}
      <section className={card({ className: "flex flex-col gap-3" })}>
        <h2 className="text-sm font-semibold">{t("staff.manager")}</h2>
        <PersonForm
          value={{
            name: warehouse.manager?.name ?? warehouse.contactPerson ?? "",
            role: warehouse.manager?.role ?? "",
            phone: warehouse.manager?.phone ?? "",
            email: warehouse.manager?.email ?? "",
            photoUrl: warehouse.manager?.photoUrl ?? "",
          }}
          onChange={(patch) => updateManager(patch)}
          t={t}
        />
      </section>

      <PartnersSection />

      {/* Список сотрудников */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            {t("staff.people")} · {staff.length}
          </h2>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={staff.length === 0} onClick={exportStaff}>
              <Download className="size-3.5" />
              {t("staff.export")}
            </Button>
            {/* Формы у загрузки нет, терять нечего — отказ тостом, а кнопка на
                время команды занята: второй тот же файл завёл бы список дважды. */}
            <Button
              size="sm"
              variant="outline"
              disabled={load.pending}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-3.5" />
              {load.pending ? t("data.busy") : t("staff.import")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importStaff(file);
                e.target.value = "";
              }}
            />
            {!draft && (
              <Button size="sm" onClick={() => setDraftTo({ ...EMPTY_DRAFT })}>
                <Plus className="size-3.5" />
                {t("staff.add")}
              </Button>
            )}
          </div>
        </div>

        {draft && (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3.5">
            <PersonForm value={draft} onChange={(p) => setDraft({ ...draft, ...p })} t={t} />
            <div className="flex items-center gap-2">
              {/* Форма есть — при отказе она остаётся открытой с набранным, а
                  кнопка становится повтором (п.3.2.2). */}
              <Button
                size="sm"
                disabled={!draft.name.trim() || create.pending}
                onClick={submitDraft}
              >
                {create.pending ? t("data.busy") : create.error ? t("data.retry") : t("staff.save")}
              </Button>
              {/* Отмену не блокируем: если запрос повис, выход не должен быть
                  заперт вместе с ним. */}
              <Button size="sm" variant="ghost" onClick={() => setDraftTo(null)}>
                {t("common.cancel")}
              </Button>
            </div>
            {create.error && (
              <p role="alert" className="text-xs text-destructive">
                {t(create.error)}
              </p>
            )}
          </div>
        )}

        {staff.length === 0 && !draft ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title={t("staff.emptyTitle")}
            body={t("staff.emptyBody")}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">{t("staff.col.name")}</th>
                  <th className="px-3 py-2 font-medium">{t("staff.col.role")}</th>
                  <th className="px-3 py-2 font-medium">{t("staff.col.contacts")}</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {staff.map((m) => (
                  <StaffRow
                    key={m.id}
                    member={m}
                    editing={editing === m.id}
                    onEdit={() => setEditing(m.id)}
                    onDone={() => setEditing(null)}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </ScreenShell>
  );
}

/** Контакты склада и люди — карточками, без единого поля ввода (п.27). */
function ReadOnlyContacts({
  warehouse,
  t,
}: {
  warehouse: { phone?: string; email?: string; manager?: StaffMember; staff?: StaffMember[] };
  t: TFunc;
}) {
  const people = warehouse.staff ?? [];
  return (
    <>
      <section className={card({ className: "flex flex-wrap gap-6 text-sm" })}>
        <div>
          <p className={eyebrow({ weight: "normal" })}>{t("staff.phone")}</p>
          {/* Продавец смотрит эту карточку, чтобы связаться с подрядчиком, —
              значит с телефона по контакту нужно попадать в звонок и в письмо,
              а не выделять номер вручную. */}
          <p className="mt-0.5">
            {warehouse.phone ? (
              <a href={telHref(warehouse.phone)} className={contactLink}>
                {warehouse.phone}
              </a>
            ) : (
              "—"
            )}
          </p>
        </div>
        <div>
          <p className={eyebrow({ weight: "normal" })}>{t("staff.email")}</p>
          <p className="mt-0.5">
            {warehouse.email ? (
              <a href={`mailto:${warehouse.email}`} className={contactLink}>
                {warehouse.email}
              </a>
            ) : (
              "—"
            )}
          </p>
        </div>
        {warehouse.manager?.name && (
          <div>
            <p className={eyebrow({ weight: "normal" })}>{t("staff.manager")}</p>
            <p className="mt-0.5">
              {warehouse.manager.name}
              {warehouse.manager.phone ? ` · ${warehouse.manager.phone}` : ""}
            </p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">
          {t("staff.people")} · {people.length}
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {people.map((m) => (
            <div key={m.id} className={card({ pad: "sm", className: "flex items-center gap-3" })}>
              {m.photoUrl ? (
                <img
                  src={m.photoUrl}
                  alt=""
                  className="size-9 rounded-full border border-border object-cover"
                />
              ) : (
                <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserRound className="size-4" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[m.role, m.phone, m.email].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={eyebrow()}>{label}</span>
      {children}
    </label>
  );
}
