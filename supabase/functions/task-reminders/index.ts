import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, status, deadline, assigned_to, priority")
      .not("deadline", "is", null)
      .neq("status", "completed")
      .lte("deadline", tomorrow.toISOString());

    if (!tasks || tasks.length === 0) {
      return new Response(JSON.stringify({ message: "No tasks needing reminders" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const taskIds = tasks.map((t) => t.id);
    const { data: assignees } = await supabase
      .from("task_assignees")
      .select("task_id, user_id")
      .in("task_id", taskIds);

    const userTasks = {};
    tasks.forEach((t) => {
      if (t.assigned_to) {
        if (!userTasks[t.assigned_to]) userTasks[t.assigned_to] = [];
        userTasks[t.assigned_to].push(t);
      }
    });
    assignees?.forEach((a) => {
      if (!userTasks[a.user_id]) userTasks[a.user_id] = [];
      const task = tasks.find((t) => t.id === a.task_id);
      if (task && !userTasks[a.user_id].some((t) => t.id === task.id)) {
        userTasks[a.user_id].push(task);
      }
    });

    let notificationsCreated = 0;
    for (const [userId, userTaskList] of Object.entries(userTasks)) {
      const overdue = userTaskList.filter((t) => new Date(t.deadline) < now);
      const upcoming = userTaskList.filter((t) => new Date(t.deadline) >= now);

      let message = "";
      if (overdue.length > 0) {
        message += `⚠️ ${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}: ${overdue.map((t) => t.title).join(", ")}. `;
      }
      if (upcoming.length > 0) {
        message += `⏰ ${upcoming.length} task${upcoming.length > 1 ? "s" : ""} due soon: ${upcoming.map((t) => t.title).join(", ")}`;
      }

      if (message) {
        await supabase.from("notifications").insert({
          user_id: userId,
          title: overdue.length > 0 ? "⚠️ Task Deadline Reminder" : "⏰ Tasks Due Soon",
          message: message.trim(),
          link: "/tasks",
        });
        notificationsCreated++;
      }
    }

    return new Response(JSON.stringify({
      message: `Sent ${notificationsCreated} reminders for ${tasks.length} tasks`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
