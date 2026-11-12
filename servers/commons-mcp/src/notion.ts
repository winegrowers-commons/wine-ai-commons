// Notion REST API の薄い包み。トークンは内部インテグレーションのもの（Worker の secret）。
// 読み書きできるのは、そのインテグレーションに共有されたページだけ。

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

export class NotionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function notion(token: string, method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": VERSION,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new NotionError(res.status, data?.message ?? `Notion API ${res.status}`);
  return data;
}

export function normalizeId(idOrUrl: string): string {
  const m = idOrUrl.replace(/-/g, "").match(/[0-9a-f]{32}/i);
  if (!m) throw new Error(`ページIDかURLを渡してください: ${idOrUrl}`);
  const h = m[0].toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---- 読む：ブロック → Markdown 風テキスト ----

const plain = (rt: any[] | undefined) => (rt ?? []).map((t) => t.plain_text ?? "").join("");

export function titleOf(obj: any): string {
  if (obj.object === "database") return plain(obj.title);
  for (const p of Object.values<any>(obj.properties ?? {})) {
    if (p.type === "title") return plain(p.title);
  }
  return "";
}

function propValue(p: any): string {
  switch (p.type) {
    case "title":
    case "rich_text":
      return plain(p[p.type]);
    case "number":
      return p.number == null ? "" : String(p.number);
    case "select":
    case "status":
      return p[p.type]?.name ?? "";
    case "multi_select":
      return (p.multi_select ?? []).map((o: any) => o.name).join(", ");
    case "date":
      return p.date ? `${p.date.start}${p.date.end ? ` → ${p.date.end}` : ""}` : "";
    case "checkbox":
      return p.checkbox ? "はい" : "いいえ";
    case "url":
    case "email":
    case "phone_number":
      return p[p.type] ?? "";
    case "relation":
      return (p.relation ?? []).map((r: any) => r.id).join(", ");
    case "people":
      return (p.people ?? []).map((u: any) => u.name ?? u.id).join(", ");
    case "formula":
      return String(p.formula?.[p.formula?.type] ?? "");
    case "rollup":
      return p.rollup?.type === "array" ? `${p.rollup.array.length}件` : String(p.rollup?.[p.rollup?.type] ?? "");
    case "created_time":
    case "last_edited_time":
      return p[p.type];
    case "files":
      return (p.files ?? []).map((f: any) => f.name).join(", ");
    default:
      return "";
  }
}

export function propertiesText(obj: any): string {
  return Object.entries<any>(obj.properties ?? {})
    .map(([k, v]) => `- ${k}: ${propValue(v)}`)
    .join("\n");
}

function blockLine(b: any, depth: number): string {
  const pad = "  ".repeat(depth);
  const t = b.type;
  const d = b[t] ?? {};
  const txt = plain(d.rich_text);
  switch (t) {
    case "paragraph":
      return pad + txt;
    case "heading_1":
      return `${pad}# ${txt}`;
    case "heading_2":
      return `${pad}## ${txt}`;
    case "heading_3":
      return `${pad}### ${txt}`;
    case "bulleted_list_item":
      return `${pad}- ${txt}`;
    case "numbered_list_item":
      return `${pad}1. ${txt}`;
    case "to_do":
      return `${pad}- [${d.checked ? "x" : " "}] ${txt}`;
    case "toggle":
      return `${pad}▸ ${txt}`;
    case "quote":
      return `${pad}> ${txt}`;
    case "callout":
      return `${pad}> ${d.icon?.emoji ?? "💡"} ${txt}`;
    case "code":
      return `${pad}\`\`\`${d.language ?? ""}\n${txt}\n${pad}\`\`\``;
    case "divider":
      return `${pad}---`;
    case "child_page":
      return `${pad}[子ページ] ${d.title} (id: ${b.id})`;
    case "child_database":
      return `${pad}[データベース] ${d.title} (id: ${b.id})`;
    case "bookmark":
    case "embed":
    case "link_preview":
      return `${pad}[リンク] ${d.url ?? ""}`;
    case "image":
    case "file":
    case "pdf":
    case "video":
      return `${pad}[${t}] ${plain(d.caption)}`;
    case "table_row":
      return `${pad}| ${(d.cells ?? []).map((c: any[]) => plain(c)).join(" | ")} |`;
    default:
      return txt ? pad + txt : `${pad}[${t}]`;
  }
}

export async function readBlocks(token: string, blockId: string, depth = 0, budget = { n: 300 }): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const q = `?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const res = await notion(token, "GET", `/blocks/${blockId}/children${q}`);
    for (const b of res.results) {
      if (budget.n-- <= 0) {
        out.push("…（長いので途中まで）");
        return out;
      }
      out.push(blockLine(b, depth));
      const skipChildren = b.type === "child_page" || b.type === "child_database";
      if (b.has_children && !skipChildren && depth < 3) {
        out.push(...(await readBlocks(token, b.id, depth + 1, budget)));
      }
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

// ---- 書く：Markdown 風テキスト → ブロック ----

const rt = (s: string) => {
  const parts: any[] = [];
  for (let i = 0; i < s.length; i += 1900) parts.push({ type: "text", text: { content: s.slice(i, i + 1900) } });
  return parts.length ? parts : [{ type: "text", text: { content: "" } }];
};

export function markdownToBlocks(md: string): any[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: any[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim() || "plain text";
      const body: string[] = [];
      while (++i < lines.length && !lines[i].startsWith("```")) body.push(lines[i]);
      blocks.push({ type: "code", code: { language: lang, rich_text: rt(body.join("\n")) } });
      continue;
    }
    if (!line.trim()) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,3}) (.*)/))) {
      const t = `heading_${m[1].length}`;
      blocks.push({ type: t, [t]: { rich_text: rt(m[2]) } });
    } else if ((m = line.match(/^\s*- \[( |x)\] (.*)/i))) {
      blocks.push({ type: "to_do", to_do: { checked: m[1].toLowerCase() === "x", rich_text: rt(m[2]) } });
    } else if ((m = line.match(/^\s*[-*] (.*)/))) {
      blocks.push({ type: "bulleted_list_item", bulleted_list_item: { rich_text: rt(m[1]) } });
    } else if ((m = line.match(/^\s*\d+\. (.*)/))) {
      blocks.push({ type: "numbered_list_item", numbered_list_item: { rich_text: rt(m[1]) } });
    } else if ((m = line.match(/^> (.*)/))) {
      blocks.push({ type: "quote", quote: { rich_text: rt(m[1]) } });
    } else if (line.trim() === "---") {
      blocks.push({ type: "divider", divider: {} });
    } else {
      blocks.push({ type: "paragraph", paragraph: { rich_text: rt(line) } });
    }
  }
  return blocks;
}

export function signatureBlock(author: string): any {
  const date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  return {
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: `✍️ ${author}（Claude 経由・${date}）` }, annotations: { color: "gray" } }],
    },
  };
}

export async function appendBlocks(token: string, parentId: string, blocks: any[]): Promise<void> {
  for (let i = 0; i < blocks.length; i += 100) {
    await notion(token, "PATCH", `/blocks/${parentId}/children`, { children: blocks.slice(i, i + 100) });
  }
}
