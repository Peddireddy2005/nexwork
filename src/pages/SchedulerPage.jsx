import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, Plus, Link2, ExternalLink, Trash2, Users, Video, Pencil, Zap } from "lucide-react";
import { format, isToday, isTomorrow, isPast } from "date-fns";
import { toast } from "sonner";

const SchedulerPage = () => {
  const { user, role } = useAuth();
  const canManage = role === "admin" || role === "manager";
  const [meetings, setMeetings] = useState([]);
  const [attendees, setAttendees] = useState({});
  const [profiles, setProfiles] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("10:00");
  const [duration, setDuration] = useState("30");
  const [meetingLink, setMeetingLink] = useState("");
  const [selectedAttendees, setSelectedAttendees] = useState([]);
  const [filter, setFilter] = useState("upcoming");

  const fetchMeetings = async () => {
    const { data } = await supabase.from("meetings").select("*").order("meeting_date", { ascending: true });
    setMeetings(data || []);
  };

  const fetchAttendees = async () => {
    const { data } = await supabase.from("meeting_attendees").select("*");
    const map = {};
    (data || []).forEach((a) => {
      if (!map[a.meeting_id]) map[a.meeting_id] = [];
      map[a.meeting_id].push(a);
    });
    setAttendees(map);
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from("profiles").select("id, full_name");
    setProfiles(data || []);
    const map = {};
    (data || []).forEach((p) => {
      map[p.id] = p.full_name || "Unknown";
    });
    setProfileMap(map);
  };

  useEffect(() => {
    fetchMeetings();
    fetchAttendees();
    fetchProfiles();
  }, []);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setMeetingDate("");
    setMeetingTime("10:00");
    setDuration("30");
    setMeetingLink("");
    setSelectedAttendees([]);
  };

  const createMeeting = async (e) => {
    e.preventDefault();
    if (!user || !title.trim() || !meetingDate) return;
    const dateTime = new Date(`${meetingDate}T${meetingTime}`).toISOString();
    const { data, error } = await supabase
      .from("meetings")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        meeting_date: dateTime,
        duration_minutes: parseInt(duration),
        meeting_link: meetingLink.trim() || null,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (selectedAttendees.length > 0 && data) {
      const inserts = selectedAttendees.map((uid) => ({ meeting_id: data.id, user_id: uid }));
      await supabase.from("meeting_attendees").insert(inserts);
    }
    toast.success("Meeting scheduled!");
    resetForm();
    setCreateOpen(false);
    fetchMeetings();
    fetchAttendees();
  };

  const openEditMeeting = (meeting) => {
    setEditingMeeting(meeting);
    setTitle(meeting.title);
    setDescription(meeting.description || "");
    const d = new Date(meeting.meeting_date);
    setMeetingDate(format(d, "yyyy-MM-dd"));
    setMeetingTime(format(d, "HH:mm"));
    setDuration(String(meeting.duration_minutes));
    setMeetingLink(meeting.meeting_link || "");
    setSelectedAttendees((attendees[meeting.id] || []).map((a) => a.user_id));
    setEditOpen(true);
  };

  const updateMeeting = async (e) => {
    e.preventDefault();
    if (!editingMeeting || !title.trim() || !meetingDate) return;
    const dateTime = new Date(`${meetingDate}T${meetingTime}`).toISOString();
    const { error } = await supabase
      .from("meetings")
      .update({
        title: title.trim(),
        description: description.trim() || null,
        meeting_date: dateTime,
        duration_minutes: parseInt(duration),
        meeting_link: meetingLink.trim() || null,
      })
      .eq("id", editingMeeting.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("meeting_attendees").delete().eq("meeting_id", editingMeeting.id);
    if (selectedAttendees.length > 0) {
      await supabase.from("meeting_attendees").insert(selectedAttendees.map((uid) => ({ meeting_id: editingMeeting.id, user_id: uid })));
    }
    toast.success("Meeting updated!");
    resetForm();
    setEditOpen(false);
    setEditingMeeting(null);
    fetchMeetings();
    fetchAttendees();
  };

  const deleteMeeting = async (id) => {
    if (!confirm("Delete this meeting?")) return;
    const { error } = await supabase.from("meetings").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Meeting deleted");
      fetchMeetings();
    }
  };

  const createInstantMeeting = () => {
    window.open("https://meet.google.com/new", "_blank");
  };

  const addToGoogleCalendar = (meeting) => {
    const start = new Date(meeting.meeting_date);
    const end = new Date(start.getTime() + meeting.duration_minutes * 60000);
    const fmt = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: meeting.title,
      dates: `${fmt(start)}/${fmt(end)}`,
      details: meeting.description || "",
      ...(meeting.meeting_link ? { location: meeting.meeting_link } : {}),
    });
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank");
  };

  const toggleAttendee = (uid) => {
    setSelectedAttendees((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]));
  };

  const getInitials = (name) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const getDateLabel = (dateStr) => {
    const d = new Date(dateStr);
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "EEE, MMM d");
  };

  const filteredMeetings = meetings.filter((m) => {
    if (filter === "upcoming") return !isPast(new Date(m.meeting_date));
    if (filter === "past") return isPast(new Date(m.meeting_date));
    return true;
  });

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const renderMeetingForm = (onSubmit, submitLabel) => (
    <form onSubmit={onSubmit} className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto">
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly standup" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Date *</Label>
          <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} min={todayStr} required />
        </div>
        <div className="space-y-2">
          <Label>Time *</Label>
          <Input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Duration</Label>
        <Select value={duration} onValueChange={setDuration}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15">15 minutes</SelectItem>
            <SelectItem value="30">30 minutes</SelectItem>
            <SelectItem value="45">45 minutes</SelectItem>
            <SelectItem value="60">1 hour</SelectItem>
            <SelectItem value="90">1.5 hours</SelectItem>
            <SelectItem value="120">2 hours</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" /> Meeting Link
        </Label>
        <Input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://meet.google.com/... or zoom link" />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Meeting agenda..." rows={2} />
      </div>
      <div className="space-y-2">
        <Label>Attendees</Label>
        <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2">
          {profiles.filter((p) => p.id !== user?.id).map((p) => (
            <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer">
              <input type="checkbox" checked={selectedAttendees.includes(p.id)} onChange={() => toggleAttendee(p.id)} className="rounded border-border" />
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[8px] bg-primary/10 text-primary">{getInitials(p.full_name || "??")}</AvatarFallback>
              </Avatar>
              <span className="text-sm">{p.full_name || "Unknown"}</span>
            </label>
          ))}
        </div>
      </div>
      <Button type="submit" className="w-full">
        {submitLabel}
      </Button>
    </form>
  );

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ lineHeight: "1.2" }}>
            Scheduler
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{filteredMeetings.length} meetings</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filter} onValueChange={(v) => setFilter(v)}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="past">Past</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          {canManage && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={createInstantMeeting}>
                <Zap className="h-4 w-4" /> Instant Meet
              </Button>
              <Dialog
                open={createOpen}
                onOpenChange={(o) => {
                  setCreateOpen(o);
                  if (!o) resetForm();
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" /> Schedule
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Schedule Meeting</DialogTitle>
                  </DialogHeader>
                  {renderMeetingForm(createMeeting, "Schedule Meeting")}
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {filteredMeetings.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No {filter === "past" ? "past" : "upcoming"} meetings</p>
            </CardContent>
          </Card>
        ) : (
          filteredMeetings.map((meeting) => {
            const meetDate = new Date(meeting.meeting_date);
            const past = isPast(meetDate);
            const meetingAttendees = attendees[meeting.id] || [];
            return (
              <Card key={meeting.id} className={`shadow-sm hover:shadow-md transition-[box-shadow] ${past ? "opacity-60" : ""}`}>
                <CardContent className="py-4 px-4 sm:px-6">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex items-center gap-3 sm:w-32 shrink-0">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground font-medium">{getDateLabel(meeting.meeting_date)}</p>
                        <p className="text-lg font-bold tabular-nums">{format(meetDate, "HH:mm")}</p>
                        <p className="text-[10px] text-muted-foreground">{meeting.duration_minutes}min</p>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-sm">{meeting.title}</h3>
                          {meeting.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{meeting.description}</p>}
                        </div>
                        {past && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            Past
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {meeting.meeting_link && (
                          <a href={meeting.meeting_link} target="_blank" rel="noopener noreferrer">
                            <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-primary/10 text-[10px]">
                              <Video className="h-3 w-3" /> Join
                              <ExternalLink className="h-2.5 w-2.5" />
                            </Badge>
                          </a>
                        )}
                        {meetingAttendees.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <div className="flex -space-x-1.5">
                              {meetingAttendees.slice(0, 4).map((a) => (
                                <Avatar key={a.id} className="h-5 w-5 border border-background">
                                  <AvatarFallback className="text-[7px] bg-muted">{getInitials(profileMap[a.user_id] || "??")}</AvatarFallback>
                                </Avatar>
                              ))}
                              {meetingAttendees.length > 4 && <span className="text-[10px] text-muted-foreground ml-1">+{meetingAttendees.length - 4}</span>}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addToGoogleCalendar(meeting)}>
                          <Calendar className="h-3 w-3" /> Google Calendar
                        </Button>
                        {canManage && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditMeeting(meeting)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteMeeting(meeting.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) {
            resetForm();
            setEditingMeeting(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Meeting</DialogTitle>
          </DialogHeader>
          {renderMeetingForm(updateMeeting, "Update Meeting")}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SchedulerPage;
