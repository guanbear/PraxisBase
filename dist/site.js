(() => {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchResults");
  const base = window.__WIKI_BASE__ || "";
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