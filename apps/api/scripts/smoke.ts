/*
 * Runtime smoke test — drives the full Soul API end-to-end in dev mode (mock adapters,
 * in-process via app.fetch, no port, no creds). Exercises all six user stories, the
 * marketplace, and the zero-plaintext vault (full client-side encrypt → store → re-derive →
 * decrypt round-trip, exactly as the browser performs it).
 * Run: bun apps/api/scripts/smoke.ts
 */
import {
  createVaultParams,
  decryptPayload,
  encryptPayload,
  unlockVaultKey,
} from "@soul/shared";
import server from "../src/index";

let pass = 0;
let fail = 0;
const log = (ok: boolean, name: string, detail = "") => {
  pass += ok ? 1 : 0;
  fail += ok ? 0 : 1;
  // biome-ignore lint/suspicious/noConsole: smoke-test reporter
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

type Res = { status: number; data: any };
async function call(
  method: string,
  path: string,
  opts: { token?: string; json?: unknown } = {}
): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.json !== undefined) headers["Content-Type"] = "application/json";
  const res = await server.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
    })
  );
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A one-time MCP credential: a real 32-byte delegate key hex behind "Bearer ". */
const BEARER_KEY_RE = /^Bearer [0-9a-f]{64}$/;

async function main() {
  // Stage 0 — health (US1 infra)
  const health = await call("GET", "/health");
  log(
    health.status === 200 && health.data.status === "ok",
    "GET /health",
    `live=${health.data.live} net=${health.data.network} memwalOk=${health.data.memwalVersionOk}`
  );

  // US1 — sign in (dev session) + account provisioning
  const login = await call("POST", "/api/auth/dev-login", { json: {} });
  const token = login.data.token as string;
  log(
    login.status === 200 && !!token && !!login.data.account?.objectId,
    "US1 POST /auth/dev-login",
    `addr=${login.data.suiAddress?.slice(0, 10)} acct=${login.data.account?.objectId?.slice(0, 10)}`
  );

  const session = await call("GET", "/api/auth/session", { token });
  log(session.status === 200 && session.data.userId === login.data.userId, "US1 GET /auth/session");

  // Idempotent provisioning — a second dev-login must NOT create a second account
  const login2 = await call("POST", "/api/auth/dev-login", {
    json: { suiAddress: login.data.suiAddress },
  });
  log(
    login2.data.account?.objectId === login.data.account?.objectId,
    "US1 idempotent account provisioning"
  );

  // US2 — build a soul (paste → analyze → searchable), poll job to ready
  const ing = await call("POST", "/api/ingest/text", {
    token,
    json: { namespace: "bio", text: "I love Sui. I am building Soul. I live in Karachi." },
  });
  log(
    ing.status === 202 && !!ing.data.id,
    "US2 POST /ingest/text (202 + job)",
    `job=${ing.data.id}`
  );
  let jobReady = false;
  for (let i = 0; i < 20 && !jobReady; i++) {
    const j = await call("GET", `/api/ingest/jobs/${ing.data.id}`, { token });
    if (j.data.status === "ready") jobReady = true;
    else if (j.data.status === "error") break;
    else await sleep(50);
  }
  log(jobReady, "US2 ingest job reaches ready (eventual consistency)");

  // empty input rejected
  const empty = await call("POST", "/api/ingest/text", {
    token,
    json: { namespace: "bio", text: "   " },
  });
  log(empty.status === 400, "US2 empty input rejected (400)");

  // US3 — inspect: meaning-based search
  const recall = await call("GET", "/api/memory?query=Sui", { token });
  const items = recall.data.items ?? [];
  log(
    recall.status === 200 && items.length >= 1,
    "US3 GET /memory?query=Sui",
    `${items.length} hits`
  );
  const first = items[0];
  // edit + delete
  if (first) {
    const del = await call("DELETE", `/api/memory/${first.id}`, { token });
    log(del.status === 200 && del.data.deleted === true, "US3 DELETE /memory/:id (de-index)");
  } else {
    log(false, "US3 delete (no item to delete)");
  }
  // recall limit validation (BUG-4 fix)
  const badLimit = await call("GET", "/api/memory?limit=abc", { token });
  log(badLimit.status === 400, "US3 invalid ?limit rejected (400)");

  // US4 — grant / list / revoke / audit
  const grant = await call("POST", "/api/permissions/apps", {
    token,
    json: { label: "Claude Desktop", allowedNamespaces: ["bio", "social"] },
  });
  const appId = grant.data.app?.id;
  log(
    grant.status === 200 && !!appId && !!grant.data.mcp?.hosted?.headers?.Authorization,
    "US4 POST /permissions/apps (grant + MCP config)"
  );
  log(
    Array.isArray(grant.data.mcp?.tools) &&
      grant.data.mcp.tools.length === 6 &&
      !grant.data.mcp.tools.includes("ask"),
    "US4 MCP config: 6 tools, no `ask`"
  );
  // secret must NOT leak in the app DTO
  log(
    grant.data.app && !("delegateSecretEnc" in grant.data.app),
    "US4 grant response omits delegate secret (Principle IX)"
  );
  const listApps = await call("GET", "/api/permissions/apps", { token });
  log(listApps.data.apps?.length === 1, "US4 GET /permissions/apps lists 1");
  const revoke = await call("DELETE", `/api/permissions/apps/${appId}`, { token });
  log(revoke.data.revoked === true, "US4 DELETE /permissions/apps/:id (revoke)");
  const audit = await call("GET", "/api/permissions/audit", { token });
  const actions = (audit.data.entries ?? []).map((e: any) => e.action);
  log(
    actions.includes("grant") && actions.includes("revoke"),
    "US4 audit log records grant + revoke",
    actions.join(",")
  );

  // US5 — MCP config endpoint for a (re-granted) app
  const grant2 = await call("POST", "/api/permissions/apps", {
    token,
    json: { label: "Cursor", allowedNamespaces: ["bio"] },
  });
  const mcpCfg = await call("GET", `/api/mcp/config/${grant2.data.app?.id}`, { token });
  log(mcpCfg.status === 200 && mcpCfg.data.tools?.length === 6, "US5 GET /mcp/config/:appId");

  // US6 — verify / restore / ownership
  const verify = await call("GET", "/api/portability/verify", { token });
  log(
    verify.status === 200 && typeof verify.data.intact === "boolean",
    "US6 GET /portability/verify",
    `intact=${verify.data.intact} ${verify.data.verified}/${verify.data.total}`
  );
  const restore = await call("POST", "/api/portability/restore", { token, json: {} });
  log(
    restore.status === 200 && typeof restore.data.total === "number",
    "US6 POST /portability/restore",
    `restored=${restore.data.restored}/${restore.data.total}`
  );
  const ownership = await call("GET", "/api/portability/ownership", { token });
  log(
    ownership.status === 200 && !!ownership.data.accountObjectId && !!ownership.data.explorerUrl,
    "US6 GET /portability/ownership"
  );

  // auth enforced
  const noauth = await call("GET", "/api/memory");
  log(noauth.status === 401, "Auth enforced (401 without token)");

  // Marketplace — sell/send scoped, revocable ACCESS (delegate keys), never the memory bytes.
  const mA = await call("POST", "/api/auth/dev-login", { json: { seed: "market-alice" } });
  const mB = await call("POST", "/api/auth/dev-login", { json: { seed: "market-bob" } });
  const aTok = mA.data.token as string;
  const bTok = mB.data.token as string;
  log(
    mA.status === 200 && mB.status === 200 && mA.data.suiAddress !== mB.data.suiAddress,
    "Market dev-login seeds mint two distinct users"
  );
  const handle = await call("POST", "/api/profile/username", {
    token: bTok,
    json: { username: "smokebob" },
  });
  log(handle.status === 200 && handle.data.handle === "smokebob.soul", "Market B claims a handle");

  const listed = await call("POST", "/api/market/listings", {
    token: aTok,
    json: { title: "Soul of a Sui builder", scope: ["bio"], priceMist: "1000000000" },
  });
  log(
    listed.status === 200 && listed.data.listing?.status === "active",
    "Market A lists access",
    `listing=${listed.data.listing?.id}`
  );
  const browse = await call("GET", "/api/market/listings", { token: bTok });
  const seen = (browse.data.listings ?? []).find((l: any) => l.id === listed.data.listing?.id);
  log(!!seen && seen.mine === false, "Market B browses listings (mine=false on A's)");

  const buy = await call("POST", `/api/market/listings/${listed.data.listing?.id}/buy`, {
    token: bTok,
    json: {},
  });
  const buyAuth = buy.data.mcp?.hosted?.headers?.Authorization ?? "";
  log(
    buy.status === 200 &&
      BEARER_KEY_RE.test(buyAuth) &&
      buy.data.mcp?.hosted?.headers?.["x-memwal-account-id"] === mA.data.account?.objectId,
    "Market B buys — one-time key in MCP config, bound to A's account"
  );
  log(
    buy.data.acquisition?.kind === "purchase" && buy.data.acquisition?.claimed === true,
    "Market purchase acquisition is claimed at birth (secret never stored)"
  );
  const acqs = await call("GET", "/api/market/acquisitions", { token: bTok });
  log(
    (acqs.data.acquisitions ?? []).some(
      (a: any) => a.id === buy.data.acquisition?.id && a.claimed && a.status === "active"
    ),
    "Market B's acquisitions show the claimed purchase"
  );
  const sales = await call("GET", "/api/market/sales", { token: aTok });
  log(
    (sales.data.sales ?? []).some(
      (s: any) => s.acquisitionId === buy.data.acquisition?.id && s.buyerHandle === "smokebob.soul"
    ),
    "Market A's sales show the purchase"
  );
  const mAudit = await call("GET", "/api/permissions/audit", { token: aTok });
  const mActions = (mAudit.data.entries ?? []).map((e: any) => e.action);
  log(
    mActions.includes("list") && mActions.includes("purchase"),
    "Market A's audit records list + purchase",
    mActions.join(",")
  );

  const gift = await call("POST", "/api/market/send", {
    token: aTok,
    json: { to: "smokebob.soul", scope: ["bio"] },
  });
  log(
    gift.status === 200 &&
      gift.data.acquisition?.kind === "gift" &&
      gift.data.acquisition?.claimed === false &&
      !JSON.stringify(gift.data).includes("Bearer "),
    "Market A gifts access to B's handle (no secret in response)"
  );
  const claim = await call("POST", `/api/market/acquisitions/${gift.data.acquisition?.id}/claim`, {
    token: bTok,
    json: {},
  });
  log(
    claim.status === 200 &&
      BEARER_KEY_RE.test(claim.data.mcp?.hosted?.headers?.Authorization ?? ""),
    "Market B claims the gift once (one-time reveal)"
  );
  const claim2 = await call("POST", `/api/market/acquisitions/${gift.data.acquisition?.id}/claim`, {
    token: bTok,
    json: {},
  });
  log(claim2.status === 409, "Market second claim rejected (409 — key shown once)");
  const mStatus = await call("GET", "/api/market/status", { token: bTok });
  log(
    mStatus.status === 200 && mStatus.data.live === false,
    "Market /status discloses simulated payments (dev)"
  );

  // Zero-plaintext vault — the browser-side ritual, end to end. Nothing the server stores or
  // returns may ever contain the plaintext.
  const VAULT_SECRET = "smoke-secret: the relayer must never see this";
  const vs0 = await call("GET", "/api/vault", { token });
  log(vs0.status === 200 && vs0.data.configured === false, "Vault starts unconfigured");

  const { params, key } = await createVaultParams("smoke passphrase 42");
  const vSetup = await call("POST", "/api/vault", { token, json: { params } });
  log(vSetup.status === 201, "Vault setup stores public KDF params (passphrase never sent)");
  const vSetup2 = await call("POST", "/api/vault", { token, json: { params } });
  log(vSetup2.status === 409, "Vault re-key refused (409 — would orphan envelopes)");

  const envelope = await encryptPayload(key, { kind: "text", text: VAULT_SECRET });
  const vAdd = await call("POST", "/api/vault/items", {
    token,
    json: {
      namespace: "docs",
      label: "smoke note",
      kind: "text",
      sizeBytes: VAULT_SECRET.length,
      envelope,
    },
  });
  log(
    vAdd.status === 201 && !!vAdd.data.id && !JSON.stringify(vAdd.data).includes(VAULT_SECRET),
    "Vault item stored (201, instant — no relayer, no plaintext in response)"
  );
  const vBad = await call("POST", "/api/vault/items", {
    token,
    json: {
      namespace: "docs",
      label: "bad",
      kind: "text",
      sizeBytes: 1,
      envelope: { v: 1, scheme: "aes-256-gcm", ivB64: "short", ctB64: "x" },
    },
  });
  log(vBad.status === 400, "Vault malformed envelope rejected (400)");

  const vList = await call("GET", "/api/vault/items", { token });
  log(
    vList.status === 200 &&
      vList.data.items?.length === 1 &&
      !JSON.stringify(vList.data).includes(VAULT_SECRET),
    "Vault list shows metadata only (label, never content)"
  );

  // A "new device": fetch the public params, re-derive from the passphrase, decrypt the detail.
  const vStatus = await call("GET", "/api/vault", { token });
  const rederived = await unlockVaultKey("smoke passphrase 42", vStatus.data.params);
  const vDetail = await call("GET", `/api/vault/items/${vAdd.data.id}`, { token });
  let decrypted = "";
  if (rederived && vDetail.data.envelope) {
    decrypted = (await decryptPayload(rederived, vDetail.data.envelope)).text ?? "";
  }
  log(
    vDetail.status === 200 && decrypted === VAULT_SECRET,
    "Vault round-trip: re-derived key decrypts the stored envelope client-side"
  );
  log(
    (await unlockVaultKey("wrong passphrase", vStatus.data.params)) === null,
    "Vault wrong passphrase fails the key-check"
  );

  // The whole point: private items never surface in recall (they are not indexed).
  const vRecall = await call("GET", "/api/memory?query=relayer must never see", { token });
  log(
    vRecall.status === 200 && !JSON.stringify(vRecall.data).includes(VAULT_SECRET),
    "Vault items never surface in recall (zero-plaintext trade-off honored)"
  );

  // Portability covers the vault: the envelope is re-read from Walrus and hash-checked.
  const vVerify = await call("GET", "/api/portability/verify", { token });
  log(
    vVerify.status === 200 && vVerify.data.vault?.verified === 1 && vVerify.data.vault?.total === 1,
    "US6 verify covers the vault",
    `vault=${vVerify.data.vault?.verified}/${vVerify.data.vault?.total}`
  );

  const vDel = await call("DELETE", `/api/vault/items/${vAdd.data.id}`, { token });
  const vList2 = await call("GET", "/api/vault/items", { token });
  log(
    vDel.status === 200 && vDel.data.deleted === true && vList2.data.items?.length === 0,
    "Vault delete is real (index is ours, not the relayer's)"
  );

  // biome-ignore lint/suspicious/noConsole: smoke-test reporter
  console.log(`\n${fail === 0 ? "ALL PASSED" : "FAILURES"}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  // biome-ignore lint/suspicious/noConsole: smoke-test reporter
  console.error("smoke crashed:", e);
  process.exit(1);
});
