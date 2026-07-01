import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const AuthContext = createContext({
  session: null,
  user: null,
  profile: null,
  role: "member",
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (data) setProfile(data);
  };

  const fetchRole = async (userId) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).single();
    setRole(data?.role || "member");
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
      await fetchRole(user.id);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => {
          fetchProfile(session.user.id);
          fetchRole(session.user.id);
        }, 0);
      } else {
        setProfile(null);
        setRole("member");
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchRole(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, role, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
