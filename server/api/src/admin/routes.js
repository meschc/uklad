/**
 * Экраны админки после входа: что показать и что поменять.
 *
 * Сюда запрос приходит уже проверенным: сессия жива, у POST верный CSRF и
 * свой Origin (`app.js`). Здесь — только разбор формы, правка через `store`
 * и запись в журнал. Каждое изменение пишется в журнал с тем, что именно
 * поменялось, — иначе через месяц не восстановить, кто продлил и на сколько.
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const plans = require("./plans");
const { hashPassword, checkPassword, MIN_LENGTH } = require("./password");
const totp = require("./totp");
const views = require("./views");

const EMAIL = /^[^\s@<>]{1,100}@[^\s@<>]{1,100}\.[^\s@<>]{2,}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LEAD_STATUSES = ["new", "work", "won", "lost"];
const DAY = 86_400_000;

const text = (form, name, max = 200) => (form.get(name) ?? "").trim().slice(0, max);
/** Дата из поля `<input type=date>` → конец этого дня по Москве (20:59:59Z). */
const dateEnd = (v) => (DATE.test(v) ? `${v}T20:59:59.999Z` : null);
const intOrNull = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/\s/g, ""));
  return Number.isInteger(n) && n >= 0 && n <= 1e9 ? n : undefined;
};

/** «Имя: …\nПочта: …» из письма заявки → объект полей. */
function leadFields(lead) {
  const out = {};
  for (const line of String(lead.message ?? "").split("\n")) {
    const m = /^([^:]{1,40}):\s*(.+)$/.exec(line.trim());
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

/** Что подставить в новый аккаунт из заявки: всё, что нашли в письме. */
function leadValues(lead) {
  const f = leadFields(lead);
  const email = (Object.values(f).find((v) => EMAIL.test(v)) ?? "").toLowerCase();
  return {
    kind: lead.kind === "seller" ? "seller" : "warehouse",
    name: (f["Склад"] || f["Компания"] || f["Имя"] || email).slice(0, 120),
    email,
    contact_name: f["Имя"] ?? "",
    phone: Object.values(f).find((v) => /^\+?[\d\s()-]{7,}$/.test(v)) ?? "",
    company: f["Компания"] ?? "",
    inn: /^\d{10}(\d{2})?$/.test(f["ИНН"] ?? "") ? f["ИНН"] : "",
    city: f["Город"] ?? "",
    note: String(lead.message ?? "").slice(0, 2000),
    tariff: "start",
    trial: "on",
  };
}

/** Вторая половина двухшаговой формы: пришло ли «Подтвердить». */
const confirmed = (form) => form.get("confirmed") === "1";

function accountRows(store, nowIso) {
  const managers = new Map(store.managers().map((m) => [m.id, m]));
  return store.allAccounts().map((a) => ({
    ...a,
    state: plans.billingState(a, nowIso),
    manager: managers.get(a.manager_id) ?? null,
  }));
}

function createRoutes({ store, cfg, invoices }) {
  /** Профиль аккаунта из формы. Ошибка — строкой, иначе патч. */
  function profileFrom(form, selfId) {
    const kind = form.get("kind");
    const name = text(form, "name", 120);
    const email = text(form, "email").toLowerCase();
    const inn = text(form, "inn", 12);
    if (kind !== "warehouse" && kind !== "seller") return { error: "Выберите тип." };
    if (!name) return { error: "Впишите название." };
    if (!EMAIL.test(email)) return { error: "Почта выглядит неверно." };
    const other = store.accountByEmail(email);
    if (other && other.id !== selfId) return { error: "Аккаунт с этой почтой уже есть." };
    if (inn && !/^\d{10}(\d{2})?$/.test(inn)) return { error: "ИНН — 10 или 12 цифр." };
    return {
      patch: {
        kind,
        name,
        email,
        contact_name: text(form, "contact_name", 120) || null,
        phone: text(form, "phone", 40) || null,
        company: text(form, "company", 200) || null,
        inn: inn || null,
        city: text(form, "city", 80) || null,
        note: text(form, "note", 2000) || null,
      },
    };
  }

  function diff(before, patch) {
    const out = {};
    for (const [k, v] of Object.entries(patch)) {
      if ((before[k] ?? null) !== (v ?? null)) out[k] = v ?? "—";
    }
    return out;
  }

  function accountPage(s, a, nowIso, extra = {}) {
    return views.accountPage({
      session: s,
      account: { ...a, state: plans.billingState(a, nowIso) },
      features: plans.effectiveFeatures(a),
      limits: plans.effectiveLimits(a),
      managers: store.managers(),
      payments: store.paymentsOf(a.id),
      invoices: invoices.of(a.id),
      audit: store.auditOf(`account:${a.id}`),
      now: nowIso,
      ...extra,
    });
  }

  async function get({ path, url, s, t, page, notFound, download, redirect }) {
    const nowIso = t.toISOString();

    if (path === "/") {
      const rows = accountRows(store, nowIso);
      const soon = new Date(t.getTime() + 14 * DAY).toISOString();
      return page(
        views.dashboard({
          session: s,
          rows,
          trialsEnding: rows.filter((a) => a.state === "trial" && a.trial_until < soon),
          overdue: rows.filter((a) => a.state === "overdue"),
          newLeads: store.countNewLeads(),
          revenue30: store.paymentsSince(new Date(t.getTime() - 30 * DAY).toISOString()),
          recent: store.audit(10),
          now: nowIso,
        }),
      );
    }

    if (path === "/money") {
      const rows = accountRows(store, nowIso);
      const soon = new Date(t.getTime() + 14 * DAY).toISOString();
      return page(
        views.moneyPage({
          session: s,
          rows,
          payments: store.recentPayments(100),
          revenue30: store.paymentsSince(new Date(t.getTime() - 30 * DAY).toISOString()),
          revenue365: store.paymentsSince(new Date(t.getTime() - 365 * DAY).toISOString()),
          trialsEnding: rows.filter((a) => a.state === "trial" && a.trial_until < soon),
          paidEnding: rows.filter((a) => a.state === "paid" && a.paid_until < soon),
          overdue: rows.filter((a) => a.state === "overdue"),
          now: nowIso,
        }),
      );
    }

    if (path === "/accounts") {
      const pick = (name, allowed) =>
        allowed.includes(url.searchParams.get(name)) ? url.searchParams.get(name) : "";
      const filter = {
        kind: pick("kind", ["warehouse", "seller"]),
        state: pick("state", Object.keys(plans.STATE_TITLES)),
        tariff: pick("tariff", Object.keys(plans.PLANS)),
        q: (url.searchParams.get("q") ?? "").trim().slice(0, 100),
      };
      const needle = filter.q.toLowerCase();
      const rows = accountRows(store, nowIso).filter(
        (a) =>
          (!filter.kind || a.kind === filter.kind) &&
          (filter.state ? a.state === filter.state : a.state !== "archived") &&
          (!filter.tariff || a.tariff === filter.tariff) &&
          (!needle ||
            [a.name, a.email, a.company, a.inn, a.phone, a.city]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(needle))),
      );
      return page(views.accountsList({ session: s, rows, filter, now: nowIso }));
    }

    if (path === "/invoices") {
      const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
      return page(
        views.invoicesPage({ session: s, rows: invoices.find(q), q, ready: invoices.ready }),
      );
    }

    if (path === "/accounts/new") {
      const leadId = Number(url.searchParams.get("lead"));
      const l = Number.isInteger(leadId) && leadId > 0 ? store.lead(leadId) : null;
      if (l?.account_id) return redirect(`/accounts/${l.account_id}`);
      return page(
        views.accountNew({ session: s, values: l ? leadValues(l) : {}, lead: l ?? null }),
      );
    }

    const acc = /^\/accounts\/(\d{1,10})$/.exec(path);
    if (acc) {
      const a = store.account(Number(acc[1]));
      return a ? page(accountPage(s, a, nowIso)) : notFound();
    }

    if (path === "/leads") {
      const status = [...LEAD_STATUSES, "archived"].includes(url.searchParams.get("status"))
        ? url.searchParams.get("status")
        : "";
      return page(
        views.leadsList({ session: s, leads: store.leads(status), status, ready: store.hasLeads }),
      );
    }
    const lead = /^\/leads\/(\d{1,10})$/.exec(path);
    if (lead) {
      const l = store.lead(Number(lead[1]));
      if (!l) return notFound();
      const account = l.account_id ? store.account(l.account_id) : null;
      return page(views.leadPage({ session: s, lead: l, fields: leadFields(l), account }));
    }

    if (path === "/support") {
      const st = url.searchParams.get("status");
      const status = views.SUPPORT_STATUSES.includes(st) ? st : "";
      return page(views.supportList({ session: s, reports: store.reports(status), status }));
    }
    const rep = /^\/support\/(\d{1,10})(\.json)?$/.exec(path);
    if (rep) {
      const r = store.report(Number(rep[1]));
      if (!r) return notFound();
      if (rep[2]) {
        // Скачивание копии — доступ к данным клиента, пусть и обезличенным:
        // в журнал (план поддержки, «Защита»).
        store.log(t, s.admin_id, "support_download", `support:${r.id}`);
        return download(`uklad-support-${r.id}.json`, r.payload);
      }
      let payload = {};
      try {
        payload = JSON.parse(r.payload);
      } catch {
        /* показываем то, что есть в колонках */
      }
      return page(views.supportPage({ session: s, report: r, payload }));
    }

    if (path === "/errors") {
      const st = url.searchParams.get("state");
      const state = views.ERROR_STATES.includes(st) ? st : "";
      return page(views.errorsList({ session: s, errors: store.clientErrors(state), state }));
    }

    if (path === "/demos") {
      return page(
        views.demosList({ session: s, demos: store.demos(), now: nowIso, days: cfg.demoDays }),
      );
    }
    const dm = /^\/demos\/(\d{1,10})$/.exec(path);
    if (dm) {
      const d = store.demo(Number(dm[1]));
      if (!d) return notFound();
      return page(
        views.demoPage({
          session: s,
          demo: d,
          link: cfg.demoLink(d.token),
          events: store.demoEvents(d.token),
          now: nowIso,
        }),
      );
    }
    const mgr = /^\/managers\/(\d{1,10})$/.exec(path);
    if (mgr) {
      const m = store.manager(Number(mgr[1]));
      return m ? page(views.managerEdit({ session: s, manager: m })) : notFound();
    }
    if (path === "/managers") {
      const load = new Map();
      for (const a of store.allAccounts()) {
        if (a.manager_id && !a.archived_at)
          load.set(a.manager_id, (load.get(a.manager_id) ?? 0) + 1);
      }
      return page(views.managersPage({ session: s, managers: store.managers(), load }));
    }
    if (path === "/audit") {
      const raw = url.searchParams.get("action") ?? "";
      const action = /^[a-z_]{1,40}$/.test(raw) ? raw : "";
      return page(views.auditPage({ session: s, audit: store.audit(500, action), action }));
    }
    if (path === "/settings") {
      return page(
        views.settingsPage({
          session: s,
          admin: store.adminById(s.admin_id),
          sessions: store.sessionsOf(s.admin_id),
          now: nowIso,
          done: url.searchParams.get("done") === "password",
        }),
      );
    }
    return notFound();
  }

  async function post({ path, form, s, t, page, redirect, notFound, badRequest }) {
    const nowIso = t.toISOString();
    const by = s.admin_id;

    if (path === "/accounts") {
      const p = profileFrom(form);
      if (p.error) {
        return badRequest(
          views.accountNew({
            session: s,
            values: Object.fromEntries(form),
            error: p.error,
            lead: Number(form.get("lead_id")) ? store.lead(Number(form.get("lead_id"))) : null,
          }),
        );
      }
      const tariff = Object.keys(plans.PLANS).includes(form.get("tariff"))
        ? form.get("tariff")
        : "start";
      const trial = form.get("trial") === "on";
      const leadId = Number(form.get("lead_id"));
      const lead = Number.isInteger(leadId) && leadId > 0 ? store.lead(leadId) : null;
      const id = store.addAccount(
        {
          ...p.patch,
          tariff,
          source: lead ? "lead" : "admin",
          price: plans.PLANS[tariff].price,
          trial_until: trial ? plans.addMonths(nowIso, plans.TRIAL_MONTHS) : null,
        },
        t,
      );
      if (lead) store.linkLead(lead.id, id);
      store.log(t, by, "account_create", `account:${id}`, {
        тип: p.patch.kind,
        почта: p.patch.email,
        тариф: plans.PLANS[tariff].title,
        пробный: trial ? `${plans.TRIAL_MONTHS} мес.` : "нет",
        ...(lead ? { "из заявки": `#${lead.id}` } : {}),
      });
      return redirect(`/accounts/${id}`);
    }

    const m = /^\/accounts\/(\d{1,10})\/([a-z]+)$/.exec(path);
    if (m) {
      const a = store.account(Number(m[1]));
      if (!a) return notFound();
      const target = `account:${a.id}`;
      const back = () => redirect(`/accounts/${a.id}`);
      const fail = (error) => badRequest(accountPage(s, a, nowIso, { error }));

      switch (m[2]) {
        case "profile": {
          const p = profileFrom(form, a.id);
          if (p.error) return fail(p.error);
          const changed = diff(a, p.patch);
          store.updateAccount(a.id, p.patch, t);
          if (Object.keys(changed).length) store.log(t, by, "account_edit", target, changed);
          return back();
        }
        case "tariff": {
          const tariff = form.get("tariff");
          const period = form.get("period");
          const price = intOrNull(form.get("price"));
          const managerId = intOrNull(form.get("manager_id"));
          if (!Object.keys(plans.PLANS).includes(tariff)) return fail("Выберите тариф.");
          if (!Object.keys(plans.PERIODS).includes(period)) return fail("Выберите период оплаты.");
          if (price === undefined) return fail("Цена — целое число рублей.");
          if (managerId === undefined || (managerId && !store.manager(managerId))) {
            return fail("Такого менеджера нет.");
          }
          const trialRaw = text(form, "trial_until", 10);
          const paidRaw = text(form, "paid_until", 10);
          if ((trialRaw && !dateEnd(trialRaw)) || (paidRaw && !dateEnd(paidRaw))) {
            return fail("Дата в формате ГГГГ-ММ-ДД.");
          }
          const patch = {
            tariff,
            period,
            price: price ?? plans.PLANS[tariff].price,
            manager_id: managerId || null,
            trial_until: trialRaw ? dateEnd(trialRaw) : null,
            paid_until: paidRaw ? dateEnd(paidRaw) : null,
          };
          const changed = diff(a, patch);
          store.updateAccount(a.id, patch, t);
          if (Object.keys(changed).length) store.log(t, by, "account_tariff", target, changed);
          return back();
        }
        case "extend": {
          const months = Number(form.get("months"));
          const amount = intOrNull(form.get("amount"));
          if (![1, 3, 6, 12].includes(months)) {
            return fail("Продлить можно на 1, 3, 6 или 12 месяцев.");
          }
          if (amount === undefined) return fail("Сумма — целое число рублей.");
          // От «оплачено до», если оно ещё впереди, иначе от сегодня:
          // заплативший раньше срока не теряет оставшиеся дни.
          const from = a.paid_until && a.paid_until > nowIso ? a.paid_until : nowIso;
          const paidUntil = plans.addMonths(from, months);
          store.updateAccount(a.id, { paid_until: paidUntil }, t);
          store.addPayment({
            accountId: a.id,
            at: nowIso,
            months,
            amount,
            paidUntil,
            note: text(form, "note") || null,
          });
          store.log(t, by, "account_extend", target, {
            месяцев: months,
            сумма: amount ?? "—",
            "было оплачено до": a.paid_until ? a.paid_until.slice(0, 10) : "—",
            "оплачено до": paidUntil.slice(0, 10),
          });
          return back();
        }
        case "invoice": {
          const r = invoices.issue(a, nowIso);
          if (r.error) return fail(r.error);
          const sent = await invoices.deliver(r.invoice, nowIso);
          store.log(t, by, "invoice_issue", target, {
            счёт: r.invoice.number,
            сумма: r.invoice.amount,
            письмо: sent ? "ушло" : "не ушло",
          });
          return back();
        }
        case "trial": {
          const months = Number(form.get("months"));
          if (![1, 3].includes(months)) {
            return fail("Пробный период продлевается на 1 или 3 месяца.");
          }
          const from = a.trial_until && a.trial_until > nowIso ? a.trial_until : nowIso;
          const until = plans.addMonths(from, months);
          store.updateAccount(a.id, { trial_until: until }, t);
          store.log(t, by, "account_trial", target, { "пробный до": until.slice(0, 10) });
          return back();
        }
        case "features": {
          const features = {};
          for (const key of Object.keys(plans.FEATURES)) {
            const v = form.get(`f_${key}`);
            if (v === "on") features[key] = true;
            if (v === "off") features[key] = false;
          }
          const limits = {};
          for (const key of Object.keys(plans.LIMITS)) {
            const v = intOrNull(form.get(`l_${key}`));
            if (v === undefined) return fail("Лимит — целое число или пусто.");
            if (v !== null) limits[key] = v;
          }
          store.updateAccount(
            a.id,
            {
              features: Object.keys(features).length ? JSON.stringify(features) : null,
              limits: Object.keys(limits).length ? JSON.stringify(limits) : null,
            },
            t,
          );
          const list = (o, fmt) => Object.entries(o).map(fmt).join(", ") || "как в тарифе";
          store.log(t, by, "account_features", target, {
            функции: list(features, ([k, v]) => `${plans.FEATURES[k]}: ${v ? "да" : "нет"}`),
            лимиты: list(limits, ([k, v]) => `${plans.LIMITS[k]}: ${v}`),
          });
          return back();
        }
        case "block": {
          const note = text(form, "note");
          store.setStatus(a.id, "blocked", note, t);
          store.log(t, by, "account_block", target, note ? { причина: note } : undefined);
          return back();
        }
        case "unblock":
          store.setStatus(a.id, "active", null, t);
          store.log(t, by, "account_unblock", target);
          return back();
        case "archive":
          if (text(form, "confirm", 120) !== a.name) {
            return fail("Чтобы убрать в архив, впишите название аккаунта точно.");
          }
          store.setArchived(a.id, nowIso, t);
          store.log(t, by, "account_archive", target, {
            было: plans.billingState(a, nowIso),
            тариф: a.tariff ?? "—",
            "оплачено до": a.paid_until ? a.paid_until.slice(0, 10) : "—",
          });
          return back();
        case "restore":
          store.setArchived(a.id, null, t);
          store.log(t, by, "account_restore", target);
          return back();
        case "reset": {
          // Ссылку показываем один раз прямо в ответе, в базе — только хэш.
          const resetLink = cfg.issueReset(a.id, t);
          store.log(t, by, "access_reset", target);
          return page(accountPage(s, store.account(a.id), nowIso, { resetLink }));
        }
        default:
          return notFound();
      }
    }

    const inv = /^\/invoices\/(\d{1,10})\/(paid|cancel)$/.exec(path);
    if (inv) {
      const id = Number(inv[1]);
      const r = inv[2] === "paid" ? invoices.markPaid(id, nowIso, by) : invoices.cancel(id, by);
      if (r.error)
        return badRequest(
          views.invoicesPage({
            session: s,
            rows: invoices.open(),
            q: "",
            ready: invoices.ready,
            error: r.error,
          }),
        );
      const i = r.invoice;
      store.log(
        t,
        by,
        inv[2] === "paid" ? "invoice_paid" : "invoice_cancel",
        `account:${i.account_id}`,
        {
          счёт: i.number,
          сумма: i.amount,
          ...(r.paidUntil ? { "оплачено до": r.paidUntil.slice(0, 10) } : {}),
        },
      );
      const back = text(form, "back");
      return redirect(back === "account" ? `/accounts/${i.account_id}` : "/invoices");
    }

    const rep = /^\/support\/(\d{1,10})$/.exec(path);
    if (rep) {
      const r = store.report(Number(rep[1]));
      if (!r) return notFound();
      const status = form.get("status");
      if (!views.SUPPORT_STATUSES.includes(status)) return notFound();
      store.setReport(r.id, status, text(form, "note", 2000));
      store.log(t, by, "support_update", `support:${r.id}`, { было: r.status, стало: status });
      return redirect(`/support/${r.id}`);
    }

    // Отметка «разобрано» отменяется той же кнопкой — без подтверждения.
    const err = /^\/errors\/([0-9a-f]{16})$/.exec(path);
    if (err) {
      const e = store.clientError(err[1]);
      if (!e) return notFound();
      const resolved = form.get("resolved") === "1";
      store.resolveClientError(e.fingerprint, resolved ? t.toISOString() : null);
      store.log(t, by, resolved ? "error_resolve" : "error_reopen", `error:${e.fingerprint}`, {
        ошибка: e.message.slice(0, 80),
      });
      const st = form.get("state");
      return redirect(views.ERROR_STATES.includes(st) ? `/errors?state=${st}` : "/errors");
    }

    const lead = /^\/leads\/(\d{1,10})(\/convert|\/archive|\/delete)?$/.exec(path);
    if (lead) {
      const l = store.lead(Number(lead[1]));
      if (!l) return notFound();
      if (lead[2] === "/archive") {
        // Отменяемое действие: без подтверждения, вернуть можно той же кнопкой.
        const back = l.archived_at ? null : nowIso;
        store.archiveLead(l.id, back);
        store.log(t, by, back ? "lead_archive" : "lead_restore", `lead:${l.id}`, {});
        return redirect(back ? "/leads" : `/leads/${l.id}`);
      }
      if (lead[2] === "/delete") {
        if (!confirmed(form)) {
          return page(
            views.confirmPage({
              session: s,
              active: "/leads",
              eyebrow: `Заявка #${l.id}`,
              title: "Удалить заявку насовсем?",
              lines: [
                ["Тема", l.subject],
                ["Пришла", l.created_at.slice(0, 10)],
                [
                  "Что будет",
                  "Текст заявки и контакты сотрутся, вернуть нельзя. Демо-ссылки останутся без заявки.",
                ],
              ],
              action: `/leads/${l.id}/delete`,
              form,
              back: `/leads/${l.id}`,
              danger: true,
            }),
          );
        }
        store.deleteLead(l.id);
        // В журнал — только номер: удаляем как раз ради того, чтобы данных не осталось.
        store.log(t, by, "lead_delete", `lead:${l.id}`, {});
        return redirect("/leads");
      }
      if (!lead[2]) {
        const status = form.get("status");
        if (!LEAD_STATUSES.includes(status)) return notFound();
        store.setLead(l.id, status, text(form, "note", 2000) || null);
        store.log(t, by, "lead_update", `lead:${l.id}`, { статус: status });
        return redirect(`/leads/${l.id}`);
      }
      // Заявка → аккаунт: форма с подставленными данными, создаёт человек.
      // Если почта уже есть у аккаунта — просто связываем.
      const v = leadValues(l);
      const existing = v.email ? store.accountByEmail(v.email) : null;
      if (existing) {
        store.linkLead(l.id, existing.id);
        store.log(t, by, "lead_update", `lead:${l.id}`, { аккаунт: `#${existing.id}` });
        return redirect(`/accounts/${existing.id}`);
      }
      return redirect(`/accounts/new?lead=${l.id}`);
    }

    if (path === "/demos") {
      const label = text(form, "label", 80);
      const email = text(form, "email").toLowerCase();
      const days = Number(form.get("days") || cfg.demoDays);
      const error = !label
        ? "Впишите, для кого ссылка."
        : email && !EMAIL.test(email)
          ? "Почта выглядит неверно."
          : !Number.isInteger(days) || days < 1 || days > 90
            ? "Срок — от 1 до 90 дней."
            : "";
      if (error) {
        return badRequest(
          views.demosList({
            session: s,
            demos: store.demos(),
            now: nowIso,
            error,
            days: cfg.demoDays,
          }),
        );
      }
      if (!confirmed(form)) {
        return page(
          views.confirmPage({
            session: s,
            active: "/demos",
            eyebrow: "Демо-ссылки",
            title: "Выдать ссылку?",
            lines: [
              ["Для кого", label],
              ["Почта", email],
              ["Работает", `${days} дн.`],
            ],
            action: "/demos",
            form,
            back: "/demos",
          }),
        );
      }
      const id = store.addDemo({
        token: cfg.newToken(),
        email,
        label,
        createdAt: nowIso,
        expiresAt: new Date(t.getTime() + days * DAY).toISOString(),
        by,
      });
      store.log(t, by, "demo_issue", `demo:${id}`, { для: label, дней: days });
      return redirect(`/demos/${id}`);
    }
    const rv = /^\/demos\/(\d{1,10})\/revoke$/.exec(path);
    if (rv) {
      const d = store.demo(Number(rv[1]));
      if (!d) return notFound();
      if (!confirmed(form)) {
        return page(
          views.confirmPage({
            session: s,
            active: "/demos",
            eyebrow: "Демо-ссылки",
            title: "Отозвать ссылку?",
            lines: [
              ["Для кого", d.label || d.email],
              ["Что будет", "Ссылка перестанет открывать демо. История останется."],
            ],
            action: `/demos/${d.id}/revoke`,
            form,
            back: `/demos/${d.id}`,
            danger: true,
          }),
        );
      }
      store.revokeDemo(d.id, t);
      store.log(t, by, "demo_revoke", `demo:${d.id}`);
      return redirect(`/demos/${d.id}`);
    }

    if (path === "/managers") {
      const name = text(form, "name", 120);
      if (!name) return redirect("/managers");
      if (!confirmed(form)) {
        return page(
          views.confirmPage({
            session: s,
            active: "/managers",
            eyebrow: "Менеджеры",
            title: "Добавить менеджера?",
            lines: [
              ["Имя", name],
              ["Контакт", text(form, "contact")],
            ],
            action: "/managers",
            form,
            back: "/managers",
          }),
        );
      }
      const id = store.addManager({ name, contact: text(form, "contact") || null }, t);
      store.log(t, by, "manager_create", `manager:${id}`, { имя: name });
      return redirect("/managers");
    }
    const mg = /^\/managers\/(\d{1,10})$/.exec(path);
    if (mg) {
      const cur = store.manager(Number(mg[1]));
      if (!cur) return notFound();
      const next = {
        name: text(form, "name", 120) || cur.name,
        contact: text(form, "contact") || null,
        active: form.get("active") === "on",
      };
      if (!confirmed(form)) {
        return page(
          views.confirmPage({
            session: s,
            active: "/managers",
            eyebrow: "Менеджеры",
            title: "Сохранить изменения?",
            lines: [
              ["Имя", cur.name === next.name ? next.name : `${cur.name} → ${next.name}`],
              ["Контакт", next.contact ?? "—"],
              [
                "Работает",
                next.active ? "да" : `нет${cur.active ? " — с клиентами его не снимет" : ""}`,
              ],
            ],
            action: `/managers/${cur.id}`,
            form,
            back: `/managers/${cur.id}`,
            danger: cur.active && !next.active,
          }),
        );
      }
      store.updateManager(cur.id, next);
      store.log(t, by, "manager_edit", `manager:${cur.id}`, {
        имя: next.name,
        активен: next.active ? "да" : "нет",
      });
      return redirect("/managers");
    }

    if (path === "/settings/password") {
      const admin = store.adminById(by);
      const next = form.get("next") ?? "";
      const step = checkPassword(form.get("current") ?? "", admin.password_hash)
        ? totp.verify(admin.totp_secret, form.get("code") ?? "", t.getTime(), admin.totp_last)
        : null;
      const error =
        step === null
          ? "Текущий пароль или код не подошли."
          : next.length < MIN_LENGTH
            ? `Новый пароль — не короче ${MIN_LENGTH} символов.`
            : next !== form.get("next2")
              ? "Новые пароли не совпадают."
              : "";
      if (error) {
        store.log(t, by, "password_change_failed");
        return badRequest(
          views.settingsPage({
            session: s,
            admin,
            sessions: store.sessionsOf(by),
            now: nowIso,
            error,
          }),
        );
      }
      store.setTotpLast(by, step);
      store.setPassword(by, hashPassword(next));
      // Новый пароль — повод выкинуть все прочие входы.
      const closed = store.dropOtherSessions(by, s.tokenHash);
      store.log(t, by, "password_change", null, { "закрыто сессий": closed });
      return redirect("/settings?done=password");
    }
    if (path === "/settings/sessions") {
      const closed = store.dropOtherSessions(by, s.tokenHash);
      store.log(t, by, "sessions_close", null, { закрыто: closed });
      return redirect("/settings");
    }
    return notFound();
  }

  return { get, post };
}

module.exports = { createRoutes, leadFields };
