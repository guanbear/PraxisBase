(() => {
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
    const matches = docs.filter((doc) => [doc.title, doc.path, doc.kind, doc.text].join("\n").toLowerCase().includes(query)).slice(0, 8);
    box.innerHTML = matches.map((doc) => {
      const href = doc.href || `${base}pages/${doc.slug}.html`;
      return `<a href="${escapeText(href)}"><strong>${escapeText(doc.title)}</strong><br><small>${escapeText(doc.path)}</small></a>`;
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
  window.addEventListener("keydown", (event) => {
    if ((event.key === "/" && document.activeElement !== input) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
      event.preventDefault();
      input.focus();
    }
  });
})();