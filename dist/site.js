(() => {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchResults");
  const languageSelect = document.getElementById("languageSelect");
  const languageButtons = Array.from(document.querySelectorAll("[data-language-option]"));
  const base = window.__WIKI_BASE__ || "";
  let reviewApiBase = "http://127.0.0.1:4174";
  const reviewConfigPromise = fetch(base + "review-config.json")
    .then((res) => res.ok ? res.json() : {})
    .then((config) => {
      if (typeof config.review_api_base === "string" && config.review_api_base.trim()) {
        reviewApiBase = config.review_api_base.trim().replace(/\/+$/, "");
      }
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
  const approvalStatusText = (key) => {
    const useZh = currentLanguage() !== "en";
    const dictionary = {
      connected: useZh ? "审批服务已连接" : "Approval service connected",
      disconnected: useZh ? "审批服务未连接：先启动 praxisbase review serve" : "Approval service is offline: start praxisbase review serve",
    };
    return dictionary[key] || dictionary.disconnected;
  };
  const syncReviewServiceHealth = async () => {
    const statuses = Array.from(document.querySelectorAll("[data-review-status], [data-privacy-status]"));
    if (statuses.length === 0) return;
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
          const response = await fetch(await reviewEndpoint("/review"), {
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
          const response = await fetch(await reviewEndpoint("/privacy-review"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ exception_id: exceptionId, decision }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.ok === false) throw new Error(payload.error || response.statusText);
          if (status) {
            status.textContent = decision === "auto_released"
              ? "已释放，重跑 daily 后会进入提炼链路"
              : decision === "rejected_low_signal"
                ? "已按低信号拒绝，已从待处理队列隐藏"
                : "已记录隐私决定";
            status.setAttribute("data-state", "ok");
          }
          if (decision === "auto_released" || decision === "rejected_low_signal") {
            const card = container.closest(".review-card");
            if (card) card.hidden = true;
          }
        } catch (error) {
          buttons.forEach((item) => { item.disabled = false; });
          if (status) { status.textContent = "审批服务未启动或请求失败"; status.setAttribute("data-state", "error"); }
        }
      });
    });
  });
  syncReviewServiceHealth();
  window.addEventListener("keydown", (event) => {
    if ((event.key === "/" && document.activeElement !== input) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
      event.preventDefault();
      input.focus();
    }
  });
})();