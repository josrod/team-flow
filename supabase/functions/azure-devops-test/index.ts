import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TestPayload {
  organization: string;
  project: string;
  pat: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: TestPayload = await req.json();
    const { organization, project, pat } = body;

    if (!organization || !project || !pat) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: organization, project, pat" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Test connection to Azure DevOps REST API
    const base64Pat = btoa(`:${pat}`);
    const apiUrl = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/projects/${encodeURIComponent(project)}?api-version=7.1`;

    const azureResp = await fetch(apiUrl, {
      headers: { Authorization: `Basic ${base64Pat}` },
    });

    if (!azureResp.ok) {
      const errorText = await azureResp.text();
      const status = azureResp.status;
      let message = "Connection failed";
      if (status === 401 || status === 403) {
        message = "Invalid PAT or insufficient permissions";
      } else if (status === 404) {
        message = "Organization or project not found";
      } else {
        message = `Azure DevOps returned ${status}: ${errorText.slice(0, 200)}`;
      }
      return new Response(
        JSON.stringify({ success: false, error: message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const projectData = await azureResp.json();

    return new Response(
      JSON.stringify({
        success: true,
        project: {
          name: projectData.name,
          id: projectData.id,
          state: projectData.state,
          description: projectData.description ?? "",
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
