import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BookOpen, CalendarDays, Check, Home, LogOut, Search, Settings, Trophy, User, Users, MessageCircle, HeartHandshake, Sparkles, BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { applySettings, initialsOf, playChime, showBrowserNotification, signOut, useMe, useMediaUrl, useNotifications, type Notification } from "@/lib/ponte-session";

const nav = [
  { to: "/dashboard", label: "Início", icon: Home },
  { to: "/aulas", label: "Aulas", icon: CalendarDays },
  { to: "/cursos", label: "Cursos", icon: BookOpen },
  { to: "/comunidade", label: "Comunidade", icon: MessageCircle },
  { to: "/ranking", label: "Ranking", icon: Trophy },
  { to: "/perfil", label: "Perfil", icon: User },
] as const;

export function UserAvatar({ name, path, className = "size-10" }: { name: string; path?: string | null | undefined; className?: string }) {
  const url = useMediaUrl(path);
  return url
    ? <img src={url} alt={`Foto de ${name}`} className={`${className} shrink-0 rounded-xl object-cover`} />
    : <span aria-hidden className={`${className} grid shrink-0 place-items-center rounded-xl bg-primary font-display text-sm font-black text-primary-foreground`}>{initialsOf(name)}</span>;
}

export function relTime(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "agora";
  if (d < 3600) return `há ${Math.floor(d / 60)} min`;
  if (d < 86400) return `há ${Math.floor(d / 3600)} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function AppShell({ children }: { children: ReactNode; role?: string }) {
  const path = useRouterState({ select: s => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const notifs = useNotifications();
  const [q, setQ] = useState("");
  const settings = me.data?.settings;
  const role = me.data?.role;
  const name = me.data?.profile.display_name || "Você";
  const unread = (notifs.data ?? []).filter(n => !n.read_at);

  useEffect(() => { if (settings) applySettings(settings); }, [settings]);
  useEffect(() => {
    const h = (e: Event) => {
      const n = (e as CustomEvent<Notification>).detail;
      if (!settings) return;
      if (!settings.categories.includes(n.category)) return;
      if (settings.notify_inapp) toast(n.title, { description: n.body, action: n.link ? { label: "Ver", onClick: () => navigate({ to: n.link! }) } : undefined });
      if (settings.notify_sound) playChime();
      if (settings.notify_push && document.visibilityState !== "visible") showBrowserNotification(n.title, n.body);
    };
    window.addEventListener("ponte:new-notification", h);
    return () => window.removeEventListener("ponte:new-notification", h);
  }, [settings, navigate]);
  useEffect(() => { if (me.data) supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", me.data.profile.id).then(() => {}); }, [me.data?.profile.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (n: Notification) => {
    if (!n.read_at) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
    navigate({ to: n.link ?? "/notificacoes" });
  };
  const markAll = async () => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications"] });
    toast.success("Todas marcadas como lidas.");
  };
  const logout = async () => { await signOut(qc); navigate({ to: "/", replace: true }); };

  return <div className="min-h-screen bg-background">
    <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">Pular para o conteúdo</a>
    <header className="fixed inset-x-0 top-0 z-40 h-18 border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1600px] items-center gap-3 px-4 lg:px-7">
        <Link to="/dashboard" className="flex items-center gap-2 font-display text-xl font-black" aria-label="Ponte 404 — início"><span className="grid size-10 place-items-center rounded-xl bridge-gradient text-primary-foreground">P</span><span className="hidden sm:inline">Ponte <span className="text-coral">404</span></span></Link>
        <form role="search" className="relative ml-auto hidden w-full max-w-xl md:block" onSubmit={e => { e.preventDefault(); navigate({ to: "/busca", search: { q } as never }); }}>
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Buscar" value={q} onChange={e => setQ(e.target.value)} maxLength={80} className="h-11 rounded-xl bg-muted pl-11 shadow-none" placeholder="Busque por matéria ou instrutor..." />
        </form>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label={`Notificações, ${unread.length} não lidas`} className="relative">
                <Bell />
                {unread.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-coral px-1 text-[10px] font-black text-coral-foreground">{unread.length > 99 ? "99+" : unread.length}</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[22rem] max-w-[92vw]">
              <DropdownMenuLabel className="flex items-center justify-between">Notificações {unread.length > 0 && <Badge className="bg-coral text-coral-foreground">{unread.length} novas</Badge>}</DropdownMenuLabel>
              {(notifs.data ?? []).slice(0, 6).map(n => <DropdownMenuItem key={n.id} onClick={() => open(n)} className="items-start gap-3 py-2">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent border border-muted-foreground" : "bg-coral"}`} aria-label={n.read_at ? "Lida" : "Não lida"} />
                <span className="min-w-0"><b className={`block text-sm ${n.read_at ? "font-medium" : ""}`}>{n.title}</b><span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span><span className="text-[11px] text-muted-foreground">{relTime(n.created_at)}</span></span>
              </DropdownMenuItem>)}
              {notifs.data?.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">🔔 Você não possui notificações.</p>}
              <DropdownMenuSeparator />
              {unread.length > 0 && <DropdownMenuItem onClick={markAll}><Check /> Marcar todas como lidas</DropdownMenuItem>}
              <DropdownMenuItem asChild><Link to="/notificacoes"><BellRing /> Ver central de notificações</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-11 px-2" aria-label="Menu da conta">
                <UserAvatar name={name} path={me.data?.profile.avatar_url} />
                <span className="hidden text-left sm:block"><b className="block max-w-32 truncate text-xs">{name}</b><small className="text-muted-foreground">{role ?? "…"}</small></span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{me.data?.profile.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/perfil"><User /> Meu perfil</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/configuracoes"><Settings /> Configurações</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}><LogOut /> Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
    <aside className="fixed bottom-0 left-0 top-18 z-30 hidden w-64 border-r bg-card px-4 py-6 lg:block" aria-label="Navegação principal">
      <nav className="space-y-1">
        {nav.map(i => <SideLink key={i.to} to={i.to} label={i.label} icon={i.icon} active={path === i.to} />)}
        <SideLink to="/notificacoes" label="Notificações" icon={Bell} active={path === "/notificacoes"} badge={unread.length} />
        <SideLink to="/configuracoes" label="Configurações" icon={Settings} active={path === "/configuracoes"} />
        {role === "Admin" && <SideLink to="/usuarios" label="Gerenciar usuários" icon={Users} active={path === "/usuarios"} />}
      </nav>
      {role === "Voluntário" && <div className="mt-8 rounded-xl bg-secondary p-4"><div className="mb-2 flex items-center gap-2"><Sparkles className="size-4 text-primary" /><b className="text-sm">Minha jornada</b></div><p className="text-xs text-muted-foreground">Uma conta, duas formas de crescer: publique na Comunidade e solicite aulas para aprender.</p></div>}
      <div className="absolute bottom-5 left-4 right-4 rounded-xl border bg-muted/60 p-4"><div className="mb-1 flex items-center gap-2 text-sm font-bold"><HeartHandshake className="size-4 text-coral" /> Ponte 404</div><p className="text-xs text-muted-foreground">Educação pública conectada.</p></div>
    </aside>
    <main id="conteudo" className="pb-28 pt-18 lg:pl-64"><div className="mx-auto max-w-[1340px] p-4 sm:p-7 lg:p-9">
      {me.data && me.data.profile.approval_status !== "aprovado" && <div role="status" className={`mb-6 rounded-xl border p-4 text-sm ${me.data.profile.approval_status === "pendente" ? "border-warning bg-warning/15" : "border-destructive bg-destructive/10"}`}>
        <b>{me.data.profile.approval_status === "pendente" ? "⏳ Cadastro em análise" : "✖ Cadastro reprovado"}</b> — {me.data.profile.approval_status === "pendente" ? "Seu documento será validado por um administrador. Você será notificado." : `Motivo: ${me.data.profile.rejection_reason ?? "não informado"}.`}
      </div>}
      {children}
    </div></main>
    <nav aria-label="Navegação" className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-6 rounded-2xl border bg-card/95 p-2 shadow-2xl backdrop-blur lg:hidden">
      {nav.map(({ to, label, icon: Icon }) => <Link key={to} to={to} className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[9px] font-bold ${path === to ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><Icon className="size-5" aria-hidden />{label}</Link>)}
    </nav>
  </div>;
}

function SideLink({ to, label, icon: Icon, active, badge = 0 }: { to: string; label: string; icon: typeof Home; active: boolean; badge?: number }) {
  return <Link to={to} aria-current={active ? "page" : undefined} className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
    <Icon className="size-5" aria-hidden />{label}{badge > 0 && <span className="ml-auto rounded-full bg-coral px-2 text-xs text-coral-foreground">{badge}</span>}
  </Link>;
}
