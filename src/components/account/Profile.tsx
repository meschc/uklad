import { useState } from "react";
import {
  Building2,
  Camera,
  ChevronLeft,
  CreditCard,
  DatabaseBackup,
  FileText,
  Globe,
  Hash,
  ImageIcon,
  LogOut,
  RotateCcw,
  Settings,
  User,
} from "lucide-react";
import { useLogout } from "./useLogout";
import { LogoutConfirm } from "./LogoutConfirm";
import { PERSIST_KEY, selectIsOwner, selectRole, useEditor } from "@/lib/store";
import { removeSaved } from "@/lib/store/persistStorage";
import { checkInn, checkKpp, checkOgrn, checkPersonName } from "@/lib/validate";
import { companyRepository } from "@/lib/data/companyRepository";
import { useCommand } from "@/lib/useCommand";
import type { Lang } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { ImagePicker } from "./ImagePicker";
import { Row, ReadValue, RowEditor } from "./ProfileRow";
import { TariffSection } from "./TariffSection";
import { NotifySection, ProfileHero, Section, ThemeTile } from "./ProfileParts";
import { BackupSection } from "./BackupSection";
import { AccountDataSection } from "./AccountDataSection";
import { BankRow } from "./BankRow";
import { EmailRow } from "./EmailRow";
import { FieldError } from "@/components/ui/field";

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
 * Почта меняется через подтверждение (`EmailRow`): пароль, код на новый адрес,
 * до его ввода старая почта остаётся рабочей.
 *
 * ИНН — ключ к реквизитам: по сохранённому номеру данные компании приходят
 * сами, отдельной кнопки «подтянуть» нет.
 */

/** Какая строка сейчас правится. */
type FieldId = "name" | "inn" | "org" | "details";

/** Выбор языка скрыт: английского кабинета пока нет. */
const SHOW_LANGUAGE = false;

export function Profile() {
  const profile = useEditor((s) => s.profile);
  const account = useEditor((s) => s.account);
  const updateProfile = useEditor((s) => s.updateProfile);
  const updateAccount = useEditor((s) => s.updateAccount);
  const goToDashboard = useEditor((s) => s.goToDashboard);
  const goToEditor = useEditor((s) => s.goToEditor);
  const serverSession = useEditor((s) => s.session.source === "server");
  const { logout, confirming: confirmLogout, deferred, cancel: cancelLogout } = useLogout();
  const resetHints = useEditor((s) => s.resetHints);
  const tariff = useEditor((s) => s.subscription.tariff);
  const isSeller = useEditor((s) => selectRole(s) === "seller");
  const owner = useEditor(selectIsOwner);
  const t = useT();

  const [edit, setEdit] = useState<FieldId | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [tab, setTab] = useState<ProfileTab>("account");
  const tabs: { value: ProfileTab; label: string; icon: React.ReactNode }[] = [
    { value: "account", label: t("profile.section.account"), icon: <User /> },
    // Реквизиты и тариф — только владельцу (сервер их другим не отдаёт):
    // у начальника склада в настройках — свой аккаунт и вид (Кирилл 24.11).
    ...(account.type === "company" && owner
      ? [{ value: "company" as const, label: t("profile.section.company"), icon: <Building2 /> }]
      : []),
    ...(owner || isSeller
      ? [
          {
            value: "tariff" as const,
            label: t(isSeller ? "profile.sellerOptions.title" : "profile.tab.tariff"),
            icon: <CreditCard />,
          },
        ]
      : []),
    { value: "settings", label: t("profile.tab.settings"), icon: <Settings /> },
  ];

  /**
   * Сброс к демо-данным. Чистим хранилище и перезагружаем страницу, а не
   * пересобираем стор на месте: посев живёт в одном месте — на старте
   * приложения, — и второй его копии в интерфейсе быть не должно.
   */
  const resetDemoData = () => {
    removeSaved(PERSIST_KEY);
    window.location.reload();
  };
  const [draft, setDraft] = useState(() => draftOf());
  /** Что случилось с реквизитами после сохранения ИНН. */
  const [innNote, setInnNote] = useState<string | null>(null);

  function draftOf() {
    return {
      name: profile.name,
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

  const innErr = checkInn(draft.inn) ? t("profile.innErr") : null;
  const nameErr = draft.name.trim()
    ? (checkPersonName(draft.name) ?? null)
    : ("profile.nameEmpty" as const);
  const kppErr = checkKpp(draft.kpp);
  const ogrnErr = checkOgrn(draft.ogrn);
  const detailsErr = kppErr ?? ogrnErr;

  const saveName = () => {
    if (nameErr) return;
    updateProfile({ name: draft.name.trim() });
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
    // ИНН сохраняется сразу, реквизиты догоняют: справочник может не
    // ответить, а введённое терять нельзя.
    updateAccount({ inn: inn || undefined });
    close();
    if (!inn) return setInnNote(null);
    setInnNote(t("profile.innFetching"));
    void companyRepository.lookup(inn).then((res) => {
      // Пока ждали, ИНН успели поменять — этот ответ уже не о нём.
      if (useEditor.getState().account.inn !== inn) return;
      if (!res.ok) return setInnNote(t(res.error));
      const info = res.data;
      if (!info) return setInnNote(t("profile.innNotFound"));
      void companyRepository.rename(info.name).then((r) => {
        if (!r.ok) setInnNote(t(r.error));
      });
      updateAccount({
        org: info.name,
        kpp: info.kpp,
        ogrn: info.ogrn,
        legalAddress: info.legalAddress,
      });
      setInnNote(
        info.mock
          ? t("profile.innMock")
          : info.status && info.status !== "ACTIVE"
            ? t("profile.innInactive")
            : t("profile.innFetched"),
      );
    });
  };

  // Название — и на сервер: его видят письма-приглашения и список компаний.
  const rename = useCommand(companyRepository.rename);
  const saveOrg = async () => {
    const org = draft.org.trim();
    // Пустое на сервер не уходит: у компании там всегда есть название.
    if (org && !(await rename.run(org)).ok) return;
    updateAccount({ org: org || undefined });
    close();
  };

  const saveDetails = () => {
    if (detailsErr) return;
    updateAccount({
      kpp: draft.kpp.trim() || undefined,
      ogrn: draft.ogrn.trim() || undefined,
      legalAddress: draft.legalAddress.trim() || undefined,
    });
    close();
  };

  const hasDetails = !!(account.kpp || account.ogrn || account.legalAddress);

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Шапка закреплена (Кирилл 1 ноя): «Готово» внизу длинной страницы
          было не видно. Вкладки — в ней же, чтобы переключаться, не
          проматывая наверх. */}
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-6 pb-3 pt-5">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={goToDashboard}>
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold tracking-tight">{t("profile.title")}</h1>
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
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6">
        {/* Визитка: кто вошёл и на каком тарифе — чтобы экран начинался не
            со строки «Имя», а с человека. */}
        <ProfileHero
          avatar={account.avatar}
          name={profile.name}
          email={profile.email}
          org={account.org}
          tariff={isSeller ? null : t(`tariff.${tariff}`)}
        />

        <div className="flex min-w-0 flex-col gap-6">
          {tab === "account" && (
            <Section title={t("profile.section.account")}>
              <div className="flex flex-col divide-y divide-border/60">
                <Row icon={<Camera className="size-4" />} label={t("profile.image.photo")}>
                  <ImagePicker
                    value={account.avatar}
                    fallback={
                      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
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
                      canSave={!nameErr}
                      hint={nameErr ? { text: t(nameErr), error: true } : null}
                    >
                      <Input
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- строчный редактор открыт по клику «изменить»: фокус обязан уйти в поле
                        autoFocus
                        value={draft.name}
                        onChange={(e) => set({ name: e.target.value })}
                        placeholder={t("profile.namePlaceholder")}
                        aria-invalid={!!nameErr || undefined}
                        className="h-9 w-full"
                      />
                    </RowEditor>
                  ) : (
                    <ReadValue value={profile.name} onEdit={() => open("name")} />
                  )}
                </Row>

                <EmailRow />
              </div>
            </Section>
          )}
          {tab === "account" && serverSession && <AccountDataSection />}

          {/* Компания отдельно от аккаунта (Кирилл 1 ноя): человек и
              юрлицо — разные вещи, и в одном списке строк они сливались.
              ИНН — ключ, остальное приходит по нему. */}
          {tab === "company" && account.type === "company" && owner && (
            <Section title={t("profile.section.company")}>
              <div className="flex flex-col divide-y divide-border/60">
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
                          aria-invalid={!!innErr || undefined}
                          className="h-9 w-full font-mono"
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

                  <Row icon={<ImageIcon className="size-4" />} label={t("profile.image.logo")}>
                    <ImagePicker
                      value={account.orgLogo}
                      fallback={
                        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
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
                        {rename.error && <FieldError>{t(rename.error)}</FieldError>}
                      </RowEditor>
                    ) : (
                      <ReadValue value={account.org ?? ""} onEdit={() => open("org")} />
                    )}
                  </Row>

                  <Row icon={<FileText className="size-4" />} label={t("profile.companyDetails")}>
                    {edit === "details" ? (
                      <RowEditor
                        onSave={saveDetails}
                        onCancel={close}
                        canSave={!detailsErr}
                        hint={detailsErr ? { text: t(detailsErr), error: true } : null}
                      >
                        <div className="flex w-full flex-col gap-1.5">
                          <Input
                            // eslint-disable-next-line jsx-a11y/no-autofocus -- строчный редактор открыт по клику «изменить»: фокус обязан уйти в поле
                            autoFocus
                            value={draft.kpp}
                            onChange={(e) => set({ kpp: e.target.value })}
                            placeholder={t("profile.kpp")}
                            aria-invalid={!!kppErr || undefined}
                            className="h-9 font-mono"
                          />
                          <Input
                            value={draft.ogrn}
                            onChange={(e) => set({ ogrn: e.target.value })}
                            placeholder={t("profile.ogrn")}
                            aria-invalid={!!ogrnErr || undefined}
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
                          // Каждое значение со своим названием: голые цифры
                          // КПП и ОГРН не отличить друг от друга. Адрес
                          // переносится, а не тянется в одну строку.
                          <dl className="grid max-w-sm grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                            {account.kpp && (
                              <>
                                <dt className="text-muted-foreground">{t("profile.kpp")}</dt>
                                <dd className="font-mono text-xs leading-5">{account.kpp}</dd>
                              </>
                            )}
                            {account.ogrn && (
                              <>
                                <dt className="text-muted-foreground">{t("profile.ogrn")}</dt>
                                <dd className="font-mono text-xs leading-5">{account.ogrn}</dd>
                              </>
                            )}
                            {account.legalAddress && (
                              <>
                                <dt className="text-muted-foreground">
                                  {t("profile.legalAddress")}
                                </dt>
                                <dd>{account.legalAddress}</dd>
                              </>
                            )}
                          </dl>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </ReadValue>
                    )}
                  </Row>
                  <BankRow />
                </>
              </div>
            </Section>
          )}

          {tab === "settings" && (
            <>
              {/* Вид — плитками, а не строками: тема видна сразу, её не надо
                читать. */}
              <Section title={t("profile.section.look")}>
                <div className="grid grid-cols-3 gap-3">
                  <ThemeTile
                    theme="system"
                    active={profile.theme === "system"}
                    label={t("profile.theme.system")}
                    onClick={() => updateProfile({ theme: "system" })}
                  />
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
                  <div className="flex flex-col">
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
                <div className="flex flex-col divide-y divide-border/60">
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
                  {/* Настоящий склад (кабинет с сервером): стирать нечего и незачем. */}
                  {!serverSession && (
                    <Row icon={<DatabaseBackup className="size-4" />} label={t("profile.demoData")}>
                      {confirmReset ? (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <FieldError>{t("profile.demoWarn")}</FieldError>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmReset(false)}
                          >
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
                  )}
                </div>
              </Section>
            </>
          )}

          {/* Тариф и резервные копии — обещания тарифов на сайте. Продавец
              смотрит те же данные в режиме чтения: это дело склада. */}
          {tab === "tariff" && owner && !isSeller && (
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
              <div className="flex flex-col gap-2 text-sm">
                <p>{t("profile.sellerOptions.included")}</p>
                <p className="text-muted-foreground">{t("profile.sellerOptions.paid")}</p>
              </div>
            </Section>
          )}
        </div>

        {confirmLogout && <LogoutConfirm deferred={deferred} onCancel={cancelLogout} />}
        <div className="flex items-center">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void logout()}
            tone="destructive"
            className="gap-1.5 text-muted-foreground"
          >
            <LogOut className="size-4" />
            {t(confirmLogout ? "profile.logoutConfirm" : "profile.logout")}
          </Button>
        </div>
      </div>
    </div>
  );
}
