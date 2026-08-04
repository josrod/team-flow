// Router for the self-hosted Supabase Edge Runtime (docker/docker-compose.yml).
//
// The edge runtime starts with `--main-service /home/deno/functions/main`, so
// every request to /functions/v1/<name> lands here. This service resolves the
// first path segment to supabase/functions/<name>/index.ts and runs it as a
// user worker, mirroring how the hosted platform serves each function by name.
// It is only used locally; the hosted platform ignores this folder.

const FUNCTIONS_DIR = "/home/deno/functions";

interface EdgeRuntime {
  userWorkers: {
    create(opts: Record<string, unknown>): Promise<{ fetch(req: Request): Promise<Response> }>;
  };
}

const runtime = (globalThis as unknown as { EdgeRuntime: EdgeRuntime }).EdgeRuntime;

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const name = url.pathname.replace(/^\/+/, "").split("/")[0];

  if (!name || name === "main" || name === "_shared" || name.includes("..")) {
    return jsonResponse({ error: "Function not found" }, 404);
  }

  const servicePath = `${FUNCTIONS_DIR}/${name}`;
  try {
    await Deno.stat(`${servicePath}/index.ts`);
  } catch {
    return jsonResponse({ error: `Function '${name}' not found` }, 404);
  }

  try {
    const worker = await runtime.userWorkers.create({
      servicePath,
      memoryLimitMb: 256,
      workerTimeoutMs: 300 * 1000,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.entries(Deno.env.toObject()),
    });
    return await worker.fetch(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
