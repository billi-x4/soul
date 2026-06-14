#!/usr/bin/env bun
/* Verify the Walrus-backed personal-context pipeline: save -> blob + metadata -> load (from blob). */
import { ensureUserAndAccount } from "../src/services/account-service";
import { loadPersonalContext, savePersonalContext } from "../src/services/personal-context-service";

let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fail++;
};

const { user } = await ensureUserAndAccount("0xcontextverify");
const answers = {
  full_name: "Ada Lovelace",
  skills: ["TypeScript", "Sui"],
  bio: "Built the soul.",
};

const saved = await savePersonalContext(user.id, answers, true);
check("save returns a Walrus blob id", Boolean(saved.blobId), saved.blobId ?? "(none)");
check("answeredCount computed", saved.answeredCount === 3, String(saved.answeredCount));

const loaded = await loadPersonalContext(user.id);
check(
  "answers reconstructed from the blob",
  JSON.stringify(loaded.answers) === JSON.stringify(answers)
);
check("completed persisted", loaded.completed === true);
check("blob id round-trips", loaded.blobId === saved.blobId);
check("exists flag set", loaded.exists === true);

console.log(`\n${fail === 0 ? "ALL PASSED" : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
