import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  appendBlocks,
  markdownToBlocks,
  normalizeId,
  notion,
  NotionError,
  propertiesText,
  readBlocks,
  signatureBlock,
  titleOf,
} from "./notion";

type Text = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (text: string): Text => ({ content: [{ type: "text", text }] });
const fail = (e: unknown): Text => {
  const msg =
    e instanceof NotionError && e.status === 404
      ? "見つかりません。そのページがコモンズの連携に共有されていないか、IDが違います。"
      : e instanceof Error
        ? e.message
        : String(e);
  return { content: [{ type: "text", text: `エラー: ${msg}` }], isError: true };
};
const guard =
  <A>(fn: (a: A) => Promise<Text>) =>
  async (a: A) => {
    try {
      return await fn(a);
    } catch (e) {
      return fail(e);
    }
  };

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

export function buildServer(token: string, author: string): McpServer {
  const server = new McpServer(
    { name: "winegrowers-commons-notion", version: "0.1.0" },
    {
      instructions:
        "Winegrowers Commons の共有 Notion（知識コモンズ）を読み書きする。ここは複数のワイン生産者の共有の場なので、事業データ（人名・金額・口座・住所・取引先・各自の Notion の URL）は書かない。書き込むと末尾に書いた人の名前が自動で付く。",
    },
  );

  server.registerTool(
    "commons_search",
    {
      title: "コモンズを検索",
      description: "共有 Notion のページとデータベースをタイトルで検索する。query を空にすると最近のものを返す。",
      inputSchema: z.object({
        query: z.string().default(""),
        kind: z.enum(["page", "database", "any"]).default("any"),
      }),
      annotations: READ,
    },
    guard(async ({ query, kind }) => {
      const body: any = { query, page_size: 20 };
      if (kind !== "any") body.filter = { property: "object", value: kind };
      const res = await notion(token, "POST", "/search", body);
      if (!res.results.length) return ok("見つかりませんでした。");
      return ok(
        res.results
          .map((r: any) => `- [${r.object === "database" ? "DB" : "ページ"}] ${titleOf(r) || "(無題)"}  id: ${r.id}  ${r.url}`)
          .join("\n"),
      );
    }),
  );

  server.registerTool(
    "commons_read",
    {
      title: "ページを読む",
      description: "ページ（またはデータベースの行）のプロパティと本文を読む。データベースIDを渡すと列の定義を返す。",
      inputSchema: z.object({ id: z.string().describe("ページIDかURL") }),
      annotations: READ,
    },
    guard(async ({ id }) => {
      const pid = normalizeId(id);
      try {
        const page = await notion(token, "GET", `/pages/${pid}`);
        const body = await readBlocks(token, pid);
        return ok(
          `# ${titleOf(page) || "(無題)"}\nURL: ${page.url}\n\n## プロパティ\n${propertiesText(page)}\n\n## 本文\n${body.join("\n")}`,
        );
      } catch (e) {
        if (!(e instanceof NotionError) || e.status !== 404 && e.status !== 400) throw e;
        const db = await notion(token, "GET", `/databases/${pid}`);
        const cols = Object.entries<any>(db.properties)
          .map(([k, v]) => {
            const opts = v[v.type]?.options?.map((o: any) => o.name).join(" / ");
            return `- ${k}（${v.type}）${opts ? `: ${opts}` : ""}`;
          })
          .join("\n");
        return ok(`# DB: ${titleOf(db)}\nURL: ${db.url}\n\n## 列\n${cols}`);
      }
    }),
  );

  server.registerTool(
    "commons_query_database",
    {
      title: "データベースを引く",
      description:
        "データベースの行を取得する。filter と sorts は Notion API の形式（JSON）。行ごとにタイトル・ID・プロパティを返す。",
      inputSchema: z.object({
        database_id: z.string(),
        filter: z.record(z.string(), z.any()).optional(),
        sorts: z.array(z.record(z.string(), z.any())).optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
      annotations: READ,
    },
    guard(async ({ database_id, filter, sorts, limit }) => {
      const res = await notion(token, "POST", `/databases/${normalizeId(database_id)}/query`, {
        filter,
        sorts,
        page_size: limit,
      });
      if (!res.results.length) return ok("該当する行はありません。");
      return ok(
        res.results
          .map((r: any) => `### ${titleOf(r) || "(無題)"}  id: ${r.id}\n${propertiesText(r)}`)
          .join("\n\n") + (res.has_more ? "\n\n…（続きあり。limit か filter で絞ってください）" : ""),
      );
    }),
  );

  server.registerTool(
    "commons_create_page",
    {
      title: "ページを作る",
      description:
        "ページの下に子ページを、またはデータベースに行を作る。content は Markdown 風（見出し #、箇条書き -、番号 1.、チェック - [ ]、引用 >、区切り ---、コード ```）。properties は Notion API の形式（DBの行のとき）。",
      inputSchema: z.object({
        parent_id: z.string().describe("親ページかデータベースのIDかURL"),
        parent_type: z.enum(["page", "database"]),
        title: z.string(),
        content: z.string().default(""),
        properties: z.record(z.string(), z.any()).optional(),
      }),
      annotations: WRITE,
    },
    guard(async ({ parent_id, parent_type, title, content, properties }) => {
      const pid = normalizeId(parent_id);
      let parent: any;
      let props: any = { ...(properties ?? {}) };
      if (parent_type === "database") {
        const db = await notion(token, "GET", `/databases/${pid}`);
        const titleKey = Object.keys(db.properties).find((k) => db.properties[k].type === "title")!;
        props[titleKey] = { title: [{ type: "text", text: { content: title } }] };
        parent = { database_id: pid };
      } else {
        props = { title: { title: [{ type: "text", text: { content: title } }] } };
        parent = { page_id: pid };
      }
      const blocks = [...markdownToBlocks(content), signatureBlock(author)];
      const page = await notion(token, "POST", "/pages", { parent, properties: props, children: blocks.slice(0, 100) });
      if (blocks.length > 100) await appendBlocks(token, page.id, blocks.slice(100));
      return ok(`作りました: ${title}\nid: ${page.id}\n${page.url}`);
    }),
  );

  server.registerTool(
    "commons_append",
    {
      title: "ページに書き足す",
      description: "既存ページの末尾に書き足す。content は commons_create_page と同じ Markdown 風。",
      inputSchema: z.object({ page_id: z.string(), content: z.string() }),
      annotations: WRITE,
    },
    guard(async ({ page_id, content }) => {
      const pid = normalizeId(page_id);
      await appendBlocks(token, pid, [...markdownToBlocks(content), signatureBlock(author)]);
      return ok("書き足しました。");
    }),
  );

  server.registerTool(
    "commons_update_properties",
    {
      title: "プロパティを変える",
      description: "データベースの行のプロパティを変える。properties は Notion API の形式。",
      inputSchema: z.object({ page_id: z.string(), properties: z.record(z.string(), z.any()) }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    guard(async ({ page_id, properties }) => {
      const page = await notion(token, "PATCH", `/pages/${normalizeId(page_id)}`, { properties });
      return ok(`変えました: ${titleOf(page)}\n${page.url}`);
    }),
  );

  server.registerTool(
    "commons_comment",
    {
      title: "コメントする",
      description: "ページにコメントを付ける。提案や質問はこちらで。",
      inputSchema: z.object({ page_id: z.string(), text: z.string() }),
      annotations: WRITE,
    },
    guard(async ({ page_id, text }) => {
      await notion(token, "POST", "/comments", {
        parent: { page_id: normalizeId(page_id) },
        rich_text: [{ type: "text", text: { content: `${text}\n— ${author}（Claude 経由）`.slice(0, 2000) } }],
      });
      return ok("コメントしました。");
    }),
  );

  return server;
}
