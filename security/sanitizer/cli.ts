// ── CONDUIT MANAGED FILE ────────────────────────────────────────────
// file:        security/sanitizer/cli.ts
// description: CLI bridge that exposes the TypeScript sanitizer to the Go command layer.
// owner:       BOTH
// update:      Manual when sanitizer subprocess behavior changes.
// schema:      security/sanitizer/patterns.yaml
// last_update: 2026-04-04
// ─────────────────────────────────────────────────────────────────────
import process from "node:process";

import { sanitizeInput } from "./sanitize.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const input = await readStdin();
  const result = sanitizeInput(input);

  process.stdout.write(
    JSON.stringify({
      allowed: result.decision !== "block_and_escalate",
      sanitized: input,
      decision: result.decision,
      matches: result.matches,
      command: process.argv[2] ?? "unknown"
    })
  );
}

main().catch((error) => {
  process.stderr.write(String(error));
  process.exitCode = 1;
});
