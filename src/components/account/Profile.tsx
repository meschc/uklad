import { useState } from "react";
import {
  Building2,
  ChevronLeft,
  DatabaseBackup,
  Globe,
  Hash,
  Mail,
  LogOut,
  RotateCcw,
  ShieldCheck,
  User,
} from "lucide-react";
import { authRepository } from "@/lib/data/authRepository";
import { leaveServerSession } from "@/lib/store/leave";
import { flushServerSync, hasDeferredCopy } from "@/lib/store/serverSync";
import { downloadBackup, downloadDeferredCopy } from "./backupDownload";
import { PERSIST_KEY, selectRole, useEditor } from "@/lib/store";
import { removeLocal } from "@/lib/safeStorage";
import { isValidInn, lookupCompany } from "@/lib/company";
import type { Lang } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { card } from "@/components/ui/card";
import { ImagePicker } from "./ImagePicker";
import { Row, ReadValue, RowEditor } from "./ProfileRow";
import { TariffSection } from "./TariffSection";
import { NotifySection, ProfileHero, Section, ThemeTile } from "./ProfileParts";
import { BackupSection } from "./BackupSection";

/** Вкладки профиля: длинная страница из всех разделов сразу не читалась. */
type ProfileTab = "account" | "company" | "tariff" | "settings";

/**
 * Настройки профиля (ТЗ, разд. 3.3 + п.4): имя, почта, реквизиты компании,
 * тема и язык.
 *
 * Каждое поле правится отдельно (п.1): карандаш открывает одну строку,
 * галочка сохраняет только её. Случайный клик по-прежнему ничего не меняет —
 * но и «режима правки всего экрана», в котором непонятно, что уже изменено,
 * тоже больше нет. Тема и язык — исключение: это настройка отображения, её
 * видно сразу и подтверждать нечего.
 *
 * Почта меняется через подтверждение: на новый адрес «уходит» код, и до его
 * ввода старая почта остаётся рабочей. Кода в прототипе никто не присылает —
 * это честно написано в подсказке.
 *
 * ИНН — ключ к реквизитам: по сохранённому номеру данные компании приходят
 * сами, отдельной кнопки «подтянуть» нет.
 */

const CONFIRM_CODE_LENGTH = 6;

/** Какая строка сейчас правится. */
type FieldId = "name" | "email" | "inn" | "org" | "details";

/** Выбор языка скрыт: английского кабинета пока нет. */
const SHOW_LANGUAGE = false;

export function Profile() {
  const profile = useEditor((s) => s.profile);
  const account = useEditor((s) => s.account);
  const updateProfile = useEditor((s) => s.updateProfile);
  const updateAccount = useEditor((s) => s.updateAccount);
  const goToDashboard = useEditor((s) => s.goToDashboard);
  const goToEditor = useEditor((s) => s.goToEditor);
  const goToLogin = useEditor((s) => s.goToLogin);
  const serverSession = useEditor((s) => s.session.source === "server");
  // Выход с сервера стирает копию кабинета на этом компьютере. Всё записано
  // и отложенной копии нет — выходим сразу; иначе подтверждение строкой на
  // месте кнопки и «Скачать копию». Не дошёл до сервера — экран входа
  // говорит, что там сессия ещё жива.
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const logout = async () => {
    if (!serverSession) return goToLogin();
    // Всё записано на сервере — копия на этом компьютере больше не нужна,
    // выходим сразу. Не всё — сначала строка с «Скачать копию».
    if (!confirmLogout) {
      const synced = await flushServerSync();
      const hasDeferred = hasDeferredCopy();
      if (!synced || hasDeferred) {
        setDeferred(hasDeferred);
        return setConfirmLogout(true);
      }
    }
    const res = await authRepository.logout();
    leaveServerSession(res.ok ? undefined : "offline");
  };
  const resetHints = useEditor((s) => s.resetHints);
  const tariff = useEditor((s) => s.subscription.tariff);
  const isSeller = useEditor((s) => selectRole(s) === "seller");
  const t = useT();

  const [edit, setEdit] = useState<FieldId | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [tab, setTab] = useState<ProfileTab>("account");
  const tabs: { value: ProfileTab; label: string }[] = [
    { value: "account", label: t("profile.section.account") },
    ...(account.type === "company"
      ? [{ value: "company" as const, label: t("profile.section.company") }]
      : []),
    {
      value: "tariff",
      label: t(isSeller ? "profile.sellerOptions.title" : "profile.tab.tariff"),
    },
    { value: "settings", label: t("profile.tab.settings") },
  ];

  /**
   * Сброс к демо-данным. Чистим хранилище и перезагружаем страницу, а не
   * пересобираем стор на месте: посев живёт в одном месте — на старте
   * приложения, — и второй его копии в интерфейсе быть не должно.
   */
  const resetDemoData = () => {
    removeLocal(PERSIST_KEY);
    window.location.reload();
  };
  const [draft, setDraft] = useState(() => draftOf());
  /** Ожидающее подтверждения письмо + введённый код. */
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  /** Что случилось с реквизитами после сохранения ИНН. */
  const [innNote, setInnNote] = useState<string | null>(null);

  function draftOf() {
    return {
      name: profile.name,
      email: profile.email,
      org: account.org ?? "",
      inn: account.inn ?? "",
      kpp: account.kpp ?? "",
      ogrn: account.ogrn ?? "",
      legalAddress: account.legalAddress ?? "",
    };
  }

  const set = (patch: Partial<ReturnType<typeof draftOf>>) => setDraft((d) => ({ ...d, ...patch }));

  /** Открыть на правку одну строку — с чистой копией текущих значений. */
  const open = (field: FieldId) => {
    setDraft(draftOf());
    setInnNote(null);
    setEdit(field);
  };
  const close = () => setEdit(null);

  const innErr = draft.inn.trim() !== "" && !isValidInn(draft.inn) ? t("profile.innErr") : null;

  const saveName = () => {
    if (!draft.name.trim()) return;
    updateProfile({ name: draft.name.trim() });
    close();
  };

  // Почта меняется не сразу: сначала подтверждение нового адреса.
  const saveEmail = () => {
    const next = draft.email.trim();
    if (!next || next === profile.email) return close();
    setPendingEmail(next);
    setCode("");
    close();
  };

  /**
   * Сохранение ИНН сразу тянет реквизиты: человек ввёл ключ — данные приходят
   * сами (п.2). Справочник ФНС в прототип не подключён, поэтому в подсказке
   * прямо сказано, что это заготовка.
   */
  const saveInn = () => {
    if (innErr) return;
    const inn = draft.inn.trim();
    const info = inn ? lookupCompany(inn) : null;
    updateAccount({
      inn: inn || undefined,
      ...(info
        ? {
            org: info.name,
            kpp: info.kpp,
            ogrn: info.ogrn,
            legalAddress: info.legalAddress,
          }
        : {}),
    });
    setInnNote(info ? t("profile.innFetched") : null);
    close();
  };

  const saveOrg = () => {
    updateAccount({ org: draft.org.trim() || undefined });
    close();
  };

  const saveDetails = () => {
    updateAccount({
      kpp: draft.kpp.trim() || undefined,
      ogrn: draft.ogrn.trim() || undefined,
      legalAddress: draft.legalAddress.trim() || undefined,
    });
    close();
  };

  const confirmEmail = () => {
    if (code.replace(/\D/g, "").length !== CONFIRM_CODE_LENGTH || !pendingEmail) return;
    updateProfile({ email: pendingEmail });
    setPendingEmail(null);
    setCode("");
  };

  const hasDetails = !!(account.kpp || account.ogrn || account.legalAddress);

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Шапка закреплена (Кирилл 1 ноя): «Готово» внизу длинной страницы
          было не видно. Вкладки — в ней же, чтобы переключаться, не
          проматывая наверх. */}
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 pb-3 pt-5">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={goToDashboard}>
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold tracking-tight">{t("profile.title")}</h1>
              <p className="text-xs text-muted-foreground">{t("profile.subtitle")}</p>
            </div>
            <Button size="sm" onClick={goToDashboard}>
              {t("profile.done")}
            </Button>
          </div>
          <div className="no-scrollbar overflow-x-auto">
            <Segmented<ProfileTab>
              size="md"
              ariaLabel={t("profile.tabs")}
              value={tab}
              onChange={setTab}
              options={tabs}
            />
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
        {/* Визитка: кто вошёл и на каком тарифе — чтобы экран начинался не
            со строки «Имя», а с человека. */}
        <ProfileHero
          avatar={account.avatar}
          name={profile.name}
          email={profile.email}
          org={account.org}
          tariff={isSeller ? null : t(`tariff.${tariff}`)}
        />

        {/* Подтверждение новой почты */}
        {pendingEmail && (
          <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              <ShieldCheck className="size-3.5" />
              {t("profile.emailConfirmTitle", { email: pendingEmail })}
            </p>
            <p className="text-xs text-warning/80">
              {t("profile.emailConfirmBody", { n: CONFIRM_CODE_LENGTH })}
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={code}
                inputMode="numeric"
                maxLength={CONFIRM_CODE_LENGTH}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="h-9 w-28 text-center font-mono tracking-widest"
              />
              <Button
                size="sm"
                className="h-9"
                disabled={code.length !== CONFIRM_CODE_LENGTH}
                onClick={confirmEmail}
              >
                {t("profile.emailConfirmApply")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={() => {
                  setPendingEmail(null);
                  setCode("");
                }}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-6">
          {tab === "account" && (
            <Section title={t("profile.section.account")}>
              <div
                className={card({
                  pad: "none",
                  className: "flex flex-col divide-y divide-border overflow-hidden",
                })}
              >
                <Row icon={<User className="size-4" />} label={t("profile.image.photo")}>
                  <ImagePicker
                    value={account.avatar}
                    fallback={
                      <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <User className="size-5" />
                      </span>
                    }
                    onChange={(avatar) => updateAccount({ avatar })}
                  />
                </Row>

                {/* Имя */}
                <Row icon={<User className="size-4" />} label={t("profile.name")}>
                  {edit === "name" ? (
                    <RowEditor
                      onSave={saveName}
                      onCancel={close}
                      canSave={!!draft.name.trim()}
                      hint={
                        draft.name.trim() ? null : { text: t("profile.nameEmpty"), error: true }
                      }
                    >
                      <Input
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- строчный редактор открыт по клику «изменить»: фокус обязан уйти в поле
                        autoFocus
                        value={draft.name}
                        onChange={(e) => set({ name: e.target.value })}
                        placeholder={t("profile.namePlaceholder")}
                        className={cn("h-9 w-full", !draft.name.trim() && "border-destructive")}
                      />
                    </RowEditor>
                  ) : (
                    <ReadValue value={profile.name} onEdit={() => open("name")} />
                  )}
                </Row>

                {/* Email */}
                <Row icon={<Mail className="size-4" />} label={t("profile.email")}>
                  {edit === "email" ? (
                    <RowEditor
                      onSave={saveEmail}
                      onCancel={close}
                      hint={{ text: t("profile.emailNeedsConfirm") }}
                    >
                      <Input
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- строчный редактор открыт по клику «изменить»: фокус обязан уйти в поле
                        autoFocus
                        type="email"
                        value={draft.email}
                        onChange={(e) => set({ email: e.target.value })}
                        placeholder={t("profile.emailPlaceholder")}
                        className="h-9 w-full"
                      />
                    </RowEditor>
                  ) : (
                    <ReadValue value={profile.email} onEdit={() => open("email")} />
                  )}
                </Row>
              </div>
            </Section>
          )}

          {/* Компания отдельно от аккаунта (Кирилл 1 ноя): человек и
              юрлицо — разные вещи, и в одном списке строк они сливались.
              ИНН — ключ, остальное приходит по нему. */}
          {tab === "company" && account.type === "company" && (
            <Section title={t("profile.section.company")}>
              <div
                className={card({
                  pad: "none",
                  className: "flex flex-col divide-y divide-border overflow-hidden",
                })}
              >
                <>
                  <Row icon={<Hash className="size-4" />} label={t("profile.inn")}>
                    {edit === "inn" ? (
                      <RowEditor
                        onSave={saveInn}
                        onCancel={close}
                        canSave={!innErr}
                        hint={
                          innErr ? { text: innErr, error: true } : { text: t("profile.innHint") }
                        }
                      >
                        <Input
                          // eslint-disable-next-line jsx-a11y/no-autofocus -- строчный редактор открыт по клику «изменить»: фокус обязан уйти в поле
                          autoFocus
                          value={draft.inn}
                          inputMode="numeric"
                          maxLength={12}
                          onChange={(e) => set({ inn: e.target.value.replace(/\D/g, "") })}
                          placeholder="7712345678"
                          className={cn("h-9 w-full font-mono", innErr && "border-destructive")}
                        />
                      </RowEditor>
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        <ReadValue value={account.inn ?? ""} mono onEdit={() => open("inn")} />
                        {innNote && (
                          <span className="text-xs text-muted-foreground">{innNote}</span>
                        )}
                      </div>
                    )}
                  </Row>

                  <Row icon={<Building2 className="size-4" />} label={t("profile.image.logo")}>
                    <ImagePicker
                      value={account.orgLogo}
                      fallback={
                        <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                          <Building2 className="size-5" />
                        </span>
                      }
                      onChange={(orgLogo) => updateAccount({ orgLogo })}
                    />
                  </Row>

                  <Row icon={<Building2 className="size-4" />} label={t("profile.company")}>
                    {edit === "org" ? (
                      <RowEditor onSave={saveOrg} onCancel={close}>
                        <Input
                          // eslint-disable-next-line jsx-a11y/no-autofocus -- строчный редактор открыт по клику «изменить»: фокус обязан уйти в поле
                          autoFocus
                          value={draft.org}
                          onChange={(e) => set({ org: e.target.value })}
                          placeholder={t("profile.companyPlaceholder")}
                          className="h-9 w-full"
                        />
                      </RowEditor>
                    ) : (
                      <ReadValue value={account.org ?? ""} onEdit={() => open("org")} />
                    )}
                  </Row>

                  <Row icon={<Building2 className="size-4" />} label={t("profile.companyDetails")}>
                    {edit === "details" ? (
                      <RowEditor onSave={saveDetails} onCancel={close}>
                        <div className="flex w-full flex-col gap-1.5">
                          <Input
                            // eslint-disable-next-line jsx-a11y/no-autofocus -- строчный редактор открыт по клику «изменить»: фокус обязан уйти в поле
                            autoFocus
                            value={draft.kpp}
                            onChange={(e) => set({ kpp: e.target.value })}
                            placeholder={t("profile.kpp")}
                            className="h-9 font-mono"
                          />
                          <Input
                            value={draft.ogrn}
                            onChange={(e) => set({ ogrn: e.target.value })}
                            placeholder={t("profile.ogrn")}
                            className="h-9 font-mono"
                          />
                          <Input
                            value={draft.legalAddress}
                            onChange={(e) => set({ legalAddress: e.target.value })}
                            placeholder={t("profile.legalAddress")}
                            className="h-9"
                          />
                        </div>
                      </RowEditor>
                    ) : (
                      <ReadValue onEdit={() => open("details")}>
                        {hasDetails ? (
                          <div className="flex max-w-56 flex-col items-end text-right">
                            {account.kpp && (
                              <span className="font-mono text-xs">{account.kpp}</span>
                            )}
                            {account.ogrn && (
                              <span className="font-mono text-xs">{account.ogrn}</span>
                            )}
                            {account.legalAddress && (
                              <span className="truncate text-xs text-muted-foreground">
                                {account.legalAddress}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </ReadValue>
                    )}
                  </Row>
                </>
              </div>
            </Section>
          )}

          {tab === "settings" && (
            <>
              {/* Вид — плитками, а не строками: тема видна сразу, её не надо
                читать. */}
              <Section title={t("profile.section.look")}>
                <div className="grid grid-cols-2 gap-3">
                  <ThemeTile
                    theme="light"
                    active={profile.theme === "light"}
                    label={t("profile.theme.light")}
                    onClick={() => updateProfile({ theme: "light" })}
                  />
                  <ThemeTile
                    theme="dark"
                    active={profile.theme === "dark"}
                    label={t("profile.theme.dark")}
                    onClick={() => updateProfile({ theme: "dark" })}
                  />
                </div>
                {/* Выбор языка скрыт до перевода кабинета (Кирилл, 31 окт). */}
                {SHOW_LANGUAGE && (
                  <div className={card({ pad: "none", className: "overflow-hidden" })}>
                    <Row icon={<Globe className="size-4" />} label={t("profile.language")}>
                      <Segmented<Lang>
                        value={profile.language}
                        onChange={(language) => updateProfile({ language })}
                        options={[
                          { value: "ru", label: t("profile.lang.ru") },
                          { value: "en", label: t("profile.lang.en") },
                        ]}
                      />
                    </Row>
                  </div>
                )}
              </Section>

              <Section title={t("profile.section.notify")}>
                <NotifySection />
              </Section>

              <Section title={t("profile.section.other")}>
                {/* Обучение: сброс подсказок + переход в редактор, где сразу
            показывается приветственная подсказка. */}
                <div
                  className={card({
                    pad: "none",
                    className: "flex flex-col divide-y divide-border overflow-hidden",
                  })}
                >
                  <Row icon={<RotateCcw className="size-4" />} label={t("profile.onboarding")}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        resetHints();
                        goToEditor();
                        useEditor.getState().showHint("welcome");
                      }}
                    >
                      {t("profile.onboardingReplay")}
                    </Button>
                  </Row>

                  {/* Демо-данные (п.8). Посев применяется только при первом запуске —
              иначе он затирал бы работу пользователя при каждой перезагрузке.
              Но тогда обновлённую демо-историю невозможно увидеть, не почистив
              хранилище руками, поэтому здесь — явная кнопка. Она стирает ВСЁ,
              поэтому в два шага и с прямым предупреждением. */}
                  <Row icon={<DatabaseBackup className="size-4" />} label={t("profile.demoData")}>
                    {confirmReset ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="text-xs text-destructive">{t("profile.demoWarn")}</span>
                        <Button size="sm" variant="outline" onClick={() => setConfirmReset(false)}>
                          {t("common.cancel")}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={resetDemoData}>
                          {t("profile.demoConfirm")}
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setConfirmReset(true)}>
                        {t("profile.demoReload")}
                      </Button>
                    )}
                  </Row>
                </div>
              </Section>
            </>
          )}

          {/* Тариф и резервные копии — обещания тарифов на сайте. Продавец
              смотрит те же данные в режиме чтения: это дело склада. */}
          {tab === "tariff" && !isSeller && (
            <>
              <Section title={t("tariff.title")}>
                <TariffSection />
              </Section>
              <Section title={t("backup.title")}>
                <BackupSection />
              </Section>
            </>
          )}

          {/* У продавца вместо тарифа — его опции: тарифов склада у него нет,
              кабинет входит в тариф склада. Список опций появится после
              запуска и онлайн-оплаты. */}
          {tab === "tariff" && isSeller && (
            <Section title={t("profile.sellerOptions.title")}>
              <div className={card({ className: "flex flex-col gap-2 text-sm" })}>
                <p>{t("profile.sellerOptions.included")}</p>
                <p className="text-muted-foreground">{t("profile.sellerOptions.paid")}</p>
              </div>
            </Section>
          )}
        </div>

        {confirmLogout && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="mr-auto">
              {t(deferred ? "profile.logoutDeferred" : "profile.logoutUnsynced")}
            </span>
            {deferred && (
              <Button size="sm" variant="outline" onClick={downloadDeferredCopy}>
                {t("profile.logoutDeferredBackup")}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => void downloadBackup()}>
              {t("profile.logoutBackup")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmLogout(false)}>
              {t("login.switch.cancel")}
            </Button>
          </div>
        )}
        <div className="flex items-center">
          <Button
            size="sm"
            variant="ghost"
            onClick={logout}
            className="gap-1.5 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="size-4" />
            {t(confirmLogout ? "profile.logoutConfirm" : "profile.logout")}
          </Button>
        </div>
      </div>
    </div>
  );
}
