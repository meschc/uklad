/**
 * Все страницы админки одной точкой входа. Сами страницы — в `views/`:
 * `base` (каркас и стили), `accounts` (обзор и пользователи), `audit`
 * (журнал), `other` (вход, заявки, демо-ссылки, менеджеры, настройки), `support`
 * (обращения из кабинета).
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const base = require("./views/base");
const accounts = require("./views/accounts");
const audit = require("./views/audit");
const other = require("./views/other");
const support = require("./views/support");

module.exports = {
  ...accounts,
  ...other,
  ...support,
  auditPage: audit.auditPage,
  CSS: base.CSS,
  esc: base.esc,
};
