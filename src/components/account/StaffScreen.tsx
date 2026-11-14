import { useRef, useState } from "react";
import { Download, Plus, Upload, Users } from "lucide-react";
import { selectRole, useEditor } from "@/lib/store";
import { staffRepository } from "@/lib/data";
import { useTeam } from "./useTeam";
import { useCommand } from "@/lib/useCommand";
import { telHref } from "@/lib/phone";
import { csvToStaff, staffToCsv } from "@/lib/staffIO";
import { BOM } from "@/lib/utils";
import type { StaffMember } from "@/lib/types";
import { SortTh, TableFilters, TableSearch, useDataTable } from "@/components/ui/data-table";
import { useT, type TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { ScreenShell, EmptyState } from "@/components/fulfillment/ScreenShell";
import { BreakPolicyCard } from "./BreakPolicyCard";
import { eyebrow } from "@/components/ui/eyebrow";
import { card } from "@/components/ui/card";
import { PartnersSection } from "./PartnersSection";
import { TeamAccess } from "./TeamAccess";
import { StaffOutput } from "./StaffOutput";
import { PersonForm } from "./PersonForm";
import { StaffRow } from "./StaffRow";
import { StaffPanel } from "./StaffPanel";
import { ArchiveNote } from "@/components/fulfillment/ArchiveNote";

/**
 * Склад и персонал (п.6, 24, 25): контакты склада, ответственное лицо отдельной
 * карточкой и список сотрудников с правкой на месте, фото, маской телефона и
 * импортом/экспортом CSV.
 */

/** Кликабельный контакт: тот же вид, что у ссылок витрины. */
const contactLink = "text-primary underline-offset-4 hover:underline";

type StaffTab = "people" | "output" | "partners" | "schedule" | "access";

export function StaffScreen() {
  const warehouse = useEditor((s) => s.warehouse);
  const notify = useEditor((s) => s.notify);
  const updateManager = useEditor((s) => s.updateManager);
  // Продавцу список персонала виден, но не редактируется (п.27).
  const readOnly = useEditor((s) => selectRole(s) === "seller");
  // Вход второго человека есть только у серверного кабинета: демо живёт в браузере.
  const onServer = useEditor((s) => s.session.source === "server");
  const t = useT();

  const staff = warehouse.staff ?? [];
  // Роль у стола — колонкой списка (Кирилл 13.11: «каждому сотруднику
  // отдельно роль»), меняется в панели сотрудника. Команда приходит с
  // сервера; в демо колонки нет.
  const team = useTeam();
  const roleName = (id: string) =>
    team.state?.roles.find((r) => r.id === team.state?.deskRoles[id])?.name ?? null;
  // Панель сотрудника: `null` — закрыта, `"new"` — новый, иначе id.
  const [panel, setPanel] = useState<string | null>(null);
  const panelMember = panel && panel !== "new" ? staff.find((m) => m.id === panel) : null;
  const staffTable = useDataTable(staff, [
    { id: "name", value: (m) => m.name },
    { id: "role", value: (m) => m.role, facet: (v) => v },
    { id: "rate", value: (m) => m.hourlyRate },
    { id: "access", value: (m) => roleName(m.id) ?? "" },
  ]);
  const [tab, setTab] = useState<StaffTab>("people");
  const fileRef = useRef<HTMLInputElement>(null);

  // Персонал правится через репозиторий (п.3.2.1). Загрузка из файла —
  // команда экрана, заведение и правка — панели, удаление — строки.
  const load = useCommand((members: Omit<StaffMember, "id">[]) =>
    staffRepository.importMany(members),
  );

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
      notify("warning", "staff.importEmpty");
      return;
    }
    const res = await load.run(parsed);
    if (res.ok) notify("success", "staff.imported", { vars: { n: parsed.length } });
    else notify("error", res.error);
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
      <ArchiveNote />
      {/* Три вкладки вместо одной длинной простыни: люди склада, партнёры-
          продавцы и режим работы. Контакты склада живут в паспорте. */}
      <div className="w-fit">
        <Segmented<StaffTab>
          size="md"
          ariaLabel={t("staff.title")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "people", label: t("staff.tab.people") },
            { value: "output", label: t("staff.tab.output") },
            { value: "partners", label: t("staff.tab.partners") },
            { value: "schedule", label: t("staff.tab.schedule") },
            ...(onServer ? [{ value: "access" as const, label: t("staff.tab.access") }] : []),
          ]}
        />
      </div>
      {tab === "people" && (
        <>
          {/* Люди первыми: кто работает, по какой ставке и сколько сделал —
          одна таблица, а не список и отдельная «нагрузка» под ним. */}
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
                <Button size="sm" onClick={() => setPanel("new")}>
                  <Plus className="size-3.5" />
                  {t("staff.add")}
                </Button>
              </div>
            </div>

            {staff.length === 0 ? (
              <EmptyState
                icon={<Users className="size-5" />}
                title={t("staff.emptyTitle")}
                body={t("staff.emptyBody")}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <TableSearch
                    value={staffTable.query}
                    onChange={staffTable.setQuery}
                    placeholder={t("common.search")}
                  />
                  <TableFilters
                    facets={staffTable.facets}
                    filters={staffTable.filters}
                    onChange={staffTable.setFilter}
                    labels={{ role: t("staff.col.role") }}
                    allLabel={(col) => t("common.filterAll", { col })}
                  />
                </div>
                {team.state && staff.some((m) => !team.state?.deskRoles[m.id]) && (
                  <p className="w-fit rounded-full bg-warning-fill px-2.5 py-0.5 text-xs font-medium text-warning-foreground">
                    {t("team.deskMissing", {
                      n: staff.filter((m) => !team.state?.deskRoles[m.id]).length,
                    })}
                  </p>
                )}
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-muted/50 text-xs">
                      <tr className="text-left">
                        <SortTh table={staffTable.table} id="name">
                          {t("staff.col.name")}
                        </SortTh>
                        <SortTh table={staffTable.table} id="role">
                          {t("staff.col.role")}
                        </SortTh>
                        <SortTh table={staffTable.table} id="rate" align="right">
                          {t("staff.rate")}
                        </SortTh>
                        {team.state && (
                          <SortTh table={staffTable.table} id="access">
                            {t("team.role")}
                          </SortTh>
                        )}
                        <th className="w-20 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {staffTable.rows.map((m) => (
                        <StaffRow
                          key={m.id}
                          member={m}
                          roleName={team.state ? roleName(m.id) : undefined}
                          onEdit={() => setPanel(m.id)}
                          t={t}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
      {tab === "schedule" && <BreakPolicyCard />}
      {tab === "output" && <StaffOutput />}
      {tab === "access" && <TeamAccess />}

      {/* Ответственное лицо — тот же шаблон, что и у сотрудника (п.24) */}
      {tab === "people" && (
        <section className="flex flex-col gap-3">
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
      )}

      {tab === "partners" && <PartnersSection />}
      {panel && (panel === "new" || panelMember) && (
        <StaffPanel
          key={panel}
          member={panelMember ?? null}
          team={team.state}
          onTeamChanged={team.reload}
          onClose={() => setPanel(null)}
          t={t}
        />
      )}
    </ScreenShell>
  );
}

/**
 * Контакты склада для продавца, без единого поля ввода (п.27). Только телефон
 * и почта склада и ответственное лицо: телефоны и почты остальных сотрудников —
 * чужие персональные данные, продавцу они не нужны и не передаются.
 */
export function ReadOnlyContacts({
  warehouse,
  t,
}: {
  warehouse: { phone?: string; email?: string; manager?: StaffMember; staff?: StaffMember[] };
  t: TFunc;
}) {
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
    </>
  );
}
