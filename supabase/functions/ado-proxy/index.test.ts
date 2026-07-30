// Integration tests for the `ado-proxy` edge function.
//
// They assert the read-only contract enforced at the edge:
// - Only POST is accepted as the transport method (the real HTTP verb for the
//   upstream request travels inside the JSON payload).
// - Inside the payload, only GET and POST are valid; POST is restricted to the
//   read-only `wiql` and `workitemsbatch` endpoints.
// - Any other URL or method is rejected before any upstream call happens.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ado-proxy`;

/** Arbitrary upstream host: requests must be rejected before reaching it. */
const TARGET_BASE = "https://tfs.example.net/tfs/RNDCollection";

interface ProxyPayload {
  url: string;
  method?: string;
  body?: string;
  refresh?: boolean;
}

const callProxy = async (
  payload: ProxyPayload | string,
  method = "POST",
): Promise<{ status: number; body: string }> => {
  const response = await fetch(FUNCTION_URL, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: method === "GET" ? undefined : typeof payload === "string" ? payload : JSON.stringify(payload),
  });
  const body = await response.text();
  return { status: response.status, body };
};

Deno.test("rejects transport methods other than POST", async () => {
  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    const { status } = await callProxy({ url: `${TARGET_BASE}/_apis/projects` }, method);
    assertEquals(status, 405, `expected 405 for transport method ${method}`);
  }
});

Deno.test("answers CORS preflight", async () => {
  const response = await fetch(FUNCTION_URL, { method: "OPTIONS" });
  await response.text();
  assertEquals(response.status, 200);
});

Deno.test("rejects upstream methods other than GET and POST", async () => {
  for (const method of ["PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    const { status } = await callProxy({ url: `${TARGET_BASE}/_apis/wit/wiql`, method });
    assertEquals(status, 400, `expected 400 for upstream method ${method}`);
  }
});

Deno.test("rejects POST to endpoints that are not wiql or workitemsbatch", async () => {
  const forbiddenTargets = [
    `${TARGET_BASE}/_apis/wit/workitems/$Task?api-version=5.0`,
    `${TARGET_BASE}/_apis/wit/workitems/123?api-version=5.0`,
    `${TARGET_BASE}/_apis/projects?api-version=5.0`,
    `${TARGET_BASE}/_apis/git/repositories/repo/pushes?api-version=5.0`,
    `${TARGET_BASE}/_apis/wit/wiqlsomethingelse?api-version=5.0`,
  ];
  for (const url of forbiddenTargets) {
    const { status } = await callProxy({ url, method: "POST", body: "{}" });
    assertEquals(status, 403, `expected 403 for POST ${url}`);
  }
});

Deno.test("accepts POST to the read-only wiql and workitemsbatch endpoints", async () => {
  // These pass the allow-list, so they continue to the configuration/target
  // checks. What matters here is that they are NOT rejected with 403 by the
  // read-only guard (they may fail later with 403 target-not-allowed, 404 or a
  // 5xx upstream error depending on the environment).
  const allowedTargets = [
    `${TARGET_BASE}/_apis/wit/wiql?api-version=5.0`,
    `${TARGET_BASE}/_apis/wit/workitemsbatch?api-version=5.0`,
  ];
  for (const url of allowedTargets) {
    const { status, body } = await callProxy({ url, method: "POST", body: '{"query":"SELECT 1"}' });
    const readOnlyRejection = status === 403 && body.includes("Only read-only requests are allowed");
    assertEquals(readOnlyRejection, false, `read-only guard should allow ${url} (got ${status}: ${body})`);
  }
});

Deno.test("rejects malformed payloads", async () => {
  // Not JSON at all.
  assertEquals((await callProxy("not-json")).status, 400);
  // Missing URL.
  assertEquals((await callProxy({ url: "" })).status, 400);
  // GET with a body is not a valid read request.
  assertEquals((await callProxy({ url: `${TARGET_BASE}/_apis/projects`, method: "GET", body: "{}" })).status, 400);
  // Oversized URL.
  assertEquals((await callProxy({ url: `${TARGET_BASE}/${"a".repeat(8200)}` })).status, 400);
});

Deno.test("rejects target URLs outside the configured server", async () => {
  const { status, body } = await callProxy({
    url: "https://attacker.example.com/_apis/projects?api-version=5.0",
    method: "GET",
  });
  // 403 when a configuration exists, 404 when the environment has none saved.
  const acceptable = status === 403 || status === 404;
  assertEquals(acceptable, true, `expected 403/404, got ${status}: ${body}`);
});
