/** Simple markdown-to-HTML renderer for basic syntax. */
export function renderMarkdown(md: string): string {
  if (!md?.trim()) return "";
  let html = escapeHtml(md);
  // Code blocks (fenced)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) =>
    `<pre><code>${code.trim()}</code></pre>`
  );
  // Inline code (content already escaped)
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
  // Links (url already escaped)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // GFM tables: collapse table blocks into single HTML lines before list/break loop
  const rawLines = html.split("\n");
  const tableRowRe = /^\|.+\|$/;
  const separatorRe = /^\|[|\s\-:]+\|$/;
  const lines: string[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    if (tableRowRe.test(line)) {
      const block: string[] = [line];
      let j = i + 1;
      while (j < rawLines.length && tableRowRe.test(rawLines[j])) {
        block.push(rawLines[j]);
        j++;
      }
      const isSeparator = (s: string) => separatorRe.test(s);
      const toCells = (row: string) => row.split("|").slice(1, -1).map((c) => c.trim());
      let tableHtml: string;
      if (block.length >= 2 && isSeparator(block[1])) {
        const headerCells = toCells(block[0]).map((c) => `<th>${c}</th>`).join("");
        const thead = `<thead><tr>${headerCells}</tr></thead>`;
        const bodyRows = block.slice(2).map((row) => `<tr>${toCells(row).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
        tableHtml = `<table>${thead}<tbody>${bodyRows}</tbody></table>`;
      } else {
        const bodyRows = block.map((row) => `<tr>${toCells(row).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
        tableHtml = `<table><tbody>${bodyRows}</tbody></table>`;
      }
      lines.push(tableHtml);
      i = j;
      continue;
    }
    lines.push(line);
    i++;
  }
  // Unordered lists and line breaks
  const result: string[] = [];
  let inList = false;
  for (const line of lines) {
    const listMatch = line.match(/^[\-\*] (.+)$/);
    if (listMatch) {
      if (!inList) {
        result.push("<ul>");
        inList = true;
      }
      result.push(`<li>${listMatch[1]}</li>`);
    } else {
      if (inList) {
        result.push("</ul>");
        inList = false;
      }
      result.push(line ? ((/^<(h[123]|pre|ul|table)/).test(line) ? line : `${line}<br />`) : "<br />");
    }
  }
  if (inList) result.push("</ul>");
  return result.join("");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
