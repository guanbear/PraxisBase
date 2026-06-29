export const SITE_OUTPUTS = [
  "dist/index.html",
  "dist/review.html",
  "dist/graph.html",
  "dist/issues.html",
  "dist/search-index.json",
  "dist/graph.json",
  "dist/graph-slices/overview.json",
  "dist/graph.jsonld",
  "dist/llms.txt",
  "dist/llms-full.txt",
  "dist/ai-readme.md",
  "dist/sitemap.xml",
  "dist/robots.txt",
  "dist/review-config.json",
  "dist/knowledge-config.json",
  "dist/style.css",
  "dist/site.js",
];

export const SITE_CSS = `:root {
  color-scheme: light dark;
  --bg: #fbfcf8;
  --ink: #17211b;
  --muted: #4a5750;
  --muted-2: #6b7872;
  --line: #d8e0da;
  --line-2: #e7ece8;
  --panel: #f7f8f5;
  --card: #ffffff;
  --soft: #e8f2ed;
  --accent: #146c5c;
  --accent-2: #8b2f58;
  --warn: #9a5a00;
  --danger: #9a2f2f;
  --info: #5a6da8;
  --radius: 10px;
  --radius-sm: 6px;
  --radius-pill: 999px;
  --shadow-sm: 0 1px 2px rgba(23, 33, 27, .05);
  --shadow-md: 0 4px 14px rgba(23, 33, 27, .08);
  --shadow-lg: 0 14px 34px rgba(23, 33, 27, .13);
  --topbar-bg: rgba(251, 252, 248, .94);
  --code-bg: #18231d;
  --code-ink: #f2f7f2;
}
[data-theme="dark"] {
  color-scheme: dark;
  --bg: #121815;
  --ink: #e7efe9;
  --muted: #9aa8a1;
  --muted-2: #7d8b85;
  --line: #2c3833;
  --line-2: #232e29;
  --panel: #171f1c;
  --card: #1b2421;
  --soft: #1f2e29;
  --accent: #3aa88f;
  --accent-2: #c66b94;
  --warn: #d6933f;
  --danger: #d66464;
  --info: #7e93c4;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, .3);
  --shadow-md: 0 4px 14px rgba(0, 0, 0, .4);
  --shadow-lg: 0 14px 34px rgba(0, 0, 0, .5);
  --topbar-bg: rgba(18, 24, 21, .9);
  --code-bg: #0d1411;
  --code-ink: #e7efe9;
}
* { box-sizing: border-box; }
body { margin: 0; color: var(--ink); background: var(--bg); font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; font-variant-numeric: tabular-nums; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 2px; border-radius: var(--radius-sm); }
button, [data-kind-filter], .kb-chip, .approval-actions button { transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease, color .16s ease; }
.action-card, .metric-link, .count-note, .process-step, .source-card, .kb-overview-card, .coverage-status-card, .review-card, .rule-card, .kb-chip { transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
[data-theme="dark"] a, [data-theme="dark"] .topnav a { color: var(--accent); }
.topbar { position: sticky; top: 0; z-index: 20; display: grid; grid-template-columns: 190px minmax(220px, 560px) auto; gap: 1rem; align-items: center; padding: .75rem 1rem; border-bottom: 1px solid var(--line); background: var(--topbar-bg); backdrop-filter: blur(12px); }
.brand { color: var(--ink); font-weight: 770; font-size: 1.04rem; }
.topnav { display: flex; justify-content: flex-end; gap: .75rem; flex-wrap: wrap; align-items: center; }
.topnav a { color: var(--muted-2); font-size: .9rem; padding: .25rem .15rem; border-radius: var(--radius-sm); }
.topnav a:hover { color: var(--accent); text-decoration: none; }
.language-switch { position: relative; display: inline-flex; align-items: center; gap: .15rem; height: 32px; border: 1px solid var(--line); border-radius: var(--radius-pill); background: var(--card); padding: 2px; box-shadow: var(--shadow-sm); }
.language-switch-icon { width: 17px; height: 17px; margin: 0 .25rem 0 .35rem; color: var(--muted); fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.language-switch button { min-width: 34px; height: 26px; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--muted); font: inherit; font-size: .78rem; font-weight: 750; cursor: pointer; }
.language-switch button[aria-pressed="true"] { background: var(--accent); color: white; box-shadow: 0 3px 10px rgba(20, 108, 92, .18); }
.language-switch button:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 2px; }
.language-select-native { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; pointer-events: none; }
.theme-switch { display: inline-flex; align-items: center; gap: .15rem; height: 32px; border: 1px solid var(--line); border-radius: var(--radius-pill); background: var(--card); padding: 2px; box-shadow: var(--shadow-sm); }
.theme-switch button { min-width: 34px; height: 26px; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--muted); font: inherit; font-size: .78rem; font-weight: 750; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: .2rem; position: relative; }
.theme-switch button[aria-pressed="true"] { background: var(--accent); color: white; box-shadow: 0 3px 10px rgba(20, 108, 92, .18); }
.theme-switch svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.search { position: relative; }
.search input { width: 100%; height: 38px; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0 2.1rem 0 .75rem; background: var(--card); color: var(--ink); transition: border-color .16s ease, box-shadow .16s ease; }
.search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(20, 108, 92, .14); outline: none; }
.search::before { content: ""; position: absolute; right: .7rem; top: 50%; width: 15px; height: 15px; transform: translateY(-50%); background: linear-gradient(var(--line), var(--line)) center/.9px 9px no-repeat, linear-gradient(var(--line), var(--line)) center/9px .9px no-repeat; border: 1.6px solid var(--line); border-radius: var(--radius-pill); box-sizing: border-box; pointer-events: none; }
.search-results { position: absolute; top: 44px; left: 0; right: 0; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--card); box-shadow: var(--shadow-lg); overflow: hidden; }
.search-results a { display: block; padding: .7rem .8rem; border-bottom: 1px solid var(--line-2); }
.search-results a:last-child { border-bottom: 0; }
.search-results a:hover, .search-results a.is-active { background: var(--soft); text-decoration: none; }
.search-results .search-empty { display: block; padding: .8rem; color: var(--muted); }
.dashboard, .graph-shell, .issues-shell, .review-shell { max-width: 1180px; margin: 0 auto; padding: 2rem 1rem 4rem; }
.hero { min-height: 190px; display: flex; align-items: end; padding: 1.7rem 1.2rem 1.8rem; margin: 0 -.3rem; border-bottom: 1px solid var(--line); border-radius: var(--radius); background: linear-gradient(135deg, rgba(20, 108, 92, .10), rgba(20, 108, 92, .01) 55%); }
[data-theme="dark"] .hero { background: linear-gradient(135deg, rgba(58, 168, 143, .14), transparent 55%); }
.eyebrow { margin: 0 0 .5rem; color: var(--accent-2); font-weight: 700; text-transform: uppercase; font-size: .78rem; }
h1 { margin: 0; font-size: clamp(2.1rem, 5vw, 4.4rem); line-height: 1; letter-spacing: 0; }
.lede { max-width: 62ch; color: var(--muted); font-size: 1.05rem; }
.metrics { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: .75rem; margin: 1rem 0; }
.metrics article, .metric-link { border: 1px solid var(--line); border-radius: var(--radius); padding: .9rem; background: var(--card); box-shadow: var(--shadow-sm); }
.metric-link { display: block; color: var(--ink); }
.metric-link:hover { text-decoration: none; border-color: var(--accent); transform: translateY(-2px); box-shadow: var(--shadow-md); }
.metrics span { display: block; color: var(--muted); font-size: .78rem; }
.metrics strong { display: block; margin-top: .35rem; font-size: 1.55rem; color: var(--ink); }
.muted { color: var(--muted); }
.section-subtitle { margin: -.3rem 0 1rem; color: var(--muted); max-width: 76ch; }
.action-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .85rem; margin: 1.25rem 0; }
.action-card { display: flex; flex-direction: column; min-height: 142px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); padding: 1rem; color: var(--ink); box-shadow: var(--shadow-sm); }
.action-card:hover { text-decoration: none; border-color: var(--accent); transform: translateY(-3px); box-shadow: var(--shadow-lg); }
.action-card span { color: var(--muted-2); font-size: .8rem; font-weight: 700; }
.action-card strong { display: block; margin: .25rem 0 .35rem; font-size: 1.9rem; line-height: 1; color: var(--ink); }
.action-card p { margin: 0; color: var(--muted); }
.action-card[data-tone="warn"] { border-top: 4px solid var(--warn); }
.action-card[data-tone="danger"] { border-top: 4px solid var(--danger); }
.action-card[data-tone="ok"] { border-top: 4px solid var(--accent); }
.action-card[data-tone="info"] { border-top: 4px solid var(--info); }
.status-strip { display: flex; gap: .55rem; flex-wrap: wrap; align-items: center; margin: 1rem 0; padding: .85rem 1rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); color: var(--muted); box-shadow: var(--shadow-sm); }
.status-strip strong { color: var(--ink); }
.status-strip .num { color: var(--accent); font-weight: 770; }
.status-strip code { color: var(--ink); }
.gitlab-writeback-panel { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(220px, .7fr) minmax(260px, .8fr); gap: .9rem; align-items: start; margin: 1rem 0 1.2rem; border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: var(--radius); background: var(--card); padding: 1rem; box-shadow: var(--shadow-sm); }
.gitlab-writeback-panel strong { display: block; margin-bottom: .25rem; font-size: 1.02rem; }
.gitlab-writeback-panel p { margin: 0; color: var(--muted); }
.gitlab-writeback-panel dl { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: .35rem .55rem; margin: 0; font-size: .86rem; }
.gitlab-writeback-panel dt { color: var(--muted); }
.gitlab-writeback-panel dd { margin: 0; overflow-wrap: anywhere; }
.gitlab-token-field { display: grid; gap: .35rem; color: var(--muted); font-size: .84rem; }
.gitlab-token-field input { height: 36px; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0 .65rem; color: var(--ink); background: var(--panel); }
.gitlab-token-actions { margin: .55rem 0 0; grid-column: 1 / -1; display: flex; gap: .45rem; flex-wrap: wrap; align-items: center; }
.compact-heading { margin-bottom: .85rem; }
.process-map { margin: 1.15rem 0; }
.process-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .65rem; }
.process-step { position: relative; display: flex; flex-direction: column; min-height: 132px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); color: var(--ink); padding: .85rem; box-shadow: var(--shadow-sm); }
.process-step:hover { text-decoration: none; border-color: var(--accent); transform: translateY(-2px); box-shadow: var(--shadow-md); }
.process-step:not(:last-child)::after { content: ""; position: absolute; right: -.48rem; top: 50%; width: .36rem; height: .36rem; border-top: 2px solid var(--line); border-right: 2px solid var(--line); transform: translateY(-50%) rotate(45deg); background: var(--bg); z-index: 1; }
.process-index { display: inline-flex; align-items: center; justify-content: center; width: 1.5rem; height: 1.5rem; border-radius: var(--radius-pill); margin-bottom: .65rem; background: var(--soft); color: var(--accent); font-weight: 800; font-size: .78rem; }
.process-label { color: var(--muted-2); font-weight: 760; font-size: .82rem; }
.process-step strong { display: block; margin: .25rem 0 .3rem; font-size: 1.7rem; line-height: 1.05; }
.process-step small { color: var(--muted); line-height: 1.35; }
.count-notes { margin: 1rem 0 1.25rem; }
.count-note-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .7rem; }
.count-note { display: block; min-height: 150px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); color: var(--ink); padding: .9rem; box-shadow: var(--shadow-sm); }
.count-note:hover { text-decoration: none; border-color: var(--accent); transform: translateY(-2px); box-shadow: var(--shadow-md); }
.count-note span { display: block; color: var(--muted-2); font-weight: 760; font-size: .82rem; }
.count-note strong { display: block; margin: .25rem 0 .45rem; font-size: 1.55rem; line-height: 1; }
.count-note p { margin: 0; color: var(--muted); line-height: 1.45; }
.terminology-panel { border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); padding: .75rem .9rem; margin: 1rem 0; box-shadow: var(--shadow-sm); }
.terminology-panel summary { cursor: pointer; color: var(--accent); font-weight: 760; }
.terminology-panel dl { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: .5rem .9rem; margin: .85rem 0 0; }
.terminology-panel dt { font-weight: 760; color: var(--ink); }
.terminology-panel dd { margin: 0; color: var(--muted); }
.kb-overview { margin: 1rem 0 1.25rem; }
.kb-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: .85rem; margin-top: .9rem; align-items: stretch; }
.kb-overview-card { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); color: var(--ink); padding: 1rem; box-shadow: var(--shadow-sm); }
.kb-overview-card:hover { text-decoration: none; border-color: var(--accent); transform: translateY(-2px); box-shadow: var(--shadow-md); }
.kb-overview-card span { display: block; color: var(--muted-2); font-weight: 700; }
.kb-overview-card strong { display: block; margin: .3rem 0; font-size: 1.7rem; line-height: 1; }
.kb-overview-card small { color: var(--muted); }
.kb-overview-card em { display: inline-flex; align-self: flex-start; margin: .5rem 0 .35rem; border: 1px solid var(--line); border-radius: var(--radius-pill); padding: .14rem .55rem; color: var(--accent); font-style: normal; font-size: .78rem; font-weight: 700; }
.kb-overview-card ul { margin: .4rem 0 0; padding-left: 1.1rem; color: var(--muted); font-size: .82rem; line-height: 1.55; }
.kb-overview-card.is-active { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(20, 108, 92, .14); }
.kb-rules { margin: 1rem 0 1.25rem; }
.rule-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .85rem; }
.rule-card { border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); padding: .95rem; box-shadow: var(--shadow-sm); }
.rule-card-head { display: flex; justify-content: space-between; gap: .8rem; align-items: baseline; border-bottom: 1px solid var(--line-2); padding-bottom: .55rem; margin-bottom: .7rem; }
.rule-card-head span { color: var(--muted); font-size: .82rem; }
.rule-card dl { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: .45rem .7rem; margin: 0; }
.rule-card dt { color: var(--muted); }
.rule-card dd { margin: 0; }
.rule-card ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .35rem; }
.rule-card li { display: flex; gap: .5rem; align-items: baseline; flex-wrap: wrap; }
.rule-card code { border: 1px solid var(--line); border-radius: var(--radius-pill); padding: .08rem .4rem; background: var(--panel); color: var(--ink); }
.data-sources { margin: 1.15rem 0; }
.source-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .85rem; }
.source-card { border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); padding: .95rem; box-shadow: var(--shadow-sm); }
.source-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: .75rem; }
.source-card-head strong { display: block; font-size: 1.02rem; }
.source-card-head span:not(.status-pill) { display: block; color: var(--muted); font-size: .84rem; margin-top: .15rem; }
.source-stats { display: flex; flex-wrap: wrap; gap: .45rem; margin: .85rem 0; }
.source-stats span { border: 1px solid var(--line); border-radius: var(--radius-pill); background: var(--panel); color: var(--muted-2); padding: .22rem .5rem; font-size: .78rem; }
.source-code-list { display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: .35rem .65rem; margin: .2rem 0 0; font-size: .86rem; }
.source-code-list dt { color: var(--muted); }
.source-code-list dd { margin: 0; overflow-wrap: anywhere; }
.source-warning { margin: .7rem 0 0; color: var(--warn); font-size: .86rem; }
.flow-guide { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .75rem; margin: 1rem 0; }
.flow-guide article { border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); padding: .85rem; box-shadow: var(--shadow-sm); }
.flow-guide strong { display: block; font-size: 1rem; }
.flow-guide span { display: inline-flex; align-items: center; justify-content: center; width: 1.55rem; height: 1.55rem; border-radius: var(--radius-pill); margin-bottom: .55rem; background: var(--soft); color: var(--accent); font-weight: 800; }
.flow-guide p { margin: .25rem 0 0; color: var(--muted); }
.overview-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(280px, .85fr); gap: 1.25rem; align-items: start; margin-top: 1.25rem; }
.panel { border: 1px solid var(--line); border-top: 3px solid var(--accent); border-radius: var(--radius); background: var(--card); padding: 1.1rem; box-shadow: var(--shadow-sm); margin: 0; }
.panel h2 { margin: 0 0 .35rem; }
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: .5rem; }
.panel-head h2 { margin: 0; }
.filters { display: flex; gap: .5rem; flex-wrap: wrap; margin: 0 0 .4rem; }
.filters button { border: 1px solid var(--line); border-radius: var(--radius-pill); background: var(--card); padding: .4rem .8rem; color: var(--muted-2); cursor: pointer; font: inherit; font-size: .84rem; font-weight: 650; }
.filters button:hover { border-color: var(--accent); color: var(--accent); }
.filters button[aria-pressed="true"], .filters button.is-active { background: var(--accent); border-color: var(--accent); color: #fff; }
.dashboard-grid, .graph-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
.dashboard-grid > div, .graph-panel, .issues-panel { border: 1px solid var(--line); border-top: 3px solid var(--accent); border-radius: var(--radius); background: var(--card); padding: 1.1rem; box-shadow: var(--shadow-sm); }
.link-list, .issue-list { list-style: none; margin: 0; padding: 0; }
.link-list li, .issue-list li { display: flex; justify-content: space-between; gap: 1rem; padding: .65rem 0; border-bottom: 1px solid var(--line-2); }
.link-list li:has(.approval-actions) { flex-wrap: wrap; align-items: center; }
.link-list li:has(.approval-actions) > a { flex: 1 1 auto; min-width: 0; }
.link-list li:has(.approval-actions) > span:not(.approval-status) { flex: 0 0 auto; }
.link-list li:has(.approval-actions) > .approval-actions { flex-basis: 100%; margin: .35rem 0 .15rem; justify-content: flex-end; }
.issue-list li { display: block; }
.link-list span, .link-list code, .issue-list small { color: var(--muted); }
.link-list a { color: var(--ink); font-weight: 600; }
.link-list a:hover { color: var(--accent); }
.experience-summaries { border: 1px solid var(--line); border-top: 3px solid var(--accent); border-radius: var(--radius); background: var(--card); margin: 1.5rem 0; padding: 1.1rem; box-shadow: var(--shadow-sm); }
.experience-list { list-style: none; margin: 0; padding: 0; display: grid; gap: .8rem; }
.experience-list li { border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); padding: .9rem; box-shadow: var(--shadow-sm); }
.experience-list p { margin: 0 0 .65rem; }
.experience-list dl { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: .25rem .7rem; margin: 0; font-size: .88rem; }
.experience-list dt { color: var(--muted); }
.experience-list dd { margin: 0; overflow-wrap: anywhere; }
.pending-candidates, .review-section { border: 1px solid var(--line); border-top: 3px solid var(--warn); border-radius: var(--radius); background: var(--card); margin: 1.5rem 0; padding: 1.1rem; box-shadow: var(--shadow-sm); }
.review-section[data-status="approved"], .review-section[data-status="promoted"] { border-top-color: var(--accent); }
.section-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: start; margin-bottom: .8rem; }
.section-heading h2 { margin: 0; }
.section-heading p { margin: .25rem 0 0; color: var(--muted); }
.section-heading strong { min-width: 46px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); padding: .4rem .7rem; text-align: center; font-size: 1.2rem; box-shadow: var(--shadow-sm); }
.command-strip { display: flex; gap: .55rem; flex-wrap: wrap; margin-top: .9rem; }
.command-strip code { border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--card); padding: .45rem .6rem; color: var(--ink); overflow-wrap: anywhere; }
.queue-summary { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: .45rem .8rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); padding: .9rem; }
.queue-summary dt { color: var(--muted); }
.queue-summary dd { margin: 0; overflow-wrap: anywhere; }
.section-lede { color: var(--muted); max-width: 860px; }
.coverage-flow { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .7rem; margin: 1rem 0; }
.coverage-flow article { display: flex; gap: .65rem; align-items: flex-start; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); padding: .8rem; min-height: 112px; box-shadow: var(--shadow-sm); }
.coverage-flow article:not(:last-child) { position: relative; }
.coverage-flow article:not(:last-child)::after { content: ""; position: absolute; right: -.55rem; top: 50%; width: .4rem; height: .4rem; border-top: 2px solid var(--line); border-right: 2px solid var(--line); transform: translateY(-50%) rotate(45deg); background: var(--bg); z-index: 1; }
.flow-index { display: inline-flex; align-items: center; justify-content: center; width: 1.55rem; height: 1.55rem; border-radius: var(--radius-pill); background: var(--soft); color: var(--accent); font-weight: 800; flex: 0 0 auto; }
.coverage-flow span:not(.flow-index) { display: block; color: var(--muted-2); font-weight: 700; }
.coverage-flow strong { display: block; font-size: 2rem; line-height: 1; margin: .25rem 0; color: var(--ink); }
.coverage-flow small { display: block; color: var(--muted); line-height: 1.35; }
.coverage-status-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .6rem; margin: 1rem 0; }
.coverage-status-card { display: block; color: var(--ink); border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: var(--radius); background: var(--card); padding: .7rem .8rem; box-shadow: var(--shadow-sm); }
.coverage-status-card:hover { text-decoration: none; border-color: var(--accent); transform: translateY(-2px); box-shadow: var(--shadow-md); }
.coverage-status-card.is-active, .metric-link.is-active { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(20, 108, 92, .14); }
.coverage-status-card span { display: block; color: var(--muted-2); font-weight: 700; }
.coverage-status-card strong { display: block; margin-top: .2rem; font-size: 1.5rem; }
.coverage-status-stable_kb { border-left-color: #10795f; }
.coverage-status-proposal, .coverage-status-wiki_evidence, .coverage-status-lesson_only { border-left-color: #5a6da8; }
.coverage-status-needs_curation { border-left-color: #9b6a00; }
.coverage-status-privacy_blocked { border-left-color: var(--danger); }
.coverage-status-low_signal_rejected, .coverage-status-raw_only { border-left-color: #7c8580; }
.kb-filter-bar { display: flex; gap: .5rem; flex-wrap: wrap; margin: .75rem 0 1rem; }
.kb-chip { display: inline-flex; align-items: center; gap: .45rem; border: 1px solid var(--line); border-radius: var(--radius-pill); background: var(--card); color: var(--ink); padding: .42rem .7rem; font: inherit; cursor: pointer; box-shadow: var(--shadow-sm); }
.kb-chip:hover { border-color: var(--accent); transform: translateY(-1px); }
.kb-chip strong { color: var(--accent); }
.kb-chip.is-active { border-color: var(--accent); background: var(--soft); }
.compact-list { margin: 0; padding-left: 1.05rem; }
.compact-list li + li { margin-top: .25rem; }
.table-scroll { overflow: auto; max-height: 70vh; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); }
.coverage-table { width: 100%; border-collapse: collapse; min-width: 860px; }
.coverage-table th, .coverage-table td { padding: .55rem .65rem; border-bottom: 1px solid var(--line-2); text-align: left; vertical-align: top; }
.coverage-table thead th { position: sticky; top: 0; background: var(--panel); color: var(--muted-2); font-size: .78rem; font-weight: 700; text-transform: uppercase; z-index: 1; }
.coverage-table tbody tr:hover { background: var(--soft); }
.coverage-table code { overflow-wrap: anywhere; }
.status-pill { display: inline-block; border: 1px solid var(--line); border-radius: var(--radius-pill); padding: .15rem .55rem; color: var(--muted-2); font-size: .76rem; font-weight: 650; background: var(--panel); }
.status-pill[data-tone="ok"] { color: var(--accent); border-color: var(--accent); }
.status-pill[data-tone="warn"] { color: var(--warn); border-color: var(--warn); }
.status-pill[data-tone="danger"] { color: var(--danger); border-color: var(--danger); }
.review-card { border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); padding: 1rem 1.1rem; scroll-margin-top: 86px; box-shadow: var(--shadow-sm); transition: box-shadow .16s ease, border-color .16s ease; }
.review-card:hover { box-shadow: var(--shadow-md); }
.review-card > p:first-child strong { font-size: 1.04rem; }
.review-card pre { max-height: 320px; overflow: auto; border-radius: var(--radius-sm); background: var(--code-bg); color: var(--code-ink); padding: .85rem; white-space: pre-wrap; }
.review-card details { margin-top: .7rem; }
.review-card summary { cursor: pointer; color: var(--accent); font-weight: 650; }
.advanced-panel { margin: 1rem 0; }
.advanced-panel > summary { cursor: pointer; color: var(--accent); font-weight: 700; padding: .55rem 0; }
.dashboard-advanced, .review-advanced { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: .35rem 0; }
.approval-actions { display: flex; gap: .45rem; flex-wrap: wrap; align-items: center; margin: .7rem 0; }
.approval-actions button { border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--card); color: var(--ink); padding: .45rem .8rem; cursor: pointer; font: inherit; font-weight: 600; }
.approval-actions button:hover { border-color: var(--accent); }
.approval-actions button:first-child { background: var(--accent); border-color: var(--accent); color: white; }
.approval-actions button:first-child:hover { filter: brightness(1.08); }
.privacy-actions button:nth-child(2) { border-color: #7c8580; color: var(--muted-2); }
.privacy-actions button:nth-child(3) { border-color: var(--warn); color: var(--warn); }
.approval-actions button:disabled { opacity: .55; cursor: wait; }
.approval-status { color: var(--muted); font-size: .85rem; }
.approval-status[data-state="ok"] { color: var(--accent); }
.approval-status[data-state="error"] { color: var(--danger); }
.approval-status[data-state="pending"] { color: var(--warn); }
.page-shell { display: grid; grid-template-columns: 230px minmax(0, 760px) 260px; gap: 1.25rem; max-width: 1280px; margin: 0 auto; padding: 1.25rem 1rem 4rem; }
.side-nav, .meta-rail { position: sticky; top: 76px; align-self: start; max-height: calc(100vh - 96px); overflow: auto; }
.side-nav a { display: block; padding: .55rem .65rem; border-radius: var(--radius-sm); color: var(--ink); }
.side-nav a:hover { background: var(--soft); text-decoration: none; }
.side-nav a[aria-current="page"] { background: var(--soft); color: var(--accent); font-weight: 700; }
.content { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 1.25rem; box-shadow: var(--shadow-sm); }
.content h1 { font-size: 2rem; line-height: 1.1; margin-bottom: 1rem; }
.content h2 { margin-top: 1.8rem; border-top: 1px solid var(--line-2); padding-top: 1rem; }
.content pre { overflow: auto; background: var(--code-bg); color: var(--code-ink); border-radius: var(--radius-sm); padding: 1rem; }
.meta-rail section { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); padding: .9rem; margin-bottom: .85rem; }
.meta-rail h2 { margin: 0 0 .55rem; font-size: .92rem; }
.meta-rail ul { margin: 0; padding-left: 1.1rem; }
.meta-rail code { overflow-wrap: anywhere; }
.meta-rail dl { display: grid; grid-template-columns: 90px 1fr; gap: .35rem .6rem; margin: 0; }
.meta-rail dt { color: var(--muted); }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .55rem; padding: 2.4rem 1rem; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: var(--radius); background: var(--panel); }
.empty-state .empty-icon { width: 42px; height: 42px; opacity: .55; color: var(--muted-2); }
.empty-state .empty-icon svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.empty-state strong { color: var(--ink); font-size: 1.02rem; }
.empty-state a { color: var(--accent); font-weight: 650; }
.review-tabs { display: flex; gap: .5rem; flex-wrap: wrap; margin: 1.25rem 0 .5rem; padding: .4rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); box-shadow: var(--shadow-sm); position: sticky; top: 64px; z-index: 15; }
.review-tabs a { display: inline-flex; align-items: center; gap: .4rem; padding: .45rem .85rem; border-radius: var(--radius-pill); color: var(--muted-2); font-weight: 650; font-size: .88rem; }
.review-tabs a:hover { background: var(--soft); color: var(--accent); text-decoration: none; }
.review-tabs a.is-active { background: var(--accent); color: #fff; }
.review-tabs .tab-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 .4rem; border-radius: var(--radius-pill); background: var(--panel); color: var(--muted); font-size: .74rem; font-weight: 750; }
.review-tabs a.is-active .tab-badge { background: rgba(255,255,255,.25); color: #fff; }
.filter-count { margin-left: auto; align-self: center; color: var(--muted); font-size: .82rem; }
.privacy-summary-card { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .75rem; margin-top: .8rem; }
.privacy-summary-card .metric { border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); padding: .85rem; box-shadow: var(--shadow-sm); }
.privacy-summary-card .metric span { display: block; color: var(--muted-2); font-size: .8rem; font-weight: 650; }
.privacy-summary-card .metric strong { display: block; margin-top: .3rem; font-size: 1.5rem; }
.graph-canvas-wrap { border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); padding: .5rem; margin: 1rem 0; box-shadow: var(--shadow-sm); overflow: hidden; }
.graph-canvas { display: block; width: 100%; height: 420px; cursor: grab; touch-action: none; }
.graph-canvas:active { cursor: grabbing; }
.graph-canvas text { font: 12px ui-sans-serif, system-ui, sans-serif; fill: var(--ink); pointer-events: none; }
.graph-viewport { transform-origin: center; transition: transform .08s ease; }
.graph-node { cursor: pointer; }
.graph-node:hover circle { stroke-width: 3.5; }
.graph-legend { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; padding: .4rem .6rem; color: var(--muted); font-size: .8rem; }
.graph-legend span { display: inline-flex; align-items: center; gap: .35rem; }
.graph-legend i { width: 12px; height: 12px; border-radius: var(--radius-pill); display: inline-block; }
.graph-legend-hint { margin-left: auto; color: var(--muted-2); font-size: .76rem; }
.kb-tree { display: grid; gap: .5rem; }
.kb-tree-group { border: 1px solid var(--line-2); border-radius: var(--radius-sm); background: var(--panel); overflow: hidden; }
.kb-tree-group > summary { cursor: pointer; padding: .6rem .85rem; font-weight: 700; color: var(--ink); list-style: none; display: flex; align-items: center; gap: .5rem; }
.kb-tree-group > summary::-webkit-details-marker { display: none; }
.kb-tree-group > summary::before { content: "▸"; color: var(--muted); font-size: .8rem; transition: transform .15s ease; }
.kb-tree-group[open] > summary::before { transform: rotate(90deg); }
.kb-tree-group > summary:hover { background: var(--soft); }
.kb-tree-group .link-list { margin: 0 .85rem .5rem; }
.tree-count { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 20px; padding: 0 .45rem; border-radius: var(--radius-pill); background: var(--soft); color: var(--accent); font-size: .76rem; font-weight: 750; }
[data-theme="dark"] .approval-actions button:first-child, [data-theme="dark"] .filters button[aria-pressed="true"], [data-theme="dark"] .filters button.is-active, [data-theme="dark"] .review-tabs a.is-active, [data-theme="dark"] .language-switch button[aria-pressed="true"], [data-theme="dark"] .theme-switch button[aria-pressed="true"] { color: #08130f; }
@media (max-width: 1200px) {
  .process-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .coverage-flow { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .flow-guide { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 768px) {
  .topbar { grid-template-columns: 1fr; gap: .55rem; }
  .topnav { justify-content: flex-start; }
  .search { order: 3; }
  .metrics, .action-grid, .gitlab-writeback-panel, .rule-grid, .source-grid, .overview-grid, .dashboard-grid, .graph-grid, .page-shell, .coverage-status-grid, .count-note-grid, .terminology-panel dl, .kb-card-grid, .flow-guide, .privacy-summary-card { grid-template-columns: 1fr; }
  .gitlab-token-actions { grid-column: auto; }
  .coverage-flow, .process-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .coverage-flow article::after, .process-step::after { display: none; }
  .hero { padding: 1.2rem .5rem 1.3rem; min-height: auto; }
  h1 { font-size: clamp(1.7rem, 7vw, 2.6rem); }
  .side-nav, .meta-rail { position: static; max-height: none; }
  .review-tabs { position: static; }
  .graph-canvas-wrap { display: none; }
}
@media (max-width: 480px) {
  .dashboard, .graph-shell, .issues-shell, .review-shell { padding: 1rem .6rem 3rem; }
  .coverage-flow, .process-grid { grid-template-columns: 1fr; }
  .action-card, .count-note { min-height: auto; }
  .metrics strong, .action-card strong, .process-step strong, .count-note strong { font-size: 1.4rem; }
}`;

export const SITE_JS = `(() => {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchResults");
  const languageSelect = document.getElementById("languageSelect");
  const languageButtons = Array.from(document.querySelectorAll("[data-language-option]"));
  const base = window.__WIKI_BASE__ || "";
  let reviewApiBase = "http://127.0.0.1:4174";
  let reviewWriteback = "local";
  let gitlabConfig = { apiBase: "", projectId: "", branch: "" };
  const reviewConfigPromise = fetch(base + "review-config.json")
    .then((res) => res.ok ? res.json() : {})
    .then((config) => {
      if (typeof config.review_api_base === "string" && config.review_api_base.trim()) {
        reviewApiBase = config.review_api_base.trim().replace(/\\/+$/, "");
      }
      if (typeof config.writeback === "string" && config.writeback.trim()) {
        reviewWriteback = config.writeback.trim();
      }
      gitlabConfig = {
        apiBase: typeof config.gitlab_api_base === "string" ? config.gitlab_api_base.trim().replace(/\\/+$/, "") : "",
        projectId: typeof config.gitlab_project_id === "string" || typeof config.gitlab_project_id === "number" ? String(config.gitlab_project_id).trim() : "",
        branch: typeof config.gitlab_branch === "string" && config.gitlab_branch.trim() ? config.gitlab_branch.trim() : "master",
      };
      return config;
    })
    .catch(() => ({}));
  const reviewEndpoint = async (path) => {
    await reviewConfigPromise;
    return reviewApiBase + path;
  };
  const currentLanguage = () => {
    const language = document.documentElement.lang || languageSelect?.value || "zh-CN";
    return language === "en" ? "en" : "zh-CN";
  };
  const gitlabTokenKey = "praxisbase.gitlab.token";
  const gitlabToken = () => localStorage.getItem(gitlabTokenKey) || "";
  const shortId = () => {
    const random = new Uint32Array(1);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(random);
    return Date.now().toString(36) + "_" + (random[0] || Math.floor(Math.random() * 1000000)).toString(36);
  };
  const gitlabConfigured = () => Boolean(gitlabConfig.apiBase && gitlabConfig.projectId && gitlabConfig.branch);
  const gitlabHeaders = () => {
    const token = gitlabToken();
    if (!token) throw new Error("missing_gitlab_token");
    return { "content-type": "application/json", "PRIVATE-TOKEN": token };
  };
  const gitlabProjectUrl = () => {
    if (!gitlabConfigured()) throw new Error("gitlab_writeback_not_configured");
    return gitlabConfig.apiBase + "/projects/" + encodeURIComponent(gitlabConfig.projectId);
  };
  const gitlabFileUrl = (path, raw) => {
    const url = gitlabProjectUrl() + "/repository/files/" + encodeURIComponent(path);
    return raw ? url + "/raw?ref=" + encodeURIComponent(gitlabConfig.branch) : url;
  };
  const gitlabJson = async (url, options) => {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof payload.message === "string" ? payload.message : response.statusText;
      throw new Error(message || "gitlab_request_failed");
    }
    return payload;
  };
  const createGitlabFile = async (path, content, message) => gitlabJson(gitlabFileUrl(path, false), {
    method: "POST",
    headers: gitlabHeaders(),
    body: JSON.stringify({ branch: gitlabConfig.branch, content, commit_message: message }),
  });
  const updateGitlabFile = async (path, content, message) => gitlabJson(gitlabFileUrl(path, false), {
    method: "PUT",
    headers: gitlabHeaders(),
    body: JSON.stringify({ branch: gitlabConfig.branch, content, commit_message: message }),
  });
  const fetchError = (response, path) => {
    const code = response.status;
    if (code === 404) { const e = new Error("not_found:" + path); e.notFound = true; return e; }
    if (code === 401 || code === 403) return new Error("token_forbidden:" + code);
    return new Error(response.statusText || ("gitlab_file_fetch_failed:" + code));
  };
  const fetchGitlabFileJson = async (path) => {
    const response = await fetch(gitlabFileUrl(path, true), { headers: { "PRIVATE-TOKEN": gitlabToken() } });
    if (!response.ok) throw fetchError(response, path);
    return response.json();
  };
  const fetchGitlabFileText = async (path) => {
    const response = await fetch(gitlabFileUrl(path, true), { headers: { "PRIVATE-TOKEN": gitlabToken() } });
    if (!response.ok) throw fetchError(response, path);
    return response.text();
  };
  const safeReleaseSummary = (value) => {
    const text = String(value || "").trim().slice(0, 1200);
    if (text.length >= 20) return text;
    return "已脱敏的隐私审批摘要：该条目保留为可复用经验，原始敏感内容未公开。";
  };
  const submitGitLabReview = async (proposalId, decision) => {
    await reviewConfigPromise;
    const now = new Date().toISOString();
    const reviewId = "review_manual_" + shortId();
    const review = {
      id: reviewId,
      protocol_version: "0.1",
      proposal_id: proposalId,
      reviewer_id: "praxisbase-gitlab-pages-ui",
      reviewer_model: "human-gitlab-pages",
      prompt_version: "manual-review-v1",
      decision,
      risk: decision === "approve" ? "low" : "medium",
      confidence: decision === "approve" ? 0.9 : 0.75,
      reasons: ["manual_" + decision],
      required_checks: [],
      created_at: now,
    };
    const path = ".praxisbase/inbox/reviews/" + reviewId + ".json";
    await createGitlabFile(path, JSON.stringify(review, null, 2) + "\\n", "Record PraxisBase review decision: " + proposalId);
    return { review_path: path, decision };
  };
  const submitGitLabPrivacy = async (container, decision) => {
    await reviewConfigPromise;
    const path = container.getAttribute("data-privacy-path");
    const exceptionId = container.getAttribute("data-privacy-id") || "privacy-item";
    if (!path) throw new Error("missing_privacy_path");
    const exception = await fetchGitlabFileJson(path);
    const details = exception.details && typeof exception.details === "object" ? exception.details : {};
    const previous = details.triage && typeof details.triage === "object" ? details.triage : {};
    const releaseSummary = safeReleaseSummary(container.getAttribute("data-privacy-release-summary") || details.redacted_summary || exception.reason);
    const triage = {
      ...previous,
      classification: decision === "auto_released" ? "needs_redaction" : previous.classification || "unclear",
      confidence: decision === "auto_released" ? 0.9 : (typeof previous.confidence === "number" ? previous.confidence : 0.75),
      rationale: "manual_privacy_" + decision,
      suggested_redactions: Array.isArray(previous.suggested_redactions) ? previous.suggested_redactions : [],
      hard_block_reasons: Array.isArray(previous.hard_block_reasons) ? previous.hard_block_reasons : [],
      decision,
      reviewer_id: "praxisbase-gitlab-pages-ui",
      triaged_at: new Date().toISOString(),
    };
    if (decision === "auto_released") {
      triage.release_summary = releaseSummary;
      triage.auto_review_policy = "human-privacy-release-v1";
    }
    const updated = { ...exception, details: { ...details, triage } };
    await updateGitlabFile(path, JSON.stringify(updated, null, 2) + "\\n", "Record PraxisBase privacy decision: " + exceptionId);
    return { exception_path: path, decision };
  };
  const archiveMarkdownFrontmatter = (raw) => {
    const now = new Date().toISOString();
    const upsert = (frontmatter, key, value) => {
      const line = key + ": " + value;
      const pattern = new RegExp("^" + key + "\\s*:.*$", "m");
      return pattern.test(frontmatter) ? frontmatter.replace(pattern, line) : frontmatter.trimEnd() + "\\n" + line;
    };
    if (raw.startsWith("---\\n")) {
      const end = raw.indexOf("\\n---", 4);
      if (end > 0) {
        let frontmatter = raw.slice(4, end);
        frontmatter = upsert(frontmatter, "status", "archived");
        frontmatter = upsert(frontmatter, "maturity", "archived");
        frontmatter = upsert(frontmatter, "revoked_at", '"' + now + '"');
        frontmatter = upsert(frontmatter, "revoked_by", "praxisbase-gitlab-pages-ui");
        const rest = raw.slice(end + 5).replace(/^\\n/, "");
        return "---\\n" + frontmatter.trimEnd() + "\\n---\\n" + rest;
      }
    }
    return "---\\nstatus: archived\\nmaturity: archived\\nrevoked_at: \\\"" + now + "\\\"\\nrevoked_by: praxisbase-gitlab-pages-ui\\n---\\n" + raw;
  };
  const submitGitLabRevoke = async (path) => {
    await reviewConfigPromise;
    const raw = await fetchGitlabFileText(path);
    await updateGitlabFile(path, archiveMarkdownFrontmatter(raw), "Revoke PraxisBase stable knowledge: " + path);
    return { path };
  };
  const approvalStatusText = (key) => {
    const useZh = currentLanguage() !== "en";
    const dictionary = {
      connected: useZh ? "审批服务已连接" : "Approval service connected",
      disconnected: useZh ? "审批服务未连接：先启动 praxisbase review serve" : "Approval service is offline: start praxisbase review serve",
      gitlabReady: useZh ? "GitLab 回写已就绪" : "GitLab writeback ready",
      gitlabMissingToken: useZh ? "GitLab 回写需要先保存 token" : "Save a GitLab token before approving",
      gitlabMissingConfig: useZh ? "GitLab 回写配置不完整" : "GitLab writeback is not fully configured",
    };
    return dictionary[key] || dictionary.disconnected;
  };
  const syncReviewServiceHealth = async () => {
    const statuses = Array.from(document.querySelectorAll("[data-review-status], [data-privacy-status], [data-revoke-status]"));
    if (statuses.length === 0) return;
    await reviewConfigPromise;
    if (reviewWriteback === "gitlab") {
      const key = !gitlabConfigured() ? "gitlabMissingConfig" : gitlabToken() ? "gitlabReady" : "gitlabMissingToken";
      statuses.forEach((status) => {
        if (status.getAttribute("data-state")) return;
        status.textContent = approvalStatusText(key);
        status.setAttribute("data-state", key === "gitlabReady" ? "ok" : "error");
      });
      return;
    }
    let ok = false;
    try {
      const response = await fetch(await reviewEndpoint("/health"));
      ok = response.ok;
    } catch {
      ok = false;
    }
    statuses.forEach((status) => {
      if (status.getAttribute("data-state")) return;
      status.textContent = approvalStatusText(ok ? "connected" : "disconnected");
      status.setAttribute("data-state", ok ? "ok" : "error");
    });
  };
  const labels = {
    en: {
      "brand": "PraxisBase Wiki",
      "nav.aria": "Wiki views",
      "nav.index": "Overview",
      "nav.review": "Approvals",
      "nav.graph": "Relationships",
      "nav.issues": "Quality",
      "language.switch": "Switch language",
      "filters.knowledgeType": "Knowledge type filters",
      "filters.all": "All",
      "dashboard.eyebrow": "Team experience knowledge hub",
      "dashboard.title": "Team Experience Base",
      "dashboard.lede": "Track collection, privacy, review, and stable knowledge across multiple knowledge bases.",
      "dashboard.metric.sources": "Sources",
      "dashboard.metric.pages": "Pages",
      "dashboard.metric.brokenLinks": "Broken links",
      "dashboard.metric.duplicates": "Duplicates",
      "dashboard.metric.orphans": "Orphans",
      "dashboard.metric.stale": "Stale",
      "dashboard.metric.quality": "Quality findings",
      "dashboard.metric.bundle": "Bundle status",
      "dashboard.knowledgePages": "Stable Knowledge",
      "dashboard.topSignatures": "Top Signatures",
      "dashboard.noSignatures": "No signatures indexed",
      "pending.title": "Pending Experience Candidates",
      "graph.eyebrow": "Knowledge relationships",
      "graph.title": "Relationships",
      "graph.lede": "Backlinks, source overlap, and related repair knowledge for agent context.",
      "graph.nodes": "Nodes",
      "graph.links": "Links",
      "issues.eyebrow": "Knowledge quality",
      "issues.title": "Quality Checks",
      "issues.lede": "Findings that should be reviewed before agents rely on this knowledge.",
      "issues.noIssues": "No quality issues found.",
      "issues.dailyPrivacy": "Daily Privacy Findings"
    },
    "zh-CN": {
      "brand": "PraxisBase 知识库",
      "nav.aria": "知识库视图",
      "nav.index": "总览",
      "nav.review": "审批",
      "nav.graph": "关系",
      "nav.issues": "质检",
      "language.switch": "切换语言",
      "filters.knowledgeType": "知识类型筛选",
      "filters.all": "全部",
      "dashboard.eyebrow": "团队经验知识中枢",
      "dashboard.title": "团队经验知识库",
      "dashboard.lede": "统一查看多个知识库的采集、隐私、审批和沉淀状态。",
      "dashboard.metric.sources": "来源",
      "dashboard.metric.pages": "页面",
      "dashboard.metric.brokenLinks": "断链",
      "dashboard.metric.duplicates": "重复",
      "dashboard.metric.orphans": "孤立项",
      "dashboard.metric.stale": "过期",
      "dashboard.metric.quality": "质量问题",
      "dashboard.metric.bundle": "包状态",
      "dashboard.knowledgePages": "稳定知识",
      "dashboard.topSignatures": "高频特征",
      "dashboard.noSignatures": "暂无特征索引",
      "pending.title": "待审核经验候选",
      "graph.eyebrow": "知识关系",
      "graph.title": "关系视图",
      "graph.lede": "面向 Agent 上下文的反向链接、来源重叠和关联修复知识。",
      "graph.nodes": "节点",
      "graph.links": "关系",
      "issues.eyebrow": "知识质检",
      "issues.title": "质量检查",
      "issues.lede": "展示会影响沉淀、引用或 Agent 使用可靠性的阻断项。",
      "issues.noIssues": "当前没有阻塞性质量问题。",
      "issues.dailyPrivacy": "Daily 隐私发现"
    }
  };
  const applyLanguage = (language) => {
    const dictionary = labels[language] || labels.en;
    document.documentElement.lang = language;
    if (input) input.setAttribute("placeholder", language === "zh-CN" ? "搜索知识" : "Search knowledge");
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      if (key && dictionary[key]) node.textContent = dictionary[key];
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
      const key = node.getAttribute("data-i18n-aria-label");
      if (key && dictionary[key]) node.setAttribute("aria-label", dictionary[key]);
    });
    languageButtons.forEach((button) => {
      button.setAttribute("aria-pressed", button.getAttribute("data-language-option") === language ? "true" : "false");
    });
  };
  if (languageSelect) {
    const storedLanguage = localStorage.getItem("praxisbase.language");
    if (storedLanguage === "zh-CN" || storedLanguage === "en") {
      languageSelect.value = storedLanguage;
      applyLanguage(storedLanguage);
    }
    languageSelect.addEventListener("change", () => {
      localStorage.setItem("praxisbase.language", languageSelect.value);
      applyLanguage(languageSelect.value);
    });
    languageButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const language = button.getAttribute("data-language-option");
        if (language !== "zh-CN" && language !== "en") return;
        languageSelect.value = language;
        localStorage.setItem("praxisbase.language", language);
        applyLanguage(language);
      });
    });
  }
  const setupGitlabTokenPanel = async () => {
    await reviewConfigPromise;
    if (reviewWriteback !== "gitlab") return;
    const panel = document.querySelector("[data-gitlab-writeback-panel]");
    if (!panel) return;
    const inputNode = panel.querySelector("[data-gitlab-token-input]");
    const status = panel.querySelector("[data-gitlab-token-status]");
    const setStatus = (text, state) => {
      if (!status) return;
      status.textContent = text;
      status.setAttribute("data-state", state);
    };
    const saved = gitlabToken();
    if (inputNode && saved) inputNode.value = saved;
    setStatus(gitlabConfigured()
      ? (saved ? approvalStatusText("gitlabReady") : approvalStatusText("gitlabMissingToken"))
      : approvalStatusText("gitlabMissingConfig"), saved && gitlabConfigured() ? "ok" : "error");
    const save = panel.querySelector("[data-gitlab-token-save]");
    const clear = panel.querySelector("[data-gitlab-token-clear]");
    const test = panel.querySelector("[data-gitlab-token-test]");
    if (save && inputNode) {
      save.addEventListener("click", () => {
        const token = String(inputNode.value || "").trim();
        if (!token) {
          localStorage.removeItem(gitlabTokenKey);
          setStatus(approvalStatusText("gitlabMissingToken"), "error");
        } else {
          localStorage.setItem(gitlabTokenKey, token);
          setStatus(gitlabConfigured() ? approvalStatusText("gitlabReady") : approvalStatusText("gitlabMissingConfig"), gitlabConfigured() ? "ok" : "error");
        }
        document.querySelectorAll("[data-review-status], [data-privacy-status], [data-revoke-status]").forEach((node) => node.removeAttribute("data-state"));
        syncReviewServiceHealth();
      });
    }
    if (clear && inputNode) {
      clear.addEventListener("click", () => {
        inputNode.value = "";
        localStorage.removeItem(gitlabTokenKey);
        setStatus(approvalStatusText("gitlabMissingToken"), "error");
        document.querySelectorAll("[data-review-status], [data-privacy-status], [data-revoke-status]").forEach((node) => node.removeAttribute("data-state"));
        syncReviewServiceHealth();
      });
    }
    if (test) {
      test.addEventListener("click", async () => {
        try {
          setStatus(currentLanguage() === "zh-CN" ? "测试中..." : "Testing...", "pending");
          await reviewConfigPromise;
          if (!gitlabConfigured()) throw new Error("gitlab_writeback_not_configured");
          await gitlabJson(gitlabProjectUrl(), { method: "GET", headers: gitlabHeaders() });
          setStatus(currentLanguage() === "zh-CN" ? "连接正常" : "Connection OK", "ok");
        } catch (error) {
          setStatus((currentLanguage() === "zh-CN" ? "连接失败：" : "Connection failed: ") + (error instanceof Error ? error.message : String(error)), "error");
        }
      });
    }
  };
  setupGitlabTokenPanel();
  const escapeText = (value) => String(value).replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
  if (input && box) {
    let docs = [];
    let indexReady = false;
    fetch(base + "search-index.json").then((res) => res.json()).then((data) => { docs = data.documents || []; indexReady = true; }).catch(() => { indexReady = true; });
    let activeIdx = -1;
    let currentMatches = [];
    const render = () => {
      const query = input.value.trim().toLowerCase();
      if (!query) { box.hidden = true; box.innerHTML = ""; activeIdx = -1; return; }
      if (!indexReady) {
        box.hidden = false;
        box.innerHTML = '<span class="search-empty">' + (currentLanguage() === "en" ? "Loading index…" : "加载索引中…") + "</span>";
        return;
      }
      currentMatches = docs.filter((doc) => [doc.title, doc.path, doc.kind, doc.text].join("\\n").toLowerCase().includes(query)).slice(0, 8);
      if (currentMatches.length === 0) {
        box.hidden = false;
        box.innerHTML = '<span class="search-empty">' + (currentLanguage() === "en" ? "No results for “" : "未找到“") + escapeText(input.value) + (currentLanguage() === "en" ? "”" : "”的结果") + "</span>";
        return;
      }
      activeIdx = 0;
      box.innerHTML = currentMatches.map((doc, i) => {
        const href = doc.href || \`\${base}pages/\${doc.slug}.html\`;
        return \`<a href="\${escapeText(href)}" data-idx="\${i}" class="\${i === activeIdx ? "is-active" : ""}"><strong>\${escapeText(doc.title)}</strong><br><small>\${escapeText(doc.path)}</small></a>\`;
      }).join("");
      box.hidden = false;
    };
    const moveActive = (delta) => {
      const links = box.querySelectorAll("a[data-idx]");
      if (links.length === 0) return;
      activeIdx = (activeIdx + delta + links.length) % links.length;
      links.forEach((node, i) => node.classList.toggle("is-active", i === activeIdx));
      links[activeIdx]?.scrollIntoView({ block: "nearest" });
    };
    input.addEventListener("input", () => { activeIdx = -1; render(); });
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") { event.preventDefault(); moveActive(1); }
      else if (event.key === "ArrowUp") { event.preventDefault(); moveActive(-1); }
      else if (event.key === "Enter") {
        const link = box.querySelector('a[data-idx="' + activeIdx + '"]');
        if (link) { event.preventDefault(); link.click(); }
      } else if (event.key === "Escape") { box.hidden = true; }
    });
    document.addEventListener("click", (event) => { if (!input.contains(event.target) && !box.contains(event.target)) box.hidden = true; });
  }
  const updateFilterCount = (selector, visibleCount) => {
    const count = document.querySelector("[data-filter-count='" + selector + "']");
    if (count) count.textContent = currentLanguage() === "en" ? visibleCount + " shown" : "显示 " + visibleCount + " 项";
  };
  document.querySelectorAll("[data-kind-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.getAttribute("data-kind-filter");
      const items = document.querySelectorAll("[data-page-kind]");
      let visible = 0;
      items.forEach((item) => {
        const show = kind === "all" || item.getAttribute("data-page-kind") === kind;
        item.hidden = !show;
        if (show) visible++;
      });
      document.querySelectorAll("[data-kind-filter]").forEach((node) => node.setAttribute("aria-pressed", node === button ? "true" : "false"));
      updateFilterCount("kind", visible);
    });
  });
  document.querySelectorAll("[data-kb-filter-link]").forEach((link) => {
    link.addEventListener("click", () => {
      const kb = link.getAttribute("data-kb-filter-link") || "all";
      document.querySelectorAll("[data-kb-filter-link]").forEach((node) => {
        node.classList.toggle("is-active", node.getAttribute("data-kb-filter-link") === kb);
      });
      document.querySelectorAll("[data-page-kb]").forEach((item) => {
        item.hidden = kb !== "all" && item.getAttribute("data-page-kb") !== kb;
      });
    });
  });
  let activeCoverageStatus = "all";
  let activeCoverageKb = "all";
  let applyCoverageFilters = () => {
    document.querySelectorAll("[data-coverage-row]").forEach((row) => {
      const status = row.getAttribute("data-coverage-status") || "raw_only";
      const kb = row.getAttribute("data-coverage-kb") || "default";
      const statusMatches = activeCoverageStatus === "all"
        || (activeCoverageStatus === "lesson_all" && Number(row.children[3]?.textContent || 0) > 0)
        || (activeCoverageStatus === "wiki_evidence_all" && Number(row.children[4]?.textContent || 0) > 0)
        || status === activeCoverageStatus;
      const kbMatches = activeCoverageKb === "all" || kb === activeCoverageKb;
      row.hidden = !(statusMatches && kbMatches);
    });
    document.querySelectorAll("[data-coverage-filter]").forEach((node) => {
      node.classList.toggle("is-active", node.getAttribute("data-coverage-filter") === activeCoverageStatus);
    });
    document.querySelectorAll("[data-coverage-kb-filter]").forEach((node) => {
      node.classList.toggle("is-active", node.getAttribute("data-coverage-kb-filter") === activeCoverageKb);
    });
  };
  document.querySelectorAll("[data-coverage-filter]").forEach((node) => {
    node.addEventListener("click", () => {
      activeCoverageStatus = node.getAttribute("data-coverage-filter") || "all";
      const details = document.getElementById("coverage-details");
      if (details && details.tagName.toLowerCase() === "details") details.setAttribute("open", "");
      applyCoverageFilters();
    });
  });
  document.querySelectorAll("[data-coverage-kb-filter]").forEach((node) => {
    node.addEventListener("click", () => {
      activeCoverageKb = node.getAttribute("data-coverage-kb-filter") || "all";
      const details = document.getElementById("coverage-details");
      if (details && details.tagName.toLowerCase() === "details") details.setAttribute("open", "");
      applyCoverageFilters();
    });
  });
  const confirmDecision = (button, status, onConfirm) => {
    if (button.getAttribute("data-confirmed") === "true") { button.removeAttribute("data-confirmed"); onConfirm(); return; }
    const decision = button.getAttribute("data-review-decision") || button.getAttribute("data-privacy-decision") || "";
    const labels = { approve: ["批准"], reject: ["拒绝"], needs_human: ["标记需修改"], auto_released: ["释放"], rejected_low_signal: ["拒绝"] };
    const verb = labels[decision] ? labels[decision][0] : decision;
    const siblings = Array.from(button.parentElement.querySelectorAll("button"));
    siblings.forEach((s) => { s.style.display = "none"; });
    const yes = document.createElement("button");
    yes.type = "button";
    yes.textContent = currentLanguage() === "en" ? "Confirm " + verb : "确认" + verb;
    yes.style.background = "var(--danger)";
    yes.style.borderColor = "var(--danger)";
    yes.style.color = "#fff";
    const no = document.createElement("button");
    no.type = "button";
    no.textContent = currentLanguage() === "en" ? "Cancel" : "取消";
    button.parentElement.append(yes, no);
    const restore = () => { yes.remove(); no.remove(); siblings.forEach((s) => { s.style.display = ""; }); };
    no.addEventListener("click", restore);
    yes.addEventListener("click", () => { restore(); button.setAttribute("data-confirmed", "true"); onConfirm(); });
  };
  document.querySelectorAll("[data-review-actions]").forEach((container) => {
    const proposalId = container.getAttribute("data-proposal-id");
    const status = container.querySelector("[data-review-status]");
    container.querySelectorAll("[data-review-decision]").forEach((button) => {
      button.addEventListener("click", () => {
        const decision = button.getAttribute("data-review-decision");
        if (!proposalId || !decision) return;
        confirmDecision(button, status, async () => {
        const buttons = Array.from(container.querySelectorAll("button"));
        buttons.forEach((item) => { item.disabled = true; });
        if (status) { status.textContent = "提交中..."; status.setAttribute("data-state", "pending"); }
        try {
          await reviewConfigPromise;
          if (reviewWriteback === "gitlab") {
            await submitGitLabReview(proposalId, decision);
            if (status) { status.textContent = decision === "approve" ? "已提交到 GitLab，等待 promote/build 生效" : "已提交审核决定到 GitLab"; status.setAttribute("data-state", "ok"); }
          } else {
            const response = await fetch(await reviewEndpoint("/review"), {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ proposal_id: proposalId, decision }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload.ok === false) throw new Error(payload.error || response.statusText);
            if (status) { status.textContent = decision === "approve" ? "已批准，运行 promote 后会进入稳定知识库" : "已记录审核决定"; status.setAttribute("data-state", "ok"); }
          }
        } catch (error) {
          buttons.forEach((item) => { item.disabled = false; });
          if (status) { status.textContent = reviewWriteback === "gitlab" ? "GitLab 提交失败：" + (error instanceof Error ? error.message : String(error)) : "审批服务未启动或请求失败"; status.setAttribute("data-state", "error"); }
        }
        });
      });
    });
  });
  document.querySelectorAll("[data-privacy-actions]").forEach((container) => {
    const exceptionId = container.getAttribute("data-privacy-id");
    const status = container.querySelector("[data-privacy-status]");
    container.querySelectorAll("[data-privacy-decision]").forEach((button) => {
      button.addEventListener("click", async () => {
        const decision = button.getAttribute("data-privacy-decision");
        if (!exceptionId || !decision) return;
        const buttons = Array.from(container.querySelectorAll("button"));
        buttons.forEach((item) => { item.disabled = true; });
        if (status) { status.textContent = "提交中..."; status.setAttribute("data-state", "pending"); }
        try {
          await reviewConfigPromise;
          if (reviewWriteback === "gitlab") {
            await submitGitLabPrivacy(container, decision);
          } else {
            const response = await fetch(await reviewEndpoint("/privacy-review"), {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ exception_id: exceptionId, decision }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload.ok === false) throw new Error(payload.error || response.statusText);
          }
          if (status) {
            status.textContent = decision === "auto_released"
              ? (reviewWriteback === "gitlab" ? "已提交到 GitLab，重跑 daily 后进入提炼链路" : "已释放，重跑 daily 后会进入提炼链路")
              : decision === "rejected_low_signal"
                ? (reviewWriteback === "gitlab" ? "已提交低信号拒绝到 GitLab" : "已按低信号拒绝，已从待处理队列隐藏")
                : (reviewWriteback === "gitlab" ? "已提交隐私决定到 GitLab" : "已记录隐私决定");
            status.setAttribute("data-state", "ok");
          }
          if (decision === "auto_released" || decision === "rejected_low_signal") {
            const card = container.closest(".review-card");
            if (card) card.hidden = true;
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          const isNotFound = msg.startsWith("not_found") || (error instanceof Error && error.notFound);
          if (isNotFound) {
            if (status) { status.textContent = currentLanguage() !== "en" ? "该条目已被处理或不存在，已从队列移除。刷新页面可看到最新队列。" : "This item was already processed or is missing; removed from the queue. Refresh to see the latest queue."; status.setAttribute("data-state", "ok"); }
            const card = container.closest(".review-card");
            if (card) card.hidden = true;
            return;
          }
          const isForbidden = msg.startsWith("token_forbidden");
          buttons.forEach((item) => { item.disabled = false; });
          if (status) {
            status.textContent = isForbidden
              ? (currentLanguage() !== "en" ? "Token 权限不足，需要 api + read_repository + write_repository 权限。" : "Token lacks permission (needs api + read_repository + write_repository).")
              : (reviewWriteback === "gitlab" ? "GitLab 提交失败：" + msg : (currentLanguage() !== "en" ? "审批服务未启动或请求失败" : "Approval service unavailable or request failed"));
            status.setAttribute("data-state", "error");
          }
        }
      });
    });
  });
  document.querySelectorAll("[data-revoke-actions]").forEach((container) => {
    const path = container.getAttribute("data-revoke-path");
    const status = container.querySelector("[data-revoke-status]");
    container.querySelectorAll("[data-revoke-decision]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!path) return;
        const buttons = Array.from(container.querySelectorAll("button"));
        buttons.forEach((item) => { item.disabled = true; });
        if (status) { status.textContent = "撤回中..."; status.setAttribute("data-state", "pending"); }
        try {
          await reviewConfigPromise;
          if (reviewWriteback === "gitlab") {
            await submitGitLabRevoke(path);
            if (status) { status.textContent = "已提交撤回到 GitLab，等待 build 后从页面消失"; status.setAttribute("data-state", "ok"); }
          } else {
            const response = await fetch(await reviewEndpoint("/revoke"), {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ path }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload.ok === false) throw new Error(payload.error || response.statusText);
            if (status) { status.textContent = "已撤回，刷新后会从稳定知识中消失"; status.setAttribute("data-state", "ok"); }
          }
          const row = container.closest("li");
          if (row) row.hidden = true;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          const isNotFound = msg.startsWith("not_found") || (error instanceof Error && error.notFound);
          if (isNotFound) {
            if (status) { status.textContent = currentLanguage() !== "en" ? "该页面已被移除，刷新后从列表消失。" : "This page was already removed; refresh to update the list."; status.setAttribute("data-state", "ok"); }
            const row = container.closest("li");
            if (row) row.hidden = true;
            return;
          }
          buttons.forEach((item) => { item.disabled = false; });
          if (status) { status.textContent = reviewWriteback === "gitlab" ? "GitLab 撤回失败：" + msg : (currentLanguage() !== "en" ? "审批服务未启动或撤回失败" : "Approval service unavailable or revoke failed"); status.setAttribute("data-state", "error"); }
        }
      });
    });
  });
  syncReviewServiceHealth();
  const themeKey = "praxisbase.theme";
  const applyTheme = () => {
    const stored = localStorage.getItem(themeKey);
    const resolved = stored === "light" || stored === "dark" ? stored : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", resolved);
    document.querySelectorAll("[data-theme-option]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-theme-option") === resolved ? "true" : "false");
    });
  };
  applyTheme();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!localStorage.getItem(themeKey)) applyTheme(); });
  document.querySelectorAll("[data-theme-option]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const theme = btn.getAttribute("data-theme-option");
      if (theme === "light" || theme === "dark") localStorage.setItem(themeKey, theme);
      applyTheme();
    });
  });
  document.querySelectorAll("[data-review-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = document.getElementById(tab.getAttribute("data-review-tab"));
      if (target) { target.scrollIntoView({ block: "start" }); }
    });
  });
  const reviewTabs = document.querySelector(".review-tabs");
  if (reviewTabs) {
    const sections = Array.from(document.querySelectorAll("[data-review-tab]")).map((tab) => document.getElementById(tab.getAttribute("data-review-tab"))).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          document.querySelectorAll("[data-review-tab]").forEach((tab) => tab.classList.toggle("is-active", tab.getAttribute("data-review-tab") === id));
        }
      });
    }, { rootMargin: "-80px 0px -60% 0px" });
    sections.forEach((section) => observer.observe(section));
  }
  const coverageRows = document.querySelectorAll("[data-coverage-row]");
  const coverageCount = document.querySelector("[data-filter-count='coverage']");
  const reportCoverageCount = () => { if (coverageCount) { const visible = Array.from(coverageRows).filter((r) => !r.hidden).length; coverageCount.textContent = currentLanguage() === "en" ? visible + " of " + coverageRows.length + " shown" : "显示 " + visible + " / " + coverageRows.length + " 项"; } };
  const origApply = applyCoverageFilters;
  if (typeof origApply === "function") { applyCoverageFilters = function () { origApply(); reportCoverageCount(); }; reportCoverageCount(); }
  const graphCanvas = document.querySelector("[data-graph-canvas]");
  const graphData = window.__WIKI_GRAPH__;
  if (graphCanvas && graphData && Array.isArray(graphData.nodes) && graphData.nodes.length > 0) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = graphCanvas;
    const w = svg.clientWidth || 1080;
    const h = 420;
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    const cssVar = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);
    const accent = cssVar("--accent", "#146c5c");
    const lineCol = cssVar("--line", "#d8e0da");
    const soft = cssVar("--soft", "#e8f2ed");
    const inkCol = cssVar("--ink", "#17211b");
    const KIND_COLORS = { known_fix: "#146c5c", procedure: "#5a6da8", note: "#9a5a00", pitfall: "#8b2f58", decision: "#10795f", memory: "#6b4fa0", other: "#7c8580" };
    const kindColor = (k) => KIND_COLORS[k] || KIND_COLORS.other;
    const nodes = graphData.nodes;
    const links = Array.isArray(graphData.links) ? graphData.links : [];
    // viewport group for zoom/pan
    const viewport = document.createElementNS(ns, "g");
    viewport.setAttribute("class", "graph-viewport");
    svg.appendChild(viewport);
    // force-directed layout (<=80 nodes), else static circle
    const useForce = nodes.length <= 80;
    const pos = {};
    const R = Math.min(w, h) / 2 - 60;
    nodes.forEach((node, i) => {
      const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      pos[node.id] = { x: w / 2 + R * Math.cos(a), y: h / 2 + R * Math.sin(a), vx: 0, vy: 0 };
    });
    if (useForce && nodes.length > 1) {
      const K_REPEL = 1400, K_SPRING = 0.05, REST = 120, KC = 0.02, DAMP = 0.85;
      for (let tick = 0; tick < 120; tick++) {
        for (let i = 0; i < nodes.length; i++) {
          const a = pos[nodes[i].id];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = pos[nodes[j].id];
            let dx = b.x - a.x, dy = b.y - a.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 0.01) { dx = (Math.random() - 0.5) * 2; dy = (Math.random() - 0.5) * 2; d2 = dx * dx + dy * dy + 0.01; }
            const f = K_REPEL / d2;
            const d = Math.sqrt(d2);
            const fx = (dx / d) * f, fy = (dy / d) * f;
            a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
          }
        }
        links.forEach((link) => {
          const a = pos[link.source] || pos[link.from];
          const b = pos[link.target] || pos[link.to];
          if (!a || !b) return;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const f = K_SPRING * (d - REST);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        });
        nodes.forEach((node) => {
          const p = pos[node.id];
          p.vx = (p.vx + (w / 2 - p.x) * KC) * DAMP;
          p.vy = (p.vy + (h / 2 - p.y) * KC) * DAMP;
          p.x += p.vx; p.y += p.vy;
          p.x = Math.max(40, Math.min(w - 40, p.x));
          p.y = Math.max(30, Math.min(h - 30, p.y));
        });
      }
    }
    // draw links
    const linksLayer = document.createElementNS(ns, "g");
    linksLayer.setAttribute("class", "graph-links");
    viewport.appendChild(linksLayer);
    links.forEach((link) => {
      const from = pos[link.source] || pos[link.from];
      const to = pos[link.target] || pos[link.to];
      if (!from || !to) return;
      const l = document.createElementNS(ns, "line");
      l.setAttribute("x1", from.x); l.setAttribute("y1", from.y);
      l.setAttribute("x2", to.x); l.setAttribute("y2", to.y);
      l.setAttribute("stroke", lineCol); l.setAttribute("stroke-width", "1.5");
      linksLayer.appendChild(l);
    });
    // draw nodes (interactive)
    const nodesLayer = document.createElementNS(ns, "g");
    nodesLayer.setAttribute("class", "graph-nodes");
    viewport.appendChild(nodesLayer);
    const baseHref = (window.__WIKI_BASE__ || "");
    nodes.forEach((node) => {
      const p = pos[node.id];
      if (!p) return;
      const g = document.createElementNS(ns, "g");
      g.setAttribute("class", "graph-node");
      g.setAttribute("data-slug", node.slug || node.id);
      g.setAttribute("transform", "translate(" + p.x + "," + p.y + ")");
      const title = document.createElementNS(ns, "title");
      title.textContent = (node.title || node.id || "") + " · " + (node.kind || "note");
      g.appendChild(title);
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("r", 8); c.setAttribute("fill", kindColor(node.kind)); c.setAttribute("fill-opacity", "0.22");
      c.setAttribute("stroke", kindColor(node.kind)); c.setAttribute("stroke-width", "2");
      g.appendChild(c);
      const t = document.createElementNS(ns, "text");
      t.setAttribute("y", -14); t.setAttribute("text-anchor", "middle");
      t.setAttribute("fill", inkCol);
      t.textContent = (node.title || node.id || "").slice(0, 22);
      g.appendChild(t);
      // click → navigate (only if not dragged)
      let downX = 0, downY = 0, moved = false;
      g.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; moved = false; g.setPointerCapture(e.pointerId); });
      g.addEventListener("pointermove", (e) => {
        if (e.buttons !== 1) return;
        if (Math.abs(e.clientX - downX) > 4 || Math.abs(e.clientY - downY) > 4) moved = true;
        if (!moved) return;
        const pt = svgPoint(svg, e.clientX, e.clientY);
        p.x = Math.max(40, Math.min(w - 40, pt.x)); p.y = Math.max(30, Math.min(h - 30, pt.y));
        g.setAttribute("transform", "translate(" + p.x + "," + p.y + ")");
        // update incident links
        links.forEach((link) => {
          const lid = link.source || link.from, rid = link.target || link.to;
          if (lid !== node.id && rid !== node.id) return;
          const lnk = linksLayer.querySelector('[data-link="' + lid + '|' + rid + '"]') || linksLayer.querySelector('line');
        });
        redrawLinks();
      });
      g.addEventListener("pointerup", () => {
        if (!moved) {
          const href = baseHref + "pages/" + (node.slug || node.id) + ".html";
          window.location.href = href;
        }
      });
      nodesLayer.appendChild(g);
    });
    function redrawLinks() {
      Array.from(linksLayer.children).forEach((child, i) => {
        const link = links[i];
        if (!link) return;
        const from = pos[link.source] || pos[link.from];
        const to = pos[link.target] || pos[link.to];
        if (!from || !to) return;
        child.setAttribute("x1", from.x); child.setAttribute("y1", from.y);
        child.setAttribute("x2", to.x); child.setAttribute("y2", to.y);
      });
    }
    function svgPoint(svgEl, clientX, clientY) {
      const pt = svgEl.createSVGPoint();
      pt.x = clientX; pt.y = clientY;
      return pt.matrixTransform(svgEl.getScreenCTM().inverse());
    }
    // zoom (wheel) + pan (drag on background)
    let scale = 1, panX = 0, panY = 0;
    const applyTransform = () => { viewport.setAttribute("transform", "translate(" + panX + "," + panY + ") scale(" + scale + ")"); };
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.1 : 0.9;
      scale = Math.max(0.5, Math.min(2.5, scale * delta));
      applyTransform();
    }, { passive: false });
    let panning = false, panStart = { x: 0, y: 0 };
    svg.addEventListener("pointerdown", (e) => {
      if (e.target === svg || e.target === viewport) { panning = true; panStart = { x: e.clientX - panX, y: e.clientY - panY }; svg.setPointerCapture(e.pointerId); }
    });
    svg.addEventListener("pointermove", (e) => { if (panning) { panX = e.clientX - panStart.x; panY = e.clientY - panStart.y; applyTransform(); } });
    svg.addEventListener("pointerup", () => { panning = false; });
    // legend: extend with per-kind chips (handled server-side in renderGraphPage)
  }
  window.addEventListener("keydown", (event) => {
    if (input && ((event.key === "/" && document.activeElement !== input) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"))) {
      event.preventDefault();
      input.focus();
    }
  });
})();`;
