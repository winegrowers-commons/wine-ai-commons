// Winegrowers Commons の共有 Notion に、参加者の Claude からつなぐための MCP サーバー。
// - 認証：OAuth（claude.ai のカスタムコネクタが求める形）。本人確認は「参加者コード」で行う。
// - 参加者コード → 名前の対応は Worker の secret（MEMBER_CODES）にだけ置く。リポジトリには置かない。
// - Notion へは内部インテグレーションのトークン（NOTION_TOKEN）で読み書きする。

import { AuthorizationError, OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import { buildServer } from "./tools";

export interface Env {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: any;
  NOTION_TOKEN: string;
  MEMBER_CODES: string; // JSON: {"参加者コード": "表示名"}
  PUBLIC_URL: string;
}

type Props = { name: string };

const escape = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function members(env: Env): Record<string, string> {
  try {
    return JSON.parse(env.MEMBER_CODES || "{}");
  } catch {
    return {};
  }
}

async function codeMatches(input: string, env: Env): Promise<{ name: string; id: string } | null> {
  const enc = new TextEncoder();
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  const a = await digest(input.trim());
  for (const [code, name] of Object.entries(members(env))) {
    const b = await digest(code);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    if (diff === 0) return { name, id: `m-${[...b.slice(0, 6)].map((x) => x.toString(16).padStart(2, "0")).join("")}` };
  }
  return null;
}

function page(body: string, status = 200, headers?: Headers): Response {
  const h = headers ?? new Headers();
  h.set("Content-Type", "text/html; charset=utf-8");
  return new Response(
    `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Winegrowers Commons</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.7;color:#222}
input[type=text],input[type=password]{width:100%;padding:.6rem;font-size:1rem;box-sizing:border-box}
button{padding:.6rem 1.2rem;font-size:1rem;margin-right:.5rem}.muted{color:#666;font-size:.9rem}.err{color:#b00}</style>
${body}</html>`,
    { status, headers: h },
  );
}

function consentForm(clientName: string, redirectHost: string, handle: string, error = ""): string {
  return `<h1>Winegrowers Commons の Notion につなぐ</h1>
<p><strong>${escape(clientName)}</strong> が、コモンズの共有 Notion を読み書きできるようになります。</p>
<p class="muted">つないだ後の行き先：${escape(redirectHost)}</p>
<form method="post">
<input type="hidden" name="handle" value="${escape(handle)}">
<p><label>参加者コード<br><input type="password" name="code" autocomplete="off" required></label></p>
${error ? `<p class="err">${escape(error)}</p>` : ""}
<p><button name="decision" value="approve">つなぐ</button><button name="decision" value="deny">やめる</button></p>
</form>
<p class="muted">参加者コードは、コモンズの世話役から受け取ったものです。書き込んだ内容には、このコードに対応するお名前が付きます。</p>`;
}

const authHandler = {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/") {
      return page(`<h1>Winegrowers Commons MCP</h1><p>Claude のカスタムコネクタに <code>${escape(url.origin)}/mcp</code> を追加してください。</p>`);
    }
    if (url.pathname !== "/authorize") return new Response("Not found", { status: 404 });

    const oauth = env.OAUTH_PROVIDER;
    try {
      if (req.method === "GET") {
        const request = await oauth.parseAuthRequest(req);
        const details = await oauth.describeConsent(request);
        const consent = await oauth.beginConsent(request);
        return page(consentForm(details.clientName, details.redirectHost, consent.handle), 200, consent.headers);
      }
      if (req.method === "POST") {
        const form = await req.formData();
        const handle = String(form.get("handle") ?? "");
        if (form.get("decision") !== "approve") {
          const denied = await oauth.denyConsent(req, handle);
          return new Response(null, { status: 302, headers: denied.headers });
        }
        const member = await codeMatches(String(form.get("code") ?? ""), env);
        if (!member) {
          // コードが違うときは手続きを最初からやり直してもらう（handle は1回きり）
          const denied = await oauth.denyConsent(req, handle);
          return new Response(null, { status: 302, headers: denied.headers });
        }
        const approved = await oauth.approveConsent(req, handle, {});
        const { redirectTo } = await oauth.completeAuthorization({
          request: approved.request,
          userId: member.id, // トークンに入るので ASCII にする
          metadata: { name: member.name },
          scope: approved.request.scope,
          props: { name: member.name } satisfies Props,
        });
        approved.headers.set("Location", redirectTo);
        return new Response(null, { status: 302, headers: approved.headers });
      }
      return new Response("Method not allowed", { status: 405 });
    } catch (e) {
      if (e instanceof AuthorizationError && (e as any).redirectTo) {
        return Response.redirect((e as any).redirectTo, 302);
      }
      if (e instanceof AuthorizationError) {
        return page(`<h1>つなげませんでした</h1><p>${escape((e as any).description ?? "")}</p><p>Claude の画面から、もう一度つないでください。</p>`, 400);
      }
      throw e;
    }
  },
};

const apiHandler = {
  fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const name = (ctx.props as Props | undefined)?.name ?? "不明な参加者";
    const handler = createMcpHandler(() => buildServer(env.NOTION_TOKEN, name), { route: "/mcp" });
    return handler(req, env, ctx);
  },
};

// 公開URL（https://<名前>.<サブドメイン>.workers.dev）は環境変数 PUBLIC_URL で渡す。
// OAuth のトークンはこの URL の /mcp に結び付けられる。
let provider: OAuthProvider<Env> | undefined;

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    provider ??= makeProvider(env.PUBLIC_URL);
    return provider.fetch(req, env, ctx);
  },
};

const makeProvider = (origin: string) => new OAuthProvider<Env>({
  resourceMetadata: { resource: `${origin}/mcp`, authorization_servers: [origin] },
  apiRoute: "/mcp",
  apiHandler,
  defaultHandler: authHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  refreshTokenTTL: 60 * 60 * 24 * 90,
});
