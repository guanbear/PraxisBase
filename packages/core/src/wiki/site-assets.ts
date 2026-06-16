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
  "dist/style.css",
  "dist/site.js",
];

export const SITE_CSS = `:root {
  color-scheme: light;
  --ink: #17211b;
  --muted: #5f6d66;
  --line: #d8e0da;
  --panel: #f7f8f5;
  --accent: #146c5c;
  --accent-2: #8b2f58;
  --warn: #9a5a00;
}
* { box-sizing: border-box; }
body { margin: 0; color: var(--ink); background: #fbfcf8; font: 15px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.topbar { position: sticky; top: 0; z-index: 10; display: grid; grid-template-columns: 180px minmax(220px, 560px) auto; gap: 1rem; align-items: center; padding: .75rem 1rem; border-bottom: 1px solid var(--line); background: rgba(251, 252, 248, .96); }
.brand { color: var(--ink); font-weight: 750; }
.topnav { display: flex; justify-content: flex-end; gap: .75rem; flex-wrap: wrap; align-items: center; }
.topnav a { color: var(--muted); font-size: .9rem; }
.language-switch { position: relative; display: inline-flex; align-items: center; gap: .15rem; height: 32px; border: 1px solid var(--line); border-radius: 999px; background: white; padding: 2px; box-shadow: 0 6px 18px rgba(23, 33, 27, .06); }
.language-switch-icon { width: 17px; height: 17px; margin: 0 .25rem 0 .35rem; color: var(--muted); fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.language-switch button { min-width: 34px; height: 26px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: .78rem; font-weight: 750; cursor: pointer; }
.language-switch button[aria-pressed="true"] { background: var(--accent); color: white; box-shadow: 0 3px 10px rgba(20, 108, 92, .18); }
.language-switch button:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 2px; }
.language-select-native { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; pointer-events: none; }
.search { position: relative; }
.search input { width: 100%; height: 38px; border: 1px solid var(--line); border-radius: 6px; padding: 0 .75rem; background: white; color: var(--ink); }
.search-results { position: absolute; top: 42px; left: 0; right: 0; border: 1px solid var(--line); border-radius: 6px; background: white; box-shadow: 0 12px 28px rgba(23, 33, 27, .12); overflow: hidden; }
.search-results a { display: block; padding: .7rem .8rem; border-bottom: 1px solid var(--line); }
.dashboard, .graph-shell, .issues-shell, .review-shell { max-width: 1180px; margin: 0 auto; padding: 2rem 1rem 4rem; }
.hero { min-height: 220px; display: flex; align-items: end; padding: 2rem 0; border-bottom: 1px solid var(--line); }
.eyebrow { margin: 0 0 .5rem; color: var(--accent-2); font-weight: 700; text-transform: uppercase; font-size: .78rem; }
h1 { margin: 0; font-size: clamp(2.2rem, 6vw, 5.2rem); line-height: .96; letter-spacing: 0; }
.lede { max-width: 62ch; color: var(--muted); font-size: 1.05rem; }
.metrics { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: .75rem; margin: 1.25rem 0; }
.metrics article, .metric-link { border: 1px solid var(--line); border-radius: 8px; padding: .85rem; background: white; }
.metric-link { display: block; color: var(--ink); }
.metric-link:hover { text-decoration: none; border-color: var(--accent); }
.metrics span { display: block; color: var(--muted); font-size: .78rem; }
.metrics strong { display: block; margin-top: .3rem; font-size: 1.45rem; }
.filters { display: flex; gap: .5rem; flex-wrap: wrap; margin: 1rem 0; }
.filters button { border: 1px solid var(--line); border-radius: 6px; background: white; padding: .45rem .7rem; color: var(--ink); cursor: pointer; }
.dashboard-grid, .graph-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
.dashboard-grid > div, .graph-panel, .issues-panel { border-top: 3px solid var(--accent); padding-top: .8rem; }
.link-list, .issue-list { list-style: none; margin: 0; padding: 0; }
.link-list li, .issue-list li { display: flex; justify-content: space-between; gap: 1rem; padding: .65rem 0; border-bottom: 1px solid var(--line); }
.issue-list li { display: block; }
.link-list span, .link-list code, .issue-list small { color: var(--muted); }
.experience-summaries { border-top: 3px solid var(--accent); margin: 1.5rem 0; padding-top: .85rem; }
.experience-list { list-style: none; margin: 0; padding: 0; display: grid; gap: .8rem; }
.experience-list li { border: 1px solid var(--line); border-radius: 8px; background: white; padding: .9rem; }
.experience-list p { margin: 0 0 .65rem; }
.experience-list dl { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: .25rem .7rem; margin: 0; font-size: .88rem; }
.experience-list dt { color: var(--muted); }
.experience-list dd { margin: 0; overflow-wrap: anywhere; }
.pending-candidates, .review-section { border-top: 3px solid var(--warn); margin: 1.5rem 0; padding-top: .85rem; }
.review-section[data-status="approved"], .review-section[data-status="promoted"] { border-top-color: var(--accent); }
.section-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: start; margin-bottom: .8rem; }
.section-heading h2 { margin: 0; }
.section-heading p { margin: .25rem 0 0; color: var(--muted); }
.section-heading strong { min-width: 42px; border: 1px solid var(--line); border-radius: 8px; background: white; padding: .35rem .6rem; text-align: center; font-size: 1.15rem; }
.command-strip { display: flex; gap: .55rem; flex-wrap: wrap; margin-top: .9rem; }
.command-strip code { border: 1px solid var(--line); border-radius: 6px; background: white; padding: .45rem .6rem; color: var(--ink); overflow-wrap: anywhere; }
.queue-summary { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: .45rem .8rem; border: 1px solid var(--line); border-radius: 8px; background: white; padding: .9rem; }
.queue-summary dt { color: var(--muted); }
.queue-summary dd { margin: 0; overflow-wrap: anywhere; }
.section-lede { color: var(--muted); max-width: 860px; }
.coverage-flow { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .7rem; margin: 1rem 0; }
.coverage-flow article { display: flex; gap: .65rem; align-items: flex-start; border: 1px solid var(--line); border-radius: 8px; background: white; padding: .8rem; min-height: 112px; }
.coverage-flow article:not(:last-child) { position: relative; }
.coverage-flow article:not(:last-child)::after { content: ""; position: absolute; right: -.55rem; top: 50%; width: .4rem; height: .4rem; border-top: 2px solid var(--line); border-right: 2px solid var(--line); transform: translateY(-50%) rotate(45deg); background: var(--bg); }
.flow-index { display: inline-flex; align-items: center; justify-content: center; width: 1.55rem; height: 1.55rem; border-radius: 999px; background: #e8f2ed; color: var(--accent); font-weight: 800; flex: 0 0 auto; }
.coverage-flow span:not(.flow-index) { display: block; color: var(--muted); font-weight: 700; }
.coverage-flow strong { display: block; font-size: 2rem; line-height: 1; margin: .25rem 0; color: var(--ink); }
.coverage-flow small { display: block; color: var(--muted); line-height: 1.35; }
.coverage-status-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .6rem; margin: 1rem 0; }
.coverage-status-card { display: block; color: var(--ink); border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: 8px; background: white; padding: .7rem .8rem; }
.coverage-status-card:hover { text-decoration: none; border-color: var(--accent); box-shadow: 0 8px 20px rgba(23, 33, 27, .08); }
.coverage-status-card.is-active, .metric-link.is-active { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(20, 108, 92, .12); }
.coverage-status-card span { display: block; color: var(--muted); font-weight: 700; }
.coverage-status-card strong { display: block; margin-top: .2rem; font-size: 1.45rem; }
.coverage-status-stable_kb { border-left-color: #10795f; }
.coverage-status-proposal, .coverage-status-wiki_evidence, .coverage-status-lesson_only { border-left-color: #5a6da8; }
.coverage-status-needs_curation { border-left-color: #9b6a00; }
.coverage-status-privacy_blocked { border-left-color: #9a2f2f; }
.coverage-status-low_signal_rejected, .coverage-status-raw_only { border-left-color: #7c8580; }
.kb-filter-bar { display: flex; gap: .5rem; flex-wrap: wrap; margin: .75rem 0 1rem; }
.kb-chip { display: inline-flex; align-items: center; gap: .45rem; border: 1px solid var(--line); border-radius: 999px; background: white; color: var(--ink); padding: .42rem .65rem; font: inherit; cursor: pointer; }
.kb-chip strong { color: var(--accent); }
.kb-chip.is-active { border-color: var(--accent); background: #e8f2ed; }
.compact-list { margin: 0; padding-left: 1.05rem; }
.compact-list li + li { margin-top: .25rem; }
.table-scroll { overflow: auto; border: 1px solid var(--line); border-radius: 8px; background: white; }
.coverage-table { width: 100%; border-collapse: collapse; min-width: 860px; }
.coverage-table th, .coverage-table td { padding: .55rem .65rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.coverage-table th { color: var(--muted); font-size: .78rem; font-weight: 700; text-transform: uppercase; }
.coverage-table code { overflow-wrap: anywhere; }
.status-pill { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: .15rem .5rem; color: var(--muted); font-size: .78rem; }
.review-card pre { max-height: 320px; overflow: auto; border-radius: 6px; background: #18231d; color: #f2f7f2; padding: .85rem; white-space: pre-wrap; }
.review-card details { margin-top: .7rem; }
.review-card summary { cursor: pointer; color: var(--accent); font-weight: 650; }
.advanced-panel { margin: 1rem 0; }
.advanced-panel > summary { cursor: pointer; color: var(--accent); font-weight: 700; padding: .55rem 0; }
.dashboard-advanced, .review-advanced { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: .35rem 0; }
.approval-actions { display: flex; gap: .45rem; flex-wrap: wrap; align-items: center; margin: .7rem 0; }
.approval-actions button { border: 1px solid var(--line); border-radius: 6px; background: white; color: var(--ink); padding: .42rem .65rem; cursor: pointer; font: inherit; }
.approval-actions button:first-child { background: var(--accent); border-color: var(--accent); color: white; }
.privacy-actions button:nth-child(2) { border-color: #7c8580; color: #44504a; }
.privacy-actions button:nth-child(3) { border-color: #9a5a00; color: #7a4700; }
.approval-actions button:disabled { opacity: .55; cursor: wait; }
.approval-status { color: var(--muted); font-size: .85rem; }
.approval-status[data-state="ok"] { color: var(--accent); }
.approval-status[data-state="error"] { color: #9a2f2f; }
.page-shell { display: grid; grid-template-columns: 230px minmax(0, 760px) 260px; gap: 1.25rem; max-width: 1280px; margin: 0 auto; padding: 1.25rem 1rem 4rem; }
.side-nav, .meta-rail { position: sticky; top: 68px; align-self: start; max-height: calc(100vh - 88px); overflow: auto; }
.side-nav a { display: block; padding: .55rem .65rem; border-radius: 6px; color: var(--ink); }
.side-nav a[aria-current="page"] { background: #e8f2ed; color: var(--accent); font-weight: 700; }
.content { background: white; border: 1px solid var(--line); border-radius: 8px; padding: 1.25rem; }
.content h1 { font-size: 2rem; line-height: 1.1; margin-bottom: 1rem; }
.content h2 { margin-top: 1.8rem; border-top: 1px solid var(--line); padding-top: 1rem; }
.content pre { overflow: auto; background: #18231d; color: #f2f7f2; border-radius: 6px; padding: 1rem; }
.meta-rail section { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: .9rem; margin-bottom: .85rem; }
.meta-rail h2 { margin: 0 0 .55rem; font-size: .92rem; }
.meta-rail ul { margin: 0; padding-left: 1.1rem; }
.meta-rail code { overflow-wrap: anywhere; }
.meta-rail dl { display: grid; grid-template-columns: 90px 1fr; gap: .35rem .6rem; margin: 0; }
.meta-rail dt { color: var(--muted); }
@media (max-width: 900px) {
  .topbar, .metrics, .dashboard-grid, .graph-grid, .page-shell, .coverage-flow, .coverage-status-grid { grid-template-columns: 1fr; }
  .coverage-flow article::after { display: none; }
  .topnav { justify-content: flex-start; }
  .side-nav, .meta-rail { position: static; max-height: none; }
}`;

export const SITE_JS = `(() => {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchResults");
  const languageSelect = document.getElementById("languageSelect");
  const languageButtons = Array.from(document.querySelectorAll("[data-language-option]"));
  const base = window.__WIKI_BASE__ || "";
  const labels = {
    en: {
      "brand": "PraxisBase Wiki",
      "nav.aria": "Wiki views",
      "nav.index": "Index",
      "nav.review": "Review",
      "nav.graph": "Graph",
      "nav.issues": "Issues",
      "language.switch": "Switch language",
      "filters.knowledgeType": "Knowledge type filters",
      "filters.all": "All",
      "dashboard.eyebrow": "Agent-ready knowledge base",
      "dashboard.title": "Knowledge Health",
      "dashboard.lede": "Reviewed fixes, skills, provenance, and graph context for repair workflows.",
      "dashboard.metric.sources": "Sources",
      "dashboard.metric.pages": "Pages",
      "dashboard.metric.brokenLinks": "Broken links",
      "dashboard.metric.duplicates": "Duplicates",
      "dashboard.metric.orphans": "Orphans",
      "dashboard.metric.stale": "Stale",
      "dashboard.metric.quality": "Quality findings",
      "dashboard.metric.bundle": "Bundle status",
      "dashboard.knowledgePages": "Knowledge Pages",
      "dashboard.topSignatures": "Top Signatures",
      "dashboard.noSignatures": "No signatures indexed",
      "pending.title": "Pending Experience Candidates",
      "graph.eyebrow": "Knowledge graph",
      "graph.title": "Graph",
      "graph.lede": "Backlinks, source overlap, and related repair knowledge for agent context.",
      "graph.nodes": "Nodes",
      "graph.links": "Links",
      "issues.eyebrow": "Wiki quality",
      "issues.title": "Quality Issues",
      "issues.lede": "Findings that should be reviewed before agents rely on this knowledge.",
      "issues.noIssues": "No quality issues found.",
      "issues.dailyPrivacy": "Daily Privacy Findings"
    },
    "zh-CN": {
      "brand": "PraxisBase 知识库",
      "nav.aria": "知识库视图",
      "nav.index": "索引",
      "nav.review": "审核",
      "nav.graph": "图谱",
      "nav.issues": "问题",
      "language.switch": "切换语言",
      "filters.knowledgeType": "知识类型筛选",
      "filters.all": "全部",
      "dashboard.eyebrow": "面向 Agent 的知识库",
      "dashboard.title": "知识库健康",
      "dashboard.lede": "已审核的修复、技能、溯源和图谱上下文，服务机器人修复工作流。",
      "dashboard.metric.sources": "来源",
      "dashboard.metric.pages": "页面",
      "dashboard.metric.brokenLinks": "断链",
      "dashboard.metric.duplicates": "重复",
      "dashboard.metric.orphans": "孤立项",
      "dashboard.metric.stale": "过期",
      "dashboard.metric.quality": "质量问题",
      "dashboard.metric.bundle": "包状态",
      "dashboard.knowledgePages": "知识页",
      "dashboard.topSignatures": "高频特征",
      "dashboard.noSignatures": "暂无特征索引",
      "pending.title": "待审核经验候选",
      "graph.eyebrow": "知识图谱",
      "graph.title": "图谱",
      "graph.lede": "面向 Agent 上下文的反向链接、来源重叠和关联修复知识。",
      "graph.nodes": "节点",
      "graph.links": "关系",
      "issues.eyebrow": "Wiki 质量",
      "issues.title": "质量问题",
      "issues.lede": "Agent 依赖这些知识前应先处理的发现。",
      "issues.noIssues": "未发现质量问题。",
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
  if (!input || !box) return;
  let docs = [];
  fetch(base + "search-index.json").then((res) => res.json()).then((data) => { docs = data.documents || []; }).catch(() => {});
  const render = () => {
    const query = input.value.trim().toLowerCase();
    if (!query) { box.hidden = true; box.innerHTML = ""; return; }
    const matches = docs.filter((doc) => [doc.title, doc.path, doc.kind, doc.text].join("\\n").toLowerCase().includes(query)).slice(0, 8);
    box.innerHTML = matches.map((doc) => {
      const href = doc.href || \`\${base}pages/\${doc.slug}.html\`;
      return \`<a href="\${escapeText(href)}"><strong>\${escapeText(doc.title)}</strong><br><small>\${escapeText(doc.path)}</small></a>\`;
    }).join("");
    box.hidden = matches.length === 0;
  };
  const escapeText = (value) => String(value).replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
  input.addEventListener("input", render);
  document.querySelectorAll("[data-kind-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.getAttribute("data-kind-filter");
      document.querySelectorAll("[data-page-kind]").forEach((item) => {
        item.hidden = kind !== "all" && item.getAttribute("data-page-kind") !== kind;
      });
    });
  });
  let activeCoverageStatus = "all";
  let activeCoverageKb = "all";
  const applyCoverageFilters = () => {
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
  document.querySelectorAll("[data-review-actions]").forEach((container) => {
    const proposalId = container.getAttribute("data-proposal-id");
    const status = container.querySelector("[data-review-status]");
    container.querySelectorAll("[data-review-decision]").forEach((button) => {
      button.addEventListener("click", async () => {
        const decision = button.getAttribute("data-review-decision");
        if (!proposalId || !decision) return;
        const buttons = Array.from(container.querySelectorAll("button"));
        buttons.forEach((item) => { item.disabled = true; });
        if (status) { status.textContent = "提交中..."; status.setAttribute("data-state", "pending"); }
        try {
          const response = await fetch("http://127.0.0.1:4174/review", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ proposal_id: proposalId, decision }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.ok === false) throw new Error(payload.error || response.statusText);
          if (status) { status.textContent = decision === "approve" ? "已批准，运行 promote 后会进入稳定知识库" : "已记录审核决定"; status.setAttribute("data-state", "ok"); }
        } catch (error) {
          buttons.forEach((item) => { item.disabled = false; });
          if (status) { status.textContent = "审批服务未启动或请求失败"; status.setAttribute("data-state", "error"); }
        }
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
          const response = await fetch("http://127.0.0.1:4174/privacy-review", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ exception_id: exceptionId, decision }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.ok === false) throw new Error(payload.error || response.statusText);
          if (status) { status.textContent = decision === "auto_released" ? "已释放，重跑 daily 后会进入提炼链路" : "已记录隐私决定"; status.setAttribute("data-state", "ok"); }
        } catch (error) {
          buttons.forEach((item) => { item.disabled = false; });
          if (status) { status.textContent = "审批服务未启动或请求失败"; status.setAttribute("data-state", "error"); }
        }
      });
    });
  });
  window.addEventListener("keydown", (event) => {
    if ((event.key === "/" && document.activeElement !== input) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
      event.preventDefault();
      input.focus();
    }
  });
})();`;
