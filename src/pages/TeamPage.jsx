import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Search, UserPlus, Copy, Mail, Check, KeyRound, Eye, EyeOff, UserX, Trash2, UserCheck, Lock, User, Building2, ChevronRight, ClipboardList, Phone, Pencil, ExternalLink, History } from "lucide-react";
import { toast } from "sonner";
import { CustomRolesManager } from "@/components/team/CustomRolesManager";
import { OnboardingStepsEditor } from "@/components/team/OnboardingStepsEditor";
import { TeamSheetSetting, useTeamSheetUrl } from "@/components/team/TeamSheetSetting";
import { ProfileEditHistory } from "@/components/team/ProfileEditHistory";
import { toE164, isValidPhone } from "@/lib/phone";

const statusFlow = ["pending", "training", "active"];
const statusColors = { pending: "bg-warning/10 text-warning", training: "bg-info/10 text-info", active: "bg-success/10 text-success" };
const roleColors = { admin: "bg-destructive/10 text-destructive", manager: "bg-primary/10 text-primary", member: "bg-muted text-muted-foreground" };

const TeamPage = () => {
  const { user, role: currentRole, profile, refreshProfile } = useAuth();
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState({});
  const [customRoles, setCustomRoles] = useState([]);
  const [search, setSearch] = useState("");
  const [invites, setInvites] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState("");
  const [resetUserName, setResetUserName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [roleFilter, setRoleFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  const [historyFor, setHistoryFor] = useState(null);

  const sheetUrl = useTeamSheetUrl();

  const [editOpen, setEditOpen] = useState(false);
  const [editUserId, setEditUserId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBio, setEditBio] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const openEditMember = (m) => {
    setEditUserId(m.id);
    setEditName(m.full_name || "");
    setEditDepartment(m.department || "");
    setEditPhone(m.phone || "");
    setEditBio(m.bio || "");
    setEditOpen(true);
  };

  const saveEditMember = async () => {
    if (!editUserId) return;
    if (currentRole !== "admin") {
      toast.error("Only admins can edit member details");
      return;
    }
    if (!editName.trim()) {
      toast.error("Full name is required");
      return;
    }
    if (editPhone && !isValidPhone(editPhone)) {
      toast.error("Phone number is invalid. Use international format like +15551234567.");
      return;
    }
    const phoneE164 = toE164(editPhone);

    const original = members.find((m) => m.id === editUserId);
    const next = {
      full_name: editName.trim(),
      department: editDepartment.trim() || null,
      phone: phoneE164,
      bio: editBio.trim() || null,
    };

    setSavingEdit(true);
    const { error } = await supabase.from("profiles").update(next).eq("id", editUserId);
    if (error) {
      setSavingEdit(false);
      toast.error(error.message);
      return;
    }

    if (original && user) {
      const changes = {};
      ["full_name", "department", "phone", "bio"].forEach((k) => {
        const from = original[k] ?? null;
        const to = next[k] ?? null;
        if (from !== to) changes[k] = { from, to };
      });
      if (Object.keys(changes).length > 0) {
        await supabase.from("profile_edit_logs").insert({
          profile_id: editUserId,
          edited_by: user.id,
          changes,
        });
      }
    }

    setSavingEdit(false);
    toast.success("Member details updated");
    setEditOpen(false);
    fetchMembers();
    if (editUserId === user?.id) refreshProfile();
  };

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberPassword, setMemberPassword] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberDepartment, setMemberDepartment] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberBio, setMemberBio] = useState("");
  const [memberRole, setMemberRole] = useState("member");
  const [memberCustomRoleId, setMemberCustomRoleId] = useState("none");
  const [showPassword, setShowPassword] = useState(false);
  const [addingMember, setAddingMember] = useState(false);

  const [steps, setSteps] = useState([]);
  const [userProgress, setUserProgress] = useState({});

  const isAdmin = currentRole === "admin";
  const isManager = currentRole === "manager";
  const canInvite = isAdmin || isManager;

  const fetchCustomRoles = async () => {
    const { data } = await supabase.from("custom_roles").select("*").order("name");
    setCustomRoles(data || []);
  };

  const fetchMembers = async () => {
    const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
    setMembers(profiles || []);
    const { data: userRoles } = await supabase.from("user_roles").select("user_id, role");
    const roleMap = {};
    userRoles?.forEach((r) => {
      roleMap[r.user_id] = r.role;
    });
    setRoles(roleMap);
  };

  const fetchInvites = async () => {
    if (!canInvite) return;
    const { data } = await supabase.from("invite_tokens").select("*").order("created_at", { ascending: false }).limit(20);
    setInvites(data || []);
  };

  const fetchSteps = async () => {
    const { data } = await supabase.from("onboarding_steps").select("*").order("order_index");
    setSteps(data || []);
  };

  const fetchProgress = async () => {
    if (!user) return;
    const { data } = await supabase.from("user_onboarding").select("step_id, completed").eq("user_id", user.id);
    const map = {};
    data?.forEach((d) => {
      map[d.step_id] = d.completed;
    });
    setUserProgress(map);
  };

  useEffect(() => {
    fetchMembers();
    fetchInvites();
    fetchCustomRoles();
    fetchSteps();
    fetchProgress();
  }, []);

  const updateRole = async (userId, newRole) => {
    const { error } = await supabase.from("user_roles").update({ role: newRole }).eq("user_id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("System role updated");
    fetchMembers();
  };

  const updateCustomRole = async (userId, customRoleId) => {
    const value = customRoleId === "none" ? null : customRoleId;
    const { error } = await supabase.from("profiles").update({ custom_role_id: value }).eq("id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Custom role assigned");
    fetchMembers();
  };

  const createInvite = async () => {
    setCreating(true);
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) {
      toast.error("Not authenticated");
      setCreating(false);
      return;
    }
    const { data, error } = await supabase.from("invite_tokens").insert({ email: inviteEmail || null, role: inviteRole, created_by: u.id }).select().single();
    if (error) {
      toast.error(error.message);
    } else {
      const link = `${window.location.origin}/invite?token=${data.token}`;
      await navigator.clipboard.writeText(link);
      toast.success("Invite link created & copied!");
      setInviteEmail("");
      setInviteRole("member");
      setInviteOpen(false);
      fetchInvites();
    }
    setCreating(false);
  };

  const copyLink = async (token, id) => {
    await navigator.clipboard.writeText(`${window.location.origin}/invite?token=${token}`);
    setCopiedId(id);
    toast.success("Link copied");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getCustomRoleName = (customRoleId) => (customRoleId ? customRoles.find((r) => r.id === customRoleId) : null);

  const openResetPassword = (userId, name) => {
    setResetUserId(userId);
    setResetUserName(name);
    setNewPassword("");
    setShowNewPassword(false);
    setResetOpen(true);
  };

  const resetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setResetting(true);
    try {
      const res = await supabase.functions.invoke("reset-member-password", { body: { user_id: resetUserId, new_password: newPassword } });
      if (res.error) toast.error(res.error.message || "Failed");
      else if (res.data?.error) toast.error(res.data.error);
      else {
        toast.success(`Password reset for ${resetUserName}`);
        setResetOpen(false);
      }
    } catch (err) {
      toast.error(err.message || "Failed");
    }
    setResetting(false);
  };

  const manageMember = async (userId, name, action) => {
    const confirmMsg = action === "delete" ? `Permanently delete ${name}?` : action === "deactivate" ? `Deactivate ${name}?` : `Reactivate ${name}?`;
    if (!confirm(confirmMsg)) return;
    try {
      const res = await supabase.functions.invoke("manage-member", { body: { user_id: userId, action } });
      if (res.error) toast.error(res.error.message || `Failed`);
      else if (res.data?.error) toast.error(res.data.error);
      else {
        toast.success(`${name} ${action === "delete" ? "deleted" : action === "deactivate" ? "deactivated" : "reactivated"}`);
        fetchMembers();
      }
    } catch (err) {
      toast.error(err.message || "Failed");
    }
  };

  const updateUserStatus = async (userId, newStatus) => {
    const { error } = await supabase.from("profiles").update({ onboarding_status: newStatus }).eq("id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Status updated");
    fetchMembers();
    if (userId === user?.id) refreshProfile();
  };

  const toggleStep = async (stepId) => {
    if (!user) return;
    const done = userProgress[stepId] || false;
    if (done) {
      await supabase.from("user_onboarding").update({ completed: false, completed_at: null }).eq("user_id", user.id).eq("step_id", stepId);
    } else {
      const { data } = await supabase.from("user_onboarding").select("id").eq("user_id", user.id).eq("step_id", stepId).single();
      if (data) await supabase.from("user_onboarding").update({ completed: true, completed_at: new Date().toISOString() }).eq("id", data.id);
      else await supabase.from("user_onboarding").insert({ user_id: user.id, step_id: stepId, completed: true, completed_at: new Date().toISOString() });
    }
    fetchProgress();
  };

  const addMember = async () => {
    if (!memberEmail || !memberPassword || !memberName) {
      toast.error("Email, password, and full name are required");
      return;
    }
    if (memberPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setAddingMember(true);
    try {
      const res = await supabase.functions.invoke("create-member", {
        body: { email: memberEmail, password: memberPassword, full_name: memberName, department: memberDepartment || null, phone: memberPhone || null, bio: memberBio || null, role: memberRole, custom_role_id: memberCustomRoleId === "none" ? null : memberCustomRoleId },
      });
      if (res.error) toast.error(res.error.message || "Failed");
      else if (res.data?.error) toast.error(res.data.error);
      else {
        toast.success(`Member "${memberName}" created! A verification email was sent.`);
        setMemberEmail("");
        setMemberPassword("");
        setMemberName("");
        setMemberDepartment("");
        setMemberPhone("");
        setMemberBio("");
        setMemberRole("member");
        setMemberCustomRoleId("none");
        setAddMemberOpen(false);
        fetchMembers();
      }
    } catch (err) {
      toast.error(err.message || "Failed");
    }
    setAddingMember(false);
  };

  const filtered = members.filter((m) => {
    const q = search.toLowerCase().trim();
    const matchesSearch = !q || m.full_name?.toLowerCase().includes(q) || m.department?.toLowerCase().includes(q) || m.employee_id?.toLowerCase().includes(q) || (roles[m.id] || "member").toLowerCase().includes(q);
    const matchesRole = roleFilter === "all" || (roles[m.id] || "member") === roleFilter;
    const matchesDept = departmentFilter === "all" || (m.department || "").toLowerCase() === departmentFilter.toLowerCase();
    return matchesSearch && matchesRole && matchesDept;
  });
  const activeInvites = invites.filter((i) => !i.used_by && new Date(i.expires_at) > new Date());

  const departments = Array.from(new Set(members.map((m) => m.department).filter(Boolean)));

  const completedCount = steps.filter((s) => userProgress[s.id]).length;
  const progressPercent = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ lineHeight: "1.2" }}>
            Team & Onboarding
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{members.length} members</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ID, name, dept, role..." className="pl-9 h-9" />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-32 h-9 text-xs">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="member">Member</SelectItem>
            </SelectContent>
          </Select>
          {departments.length > 0 && (
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-36 h-9 text-xs">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(isAdmin || isManager) && sheetUrl && (
            <Button size="sm" variant="outline" asChild className="gap-1.5">
              <a href={sheetUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Team Sheet
              </a>
            </Button>
          )}
          {isAdmin && (
            <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 active:scale-[0.97]">
                  <UserPlus className="h-4 w-4" /> Add Member
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Onboard New Member</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Full Name *</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="John Smith" className="pl-9" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Email *</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="john@company.com" type="email" className="pl-9" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Password *</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={memberPassword} onChange={(e) => setMemberPassword(e.target.value)} placeholder="Min 6 characters" type={showPassword ? "text" : "password"} className="pl-9 pr-9" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Department</Label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={memberDepartment} onChange={(e) => setMemberDepartment(e.target.value)} placeholder="e.g. Marketing" className="pl-9" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={memberPhone} onChange={(e) => setMemberPhone(e.target.value)} placeholder="+1 555 123 4567" type="tel" className="pl-9" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>System Role</Label>
                      <Select value={memberRole} onValueChange={setMemberRole}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {customRoles.length > 0 && (
                      <div className="space-y-2">
                        <Label>Custom Role</Label>
                        <Select value={memberCustomRoleId} onValueChange={setMemberCustomRoleId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {customRoles.map((cr) => (
                              <SelectItem key={cr.id} value={cr.id}>
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cr.color }} />
                                  {cr.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Bio</Label>
                      <Textarea value={memberBio} onChange={(e) => setMemberBio(e.target.value)} placeholder="Short bio..." rows={2} />
                    </div>
                  </div>
                  <Button onClick={addMember} className="w-full gap-2 active:scale-[0.98]" disabled={addingMember}>
                    <UserPlus className="h-4 w-4" />
                    {addingMember ? "Creating..." : "Create Member Account"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">A verification email will be sent — the member must confirm before they can log in.</p>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="members" className="w-full">
        <TabsList>
          <TabsTrigger value="members" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Members
          </TabsTrigger>
          <TabsTrigger value="onboarding" className="gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" /> Onboarding
          </TabsTrigger>
          {isAdmin && <TabsTrigger value="roles" className="gap-1.5">Custom Roles</TabsTrigger>}
          {isAdmin && <TabsTrigger value="settings" className="gap-1.5">Settings</TabsTrigger>}
        </TabsList>

        <TabsContent value="members" className="space-y-4 mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((member) => {
              const customRole = getCustomRoleName(member.custom_role_id);
              return (
                <Card key={member.id} className="shadow-sm hover:shadow-md transition-[box-shadow]">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-11 w-11">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">{member.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "??"}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">{member.full_name || "Unknown"}</h3>
                        {member.employee_id && <p className="text-[10px] text-muted-foreground font-mono mt-0.5" title="Employee ID (non-editable)">{member.employee_id}</p>}
                        {member.user_handle && <p className="text-[11px] text-primary font-mono">@{member.user_handle}</p>}
                        {(isAdmin || isManager) && <p className="text-xs text-muted-foreground">{member.department || "No department"}</p>}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {(isAdmin || isManager) && (
                            <Badge variant="secondary" className={`text-[10px] ${statusColors[member.onboarding_status] || ""}`}>
                              {member.onboarding_status}
                            </Badge>
                          )}
                          <Badge variant="secondary" className={`text-[10px] capitalize ${roleColors[roles[member.id]] || ""}`}>
                            {roles[member.id] || "member"}
                          </Badge>
                          {customRole && (
                            <Badge variant="outline" className="text-[10px]" style={{ borderColor: customRole.color, color: customRole.color }}>
                              {customRole.name}
                            </Badge>
                          )}
                        </div>
                        {isAdmin && (
                          <div className="mt-3 space-y-2">
                            <Select value={roles[member.id] || "member"} onValueChange={(v) => updateRole(member.id, v)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="member">Member</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={member.custom_role_id || "none"} onValueChange={(v) => updateCustomRole(member.id, v)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Custom role..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No custom role</SelectItem>
                                {customRoles.map((cr) => (
                                  <SelectItem key={cr.id} value={cr.id}>
                                    <div className="flex items-center gap-2">
                                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cr.color }} />
                                      {cr.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex gap-1.5">
                              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1 active:scale-[0.97]" onClick={() => openEditMember(member)}>
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </Button>
                              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1 active:scale-[0.97]" onClick={() => setHistoryFor({ id: member.id, name: member.full_name || "Member" })}>
                                <History className="h-3.5 w-3.5" /> History
                              </Button>
                              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1 active:scale-[0.97]" onClick={() => openResetPassword(member.id, member.full_name || "Unknown")}>
                                <KeyRound className="h-3.5 w-3.5" /> Reset PW
                              </Button>
                            </div>
                            <div className="flex gap-1.5">
                              {member.onboarding_status === "active" ? (
                                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1 text-warning hover:text-warning active:scale-[0.97]" onClick={() => manageMember(member.id, member.full_name || "Unknown", "deactivate")}>
                                  <UserX className="h-3.5 w-3.5" /> Deactivate
                                </Button>
                              ) : (
                                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1 text-success hover:text-success active:scale-[0.97]" onClick={() => manageMember(member.id, member.full_name || "Unknown", "reactivate")}>
                                  <UserCheck className="h-3.5 w-3.5" /> Activate
                                </Button>
                              )}
                            </div>
                            <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 active:scale-[0.97]" onClick={() => manageMember(member.id, member.full_name || "Unknown", "delete")}>
                              <Trash2 className="h-3.5 w-3.5" /> Delete Member
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && (
              <Card className="shadow-sm col-span-full">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No members found</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="onboarding" className="space-y-4 mt-4">
          <Card className="shadow-sm">
            <CardContent className="py-4">
              <div className="flex items-center justify-center gap-2 mb-4">
                {statusFlow.map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${profile?.onboarding_status === s ? statusColors[s] + " ring-2 ring-offset-1 ring-current" : "bg-muted text-muted-foreground"}`}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </div>
                    {i < statusFlow.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/40" />}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Progress</span>
                <span className="text-sm font-medium tabular-nums">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {completedCount} of {steps.length} steps completed
              </p>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {steps.length === 0 ? (
              <Card className="shadow-sm">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No onboarding steps yet.</p>
                </CardContent>
              </Card>
            ) : (
              steps.map((step, i) => (
                <Card key={step.id} className={`shadow-sm transition-all ${userProgress[step.id] ? "opacity-60" : ""}`}>
                  <CardContent className="py-3 px-4 flex items-start gap-3">
                    <Checkbox checked={userProgress[step.id] || false} onCheckedChange={() => toggleStep(step.id)} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${userProgress[step.id] ? "line-through" : ""}`}>
                        {i + 1}. {step.title}
                      </p>
                      {step.description && <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {isAdmin && members.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Manage User Onboarding Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {members.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium truncate flex-1 min-w-0">{p.full_name || "Unknown"}</p>
                      <Select value={p.onboarding_status} onValueChange={(v) => updateUserStatus(p.id, v)}>
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="training">Training</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {isAdmin && (
          <TabsContent value="roles" className="mt-4">
            <CustomRolesManager onRolesChange={fetchCustomRoles} />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="settings" className="mt-4 space-y-4">
            <TeamSheetSetting />
            <OnboardingStepsEditor />
            <Button variant="outline" size="sm" onClick={fetchSteps}>
              Refresh onboarding list
            </Button>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Set a new password for <span className="font-medium text-foreground">{resetUserName}</span>
            </p>
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" type={showNewPassword ? "text" : "password"} className="pl-9 pr-9" />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button onClick={resetPassword} className="w-full gap-2 active:scale-[0.98]" disabled={resetting}>
              <KeyRound className="h-4 w-4" />
              {resetting ? "Resetting..." : "Reset Password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Member Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Department</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={editDepartment} onChange={(e) => setEditDepartment(e.target.value)} className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} type="tel" className="pl-9" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={3} />
            </div>
            <Button onClick={saveEditMember} className="w-full gap-2" disabled={savingEdit}>
              <Check className="h-4 w-4" />
              {savingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyFor} onOpenChange={(o) => { if (!o) setHistoryFor(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit History — {historyFor?.name}</DialogTitle>
          </DialogHeader>
          <ProfileEditHistory profileId={historyFor?.id ?? null} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamPage;
