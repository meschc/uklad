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

function accountRows(store, nowIso) {
  const managers = new Map(store.managers().map((m) => [m.id, m]));
  return store.allAccounts().map((a) => ({
    ...a,
    state: plans.billingState(a, nowIso),
    manager: managers.get(a.manager_id) ?? null,
  }));
}

function createRoutes({ store, cfg }) {
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
      audit: store.auditOf(`account:${a.id}`),
      now: nowIso,
      ...extra,
    });
  }

  async function get({ path, url, s, t, page, notFound, download }) {
    const nowIso = t.toISOString();

    if (path === "/") {
      const rows = accountRows(store, nowIso);
      const soon = new Date(t.getTime() + 14 * DAY).toISOString();
      return page(
        views.dashboard({
          session: s,
          rows,
          trialsEnding: rows.filter((a) => a.state === "trial" && a.trial_until < soon),
          paidEnding: rows.filter((a) => a.state === "paid" && a.paid_until < soon),
          overdue: rows.filter((a) => a.state === "overdue"),
          newLeads: store.countNewLeads(),
          revenue30: store.paymentsSince(new Date(t.getTime() - 30 * DAY).toISOString()),
          recent: store.audit(10),
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

    if (path === "/accounts/new") {
      return page(views.accountNew({ session: s, values: {} }));
    }

    const acc = /^\/accounts\/(\d{1,10})$/.exec(path);
    if (acc) {
      const a = store.account(Number(acc[1]));
      return a ? page(accountPage(s, a, nowIso)) : notFound();
    }

    if (path === "/leads") {
      const status = LEAD_STATUSES.includes(url.searchParams.get("status"))
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

    if (path === "/demos") {
      return page(views.demosList({ session: s, demos: store.demos(), now: nowIso }));
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
          views.accountNew({ session: s, values: Object.fromEntries(form), error: p.error }),
        );
      }
      const tariff = Object.keys(plans.PLANS).includes(form.get("tariff"))
        ? form.get("tariff")
        : "start";
      const trial = form.get("trial") === "on";
      const id = store.addAccount(
        {
          ...p.patch,
          tariff,
          price: plans.PLANS[tariff].price,
          trial_until: trial ? plans.addMonths(nowIso, plans.TRIAL_MONTHS) : null,
        },
        t,
      );
      store.log(t, by, "account_create", `account:${id}`, {
        тип: p.patch.kind,
        почта: p.patch.email,
        тариф: plans.PLANS[tariff].title,
        пробный: trial ? `${plans.TRIAL_MONTHS} мес.` : "нет",
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

    const lead = /^\/leads\/(\d{1,10})(\/convert)?$/.exec(path);
    if (lead) {
      const l = store.lead(Number(lead[1]));
      if (!l) return notFound();
      if (!lead[2]) {
        const status = form.get("status");
        if (!LEAD_STATUSES.includes(status)) return notFound();
        store.setLead(l.id, status, text(form, "note", 2000) || null);
        store.log(t, by, "lead_update", `lead:${l.id}`, { статус: status });
        return redirect(`/leads/${l.id}`);
      }
      // Заявка → аккаунт: подставляем, что нашли в письме, остальное правится потом.
      const f = leadFields(l);
      const email = (Object.values(f).find((v) => EMAIL.test(v)) ?? "").toLowerCase();
      if (!email) return redirect(`/accounts/new`);
      const existing = store.accountByEmail(email);
      if (existing) {
        store.linkLead(l.id, existing.id);
        store.log(t, by, "lead_update", `lead:${l.id}`, { аккаунт: `#${existing.id}` });
        return redirect(`/accounts/${existing.id}`);
      }
      const name = f["Склад"] || f["Компания"] || f["Имя"] || email;
      const id = store.addAccount(
        {
          kind: l.kind === "seller" ? "seller" : "warehouse",
          name: name.slice(0, 120),
          email,
          contact_name: f["Имя"] ?? null,
          phone: Object.values(f).find((v) => /^\+?[\d\s()-]{7,}$/.test(v)) ?? null,
          tariff: "start",
          price: plans.PLANS.start.price,
          trial_until: plans.addMonths(nowIso, plans.TRIAL_MONTHS),
        },
        t,
      );
      store.linkLead(l.id, id);
      store.log(t, by, "account_create", `account:${id}`, {
        "из заявки": `#${l.id}`,
        почта: email,
      });
      return redirect(`/accounts/${id}`);
    }

    if (path === "/managers") {
      const name = text(form, "name", 120);
      if (!name) return redirect("/managers");
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
