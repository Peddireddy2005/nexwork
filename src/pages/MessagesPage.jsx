import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus, Send, Hash, MessageCircle, UserPlus, X, Pencil, Trash2,
  Reply, MoreVertical, Search, Check, CheckCheck, Shield, Lock, Pin,
  Paperclip, FileText, Image, File, Download, Mic, Square, Forward,
  Smile, Settings2,
} from "lucide-react";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { generateChannelKey, encryptMessage, decryptMessage } from "@/lib/encryption";
import { mergeHistory, upsertRealtimeMessage } from "@/lib/messageSync";

const EMOJI_LIST = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "🎉", "💯", "✅", "👀", "🙏"];

const MessagesPage = () => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [rawMessages, setRawMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [channelName, setChannelName] = useState("");
  const [channelDescription, setChannelDescription] = useState("");
  const [enableEncryption, setEnableEncryption] = useState(true);
  const [profiles, setProfiles] = useState({});
  const [profileAvatars, setProfileAvatars] = useState({});
  const [memberRoles, setMemberRoles] = useState({});
  const [allProfiles, setAllProfiles] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [channelMembers, setChannelMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [replyTo, setReplyTo] = useState(null);

  const [typingUsers, setTypingUsers] = useState([]);
  const [showPinned, setShowPinned] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [reactions, setReactions] = useState({});
  const [editChName, setEditChName] = useState("");
  const [editChDesc, setEditChDesc] = useState("");
  const [dmDialogOpen, setDmDialogOpen] = useState(false);
  const [dmSearch, setDmSearch] = useState("");
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const presenceChannelRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fetchChannels = async () => {
    if (!user) return;
    const { data: memberships } = await supabase.from("channel_members").select("channel_id").eq("user_id", user.id);
    if (memberships && memberships.length > 0) {
      const channelIds = memberships.map((m) => m.channel_id);
      const { data } = await supabase.from("channels").select("*").in("id", channelIds);
      setChannels(data || []);
      if (data && data.length > 0 && !activeChannel) setActiveChannel(data[0]);
    }
  };

  const decryptMessages = async (msgs, channel) => {
    if (!channel?.encryption_key) return msgs.map((m) => ({ ...m, decryptedContent: m.content }));
    return Promise.all(msgs.map(async (m) => ({ ...m, decryptedContent: await decryptMessage(m.content, channel.encryption_key) })));
  };

  const fetchMessages = async (channelOverride) => {
    const ch = channelOverride || activeChannel;
    if (!ch) return;
    const { data, error } = await supabase.from("messages").select("*").eq("channel_id", ch.id).order("created_at", { ascending: true }).limit(500);
    if (error) {
      console.error("[Messages] History load failed:", error);
      toast.error("Failed to load chat history");
      return;
    }
    const msgs = data || [];
    const decrypted = await decryptMessages(msgs, ch);
    setRawMessages((prev) => mergeHistory(prev, msgs));
    setMessages((prev) => mergeHistory(prev, decrypted));
  };

  const fetchReactions = async () => {
    if (!activeChannel) return;
    const msgIds = rawMessages.map((m) => m.id);
    if (msgIds.length === 0) {
      setReactions({});
      return;
    }
    const { data } = await supabase.from("message_reactions").select("*").in("message_id", msgIds);
    const map = {};
    (data || []).forEach((r) => {
      if (!map[r.message_id]) map[r.message_id] = [];
      map[r.message_id].push(r);
    });
    setReactions(map);
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from("profiles").select("id, full_name, avatar_url");
    const map = {};
    const avatarMap = {};
    (data || []).forEach((p) => {
      map[p.id] = p.full_name || "Unknown";
      avatarMap[p.id] = p.avatar_url;
    });
    setProfiles(map);
    setProfileAvatars(avatarMap);
    setAllProfiles(data || []);
    const { data: rolesData } = await supabase.from("user_roles").select("user_id, role");
    const rMap = {};
    (rolesData || []).forEach((r) => {
      rMap[r.user_id] = r.role;
    });
    setMemberRoles(rMap);
  };

  const fetchChannelMembers = async () => {
    if (!activeChannel) return;
    const { data } = await supabase.from("channel_members").select("*").eq("channel_id", activeChannel.id);
    setChannelMembers(data || []);
  };

  useEffect(() => {
    fetchChannels();
    fetchProfiles();
  }, [user]);

  useEffect(() => {
    if (!activeChannel || !user) return;
    const presenceChannel = supabase.channel(`typing-${activeChannel.id}`, { config: { presence: { key: user.id } } });
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const typing = [];
        for (const [uid, presences] of Object.entries(state)) {
          if (uid !== user.id && Array.isArray(presences) && presences.some((p) => p.typing)) typing.push(uid);
        }
        setTypingUsers(typing);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await presenceChannel.track({ typing: false });
      });
    presenceChannelRef.current = presenceChannel;
    return () => {
      supabase.removeChannel(presenceChannel);
      presenceChannelRef.current = null;
    };
  }, [activeChannel, user]);

  const broadcastTyping = useCallback((isTyping) => {
    presenceChannelRef.current?.track({ typing: isTyping });
  }, []);
  const handleTyping = useCallback(() => {
    broadcastTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => broadcastTyping(false), 2000);
  }, [broadcastTyping]);

  useEffect(() => {
    fetchMessages();
    fetchChannelMembers();
    if (!activeChannel) return;
    const channelId = activeChannel.id;
    const encKey = activeChannel.encryption_key;
    let isCurrent = true;

    const upsertMessage = async (msg) => {
      const decryptedContent = encKey ? await decryptMessage(msg.content, encKey) : msg.content;
      if (!isCurrent) return;
      setRawMessages((prev) => upsertRealtimeMessage(prev, msg));
      setMessages((prev) => upsertRealtimeMessage(prev, { ...msg, content: decryptedContent, decryptedContent }));
    };

    const channel = supabase
      .channel(`messages-${channelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, async (payload) => {
        await upsertMessage(payload.new);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, async (payload) => {
        const msg = payload.new;
        const decryptedContent = encKey ? await decryptMessage(msg.content, encKey) : msg.content;
        if (!isCurrent) return;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...msg, decryptedContent } : m)));
        setRawMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, (payload) => {
        const id = payload.old.id;
        if (!isCurrent) return;
        setMessages((prev) => prev.filter((m) => m.id !== id));
        setRawMessages((prev) => prev.filter((m) => m.id !== id));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          fetchMessages(activeChannel);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn("[Messages] Realtime status:", status, "— will retry on reconnect");
        }
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") fetchMessages(activeChannel);
    };
    const onOnline = () => fetchMessages(activeChannel);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      isCurrent = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      supabase.removeChannel(channel);
    };
  }, [activeChannel?.id]);

  useEffect(() => {
    if (!activeChannel) return;
    fetchReactions();
    const ch = supabase
      .channel(`reactions-${activeChannel.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
        fetchReactions();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [activeChannel?.id]);

  useEffect(() => {
    if (activeChannel) fetchReactions();
  }, [rawMessages.length]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!user || !activeChannel || !newMessage.trim()) return;
    broadcastTyping(false);
    const plainText = newMessage.trim();
    const replyId = replyTo?.id || null;
    setNewMessage("");
    setReplyTo(null);
    let content = plainText;
    if (activeChannel.encryption_key) {
      try {
        content = await encryptMessage(plainText, activeChannel.encryption_key);
      } catch (err) {
        console.error("[Messages] Encryption failed:", err);
        toast.error("Encryption failed");
        setNewMessage(plainText);
        return;
      }
    }
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic = {
      id: tempId,
      content,
      user_id: user.id,
      channel_id: activeChannel.id,
      created_at: new Date().toISOString(),
      edited_at: null,
      reply_to: replyId,
      pinned_at: null,
      pinned_by: null,
      file_url: null,
      file_name: null,
      file_type: null,
      decryptedContent: plainText,
    };
    setMessages((prev) => [...prev, optimistic]);
    const { data, error } = await supabase.from("messages").insert({ channel_id: activeChannel.id, user_id: user.id, content, reply_to: replyId }).select().single();
    if (error) {
      console.error("[Messages] Send failed:", error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage(plainText);
      toast.error(error.message || "Failed to send message");
      return;
    }
    if (data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...data, decryptedContent: plainText } : m)));
      setRawMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeChannel) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File must be under 20MB");
      return;
    }
    setUploading(true);
    try {
      const filePath = `${user.id}/${activeChannel.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("channel-files").upload(filePath, file);
      if (uploadError) {
        toast.error(uploadError.message);
        setUploading(false);
        return;
      }
      let content = `📎 ${file.name}`;
      if (activeChannel.encryption_key) content = await encryptMessage(content, activeChannel.encryption_key);
      const { error } = await supabase.from("messages").insert({ channel_id: activeChannel.id, user_id: user.id, content, file_url: filePath, file_name: file.name, file_type: file.type });
      if (error) toast.error(error.message);
      else toast.success("File sent");
    } catch (err) {
      toast.error(err.message || "Upload failed");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startRecording = async () => {
    if (!user || !activeChannel) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        setRecordingDuration(0);
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (blob.size < 1000) {
          toast.info("Recording too short");
          return;
        }
        await uploadVoiceMessage(blob);
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const uploadVoiceMessage = async (blob) => {
    if (!user || !activeChannel) return;
    setUploading(true);
    try {
      const fileName = `voice_${Date.now()}.webm`;
      const filePath = `${user.id}/${activeChannel.id}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from("channel-files").upload(filePath, blob, { contentType: "audio/webm" });
      if (uploadError) {
        toast.error(uploadError.message);
        setUploading(false);
        return;
      }
      let content = "🎙️ Voice message";
      if (activeChannel.encryption_key) content = await encryptMessage(content, activeChannel.encryption_key);
      const { error } = await supabase.from("messages").insert({ channel_id: activeChannel.id, user_id: user.id, content, file_url: filePath, file_name: fileName, file_type: "audio/webm" });
      if (error) toast.error(error.message);
      else toast.success("Voice message sent");
    } catch (err) {
      toast.error(err.message || "Upload failed");
    }
    setUploading(false);
  };

  const formatDuration = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const isAudioFile = (type) => type?.startsWith("audio/");

  const [signedUrls, setSignedUrls] = useState({});

  const getFileUrl = useCallback(
    async (fileUrl) => {
      if (!fileUrl) return "";
      if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return fileUrl;
      if (signedUrls[fileUrl]) return signedUrls[fileUrl];
      const { data } = await supabase.storage.from("channel-files").createSignedUrl(fileUrl, 3600);
      if (data?.signedUrl) {
        setSignedUrls((prev) => ({ ...prev, [fileUrl]: data.signedUrl }));
        return data.signedUrl;
      }
      return "";
    },
    [signedUrls]
  );

  const [resolvedUrls, setResolvedUrls] = useState({});
  useEffect(() => {
    const resolve = async () => {
      const newUrls = {};
      for (const msg of messages) {
        if (msg.file_url && !resolvedUrls[msg.id]) {
          const url = await getFileUrl(msg.file_url);
          if (url) newUrls[msg.id] = url;
        }
      }
      if (Object.keys(newUrls).length > 0) {
        setResolvedUrls((prev) => ({ ...prev, ...newUrls }));
      }
    };
    resolve();
  }, [messages]);

  const getResolvedFileUrl = (msg) => {
    return resolvedUrls[msg.id] || msg.file_url || "";
  };

  const startEdit = (msg) => {
    setEditingMessage(msg.id);
    setEditContent(msg.decryptedContent);
  };
  const saveEdit = async () => {
    if (!editingMessage || !editContent.trim()) return;
    let content = editContent.trim();
    if (activeChannel?.encryption_key) content = await encryptMessage(content, activeChannel.encryption_key);
    const { error } = await supabase.from("messages").update({ content, edited_at: new Date().toISOString() }).eq("id", editingMessage);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditingMessage(null);
    setEditContent("");
    fetchMessages();
  };
  const cancelEdit = () => {
    setEditingMessage(null);
    setEditContent("");
  };

  const deleteMessage = async (id) => {
    if (!confirm("Delete this message?")) return;
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) toast.error(error.message);
    else fetchMessages();
  };

  const pinMessage = async (msg) => {
    if (!user) return;
    const isPinned = !!msg.pinned_at;
    const { error } = await supabase
      .from("messages")
      .update(isPinned ? { pinned_at: null, pinned_by: null } : { pinned_at: new Date().toISOString(), pinned_by: user.id })
      .eq("id", msg.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(isPinned ? "Unpinned" : "Pinned");
    fetchMessages();
  };

  const forwardMessage = async (targetChannelId) => {
    if (!user || !forwardMsg) return;
    const targetChannel = channels.find((c) => c.id === targetChannelId);
    let content = `↪️ Forwarded from #${activeChannel?.name}: ${forwardMsg.decryptedContent}`;
    if (targetChannel?.encryption_key) content = await encryptMessage(content, targetChannel.encryption_key);
    const { error } = await supabase.from("messages").insert({ channel_id: targetChannelId, user_id: user.id, content, file_url: forwardMsg.file_url, file_name: forwardMsg.file_name, file_type: forwardMsg.file_type });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Forwarded");
    setForwardOpen(false);
    setForwardMsg(null);
  };

  const toggleReaction = async (messageId, emoji) => {
    if (!user) return;
    const existing = reactions[messageId]?.find((r) => r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("message_reactions").insert({ message_id: messageId, user_id: user.id, emoji });
    }
  };

  const createChannel = async (e) => {
  e.preventDefault();
  if (!user || !channelName.trim()) return;
  let encryptionKey = null;
  if (enableEncryption) encryptionKey = await generateChannelKey();
  const { data, error } = await supabase.from("channels").insert({ name: channelName.trim(), description: channelDescription.trim() || null, created_by: user.id, encryption_key: encryptionKey }).select().single();
  if (error) {
    toast.error(error.message);
    return;
  }
  const { error: memberError } = await supabase.from("channel_members").insert({ channel_id: data.id, user_id: user.id });
  if (memberError) {
    // Roll back the orphaned channel so it doesn't sit there with no members
    await supabase.from("channels").delete().eq("id", data.id);
    toast.error(`Couldn't finish creating the channel: ${memberError.message}`);
    return;
  }
  setChannelName("");
  setChannelDescription("");
  setEnableEncryption(true);
  setCreateOpen(false);
  fetchChannels();
  toast.success(`Channel created${encryptionKey ? " with E2E encryption 🔒" : ""}`);
};

  const createDM = async (targetUserId) => {
  if (!user) return;
  const { data: myChannels } = await supabase.from("channel_members").select("channel_id").eq("user_id", user.id);
  const { data: theirChannels } = await supabase.from("channel_members").select("channel_id").eq("user_id", targetUserId);
  if (myChannels && theirChannels) {
    const myIds = new Set(myChannels.map((c) => c.channel_id));
    const commonIds = theirChannels.filter((c) => myIds.has(c.channel_id)).map((c) => c.channel_id);
    if (commonIds.length > 0) {
      const { data: existingDM } = await supabase.from("channels").select("*").in("id", commonIds).eq("is_direct", true).limit(1);
      if (existingDM && existingDM.length > 0) {
        setActiveChannel(existingDM[0]);
        setDmDialogOpen(false);
        setDmSearch("");
        setShowMobileSidebar(false);
        return;
      }
    }
  }
  const targetName = allProfiles.find((p) => p.id === targetUserId)?.full_name || "Unknown";
  const encryptionKey = await generateChannelKey();
  const { data, error } = await supabase
    .from("channels")
    .insert({
      name: `DM: ${profile?.full_name || "You"} & ${targetName}`,
      is_direct: true,
      created_by: user.id,
      encryption_key: encryptionKey,
    })
    .select()
    .single();
  if (error) {
    toast.error(error.message);
    return;
  }
  const { error: memberError } = await supabase.from("channel_members").insert([
    { channel_id: data.id, user_id: user.id },
    { channel_id: data.id, user_id: targetUserId },
  ]);
  if (memberError) {
    await supabase.from("channels").delete().eq("id", data.id);
    toast.error(`Couldn't start the DM: ${memberError.message}`);
    return;
  }
  setDmDialogOpen(false);
  setDmSearch("");
  fetchChannels();
  setActiveChannel(data);
  setShowMobileSidebar(false);
  toast.success("Direct message created");
};

  const profile = allProfiles.find((p) => p.id === user?.id);

  const updateChannelSettings = async () => {
    if (!activeChannel) return;
    const { error } = await supabase.from("channels").update({ name: editChName.trim() || activeChannel.name, description: editChDesc.trim() || null }).eq("id", activeChannel.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Channel updated");
    setSettingsOpen(false);
    const { data } = await supabase.from("channels").select("*").eq("id", activeChannel.id).single();
    if (data) {
      setActiveChannel(data);
      setChannels((prev) => prev.map((c) => (c.id === data.id ? data : c)));
    }
  };

  const deleteChannel = async () => {
    if (!activeChannel || !confirm(`Delete #${activeChannel.name}? This cannot be undone.`)) return;
    const { error } = await supabase.from("channels").delete().eq("id", activeChannel.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Channel deleted");
    setSettingsOpen(false);
    setActiveChannel(null);
    fetchChannels();
  };

  const addMemberToChannel = async (userId) => {
    if (!activeChannel) return;
    if (channelMembers.some((m) => m.user_id === userId)) {
      toast.info("Already a member");
      return;
    }
    const { error } = await supabase.from("channel_members").insert({ channel_id: activeChannel.id, user_id: userId });
    if (error) toast.error(error.message);
    else {
      toast.success("Member added");
      fetchChannelMembers();
    }
  };

  const removeMemberFromChannel = async (userId) => {
    if (!activeChannel) return;
    const { error } = await supabase.from("channel_members").delete().eq("channel_id", activeChannel.id).eq("user_id", userId);
    if (error) toast.error(error.message);
    else {
      toast.success("Member removed");
      fetchChannelMembers();
    }
  };

  const getInitials = (name) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const formatDateSeparator = (date) => {
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  };
  const getFileIcon = (type) => {
    if (!type) return <File className="h-4 w-4" />;
    if (type.startsWith("image/")) return <Image className="h-4 w-4" />;
    if (type.includes("pdf") || type.includes("document") || type.includes("word")) return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };
  const isImageFile = (type) => type?.startsWith("image/");
  const roleColors = { admin: "text-destructive", manager: "text-primary", member: "text-muted-foreground" };

  const pinnedMessages = messages.filter((m) => !!m.pinned_at);
  const filteredMessages = messageSearch ? messages.filter((m) => m.decryptedContent.toLowerCase().includes(messageSearch.toLowerCase())) : messages;
  const getReplyMessage = (replyId) => (replyId ? messages.find((m) => m.id === replyId) : null);
  const memberUserIds = new Set(channelMembers.map((m) => m.user_id));
  const nonMembers = allProfiles.filter((p) => !memberUserIds.has(p.id) && (p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || !searchQuery));
  const isChannelEncrypted = !!activeChannel?.encryption_key;
  const typingNames = typingUsers.map((uid) => profiles[uid] || "Someone").filter(Boolean);

  const getGroupedReactions = (messageId) => {
    const msgReactions = reactions[messageId] || [];
    const grouped = {};
    msgReactions.forEach((r) => {
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, userIds: [], hasOwn: false };
      grouped[r.emoji].count++;
      grouped[r.emoji].userIds.push(r.user_id);
      if (r.user_id === user?.id) grouped[r.emoji].hasOwn = true;
    });
    return grouped;
  };

  const [showMobileSidebar, setShowMobileSidebar] = useState(true);

  const directChannels = channels.filter((c) => c.is_direct);
  const groupChannels = channels.filter((c) => !c.is_direct);

  return (
    <div className="animate-fade-in-up h-[calc(100vh-8rem)]">
      <div className="flex h-full gap-0 rounded-2xl overflow-hidden border border-border/60 bg-gradient-to-br from-background via-background to-primary/5 shadow-xl">
        <div className={`${activeChannel && !showMobileSidebar ? "hidden md:flex" : "flex"} ${activeChannel ? "md:w-60 lg:w-72" : "w-full md:w-60 lg:w-72"} shrink-0 flex-col transition-all duration-200 ${!activeChannel ? "" : "border-r border-border/50"} bg-card/40 backdrop-blur-xl`}>
          <div className="px-4 pt-4 pb-3 border-b border-border/40">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="text-base font-semibold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">Inbox</h2>
                <p className="text-[11px] text-muted-foreground">
                  {channels.length} {channels.length === 1 ? "conversation" : "conversations"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <Dialog open={dmDialogOpen} onOpenChange={setDmDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" title="New DM">
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
                      <DialogHeader>
                        <DialogTitle>New Direct Message</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Select a member</Label>
                        <Input value={dmSearch} onChange={(e) => setDmSearch(e.target.value)} placeholder="Search by name..." className="h-8 text-sm" />
                        <div className="space-y-1 max-h-60 overflow-y-auto">
                          {allProfiles.filter((p) => p.id !== user?.id && (p.full_name?.toLowerCase().includes(dmSearch.toLowerCase()) || !dmSearch)).map((p) => (
                            <button key={p.id} onClick={() => createDM(p.id)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm hover:bg-muted transition-colors text-left">
                              <Avatar className="h-6 w-6">
                                {p.avatar_url && <AvatarImage src={p.avatar_url} />}
                                <AvatarFallback className="text-[10px]">{getInitials(p.full_name || "??")}</AvatarFallback>
                              </Avatar>
                              <span>{p.full_name || "Unknown"}</span>
                              <span className={`text-[10px] capitalize ml-auto ${roleColors[memberRoles[p.id]] || "text-muted-foreground"}`}>{memberRoles[p.id] || "member"}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20 text-primary">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
                    <DialogHeader>
                      <DialogTitle>New Channel</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={createChannel} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Channel Name</Label>
                        <Input value={channelName} onChange={(e) => setChannelName(e.target.value)} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Description (optional)</Label>
                        <Input value={channelDescription} onChange={(e) => setChannelDescription(e.target.value)} placeholder="What's this channel about?" />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={enableEncryption} onChange={(e) => setEnableEncryption(e.target.checked)} className="rounded border-border" />
                        <Lock className="h-4 w-4 text-primary" />
                        <span className="text-sm">Enable end-to-end encryption</span>
                      </label>
                      <Button type="submit" className="w-full">
                        Create
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
          <ScrollArea className="flex-1 px-2 py-2">
            <div className="space-y-4">
              {channels.length === 0 && (
                <div className="text-center py-10 px-3">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 mx-auto mb-3 flex items-center justify-center">
                    <MessageCircle className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium">No conversations yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Create a channel to get started</p>
                </div>
              )}
              {groupChannels.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-3 mb-1.5">
                    <Hash className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Channels</span>
                    <span className="text-[10px] text-muted-foreground/60 ml-auto">{groupChannels.length}</span>
                  </div>
                  <div className="space-y-0.5">
                    {groupChannels.map((ch) => {
                      const active = activeChannel?.id === ch.id;
                      return (
                        <button
                          key={ch.id}
                          onClick={() => {
                            setActiveChannel(ch);
                            setShowPinned(false);
                            setShowMobileSidebar(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all text-left group ${active ? "bg-gradient-to-r from-primary/15 to-primary/5 text-foreground font-medium shadow-sm ring-1 ring-primary/20" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                        >
                          <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-primary/20 text-primary" : "bg-muted/60 text-muted-foreground group-hover:bg-muted"}`}>
                            {ch.encryption_key ? <Lock className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
                          </div>
                          <span className="truncate flex-1">{ch.name}</span>
                          {ch.encryption_key && <Shield className="h-3 w-3 text-primary/60 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {directChannels.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-3 mb-1.5">
                    <MessageCircle className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Direct Messages</span>
                    <span className="text-[10px] text-muted-foreground/60 ml-auto">{directChannels.length}</span>
                  </div>
                  <div className="space-y-0.5">
                    {directChannels.map((ch) => {
                      const active = activeChannel?.id === ch.id;
                      return (
                        <button
                          key={ch.id}
                          onClick={() => {
                            setActiveChannel(ch);
                            setShowPinned(false);
                            setShowMobileSidebar(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all text-left ${active ? "bg-gradient-to-r from-primary/15 to-primary/5 text-foreground font-medium shadow-sm ring-1 ring-primary/20" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                        >
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarFallback className={`text-[10px] ${active ? "bg-primary/20 text-primary" : "bg-muted"}`}>{getInitials(ch.name || "??")}</AvatarFallback>
                          </Avatar>
                          <span className="truncate flex-1">{ch.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <Card className={`flex-1 flex flex-col shadow-none border-0 rounded-none bg-transparent overflow-hidden ${activeChannel ? "" : "hidden md:flex"}`}>
          {activeChannel ? (
            <>
              <CardHeader className="pb-2 sm:pb-3 border-b flex-row items-center justify-between space-y-0 px-3 sm:px-6">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden shrink-0" onClick={() => setShowMobileSidebar(true)}>
                    <Hash className="h-4 w-4" />
                  </Button>
                  <div className="min-w-0">
                    <CardTitle className="text-sm sm:text-base flex items-center gap-1.5 sm:gap-2">
                      {isChannelEncrypted ? <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" /> : <Hash className="h-3.5 w-3.5 sm:h-4 sm:w-4 hidden sm:block shrink-0" />}
                      <span className="truncate">{activeChannel.name}</span>
                    </CardTitle>
                    {activeChannel.description && <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 truncate max-w-[120px] sm:max-w-none">{activeChannel.description}</p>}
                  </div>
                  {isChannelEncrypted && (
                    <Badge variant="secondary" className="text-[10px] gap-1 bg-primary/10 text-primary hidden sm:flex">
                      <Shield className="h-3 w-3" /> E2E
                    </Badge>
                  )}
                  <span className="text-[10px] sm:text-xs text-muted-foreground hidden sm:inline">{channelMembers.length} members</span>
                </div>
                <div className="flex items-center gap-1">
                  {pinnedMessages.length > 0 && (
                    <Button variant={showPinned ? "secondary" : "ghost"} size="icon" className="h-8 w-8 relative" onClick={() => setShowPinned(!showPinned)}>
                      <Pin className="h-4 w-4" />
                      <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] rounded-full h-4 w-4 flex items-center justify-center">{pinnedMessages.length}</span>
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowMessageSearch(!showMessageSearch)}>
                    <Search className="h-4 w-4" />
                  </Button>
                  {isAdmin && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditChName(activeChannel.name);
                          setEditChDesc(activeChannel.description || "");
                          setSettingsOpen(true);
                        }}
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <UserPlus className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>Manage Members — #{activeChannel.name}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-2">
                            <div>
                              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Current Members ({channelMembers.length})</Label>
                              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                                {channelMembers.map((cm) => (
                                  <div key={cm.id} className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <Avatar className="h-6 w-6">
                                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{getInitials(profiles[cm.user_id] || "??")}</AvatarFallback>
                                      </Avatar>
                                      <span className="text-sm">{profiles[cm.user_id] || "Unknown"}</span>
                                      <span className={`text-[10px] capitalize ${roleColors[memberRoles[cm.user_id]] || "text-muted-foreground"}`}>{memberRoles[cm.user_id] || "member"}</span>
                                    </div>
                                    {cm.user_id !== user?.id && (
                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeMemberFromChannel(cm.user_id)}>
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Add Members</Label>
                              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name..." className="mt-2 h-8 text-sm" />
                              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                                {nonMembers.length === 0 ? (
                                  <p className="text-xs text-muted-foreground py-2 text-center">No users to add</p>
                                ) : (
                                  nonMembers.map((p) => (
                                    <div key={p.id} className="flex items-center justify-between hover:bg-muted/50 rounded-md px-3 py-2 cursor-pointer" onClick={() => addMemberToChannel(p.id)}>
                                      <div className="flex items-center gap-2">
                                        <Avatar className="h-6 w-6">
                                          <AvatarFallback className="text-[10px]">{getInitials(p.full_name || "??")}</AvatarFallback>
                                        </Avatar>
                                        <span className="text-sm">{p.full_name || "Unknown"}</span>
                                        <span className={`text-[10px] capitalize ${roleColors[memberRoles[p.id]] || "text-muted-foreground"}`}>{memberRoles[p.id] || "member"}</span>
                                      </div>
                                      <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </>
                  )}
                </div>
              </CardHeader>

              {showMessageSearch && (
                <div className="px-4 py-2 border-b flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input value={messageSearch} onChange={(e) => setMessageSearch(e.target.value)} placeholder="Search messages..." className="h-8 text-sm border-0 shadow-none focus-visible:ring-0" autoFocus />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => {
                      setShowMessageSearch(false);
                      setMessageSearch("");
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {showPinned && pinnedMessages.length > 0 && (
                <div className="px-4 py-3 border-b bg-muted/30 max-h-48 overflow-y-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <Pin className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-primary uppercase tracking-wider">Pinned Messages</span>
                  </div>
                  <div className="space-y-2">
                    {pinnedMessages.map((pm) => (
                      <div key={pm.id} className="flex items-start gap-2 bg-background/80 rounded-md px-3 py-2 text-sm border border-border/50">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-xs text-primary">{profiles[pm.user_id] || "Unknown"}</span>
                          <p className="text-sm text-foreground truncate">{pm.decryptedContent}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => pinMessage(pm)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-1">
                  {filteredMessages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">{messageSearch ? "No messages match your search." : "No messages yet. Start the conversation!"}</p>
                  ) : (
                    filteredMessages.map((msg, idx) => {
                      const msgDate = new Date(msg.created_at);
                      const prevDate = idx > 0 ? new Date(filteredMessages[idx - 1].created_at) : null;
                      const showDateSep = !prevDate || !isSameDay(msgDate, prevDate);
                      const isOwn = msg.user_id === user?.id;
                      const replyMsg = getReplyMessage(msg.reply_to);
                      const isPinned = !!msg.pinned_at;
                      const hasFile = !!msg.file_url;
                      const grouped = getGroupedReactions(msg.id);

                      return (
                        <div key={msg.id}>
                          {showDateSep && (
                            <div className="flex items-center gap-3 my-4">
                              <div className="flex-1 h-px bg-border" />
                              <span className="text-[11px] text-muted-foreground font-medium px-2">{formatDateSeparator(msgDate)}</span>
                              <div className="flex-1 h-px bg-border" />
                            </div>
                          )}
                          <div className={`group flex gap-2.5 py-1 ${isOwn ? "flex-row-reverse" : ""}`}>
                            <Avatar className="h-8 w-8 shrink-0 mt-1">
                              {profileAvatars[msg.user_id] && <AvatarImage src={profileAvatars[msg.user_id]} />}
                              <AvatarFallback className="text-xs bg-muted">{getInitials(profiles[msg.user_id] || "??")}</AvatarFallback>
                            </Avatar>
                            <div className={`max-w-[85%] sm:max-w-[70%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                              <p className={`text-[11px] text-muted-foreground mb-0.5 ${isOwn ? "text-right" : ""}`}>
                                {profiles[msg.user_id] || "Unknown"} · {format(msgDate, "HH:mm")}
                                {msg.edited_at && <span className="italic ml-1">(edited)</span>}
                                {isPinned && <Pin className="h-3 w-3 inline ml-1 text-primary" />}
                              </p>
                              {replyMsg && (
                                <div className={`text-[11px] px-2 py-1 rounded-t-md border-l-2 border-primary/40 bg-muted/50 mb-0.5 max-w-full truncate ${isOwn ? "self-end" : "self-start"}`}>
                                  <span className="font-medium text-primary/70">{profiles[replyMsg.user_id] || "Unknown"}</span>
                                  <span className="ml-1 text-muted-foreground">
                                    {replyMsg.decryptedContent.slice(0, 60)}
                                    {replyMsg.decryptedContent.length > 60 ? "..." : ""}
                                  </span>
                                </div>
                              )}
                              <div className={`relative inline-flex items-start gap-1 ${isOwn ? "flex-row-reverse" : ""}`}>
                                {editingMessage === msg.id ? (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      value={editContent}
                                      onChange={(e) => setEditContent(e.target.value)}
                                      className="h-8 text-sm min-w-[200px]"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") saveEdit();
                                        if (e.key === "Escape") cancelEdit();
                                      }}
                                    />
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}>
                                      <Check className="h-3.5 w-3.5 text-success" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}>
                                      <X className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                  </div>
                                ) : (
                                  <>
                                    <div className={`inline-block rounded-xl text-sm whitespace-pre-wrap break-words ${isOwn ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm"} ${hasFile ? "p-1" : "px-3 py-2"}`}>
                                      {hasFile && isAudioFile(msg.file_type) && (
                                        <div className="px-2 py-1">
                                          <audio controls src={getResolvedFileUrl(msg)} className="max-w-[220px] h-9" preload="metadata" />
                                        </div>
                                      )}
                                      {hasFile && isImageFile(msg.file_type) && (
                                        <a href={getResolvedFileUrl(msg)} target="_blank" rel="noopener noreferrer" className="block mb-1">
                                          <img src={getResolvedFileUrl(msg)} alt={msg.file_name || "image"} className="max-w-[240px] max-h-[200px] rounded-lg object-cover" />
                                        </a>
                                      )}
                                      {hasFile && !isImageFile(msg.file_type) && !isAudioFile(msg.file_type) && (
                                        <a href={getResolvedFileUrl(msg)} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-1 ${isOwn ? "bg-primary-foreground/10 hover:bg-primary-foreground/20" : "bg-background/60 hover:bg-background/80"} transition-colors`}>
                                          {getFileIcon(msg.file_type)}
                                          <span className="text-xs truncate max-w-[160px]">{msg.file_name || "File"}</span>
                                          <Download className="h-3.5 w-3.5 shrink-0" />
                                        </a>
                                      )}
                                      {(!hasFile || (!msg.decryptedContent.startsWith("📎") && !msg.decryptedContent.startsWith("🎙️"))) && <span className={hasFile ? "px-2 pb-1 block text-xs" : ""}>{msg.decryptedContent}</span>}
                                      {hasFile && (msg.decryptedContent.startsWith("📎") || msg.decryptedContent.startsWith("🎙️")) && !isAudioFile(msg.file_type) && <span className="px-2 pb-1 block text-xs">{msg.file_name}</span>}
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-6 w-6">
                                            <Smile className="h-3.5 w-3.5" />
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-2" side="top" align="start">
                                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                                            {EMOJI_LIST.map((emoji) => (
                                              <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)} className="text-lg hover:scale-125 transition-transform p-1 rounded hover:bg-muted">
                                                {emoji}
                                              </button>
                                            ))}
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-6 w-6">
                                            <MoreVertical className="h-3.5 w-3.5" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align={isOwn ? "end" : "start"} className="w-36">
                                          <DropdownMenuItem onClick={() => setReplyTo(msg)}>
                                            <Reply className="h-3.5 w-3.5 mr-2" /> Reply
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => pinMessage(msg)}>
                                            <Pin className="h-3.5 w-3.5 mr-2" /> {isPinned ? "Unpin" : "Pin"}
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => {
                                              navigator.clipboard.writeText(msg.decryptedContent);
                                              toast.success("Copied");
                                            }}
                                          >
                                            <Check className="h-3.5 w-3.5 mr-2" /> Copy
                                          </DropdownMenuItem>
                                          {isAdmin && (
                                            <DropdownMenuItem
                                              onClick={() => {
                                                setForwardMsg(msg);
                                                setForwardOpen(true);
                                              }}
                                            >
                                              <Forward className="h-3.5 w-3.5 mr-2" /> Forward
                                            </DropdownMenuItem>
                                          )}
                                          {isOwn && !hasFile && (
                                            <DropdownMenuItem onClick={() => startEdit(msg)}>
                                              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                                            </DropdownMenuItem>
                                          )}
                                          {isAdmin && (
                                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteMessage(msg.id)}>
                                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                            </DropdownMenuItem>
                                          )}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </>
                                )}
                              </div>
                              {Object.keys(grouped).length > 0 && (
                                <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "justify-end" : ""}`}>
                                  {Object.entries(grouped).map(([emoji, data]) => (
                                    <button
                                      key={emoji}
                                      onClick={() => toggleReaction(msg.id, emoji)}
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${data.hasOwn ? "border-primary/50 bg-primary/10" : "border-border bg-muted/50 hover:bg-muted"}`}
                                    >
                                      <span>{emoji}</span>
                                      <span className="tabular-nums">{data.count}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {isOwn && !editingMessage && (
                                <div className="flex justify-end mt-0.5">
                                  <CheckCheck className="h-3.5 w-3.5 text-primary/50" />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {typingNames.length > 0 && (
                <div className="px-4 py-1.5 border-t bg-muted/20">
                  <p className="text-xs text-muted-foreground italic animate-pulse">
                    {typingNames.length === 1 ? `${typingNames[0]} is typing...` : typingNames.length === 2 ? `${typingNames[0]} and ${typingNames[1]} are typing...` : `${typingNames[0]} and ${typingNames.length - 1} others are typing...`}
                  </p>
                </div>
              )}

              {replyTo && (
                <div className="px-4 py-2 border-t bg-muted/30 flex items-center gap-2">
                  <Reply className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-primary">{profiles[replyTo.user_id] || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground truncate">{replyTo.decryptedContent}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setReplyTo(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              <form onSubmit={sendMessage} className="p-2 sm:p-3 border-t flex gap-1.5 sm:gap-2 items-center">
                {isChannelEncrypted && <Lock className="h-4 w-4 text-primary shrink-0 hidden sm:block" />}
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.mp3,.mp4,.wav,.webm,.ogg,.aac,.flac" />
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => fileInputRef.current?.click()} disabled={uploading || recording}>
                  <Paperclip className="h-4 w-4" />
                </Button>
                {recording ? (
                  <div className="flex-1 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                    <span className="text-sm text-destructive font-medium">{formatDuration(recordingDuration)}</span>
                    <span className="text-xs text-muted-foreground">Recording...</span>
                    <div className="flex-1" />
                    <Button type="button" variant="destructive" size="icon" className="h-9 w-9 shrink-0" onClick={stopRecording}>
                      <Square className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      value={newMessage}
                      onChange={(e) => {
                        setNewMessage(e.target.value);
                        handleTyping();
                      }}
                      placeholder={isChannelEncrypted ? "Encrypted message..." : "Type a message..."}
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage(e);
                        }
                      }}
                    />
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={startRecording} disabled={uploading}>
                      <Mic className="h-4 w-4" />
                    </Button>
                    <Button type="submit" size="icon" disabled={!newMessage.trim() || uploading}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </form>
            </>
          ) : (
            <CardContent className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-sm px-6">
                <div className="relative mx-auto mb-5 h-20 w-20">
                  <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/30 via-primary/10 to-transparent blur-2xl" />
                  <div className="relative h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                    <MessageCircle className="h-9 w-9 text-primary" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-1.5">Welcome to Messages</h3>
                <p className="text-sm text-muted-foreground">Pick a conversation from the sidebar or start a new channel to begin chatting securely with your team.</p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      <Dialog open={forwardOpen} onOpenChange={setForwardOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Forward Message</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-2 truncate">"{forwardMsg?.decryptedContent}"</p>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Select Channel</Label>
          <div className="space-y-1 max-h-60 overflow-y-auto mt-2">
            {channels.filter((c) => c.id !== activeChannel?.id).map((ch) => (
              <button key={ch.id} onClick={() => forwardMessage(ch.id)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm hover:bg-muted transition-colors text-left">
                {ch.encryption_key ? <Lock className="h-3.5 w-3.5 text-primary shrink-0" /> : <Hash className="h-4 w-4 shrink-0" />}
                <span className="truncate">{ch.name}</span>
              </button>
            ))}
            {channels.filter((c) => c.id !== activeChannel?.id).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No other channels available</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Channel Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Channel Name</Label>
              <Input value={editChName} onChange={(e) => setEditChName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editChDesc} onChange={(e) => setEditChDesc(e.target.value)} placeholder="What's this channel about?" rows={3} />
            </div>
            {isChannelEncrypted && (
              <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary">
                <Shield className="h-3 w-3" /> End-to-end encrypted
              </Badge>
            )}
            <Button onClick={updateChannelSettings} className="w-full">
              Save Changes
            </Button>
            <Button variant="outline" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10" onClick={deleteChannel}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete Channel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MessagesPage;
