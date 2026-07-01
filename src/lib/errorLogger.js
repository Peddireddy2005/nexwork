import { supabase } from "@/integrations/supabase/client";

export async function logError(entry) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("error_logs").insert({
      error_message: entry.error_message.slice(0, 2000),
      stack_trace: entry.stack_trace?.slice(0, 5000) || null,
      user_id: entry.user_id || user?.id || null,
      action: entry.action || null,
      component: entry.component || null,
      severity: entry.severity || "error",
      metadata: entry.metadata || {},
    });
  } catch (e) {
    console.error("[ErrorLogger] Failed to log error:", e);
  }
}

export function setupGlobalErrorHandlers() {
  window.onerror = (message, source, lineno, colno, error) => {
    logError({
      error_message: String(message),
      stack_trace: error?.stack,
      action: "unhandled_error",
      component: source ? `${source}:${lineno}:${colno}` : undefined,
      severity: "critical",
    });
  };

  window.onunhandledrejection = (event) => {
    const error = event.reason;
    logError({
      error_message: error?.message || String(error),
      stack_trace: error?.stack,
      action: "unhandled_promise_rejection",
      severity: "critical",
    });
  };
}
