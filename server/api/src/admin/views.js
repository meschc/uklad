/**
 * Все страницы админки одной точкой входа. Сами страницы — в `views/`:
 * `base` (каркас), `styles` (CSS), `icons`, `accounts` (обзор и
 * пользователи), `money` (деньги), `demos` (демо-ссылки), `audit` (журнал),
 * `other` (вход, заявки, менеджеры, настройки), `support` (обращения).
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const base = require("./views/base");
const accounts = require("./views/accounts");
const audit = require("./views/audit");
const other = require("./views/other");
const support = require("./views/support");
const invoices = require("./views/invoices");
const money = require("./views/money");
const demos = require("./views/demos");

module.exports = {
  ...accounts,
  ...other,
  ...support,
  invoicesPage: invoices.invoicesPage,
  ...money,
  ...demos,
  confirmPage: base.confirmPage,
  auditPage: audit.auditPage,
  CSS: base.CSS,
  esc: base.esc,
};
