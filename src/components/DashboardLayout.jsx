import React, { useEffect, useRef } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Skeleton } from "@/components/ui/skeleton";
import GlobalMessageNotifier from "@/components/GlobalMessageNotifier";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationBell } from "@/components/NotificationBell";
import { QuickCreateMenu } from "@/components/QuickCreateMenu";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { supabase } from "@/integrations/supabase/client";
import { setupGlobalErrorHandlers } from "@/lib/errorLogger";
import { parseDevice } from "@/lib/messageSync";
import { applySessionPolicy } from "@/lib/sessionPolicy";

const DashboardLayout = () => {
  const { session, user, loading } = useAuth();
  const sessionIdRef = useRef(Math.random().toString(36).substring(2));

  useEffect(() => {
    setupGlobalErrorHandlers();
  }, []);

  useEffect(() => {
    if (!user) return;
    const sessionId = sessionIdRef.current;
    const device = parseDevice(navigator.userAgent, window.screen?.width);
    const deviceInfo = `${device.label} · ${window.screen?.width || "?"}x${window.screen?.height || "?"}`;

    const upsertSession = async () => {
      await supabase
        .from("user_sessions")
        .upsert(
          {
            user_id: user.id,
            session_id: sessionId,
            device_info: deviceInfo,
            last_active_at: new Date().toISOString(),
          },
          { onConflict: "user_id,session_id" }
        )
        .select();
    };

    const enforceSingleDevice = async () => {
      const { data: setting } = await supabase.from("user_device_settings").select("allow_multi_device").eq("user_id", user.id).maybeSingle();
      const allowMulti = setting?.allow_multi_device === true;
      const { data: rows } = await supabase.from("user_sessions").select("id, user_id, session_id, device_info, last_active_at").eq("user_id", user.id);
      const sessions = rows ?? [];
      const { remove } = applySessionPolicy({
        sessions,
        currentSessionId: sessionId,
        currentDeviceInfo: deviceInfo,
        allowMulti,
      });
      if (remove.length > 0) {
        await supabase.from("user_sessions").delete().in("id", remove.map((s) => s.id));
      }
    };

    (async () => {
      await upsertSession();
      await enforceSingleDevice();
    })();

    const interval = setInterval(async () => {
      await supabase.from("user_sessions").update({ last_active_at: new Date().toISOString() }).eq("user_id", user.id).eq("session_id", sessionId);
      await enforceSingleDevice();
    }, 60000);

    return () => {
      clearInterval(interval);
      supabase.from("user_sessions").delete().eq("user_id", user.id).eq("session_id", sessionId);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 w-48">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center glass border-b px-4 sticky top-0 z-10">
            <SidebarTrigger className="mr-4" />
            <div className="flex-1" />
            <QuickCreateMenu />
            <GlobalMessageNotifier />
            <NotificationBell />
            <ThemeToggle />
          </header>
          <AnnouncementBanner />
          <main className="flex-1 p-4 sm:p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
      <CommandPalette />
    </SidebarProvider>
  );
};

export default DashboardLayout;
