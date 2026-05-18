export function renderInspectionHtml(input: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 80ch; margin: 2rem auto; padding: 0 1rem; }
    h1 { border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; }
    .bundle { background: #f5f5f5; padding: 1rem; margin: 1rem 0; border-radius: 4px; }
    .warning { color: #b45309; background: #fef3c7; padding: 0.5rem; border-radius: 4px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background: #f0f0f0; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(input.title)}</h1>
    ${input.body}
  </main>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
