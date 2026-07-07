import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", caller.id).single();
    if (!roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only admins can create members" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { email, password, full_name, department, bio, role, custom_role_id, phone } = await req.json();
    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: "Email, password, and full name are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create user with email auto-confirmed — verification is disabled for the workspace
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = newUser.user.id;

    await adminClient.from("profiles").update({
      full_name,
      department: department || null,
      bio: bio || null,
      onboarding_status: "pending",
      custom_role_id: custom_role_id || null,
      phone: phone || null,
    }).eq("id", userId);

    if (role && role !== "member") {
      // BUGFIX: this used to be `.update({ role }).eq("user_id", userId)`.
      // That silently assigns nothing if the `on_auth_user_created` trigger
      // hasn't inserted the default 'member' row yet by the time this runs
      // (a real possibility under load / replication lag), leaving the new
      // member stuck on the default role with no error surfaced. Upserting
      // guarantees the row exists with the requested role either way.
      const { error: roleUpsertError } = await adminClient
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id" });
      if (roleUpsertError) {
        console.error("Role assignment failed for new member:", roleUpsertError);
      }
    }

    const { data: profileRow } = await adminClient.from("profiles").select("employee_id").eq("id", userId).single();

    return new Response(
      JSON.stringify({ success: true, user_id: userId, email, employee_id: profileRow?.employee_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});