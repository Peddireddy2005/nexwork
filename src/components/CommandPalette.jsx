import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { LayoutDashboard, CheckSquare, MessageSquare, Users, BarChart3, Settings, CalendarClock, FolderKanban, UserCircle, ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, group: "Navigation" },
  { label: "Projects", path: "/projects", icon: FolderKanban, group: "Navigation" },
  { label: "My Tasks", path: "/tasks", icon: CheckSquare, group: "Navigation" },
  { label: "Messages", path: "/messages", icon: MessageSquare, group: "Navigation" },
  { label: "Onboarding", path: "/onboarding", icon: ClipboardList, group: "Navigation" },
  { label: "Scheduler", path: "/scheduler", icon: CalendarClock, group: "Navigation" },
  { label: "Settings", path: "/settings", icon: Settings, group: "Navigation" },
];

const adminItems = [
  { label: "Team", path: "/team", icon: Users, group: "Management" },
  { label: "Performance", path: "/performance", icon: BarChart3, group: "Management" },
  { label: "Clients & CRM", path: "/clients", icon: UserCircle, group: "Management" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { role } = useAuth();
  const showAdmin = role === "admin" || role === "manager";

  useEffect(() => {
    const down = (e) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (path) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {navItems.map((item) => (
            <CommandItem key={item.path} onSelect={() => runCommand(item.path)}>
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {showAdmin && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Management">
              {adminItems.map((item) => (
                <CommandItem key={item.path} onSelect={() => runCommand(item.path)}>
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
