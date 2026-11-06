import { useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Role = "Aluno" | "Professor" | "Voluntário" | "Admin";
export type DbRole = Database["public"]["Enums"]["app_role"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Settings = Database["public"]["Tables"]["user_settings"]["Row"];
export type Lesson = Database["public"]["Tables"]["lessons"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export const roleLabel: Record<DbRole, Role> = { admin: "Admin", professor: "Professor", voluntario: "Voluntário", aluno: "Aluno" };

/* ---------- session store (one listener for the whole app) ---------- */
let session: Session | null = null;
let ready = false;
const listeners = new Set<() => void>();
let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  supabase.auth.getSession().then(({ data }) => { session = data.session; ready = true; listeners.forEach(l => l()); });
  supabase.auth.onAuthStateChange((_e, s) => { session = s; ready = true; listeners.forEach(l => l()); });
}
export function useSession() {
  useEffect(start, []);
  const s = useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => session, () => null);
  const r = useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => ready, () => false);
  return { session: s, user: s?.user ?? null, ready: r };
}

/* ---------- current user ---------- */
export type Me = { profile: Profile; roles: DbRole[]; role: Role; settings: Settings };
export function useMe() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["me", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Me> => {
      const uid = user!.id;
      const [p, r, s] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).single(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("user_settings").select("*").eq("user_id", uid).maybeSingle(),
      ]);
      if (p.error) throw p.error;
      const roles = (r.data ?? []).map(x => x.role);
      let settings = s.data;
      if (!settings) {
        const ins = await supabase.from("user_settings").insert({ user_id: uid }).select("*").single();
        settings = ins.data!;
      }
      const primary: DbRole = roles.includes("admin") ? "admin" : roles.includes("professor") ? "professor" : roles.includes("voluntario") ? "voluntario" : "aluno";
      return { profile: p.data, roles, role: roleLabel[primary], settings };
    },
  });
}

/* ---------- notifications with realtime ---------- */
export function useNotifications() {
  const { user } = useSession();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`notif-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, payload => {
        qc.invalidateQueries({ queryKey: ["notifications", user.id] });
        if (payload.eventType === "INSERT") window.dispatchEvent(new CustomEvent("ponte:new-notification", { detail: payload.new }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);
  return q;
}

export function useLessons() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["lessons", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("lessons").select("*").order("starts_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export type PublicProfile = Database["public"]["Functions"]["public_profiles"]["Returns"][number];
export function useDirectory() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["directory"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_profiles");
      if (error) throw error;
      return data;
    },
  });
}

/* ---------- signed URLs for private profile images ---------- */
export function useMediaUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["media", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.storage.from("profile-media").createSignedUrl(path!, 3600);
      return data?.signedUrl ?? null;
    },
  }).data ?? null;
}

/* ---------- apply appearance settings to the whole app ---------- */
export function applySettings(s: Pick<Settings, "theme" | "high_contrast" | "text_scale" | "reduce_motion">) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark = s.theme === "dark" || (s.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.classList.toggle("high-contrast", s.high_contrast);
  root.classList.toggle("reduce-motion", s.reduce_motion);
  root.classList.remove("large-text");
  root.style.fontSize = `${s.text_scale}%`;
  try { localStorage.setItem("ponte-appearance", JSON.stringify(s)); } catch { /* ignore */ }
}

export function initialsOf(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("") || "P"; }

export function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export async function signOut(qc: ReturnType<typeof useQueryClient>) {
  await qc.cancelQueries();
  qc.clear();
  await supabase.auth.signOut();
}

/* ---------- local alerts (sound + browser notification) ---------- */
export function playChime() {
  try {
    const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4);
  } catch { /* ignore */ }
}
export function showBrowserNotification(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  new Notification(title, { body, icon: "/favicon.ico" });
  return true;
}
