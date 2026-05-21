export const SITE_OUTPUTS = [
  "dist/index.html",
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
.topnav { display: flex; justify-content: flex-end; gap: .75rem; flex-wrap: wrap; }
.topnav a { color: var(--muted); font-size: .9rem; }
.search { position: relative; }
.search input { width: 100%; height: 38px; border: 1px solid var(--line); border-radius: 6px; padding: 0 .75rem; background: white; color: var(--ink); }
.search-results { position: absolute; top: 42px; left: 0; right: 0; border: 1px solid var(--line); border-radius: 6px; background: white; box-shadow: 0 12px 28px rgba(23, 33, 27, .12); overflow: hidden; }
.search-results a { display: block; padding: .7rem .8rem; border-bottom: 1px solid var(--line); }
.dashboard, .graph-shell, .issues-shell { max-width: 1180px; margin: 0 auto; padding: 2rem 1rem 4rem; }
.hero { min-height: 220px; display: flex; align-items: end; padding: 2rem 0; border-bottom: 1px solid var(--line); }
.eyebrow { margin: 0 0 .5rem; color: var(--accent-2); font-weight: 700; text-transform: uppercase; font-size: .78rem; }
h1 { margin: 0; font-size: clamp(2.2rem, 6vw, 5.2rem); line-height: .96; letter-spacing: 0; }
.lede { max-width: 62ch; color: var(--muted); font-size: 1.05rem; }
.metrics { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: .75rem; margin: 1.25rem 0; }
.metrics article { border: 1px solid var(--line); border-radius: 8px; padding: .85rem; background: white; }
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
  .topbar, .metrics, .dashboard-grid, .graph-grid, .page-shell { grid-template-columns: 1fr; }
  .topnav { justify-content: flex-start; }
  .side-nav, .meta-rail { position: static; max-height: none; }
}`;

export const SITE_JS = `(() => {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchResults");
  const base = window.__WIKI_BASE__ || "";
  if (!input || !box) return;
  let docs = [];
  fetch(base + "search-index.json").then((res) => res.json()).then((data) => { docs = data.documents || []; }).catch(() => {});
  const render = () => {
    const query = input.value.trim().toLowerCase();
    if (!query) { box.hidden = true; box.innerHTML = ""; return; }
    const matches = docs.filter((doc) => [doc.title, doc.path, doc.kind, doc.text].join("\\n").toLowerCase().includes(query)).slice(0, 8);
    box.innerHTML = matches.map((doc) => \`<a href="\${base}pages/\${doc.slug}.html"><strong>\${escapeText(doc.title)}</strong><br><small>\${escapeText(doc.path)}</small></a>\`).join("");
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
})();`;
