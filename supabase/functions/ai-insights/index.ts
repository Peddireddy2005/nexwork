import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, data } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "dashboard_summary") {
      systemPrompt = "You are a workspace analytics AI. Provide a brief, actionable 2-3 sentence summary of workspace health based on the data. Be encouraging but honest. Use emoji sparingly.";
      userPrompt = `Workspace stats: ${JSON.stringify(data)}. Summarize the workspace health and suggest one actionable improvement.`;
    } else if (type === "performance_insights") {
      systemPrompt = "You are a team performance analyst. Give 2-3 brief, constructive insights about team performance. Be positive and suggest improvements.";
      userPrompt = `Team performance data: ${JSON.stringify(data)}. Analyze and provide insights.`;
    } else if (type === "task_description") {
      systemPrompt = "You are a project manager assistant. Generate a clear, concise task description (2-3 sentences) based on the task title. Be specific and actionable.";
      userPrompt = `Generate a task description for: "${data.title}"`;
    } else if (type === "meeting_agenda") {
      systemPrompt = "You are a meeting facilitator. Generate a brief meeting agenda with 3-5 bullet points based on the meeting title and description.";
      userPrompt = `Generate agenda for meeting: "${data.title}" - ${data.description || "No description provided"}`;
    } else {
      throw new Error("Unknown insight type");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "Unable to generate insights.";

    return new Response(JSON.stringify({ insight: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
