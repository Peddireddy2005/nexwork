import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Plus, UserCircle, Trash2, Edit2, Mail, Phone, Loader2, Sparkles, FolderOpen } from "lucide-react";

const SERVICE_TYPES = ["AI Ads", "Automation", "Website Development", "Mobile App", "Branding", "Social Media", "SEO", "Consulting", "General"];

const statusColors = {
  active: "bg-green-500/10 text-green-700 dark:text-green-400",
  inactive: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  lead: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  prospect: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
};

const ClientsPage = () => {
  const { user, role } = useAuth();
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("active");
  const [serviceType, setServiceType] = useState("General");
  const [notes, setNotes] = useState("");
  const [autoGenerate, setAutoGenerate] = useState(true);

  const fetchClients = async () => {
    const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    setClients(data || []);
    setLoading(false);
  };

  const fetchProjects = async () => {
    const { data } = await supabase.from("client_projects").select("*").order("created_at", { ascending: false });
    setProjects(data || []);
  };

  useEffect(() => {
    fetchClients();
    fetchProjects();
  }, []);

  const resetForm = () => {
    setName("");
    setEmail("");
    setPhone("");
    setCompany("");
    setStatus("active");
    setServiceType("General");
    setNotes("");
    setEditingClient(null);
    setAutoGenerate(true);
  };

  const saveClient = async () => {
  if (!name.trim()) return toast.error("Name is required");
  setSaving(true);

  try {
    const payload = {
      name,
      email: email || null,
      phone: phone || null,
      company: company || null,
      status,
      notes: notes || null,
      service_type: serviceType,
    };

    if (editingClient) {
      const { error } = await supabase
        .from("clients")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", editingClient.id);
      if (error) throw error;
      toast.success("Client updated");
    } else {
      const { data: newClient, error: clientError } = await supabase
        .from("clients")
        .insert({ ...payload, created_by: user.id })
        .select()
        .single();
      if (clientError) throw clientError;

      // Legacy CRM-tab record
      const { error: cpError } = await supabase.from("client_projects").insert({
        client_id: newClient.id,
        name: `${name} - ${serviceType}`,
        status: "active",
        start_date: new Date().toISOString().split("T")[0],
      });
      if (cpError) console.error("client_projects insert failed:", cpError);

      // REAL project — this is what makes it show up under Projects / Dashboard / Kanban
      const startDate = new Date().toISOString().split("T")[0];
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 30);

      const { data: newProject, error: projError } = await supabase
        .from("projects")
        .insert({
          name: `${name} — ${serviceType}`,
          description: notes || null,
          client_id: newClient.id,
          owner_id: user.id,
          status: "active",
          start_date: startDate,
          deadline: deadline.toISOString().split("T")[0],
          service_types: [serviceType],
          created_by: user.id,
        })
        .select()
        .single();

      if (projError) {
        toast.error(`Client created, but project setup failed: ${projError.message}`);
      } else {
        await supabase.from("project_members").insert({
          project_id: newProject.id,
          user_id: user.id,
          role: "owner",
        });

        await supabase.from("activity_logs").insert({
          user_id: user.id,
          action: "client_created",
          entity_type: "client",
          entity_id: newClient.id,
          metadata: { name, project_id: newProject.id },
        });
      }

      if (autoGenerate && newProject) {
        toast.info("Generating tasks with AI...");
        try {
          const { data: aiData, error: aiError } = await supabase.functions.invoke("ai-project-generator", {
            body: {
              action: "generate_tasks",
              clientId: newClient.id,
              clientName: name,
              serviceType,
            },
          });
          if (aiError) throw aiError;
          if (aiData?.tasks?.length) {
            const ids = aiData.tasks.map((t) => t.id);
            await supabase.from("tasks").update({ project_id: newProject.id }).in("id", ids);
            toast.success(`Created client + project + ${aiData.tasks.length} AI-generated tasks`);
          } else {
            toast.success("Client & project created");
          }
        } catch (aiErr) {
          console.error("AI task generation failed:", aiErr);
          toast.success("Client & project created (AI tasks skipped)");
        }
      } else if (newProject) {
        toast.success("Client & project created");
      }
    }

    setShowCreate(false);
    resetForm();
    fetchClients();
    fetchProjects();
  } catch (e) {
    toast.error(e.message || "Failed to save client");
  } finally {
    setSaving(false);
  }
};

  const deleteClient = async (id) => {
    if (role !== "admin") {
      toast.error("Only admins can delete clients");
      return;
    }
    if (!confirm("Delete this client and all linked projects?")) return;
    await supabase.from("client_projects").delete().eq("client_id", id);
    await supabase.from("clients").delete().eq("id", id);
    toast.success("Client deleted");
    fetchClients();
    fetchProjects();
  };

  const openEdit = (c) => {
    if (role !== "admin") {
      toast.error("Only admins can edit clients");
      return;
    }
    setEditingClient(c);
    setName(c.name);
    setEmail(c.email || "");
    setPhone(c.phone || "");
    setCompany(c.company || "");
    setStatus(c.status);
    setServiceType(c.service_type || "General");
    setNotes(c.notes || "");
    setShowCreate(true);
  };

  const getClientProjects = (clientId) => projects.filter((p) => p.client_id === clientId);
  const getProjectProgress = (clientId) => {
    const cp = getClientProjects(clientId);
    if (cp.length === 0) return 0;
    return Math.round((cp.filter((p) => p.status === "completed").length / cp.length) * 100);
  };

  const isAdmin = role === "admin";

  if (role !== "admin" && role !== "manager") {
    return <div className="text-center py-12 text-muted-foreground">Access restricted to admins and managers</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <UserCircle className="h-6 w-6 text-primary" /> Clients & Delivery
          </h1>
          <p className="text-muted-foreground text-sm">Client → Project → Tasks → Delivery</p>
        </div>
        {isAdmin && (
          <Dialog
            open={showCreate}
            onOpenChange={(o) => {
              setShowCreate(o);
              if (!o) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingClient ? "Edit Client" : "Onboard New Client"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Client Name *" value={name} onChange={(e) => setName(e.target.value)} />
                <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Input placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
                <Select value={serviceType} onValueChange={setServiceType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Service Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" />
                {!editingClient && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={autoGenerate} onChange={(e) => setAutoGenerate(e.target.checked)} className="rounded" />
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Auto-generate tasks with AI
                  </label>
                )}
                <Button onClick={saveClient} className="w-full" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...
                    </>
                  ) : editingClient ? (
                    "Update"
                  ) : (
                    "Create & Launch Project"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{clients.length}</p>
            <p className="text-xs text-muted-foreground">Total Clients</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{clients.filter((c) => c.status === "active").length}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{clients.filter((c) => c.status === "lead").length}</p>
            <p className="text-xs text-muted-foreground">Leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{projects.length}</p>
            <p className="text-xs text-muted-foreground">Projects</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
        </TabsList>
        <TabsContent value="clients">
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : clients.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">No clients yet. Create your first client to start the delivery pipeline.</CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Projects</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{c.name}</p>
                          {c.company && <p className="text-xs text-muted-foreground">{c.company}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {c.service_type || "General"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                          {c.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {c.email}
                            </span>
                          )}
                          {c.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {c.phone}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[c.status]}>{c.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{getClientProjects(c.id).length}</span>
                          {getClientProjects(c.id).length > 0 && <Progress value={getProjectProgress(c.id)} className="w-16 h-1.5" />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {isAdmin && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteClient(c.id)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="projects">
          <Card>
            <CardContent className="py-4">
              {projects.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No projects yet. Create a client to auto-generate a project.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Budget</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Timeline</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{clients.find((c) => c.id === p.client_id)?.name || "—"}</TableCell>
                        <TableCell className="text-sm">{p.budget ? `$${p.budget.toLocaleString()}` : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{p.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.start_date ? new Date(p.start_date).toLocaleDateString() : "—"}
                          {p.end_date ? ` → ${new Date(p.end_date).toLocaleDateString()}` : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClientsPage;
