import {
  LayoutDashboard,
  CheckSquare,
  MessageSquare,
  Users,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  CalendarClock,
  Monitor,
  Wifi,
  UserCircle,
  FolderKanban,
  ClipboardList,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ThemeToggle";

const mainItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Projects", url: "/projects", icon: FolderKanban },
  { title: "My Tasks", url: "/tasks", icon: CheckSquare },
  { title: "Messages", url: "/messages", icon: MessageSquare },
  { title: "Onboarding", url: "/onboarding", icon: ClipboardList },
  { title: "Scheduler", url: "/scheduler", icon: CalendarClock },
];

const adminItems = [
  { title: "Clients", url: "/clients", icon: UserCircle },
  { title: "Team", url: "/team", icon: Users },
  { title: "Performance", url: "/performance", icon: BarChart3 },
  { title: "Active Users", url: "/active-users", icon: Wifi },
  { title: "Sessions", url: "/sessions", icon: Monitor },
];

const bottomItems = [{ title: "Settings", url: "/settings", icon: Settings }];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, role, signOut } = useAuth();

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + "/");
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  const showAdmin = role === "admin" || role === "manager";

  const renderNavItems = (items) =>
    items.map((item) => (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild isActive={isActive(item.url)}>
          <NavLink to={item.url} end activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
            <item.icon className="mr-2 h-4 w-4" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center justify-between">
          {!collapsed && (
            <Link to="/dashboard" className="text-lg font-bold tracking-tight text-sidebar-foreground hover:opacity-80 transition-opacity" aria-label="Go to dashboard">
              <span className="text-primary">NEXUBOTICS</span>
            </Link>
          )}
          <button onClick={toggleSidebar} className="p-1 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors active:scale-95">
            <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderNavItems(mainItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Management</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderNavItems(adminItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{renderNavItems(bottomItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
            <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground text-xs">{initials}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{profile?.full_name || "User"}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">{role}</p>
            </div>
          )}
          {!collapsed && (
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button onClick={signOut} className="p-1.5 rounded-md text-sidebar-foreground/60 hover:text-destructive hover:bg-sidebar-accent transition-colors active:scale-95" title="Sign out">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {!collapsed && <p className="text-[10px] text-sidebar-foreground/40 mt-2 text-center">⌘K to search</p>}
      </SidebarFooter>
    </Sidebar>
  );
}
