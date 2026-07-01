import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, CheckSquare, FolderKanban, UserCircle, CalendarClock, MessageSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NewClientWizard } from "@/components/clients/NewClientWizard";

export function QuickCreateMenu() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "admin" || role === "manager";
  const [showClient, setShowClient] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="default" className="gap-1.5 hidden sm:inline-flex">
            <Plus className="h-4 w-4" /> New
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Quick create</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate("/tasks?new=1")}>
            <CheckSquare className="h-4 w-4 mr-2" /> Task
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate("/projects?new=1")}>
            <FolderKanban className="h-4 w-4 mr-2" /> Project
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem onSelect={() => setShowClient(true)}>
              <UserCircle className="h-4 w-4 mr-2" /> Client
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => navigate("/scheduler?new=1")}>
            <CalendarClock className="h-4 w-4 mr-2" /> Meeting
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate("/messages")}>
            <MessageSquare className="h-4 w-4 mr-2" /> Message
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewClientWizard open={showClient} onOpenChange={setShowClient} />
    </>
  );
}
