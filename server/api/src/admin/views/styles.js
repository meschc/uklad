/**
 * Стили админки — токены дизайн-системы Уклада (`src/index.css`) и шрифт
 * Medeo, повторённые здесь: сервер не собирается Vite и Tailwind не видит.
 *
 * Как у лендинга, а не как у дашборда: рамок почти нет. Меню и поле вокруг —
 * одним серым, рабочая область — белым «окном» со скруглёнными углами.
 * Внутри окна блоки разделяет воздух и заголовки, а не обводки; серая
 * плашка — только там, где надо выделить число или группу полей.
 */
/* global module */

const FONT = (file, range) =>
  `@font-face{font-family:"Medeo Sans";src:url("/fonts/${file}") format("woff2");font-weight:100 900;font-display:swap;unicode-range:${range}}`;

const CSS = `
${FONT("medeo-sans-cyrillic.woff2", "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116")}
${FONT("medeo-sans-latin.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+20BD,U+2122,U+2190-2199,U+2212,U+2215,U+FEFF,U+FFFD")}
:root{color-scheme:light;
--bg:hsl(0 0% 100%);--fg:hsl(224 12% 12%);--muted:hsl(220 9% 42%);--rail:hsl(220 14% 96%);--soft:hsl(220 14% 96%);
--hairline:hsl(224 12% 12%/.07);--hairline-strong:hsl(224 12% 12%/.16);--wash:hsl(224 12% 12%/.05);--primary:hsl(221 83% 53%);--danger:hsl(0 72% 51%);--ok:hsl(163 94% 24%);--warn:hsl(26 90% 37%);
--tag-orange:hsl(28 91% 54%);--tag-purple:hsl(305 57% 46%);--tag-green:hsl(144 100% 29%);--tag-yellow:hsl(48 98% 51%);--tag-gray:hsl(225 2% 44%);--tag-brown:hsl(30 50% 40%);--tag-lime:hsl(101 48% 51%);--tag-ink:hsl(230 10% 7%)}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;
--bg:hsl(224 13% 11%);--fg:hsl(220 14% 92%);--muted:hsl(220 9% 60%);--rail:hsl(224 14% 8%);--soft:hsl(223 12% 16%);
--hairline:hsl(220 14% 92%/.07);--hairline-strong:hsl(220 14% 92%/.2);--wash:hsl(220 14% 92%/.05);--primary:hsl(217 91% 52%);--danger:hsl(0 63% 50%);--ok:hsl(158 64% 52%);--warn:hsl(43 96% 56%)}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 "Medeo Sans",system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,h3,.stat b{text-wrap:balance}p{text-wrap:pretty}
a{color:inherit}
.i{flex:none}

/* Каркас: меню и поле — серые, рабочая область — белое окно. */
body.app{background:var(--rail);display:grid;grid-template-columns:240px minmax(0,1fr);min-height:100vh}
body.app main{background:var(--bg);margin:10px 10px 10px 0;border-radius:20px;padding:36px 44px 64px;min-height:calc(100vh - 20px);min-width:0}
body.bare{background:var(--rail)}
.side{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:24px;padding:20px 12px}
.logo{display:flex;align-items:center;gap:10px;padding:0 8px;text-decoration:none}
.logo img{border-radius:10px}.logo span{font-weight:600;font-size:19px;letter-spacing:-.03em;line-height:1.05}
.logo small{display:block;font-weight:400;font-size:12px;letter-spacing:0;color:var(--muted)}
.side nav{display:grid;gap:2px;flex:1;align-content:start;overflow:auto}
.side .group{font-size:12px;color:var(--muted);padding:16px 12px 6px}
.side nav a{display:flex;gap:10px;align-items:center;height:36px;padding:0 12px;border-radius:10px;color:var(--muted);text-decoration:none}
.side nav a span{flex:1}
.side nav a:hover{color:var(--fg);background:var(--wash)}
.side nav a.on{color:var(--fg);background:var(--bg);font-weight:500}
.side nav a.on .i{color:var(--primary)}
.side nav b{background:var(--primary);color:#fff;border-radius:999px;font-size:11px;min-width:20px;height:20px;display:grid;place-items:center;padding:0 6px;font-weight:600}

/* Заголовки: надзаголовок синим, как на лендинге. */
.head{display:flex;align-items:flex-end;gap:12px;margin-bottom:28px;flex-wrap:wrap}.head .grow{flex:1}
.eyebrow{display:block;font-size:13px;font-weight:500;color:var(--primary);margin-bottom:4px}
h1{font-size:32px;line-height:1.1;letter-spacing:-.03em;margin:0;font-weight:600}
h2{font-size:19px;letter-spacing:-.02em;margin:0 0 14px;font-weight:600}h3{font-size:15px;margin:0 0 8px;font-weight:600}
.lede{color:var(--muted);max-width:640px;margin:-16px 0 28px}
.count{color:var(--muted);font-weight:400}
.sec{margin-top:44px}.sec:first-child{margin-top:0}
.sec-head{display:flex;align-items:baseline;gap:12px;margin-bottom:12px}.sec-head h2{margin:0}.sec-head .grow{flex:1}
.back{display:inline-flex;align-items:center;gap:6px;color:var(--muted);text-decoration:none;margin-bottom:16px;font-size:14px}.back:hover{color:var(--fg)}

/* Числа: крупно, ровными столбцами. */
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:44px}
.stats+.stats{margin-top:-34px}
.stat{background:var(--soft);border-radius:16px;padding:16px 18px 18px;text-decoration:none;display:block;min-width:0}
a.stat:hover{background:var(--wash)}
.stat-l{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:13px}
.stat b{display:block;font-size:30px;line-height:1.1;letter-spacing:-.03em;font-weight:600;font-variant-numeric:tabular-nums;margin-top:10px;white-space:nowrap}
.stat b.warn{color:var(--warn)}.stat b.danger{color:var(--danger)}.stat b.ok{color:var(--ok)}.stat b.primary{color:var(--primary)}
.split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:44px;align-items:start}
.side-col{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:44px;align-items:start}

/* Таблицы без рамки: только тонкие линейки между строками. */
table{width:100%;border-collapse:collapse}
th{text-align:left;font-weight:400;color:var(--muted);font-size:13px;white-space:nowrap;padding:0 10px 8px}
td{padding:12px 10px;border-top:1px solid var(--hairline);vertical-align:top}
td a{text-decoration:none;font-weight:500}td a:hover{color:var(--primary)}
th:first-child,td:first-child{padding-left:0}th:last-child,td:last-child{padding-right:0}
.num{font-variant-numeric:tabular-nums;white-space:nowrap}.r{text-align:right}.muted{color:var(--muted)}.small{font-size:13px}
.empty{color:var(--muted);padding:24px 0;margin:0}
.who{display:flex;gap:12px;align-items:center}
.ava{width:36px;height:36px;border-radius:10px;background:var(--soft);display:grid;place-items:center;flex:none;color:var(--muted)}

/* Метки — заливкой-пилюлей, без обводки. Статусы — по роли, виды — метро. */
.badge{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:500;white-space:nowrap;background:var(--soft);color:var(--muted)}
.badge.paid,.badge.won,.badge.done{background:hsl(163 94% 24%/.12);color:var(--ok)}
.badge.trial,.badge.work,.badge.live{background:hsl(221 83% 53%/.12);color:var(--primary)}
.badge.overdue,.badge.new{background:hsl(26 90% 37%/.12);color:var(--warn)}
.badge.blocked,.badge.lost{background:hsl(0 72% 51%/.12);color:var(--danger)}
.tag{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:500;color:#fff;white-space:nowrap}
.tag.demo{background:var(--primary)}.tag.warehouse{background:var(--tag-orange);color:var(--tag-ink)}.tag.seller{background:var(--tag-purple)}.tag.contact{background:var(--tag-gray)}
.tag.site{background:var(--tag-green)}.tag.cabinet{background:var(--tag-lime);color:var(--tag-ink)}.tag.admin{background:var(--tag-brown)}.tag.lead{background:var(--tag-yellow);color:var(--tag-ink)}

/* Переключатель — как ui/segmented. */
.bar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center}
.bar form{display:flex;gap:10px;flex-wrap:wrap;align-items:center;flex:1}.bar .q{flex:1;min-width:220px}.bar select{width:auto}
.seg{display:inline-flex;background:var(--soft);border-radius:12px;padding:2px;flex-wrap:wrap}
.seg a{padding:0 12px;height:32px;display:flex;align-items:center;border-radius:10px;color:var(--muted);text-decoration:none;white-space:nowrap;font-size:14px}
.seg a.on{background:var(--bg);color:var(--fg);font-weight:500}
.seg a:not(.on):hover{color:var(--fg)}
/* Плавный переход: страницы рисует сервер, поэтому выбранная плашка «едет»
   через переход между страницами (Chrome, Safari), без скриптов. */
@view-transition{navigation:auto}
.bar .seg a.on{view-transition-name:seg-on}
::view-transition-old(root),::view-transition-new(root){animation:none}
::view-transition-group(seg-on){animation-duration:.22s;animation-timing-function:cubic-bezier(.2,0,0,1)}
@media (prefers-reduced-motion:reduce){::view-transition-group(*){animation:none}}

/* Поля: серая заливка вместо рамки. Ошибка видна, пока поле не в фокусе. */
input,select,textarea{height:40px;padding:0 12px;border:0;border-radius:10px;background:var(--soft);color:var(--fg);font:inherit;width:100%;outline:none}
textarea{height:auto;min-height:88px;padding:10px 12px;resize:vertical}
/* Список — нативный (без скриптов), но наш вид: своя стрелка, та же высота. */
select{appearance:none;background-image:url(/chevron.svg);background-repeat:no-repeat;background-position:right 12px center;background-size:16px;padding-right:36px;cursor:pointer;text-overflow:ellipsis}
/* Фокус тонкой кромкой, а не толстым кольцом; у мыши — только смена фона. */
input:focus,select:focus,textarea:focus{background-color:var(--bg);box-shadow:inset 0 0 0 1px var(--hairline-strong)}
input:focus-visible,select:focus-visible,textarea:focus-visible{box-shadow:inset 0 0 0 1.5px var(--primary)}
input:user-invalid:not(:focus){box-shadow:inset 0 0 0 1.5px var(--danger)}
input[type=checkbox]{width:18px;height:18px;accent-color:var(--primary)}
label{display:grid;gap:6px;color:var(--muted);font-size:13px}
label.check{display:flex;align-items:center;gap:10px;color:var(--fg);font-size:15px}
.form{display:grid;gap:14px;max-width:760px}.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.hint{color:var(--muted);font-size:13px;margin:0}

/* Кнопки — пилюли одной высоты, главная синяя, вторая серая. */
button,.btn{height:40px;padding:0 18px;border:0;border-radius:999px;background:var(--primary);color:#fff;font:inherit;font-weight:500;cursor:pointer;display:inline-flex;gap:8px;align-items:center;text-decoration:none;white-space:nowrap}
button:hover,.btn:hover{filter:brightness(1.06)}
.soft,button.soft{background:var(--soft);color:var(--fg)}.soft:hover{background:var(--wash);filter:none}
button.quiet{background:transparent;color:var(--muted);height:36px;padding:0 12px;width:100%;border-radius:10px}button.quiet:hover{background:var(--wash);color:var(--fg);filter:none}
button.danger,.btn.danger{background:var(--danger)}
button.danger-text{color:var(--danger)}
.sm,button.sm{height:32px;padding:0 14px;font-size:14px}
.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.actions select{width:auto}

/* Плашки: серая — группа, синяя кромка слева — то, что надо прочесть. */
.panel{background:var(--soft);border-radius:16px;padding:22px 24px}
/* Колонка блоков: между панелью, формой и разделом — один ровный отступ. */
.stack{display:grid;gap:32px;align-content:start}.stack>.sec{margin-top:0}
.panel:not(.form)>*+*{margin-top:14px}.panel:not(.form)>h2+*{margin-top:0}
.panel input,.panel select,.panel textarea{background-color:var(--bg)}
/* На серой плашке серая кнопка пропадала — даём ей белый фон. */
.panel .soft{background:var(--bg)}.panel .soft:hover{background:var(--bg);box-shadow:inset 0 0 0 1px var(--hairline-strong)}
.note{border-left:3px solid var(--primary);padding:4px 0 4px 16px;margin:0 0 28px;max-width:760px}
.note.warn{border-color:var(--warn)}
.note p{margin:4px 0 0;color:var(--muted)}
.copy{font:inherit;display:block;margin-top:10px;padding:12px 14px;background:var(--soft);border-radius:10px;word-break:break-all;user-select:all}
dl{margin:0;display:grid;grid-template-columns:170px 1fr;gap:10px 16px}dt{color:var(--muted)}dd{margin:0;word-break:break-word}
.confirm{max-width:640px;display:grid;gap:28px}
.error{color:var(--danger);margin:0}.ok{color:var(--ok);margin:0}
.feat{display:grid;grid-template-columns:1fr auto;gap:8px 14px;align-items:center}.feat select{width:auto;height:36px}
.pre{white-space:pre-wrap;font:inherit;margin:0}

/* Лента событий демо: время слева, действие справа. */
.timeline .ev{display:grid;grid-template-columns:130px 22px 1fr;gap:10px;padding:8px 0;border-top:1px solid var(--hairline);align-items:start}
.timeline .ev .i{color:var(--muted);margin-top:2px}.timeline .visit{padding:20px 0 6px;font-weight:600}
.bars{display:grid;gap:10px}.bars .b{display:grid;grid-template-columns:minmax(0,200px) 1fr 80px;gap:12px;align-items:center}
.bars .b i{display:block;height:8px;border-radius:99px;background:var(--primary)}

.login{max-width:380px;margin:14vh auto 0;display:grid;gap:16px;background:var(--bg);padding:32px;border-radius:20px}
.login .logo{padding:0;margin-bottom:8px}.login h1{font-size:24px}

/* Мелкие помощники вместо style="…": CSP админки запрещает встроенные стили,
   и такие отступы молча пропадали. */
.mt{margin-top:14px}.mb{margin-bottom:44px}.inline{display:inline}
label.check.end{align-self:end;height:40px}.stat.bare{background:none;padding:0}
.w5{width:5%}.w10{width:10%}.w15{width:15%}.w20{width:20%}.w25{width:25%}.w30{width:30%}.w35{width:35%}.w40{width:40%}.w45{width:45%}.w50{width:50%}.w55{width:55%}.w60{width:60%}.w65{width:65%}.w70{width:70%}.w75{width:75%}.w80{width:80%}.w85{width:85%}.w90{width:90%}.w95{width:95%}.w100{width:100%}

@media (max-width:1100px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.split,.side-col{grid-template-columns:1fr}}
@media (max-width:820px){body.app{grid-template-columns:1fr}.side{position:static;height:auto;padding:12px 16px;gap:12px}
.side nav{display:flex;flex-wrap:wrap}.side .group{display:none}.side nav a span{flex:none}
body.app main{margin:0 8px 8px;padding:24px 16px 48px}.row,.row3{grid-template-columns:1fr}dl{grid-template-columns:1fr}
table{display:block;overflow-x:auto}h1{font-size:26px}}
`;

module.exports = { CSS };
