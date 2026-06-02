import { escapeHtml } from "../build/html.js";
import type { WikiGraph } from "./resolver.js";
import type { WikiSitePage } from "./site-model.js";

export function pageHref(page: WikiSitePage): string {
  return `pages/${page.slug}.html`;
}

export function graphJsonLd(pages: WikiSitePage[], graph: WikiGraph): unknown {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: pages.map((page, index) => ({
      "@type": "TechArticle",
      position: index + 1,
      name: page.title,
      url: `pages/${page.slug}.html`,
      about: graph.links.filter((link) => link.from === page.id).map((link) => link.to),
    })),
  };
}

export function renderSitemap(pages: WikiSitePage[]): string {
  const urls = ["index.html", ...pages.map(pageHref)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>/${escapeHtml(url)}</loc></url>`).join("\n")}
</urlset>
`;
}
