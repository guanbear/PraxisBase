(() => {
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
        reviewApiBase = config.review_api_base.trim().replace(/\/+$/, "");
      }
      if (typeof config.writeback === "string" && config.writeback.trim()) {
        reviewWriteback = config.writeback.trim();
      }
      gitlabConfig = {
        apiBase: typeof config.gitlab_api_base === "string" ? config.gitlab_api_base.trim().replace(/\/+$/, "") : "",
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
  const fetchGitlabFileJson = async (path) => {
    const response = await fetch(gitlabFileUrl(path, true), { headers: { "PRIVATE-TOKEN": gitlabToken() } });
    if (!response.ok) throw new Error(response.statusText || "gitlab_file_fetch_failed");
    return response.json();
  };
  const fetchGitlabFileText = async (path) => {
    const response = await fetch(gitlabFileUrl(path, true), { headers: { "PRIVATE-TOKEN": gitlabToken() } });
    if (!response.ok) throw new Error(response.statusText || "gitlab_file_fetch_failed");
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
    await createGitlabFile(path, JSON.stringify(review, null, 2) + "\n", "Record PraxisBase review decision: " + proposalId);
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
    await updateGitlabFile(path, JSON.stringify(updated, null, 2) + "\n", "Record PraxisBase privacy decision: " + exceptionId);
    return { exception_path: path, decision };
  };
  const archiveMarkdownFrontmatter = (raw) => {
    const now = new Date().toISOString();
    const upsert = (frontmatter, key, value) => {
      const line = key + ": " + value;
      const pattern = new RegExp("^" + key + "\s*:.*$", "m");
      return pattern.test(frontmatter) ? frontmatter.replace(pattern, line) : frontmatter.trimEnd() + "\n" + line;
    };
    if (raw.startsWith("---\n")) {
      const end = raw.indexOf("\n---", 4);
      if (end > 0) {
        let frontmatter = raw.slice(4, end);
        frontmatter = upsert(frontmatter, "status", "archived");
        frontmatter = upsert(frontmatter, "maturity", "archived");
        frontmatter = upsert(frontmatter, "revoked_at", '"' + now + '"');
        frontmatter = upsert(frontmatter, "revoked_by", "praxisbase-gitlab-pages-ui");
        const rest = raw.slice(end + 5).replace(/^\n/, "");
        return "---\n" + frontmatter.trimEnd() + "\n---\n" + rest;
      }
    }
    return "---\nstatus: archived\nmaturity: archived\nrevoked_at: \"" + now + "\"\nrevoked_by: praxisbase-gitlab-pages-ui\n---\n" + raw;
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
      currentMatches = docs.filter((doc) => [doc.title, doc.path, doc.kind, doc.text].join("\n").toLowerCase().includes(query)).slice(0, 8);
      if (currentMatches.length === 0) {
        box.hidden = false;
        box.innerHTML = '<span class="search-empty">' + (currentLanguage() === "en" ? "No results for “" : "未找到“") + escapeText(input.value) + (currentLanguage() === "en" ? "”" : "”的结果") + "</span>";
        return;
      }
      activeIdx = 0;
      box.innerHTML = currentMatches.map((doc, i) => {
        const href = doc.href || `${base}pages/${doc.slug}.html`;
        return `<a href="${escapeText(href)}" data-idx="${i}" class="${i === activeIdx ? "is-active" : ""}"><strong>${escapeText(doc.title)}</strong><br><small>${escapeText(doc.path)}</small></a>`;
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
          buttons.forEach((item) => { item.disabled = false; });
          if (status) { status.textContent = reviewWriteback === "gitlab" ? "GitLab 提交失败：" + (error instanceof Error ? error.message : String(error)) : "审批服务未启动或请求失败"; status.setAttribute("data-state", "error"); }
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
          buttons.forEach((item) => { item.disabled = false; });
          if (status) { status.textContent = reviewWriteback === "gitlab" ? "GitLab 撤回失败：" + (error instanceof Error ? error.message : String(error)) : "审批服务未启动或撤回失败"; status.setAttribute("data-state", "error"); }
        }
      });
    });
  });
  syncReviewServiceHealth();
  const themeKey = "praxisbase.theme";
  const applyTheme = (theme) => {
    const explicit = theme === "light" || theme === "dark" ? theme : null;
    document.documentElement.setAttribute("data-theme", explicit || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
    document.documentElement.removeAttribute("data-theme-pending");
    document.querySelectorAll("[data-theme-option]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-theme-option") === (explicit || "auto") ? "true" : "false");
    });
  };
  applyTheme(localStorage.getItem(themeKey) || "auto");
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!localStorage.getItem(themeKey) || localStorage.getItem(themeKey) === "auto") applyTheme("auto"); });
  document.querySelectorAll("[data-theme-option]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const theme = btn.getAttribute("data-theme-option");
      if (theme === "auto") localStorage.removeItem(themeKey); else localStorage.setItem(themeKey, theme);
      applyTheme(theme || "auto");
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
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#146c5c";
    const line = getComputedStyle(document.documentElement).getPropertyValue("--line").trim() || "#d8e0da";
    const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#17211b";
    const soft = getComputedStyle(document.documentElement).getPropertyValue("--soft").trim() || "#e8f2ed";
    const pos = {};
    const R = Math.min(w, h) / 2 - 60;
    graphData.nodes.forEach((node, i) => {
      const a = (i / graphData.nodes.length) * Math.PI * 2;
      pos[node.id] = { x: w / 2 + R * Math.cos(a), y: h / 2 + R * Math.sin(a) };
    });
    const idToNode = new Map(graphData.nodes.map((n) => [n.id, n]));
    const links = Array.isArray(graphData.links) ? graphData.links : [];
    links.forEach((link) => {
      const from = pos[link.source] || pos[link.from];
      const to = pos[link.target] || pos[link.to];
      if (!from || !to) return;
      const l = document.createElementNS(ns, "line");
      l.setAttribute("x1", from.x); l.setAttribute("y1", from.y);
      l.setAttribute("x2", to.x); l.setAttribute("y2", to.y);
      l.setAttribute("stroke", line); l.setAttribute("stroke-width", "1.5");
      svg.appendChild(l);
    });
    graphData.nodes.forEach((node) => {
      const p = pos[node.id];
      if (!p) return;
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", p.x); c.setAttribute("cy", p.y);
      c.setAttribute("r", 7); c.setAttribute("fill", soft); c.setAttribute("stroke", accent); c.setAttribute("stroke-width", "2");
      svg.appendChild(c);
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", p.x); t.setAttribute("y", p.y - 13); t.setAttribute("text-anchor", "middle");
      t.textContent = (node.title || node.id || "").slice(0, 24);
      svg.appendChild(t);
    });
  }
  window.addEventListener("keydown", (event) => {
    if (input && ((event.key === "/" && document.activeElement !== input) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"))) {
      event.preventDefault();
      input.focus();
    }
  });
})();