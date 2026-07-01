import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, user_id } = await req.json();

    if (!token || typeof token !== "string" || token.length < 10) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!user_id || typeof user_id !== "string") {
      return new Response(JSON.stringify({ error: "Invalid user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("invite_tokens")
      .select("*")
      .eq("token", token)
      .is("used_by", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (inviteError || !invite) {
      return new Response(JSON.stringify({ error: "Invalid or expired invite" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .update({ role: invite.role })
      .eq("user_id", user_id);

    if (roleError) {
      return new Response(JSON.stringify({ error: "Failed to assign role" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabaseAdmin
      .from("invite_tokens")
      .update({ used_by: user_id, used_at: new Date().toISOString() })
      .eq("token", token);

    return new Response(JSON.stringify({ success: true, role: invite.role }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
