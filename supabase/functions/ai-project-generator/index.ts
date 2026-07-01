import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { action, clientId, clientName, serviceType, projectId, prompt } = await req.json();

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const callAI = async (systemPrompt, userPrompt) => {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "structured_output",
              description: "Return structured data",
              parameters: {
                type: "object",
                properties: {
                  tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                        estimated_days: { type: "number" },
                      },
                      required: ["title", "priority"],
                    },
                  },
                  summary: { type: "string" },
                  suggestions: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["tasks", "summary"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "structured_output" } },
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("OpenAI error:", resp.status, errText);
        throw new Error(`AI request failed: ${resp.status}`);
      }

      const data = await resp.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        return JSON.parse(toolCall.function.arguments);
      }
      throw new Error("No structured output from AI");
    };

    if (action === "generate_tasks") {
      const result = await callAI(
        "You are a project management AI for NEXUBOTICS, a tech company. Generate practical, actionable tasks for client projects. Each task should be specific and achievable.",
        `Generate 5-8 tasks for a new client project.\nClient: ${clientName}\nService Type: ${serviceType}\nGenerate tasks that cover the full delivery lifecycle: discovery, planning, execution, review, and delivery.`
      );

      const now = new Date();
      const tasksToInsert = result.tasks.map((t) => ({
        title: t.title,
        description: t.description || null,
        priority: t.priority || "medium",
        status: "todo",
        created_by: user.id,
        deadline: t.estimated_days
          ? new Date(now.getTime() + t.estimated_days * 86400000).toISOString()
          : null,
      }));

      const { data: createdTasks, error: taskError } = await supabase
        .from("tasks")
        .insert(tasksToInsert)
        .select("id, title");

      if (taskError) throw taskError;

      return new Response(JSON.stringify({
        success: true,
        tasks: createdTasks,
        summary: result.summary,
        suggestions: result.suggestions || [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "summarize_project") {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("title, status, priority, deadline, assigned_to")
        .eq("created_by", user.id);

      const result = await callAI(
        "You are a project management AI. Analyze project data and provide actionable insights.",
        `Summarize this project status and suggest next actions.\nProject tasks: ${JSON.stringify(tasks?.slice(0, 20))}\nProvide a clear summary and actionable suggestions.`
      );

      return new Response(JSON.stringify({
        success: true,
        summary: result.summary,
        suggestions: result.suggestions || [],
        tasks: result.tasks || [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "detect_delays") {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("title, status, priority, deadline")
        .neq("status", "completed");

      const overdue = (tasks || []).filter(
        (t) => t.deadline && new Date(t.deadline) < new Date()
      );

      const result = await callAI(
        "You are a project management AI. Identify risks and suggest fixes for delayed tasks.",
        `These tasks are overdue or at risk:\n${JSON.stringify(overdue.slice(0, 15))}\nAnalyze delays and suggest recovery actions.`
      );

      return new Response(JSON.stringify({
        success: true,
        summary: result.summary,
        delayedCount: overdue.length,
        suggestions: result.suggestions || [],
        tasks: result.tasks || [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "create_from_prompt") {
      const result = await callAI(
        "You are a project management AI for NEXUBOTICS. Create a structured project plan from a natural language description.",
        `Create a project plan from this description: "${prompt}"\nGenerate tasks with priorities and estimated timelines.`
      );

      const now = new Date();
      const tasksToInsert = result.tasks.map((t) => ({
        title: t.title,
        description: t.description || null,
        priority: t.priority || "medium",
        status: "todo",
        created_by: user.id,
        deadline: t.estimated_days
          ? new Date(now.getTime() + t.estimated_days * 86400000).toISOString()
          : null,
      }));

      const { data: createdTasks, error: taskError } = await supabase
        .from("tasks")
        .insert(tasksToInsert)
        .select("id, title");

      if (taskError) throw taskError;

      return new Response(JSON.stringify({
        success: true,
        tasks: createdTasks,
        summary: result.summary,
        suggestions: result.suggestions || [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-project-generator error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
