-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'member');
CREATE TYPE public.task_status AS ENUM ('todo', 'in_progress', 'review', 'completed');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.onboarding_status_type AS ENUM ('pending', 'training', 'active');

-- Updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  department TEXT,
  phone TEXT,
  user_handle TEXT UNIQUE,
  employee_id TEXT UNIQUE DEFAULT 'EMP-' || LPAD(nextval('public.employee_id_seq')::TEXT, 4, '0'),
  onboarding_status TEXT NOT NULL DEFAULT 'pending' CHECK (onboarding_status IN ('pending','training','active')),
  custom_role_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'member',
  UNIQUE(user_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role::text FROM public.user_roles WHERE user_id = _user_id
$$;

-- Custom roles
CREATE TABLE public.custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  color TEXT DEFAULT '#3b82f6',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

-- Invite tokens
CREATE TABLE public.invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  role TEXT NOT NULL DEFAULT 'member',
  email TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;

-- Clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  company TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  service_type TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  start_date DATE,
  deadline DATE,
  budget NUMERIC,
  service_types TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Project members
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Client projects (CRM projects, separate from main projects)
CREATE TABLE public.client_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  budget NUMERIC,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.client_projects ENABLE ROW LEVEL SECURITY;

-- Tasks
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','review','completed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  deadline TIMESTAMPTZ,
  start_date DATE,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Task assignees (multi-assignee)
CREATE TABLE public.task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(task_id, user_id)
);
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

-- Task attachments
CREATE TABLE public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

-- Task comments
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- Checklists
CREATE TABLE public.checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Checklist',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;

-- Task completion history (for performance tracking)
CREATE TABLE public.task_completion_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  task_title TEXT NOT NULL,
  task_description TEXT,
  task_priority TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  was_group_task BOOLEAN NOT NULL DEFAULT false,
  group_members UUID[] DEFAULT '{}',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_completion_history ENABLE ROW LEVEL SECURITY;

-- Channels
CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_direct BOOLEAN NOT NULL DEFAULT false,
  encryption_key TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

-- Channel members
CREATE TABLE public.channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  reply_to UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  pinned_at TIMESTAMPTZ,
  pinned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Message reactions
CREATE TABLE public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Onboarding steps
CREATE TABLE public.onboarding_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  default_status TEXT DEFAULT 'pending',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;

-- User onboarding progress
CREATE TABLE public.user_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.onboarding_steps(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, step_id)
);
ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

-- Performance ratings
CREATE TABLE public.performance_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
  comment TEXT,
  week_start DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, rated_by, week_start)
);
ALTER TABLE public.performance_ratings ENABLE ROW LEVEL SECURITY;

-- Meetings
CREATE TABLE public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  meeting_date TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  meeting_link TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.meeting_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(meeting_id, user_id)
);
ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;

-- Sessions tracking
CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  device_info TEXT,
  ip_address TEXT,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, session_id)
);
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_device_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  allow_multi_device BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_device_settings ENABLE ROW LEVEL SECURITY;

-- Automation rules
CREATE TABLE public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

-- Announcements
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','critical')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Activity logs
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Error logs
CREATE TABLE public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT,
  component TEXT,
  severity TEXT DEFAULT 'error',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Profile edit logs
CREATE TABLE public.profile_edit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  edited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_edit_logs ENABLE ROW LEVEL SECURITY;

-- App settings
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Auto-create profile on signup
CREATE SEQUENCE IF NOT EXISTS public.employee_id_seq START 1001;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, employee_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    'EMP-' || LPAD(nextval('public.employee_id_seq')::TEXT, 4, '0')
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member') ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper for invite token verification
CREATE OR REPLACE FUNCTION public.check_invite_token(p_token TEXT)
RETURNS TABLE (
  invite_role TEXT,
  invite_email TEXT,
  used BOOLEAN,
  expired BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    role::text AS invite_role,
    email AS invite_email,
    (used_by IS NOT NULL) AS used,
    (expires_at < now()) AS expired
  FROM public.invite_tokens
  WHERE token = p_token;
$$;

-- RLS Policies

-- Profiles
CREATE POLICY "Authenticated view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "System inserts profiles" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins update any profile" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- User roles
CREATE POLICY "Roles viewable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System inserts roles" ON public.user_roles FOR INSERT WITH CHECK (true);

-- Custom roles
CREATE POLICY "View custom roles" ON public.custom_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage custom roles" ON public.custom_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Invite tokens
CREATE POLICY "Admins manage invites" ON public.invite_tokens FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Public read invite by token" ON public.invite_tokens FOR SELECT USING (true);

-- Clients
CREATE POLICY "Admins and managers view clients" ON public.clients FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Admins manage clients" ON public.clients FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Projects
CREATE POLICY "Authenticated view projects" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers manage projects" ON public.projects FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Project owners can update" ON public.projects FOR UPDATE TO authenticated USING (auth.uid() = owner_id);

-- Project members
CREATE POLICY "View project members" ON public.project_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage project members" ON public.project_members FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Client projects
CREATE POLICY "Admins and managers view client projects" ON public.client_projects FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Admins manage client projects" ON public.client_projects FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Tasks
CREATE POLICY "Authenticated view tasks" ON public.tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Task owner or assignee updates" ON public.tasks FOR UPDATE TO authenticated USING (
  auth.uid() = created_by OR auth.uid() = assigned_to OR
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);
CREATE POLICY "Task owner or admin deletes" ON public.tasks FOR DELETE TO authenticated USING (
  auth.uid() = created_by OR public.has_role(auth.uid(), 'admin')
);

-- Task assignees
CREATE POLICY "View task assignees" ON public.task_assignees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage task assignees" ON public.task_assignees FOR ALL TO authenticated USING (true);

-- Task attachments
CREATE POLICY "View task attachments" ON public.task_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Upload task attachments" ON public.task_attachments FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "Delete own attachments" ON public.task_attachments FOR DELETE TO authenticated USING (auth.uid() = uploaded_by OR public.has_role(auth.uid(), 'admin'));

-- Task comments
CREATE POLICY "View task comments" ON public.task_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Create task comments" ON public.task_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Delete own comments" ON public.task_comments FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Checklists
CREATE POLICY "View checklists" ON public.checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage checklists" ON public.checklists FOR ALL TO authenticated USING (true);

CREATE POLICY "View checklist items" ON public.checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage checklist items" ON public.checklist_items FOR ALL TO authenticated USING (true);

-- Task completion history
CREATE POLICY "View completion history" ON public.task_completion_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert completion history" ON public.task_completion_history FOR INSERT TO authenticated WITH CHECK (true);

-- Channels
CREATE POLICY "View channels member of" ON public.channels FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.channel_members WHERE channel_id = channels.id AND user_id = auth.uid())
);
CREATE POLICY "Create channels" ON public.channels FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admin updates channels" ON public.channels FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin deletes channels" ON public.channels FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Channel members
CREATE POLICY "View channel members" ON public.channel_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Join channels" ON public.channel_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Leave channels" ON public.channel_members FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Messages
CREATE POLICY "View messages in channels" ON public.messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.channel_members WHERE channel_id = messages.channel_id AND user_id = auth.uid())
);
CREATE POLICY "Send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Edit own messages" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Delete own or admin" ON public.messages FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Message reactions
CREATE POLICY "View reactions" ON public.message_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Toggle reactions" ON public.message_reactions FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Notifications
CREATE POLICY "View own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "System creates notifications" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Onboarding steps
CREATE POLICY "View onboarding steps" ON public.onboarding_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage onboarding" ON public.onboarding_steps FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- User onboarding
CREATE POLICY "View own onboarding" ON public.user_onboarding FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Update own onboarding" ON public.user_onboarding FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Performance ratings
CREATE POLICY "View ratings" ON public.performance_ratings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers rate" ON public.performance_ratings FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);
CREATE POLICY "Admins delete ratings" ON public.performance_ratings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Meetings
CREATE POLICY "View meetings" ON public.meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers manage meetings" ON public.meetings FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR auth.uid() = created_by
);
CREATE POLICY "View meeting attendees" ON public.meeting_attendees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage meeting attendees" ON public.meeting_attendees FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);

-- Sessions
CREATE POLICY "Users view own sessions" ON public.user_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users manage own sessions" ON public.user_sessions FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all sessions" ON public.user_sessions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users manage own device settings" ON public.user_device_settings FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage device settings" ON public.user_device_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Automation rules
CREATE POLICY "View automation rules" ON public.automation_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage automation" ON public.automation_rules FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);

-- Announcements
CREATE POLICY "View announcements" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage announcements" ON public.announcements FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Activity logs
CREATE POLICY "View own activity" ON public.activity_logs FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Insert activity" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Error logs
CREATE POLICY "Insert error logs" ON public.error_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins view error logs" ON public.error_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Profile edit logs
CREATE POLICY "Admins view edit logs" ON public.profile_edit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Insert edit logs" ON public.profile_edit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- App settings
CREATE POLICY "View app settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage app settings" ON public.app_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sessions;
