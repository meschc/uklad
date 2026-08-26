import { useMemo, useRef, useState } from "react";
import {
  Activity,
  AtSign,
  Check,
  Download,
  Phone,
  Plus,
  Trash2,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import { selectRole, useEditor } from "@/lib/store";
import { formatPhone } from "@/lib/phone";
import { staffWorkload } from "@/lib/fulfillment";
import { csvToStaff, staffToCsv } from "@/lib/staffIO";
import type { StaffMember } from "@/lib/types";
import { useT, type TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScreenShell, EmptyState } from "@/components/fulfillment/ScreenShell";
import { PartnersSection } from "./PartnersSection";
import { PersonForm, type PersonDraft } from "./PersonForm";

/**
 * Склад и персонал (п.6, 24, 25): контакты склада, ответственное лицо отдельной
 * карточкой и список сотрудников с правкой на месте, фото, маской телефона и
 * импортом/экспортом CSV.
 */

const EMPTY_DRAFT: PersonDraft = {
  name: "",
  role: "",
  phone: "",
  email: "",
  photoUrl: "",
};

export function StaffScreen() {
  const warehouse = useEditor((s) => s.warehouse);
  const addStaffMember = useEditor((s) => s.addStaffMember);
  const updateStaffMember = useEditor((s) => s.updateStaffMember);
  const removeStaffMember = useEditor((s) => s.removeStaffMember);
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
    contacts.phone !== (warehouse.phone ?? "") ||
    contacts.email !== (warehouse.email ?? "");

  const saveContacts = () => {
    updateWarehouseContacts(warehouse.id, contacts);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  const submitDraft = () => {
    if (!draft?.name.trim()) return;
    addStaffMember(draft);
    setDraft(null);
  };

  const exportStaff = () => {
    const blob = new Blob([`﻿${staffToCsv(staff)}`], {
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
    const parsed = csvToStaff(await file.text());
    for (const member of parsed) addStaffMember(member);
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
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Activity className="size-3.5 text-muted-foreground" />
            {t("staff.workloadTitle")}
          </h2>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">{t("staff.wlName")}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t("staff.wlReceipts")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t("staff.wlUnits")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t("staff.wlTrips")}
                  </th>
                  <th className="px-3 py-2 font-medium">{t("staff.wlLast")}</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((m) => {
                  const w = workload.get(m.id);
                  return (
                    <tr key={m.id} className="border-t border-border/60">
                      <td className="px-3 py-1.5">{m.name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {w?.receipts ?? 0}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {w?.units ?? 0}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {w?.trips ?? 0}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {w?.lastAt
                          ? new Date(w.lastAt).toLocaleDateString()
                          : t("staff.wlNever")}
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
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
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
              onChange={(e) =>
                setContacts((c) => ({ ...c, phone: formatPhone(e.target.value) }))
              }
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
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
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
            <Button
              size="sm"
              variant="outline"
              disabled={staff.length === 0}
              onClick={exportStaff}
            >
              <Download className="size-3.5" />
              {t("staff.export")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-3.5" />
              {t("staff.import")}
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
              <Button size="sm" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
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
              <Button size="sm" disabled={!draft.name.trim()} onClick={submitDraft}>
                {t("staff.save")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                {t("common.cancel")}
              </Button>
            </div>
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
                    onDone={(patch) => {
                      updateStaffMember(m.id, patch);
                      setEditing(null);
                    }}
                    onRemove={() => removeStaffMember(m.id)}
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
      <section className="flex flex-wrap gap-6 rounded-xl border border-border bg-card p-4 text-sm">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("staff.phone")}
          </p>
          <p className="mt-0.5">{warehouse.phone || "—"}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("staff.email")}
          </p>
          <p className="mt-0.5">{warehouse.email || "—"}</p>
        </div>
        {warehouse.manager?.name && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("staff.manager")}
            </p>
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
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
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

function StaffRow({
  member: m,
  editing,
  onEdit,
  onDone,
  onRemove,
  t,
}: {
  member: StaffMember;
  editing: boolean;
  onEdit: () => void;
  onDone: (patch: Partial<Omit<StaffMember, "id">>) => void;
  onRemove: () => void;
  t: TFunc;
}) {
  const [form, setForm] = useState<PersonDraft>({
    name: m.name,
    role: m.role,
    phone: m.phone ?? "",
    email: m.email ?? "",
    photoUrl: m.photoUrl ?? "",
  });

  if (editing) {
    return (
      <tr className="border-t border-border/60 bg-accent/40">
        <td className="px-3 py-2" colSpan={3}>
          <PersonForm
            value={form}
            onChange={(patch) => setForm({ ...form, ...patch })}
            t={t}
          />
        </td>
        <td className="px-3 py-2 align-top">
          <Button size="icon-sm" variant="ghost" onClick={() => onDone(form)}>
            <Check className="size-4" />
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group border-t border-border/60">
      <td className="px-3 py-2">
        <button onClick={onEdit} className="flex items-center gap-2 text-left">
          {m.photoUrl ? (
            <img
              src={m.photoUrl}
              alt=""
              className="size-7 rounded-full border border-border object-cover"
            />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserRound className="size-3.5" />
            </span>
          )}
          <span className="font-medium">{m.name}</span>
        </button>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{m.role || "—"}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {m.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="size-3" />
              {m.phone}
            </span>
          )}
          {m.email && (
            <span className="inline-flex items-center gap-1">
              <AtSign className="size-3" />
              {m.email}
            </span>
          )}
          {!m.phone && !m.email && "—"}
        </div>
      </td>
      <td className="px-3 py-2">
        <button
          onClick={onRemove}
          title={t("staff.remove")}
          aria-label={t("staff.remove")}
          className="flex size-7 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </td>
    </tr>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
