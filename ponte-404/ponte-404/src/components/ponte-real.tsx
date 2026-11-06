import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell, BookOpen, CalendarDays, CalendarPlus, Check, CheckCircle2, Clock3, ImagePlus, Inbox, Lock, LogOut, MessageCircle,
  Monitor, Moon, Search, Settings, ShieldCheck, Star, Sun, Trash2, User, Users, XCircle, Eye, Ban, Pencil, BellRing,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, UserAvatar, relTime } from "@/components/ponte-shell";
import { deleteMyAccount } from "@/lib/account.functions";
import {
  applySettings, formatWhen, playChime, roleLabel, showBrowserNotification, signOut, useDirectory, useLessons, useMe, useMediaUrl, useNotifications,
  type Lesson, type Notification, type Profile, type PublicProfile, type Settings as UserSettings,
} from "@/lib/ponte-session";

/* ---------------- shared bits ---------------- */
function Title({ eyebrow, title, text, action }: { eyebrow?: string; title: string; text: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>{eyebrow && <p className="mb-2 text-sm font-bold text-primary">{eyebrow}</p>}<h1 className="font-display text-3xl font-black sm:text-4xl">{title}</h1><p className="mt-2 text-muted-foreground">{text}</p></div>{action}</div>;
}
function Empty({ icon: Icon, title, text, action }: { icon: typeof Bell; title: string; text: string; action?: ReactNode }) {
  return <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center"><Icon className="mx-auto mb-4 size-10 text-muted-foreground" aria-hidden /><h3 className="font-display text-lg font-black">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{text}</p>{action && <div className="mt-5">{action}</div>}</div>;
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="grid gap-2 text-sm font-bold">{label}{children}{hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}</label>;
}
function Loading() { return <div role="status" className="py-16 text-center text-muted-foreground">Carregando…</div>; }
function Toggle({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  return <label className={`flex min-h-12 items-center justify-between gap-4 rounded-xl border bg-background px-4 py-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
    <span><b className="block text-sm">{label}</b>{hint && <span className="text-xs text-muted-foreground">{hint}</span>}</span>
    <input type="checkbox" role="switch" aria-checked={checked} className="size-5 accent-primary" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
  </label>;
}
const statusInfo: Record<string, { label: string; cls: string; icon: string }> = {
  solicitada: { label: "Solicitada", cls: "bg-warning text-warning-foreground", icon: "⏳" },
  agendada: { label: "Agendada", cls: "bg-info text-info-foreground", icon: "📅" },
  confirmada: { label: "Confirmada", cls: "bg-success text-success-foreground", icon: "✔" },
  cancelada: { label: "Cancelada", cls: "bg-destructive text-destructive-foreground", icon: "✖" },
  concluida: { label: "Concluída", cls: "bg-secondary text-secondary-foreground", icon: "🏁" },
};
function StatusBadge({ s }: { s: string }) { const i = statusInfo[s] ?? statusInfo["agendada"]!; return <Badge className={i.cls}><span aria-hidden>{i.icon}</span> {i.label}</Badge>; }
const categoryLabel: Record<string, string> = { aula: "Aulas", lembrete: "Lembretes", solicitacao: "Solicitações", admin: "Administração", sistema: "Sistema" };

function useNameMap() {
  const dir = useDirectory();
  return useMemo(() => new Map((dir.data ?? []).map(p => [p.id, p] as const)), [dir.data]);
}

/* ---------------- lesson form (Professor: create / edit, Aluno+Voluntário: request) ---------------- */
function LessonForm({ open, onOpenChange, mode, lesson, teacherId }: { open: boolean; onOpenChange: (v: boolean) => void; mode: "create" | "edit" | "request"; lesson?: Lesson | undefined; teacherId?: string | undefined }) {
  const me = useMe(); const qc = useQueryClient(); const dir = useDirectory();
  const [busy, setBusy] = useState(false);
  const instructors = (dir.data ?? []).filter(p => p.role === "professor" && p.approval_status === "aprovado" && p.id !== me.data?.profile.id);
  const toLocal = (iso?: string) => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!me.data) return;
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title") ?? "").trim(); const subject = String(f.get("subject") ?? "").trim();
    const when = String(f.get("when") ?? ""); const location = String(f.get("location") ?? "Sala online").trim() || "Sala online";
    const topics = String(f.get("topics") ?? "").split(",").map(t => t.trim()).filter(Boolean).slice(0, 10);
    if (title.length < 3) return void toast.error("O título precisa ter pelo menos 3 caracteres.");
    if (!when || new Date(when).getTime() < Date.now()) return void toast.error("Escolha uma data e hora no futuro.");
    setBusy(true);
    const starts_at = new Date(when).toISOString();
    let error;
    if (mode === "edit" && lesson) {
      ({ error } = await supabase.from("lessons").update({ title, subject, starts_at, location, topics }).eq("id", lesson.id));
    } else if (mode === "create") {
      const studentId = String(f.get("student") ?? "") || null;
      ({ error } = await supabase.from("lessons").insert({ title, subject, starts_at, location, topics, seats: Number(f.get("seats") ?? 1) || 1, teacher_id: me.data.profile.id, created_by: me.data.profile.id, student_id: studentId, status: "agendada" }));
    } else {
      const teacher = String(f.get("teacher") ?? teacherId ?? "");
      if (!teacher) { setBusy(false); return void toast.error("Escolha um professor."); }
      ({ error } = await supabase.from("lessons").insert({ title, subject, starts_at, location, topics, teacher_id: teacher, student_id: me.data.profile.id, created_by: me.data.profile.id, status: "solicitada" }));
    }
    setBusy(false);
    if (error) return void toast.error("Não foi possível salvar: " + error.message);
    qc.invalidateQueries({ queryKey: ["lessons"] }); qc.invalidateQueries({ queryKey: ["notifications"] });
    toast.success(mode === "edit" ? "Aula atualizada. Participantes notificados." : mode === "create" ? "Aula marcada! Participantes notificados." : "Solicitação enviada ao professor.");
    onOpenChange(false);
  };
  const students = (dir.data ?? []).filter(p => p.role === "aluno" || p.role === "voluntario");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] overflow-y-auto">
    <DialogHeader><DialogTitle>{mode === "edit" ? "Alterar aula" : mode === "create" ? "Marcar aula" : "Solicitar aula"}</DialogTitle><DialogDescription>{mode === "request" ? "O professor recebe uma notificação e pode confirmar." : "Os participantes serão notificados automaticamente."}</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="grid gap-4">
      {mode === "request" && !teacherId && <Field label="Professor"><select name="teacher" required className="h-11 rounded-md border bg-background px-3" defaultValue=""><option value="" disabled>Escolha…</option>{instructors.map(i => <option key={i.id} value={i.id}>{i.display_name}{i.subjects?.length ? ` — ${i.subjects.join(", ")}` : ""}</option>)}</select>{instructors.length === 0 && <span className="text-xs font-normal text-muted-foreground">Ainda não há professores aprovados.</span>}</Field>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Disciplina"><Input name="subject" required maxLength={40} defaultValue={lesson?.subject} placeholder="Ex.: Matemática" /></Field>
        <Field label="Data e hora"><Input name="when" type="datetime-local" required defaultValue={toLocal(lesson?.starts_at)} /></Field>
      </div>
      <Field label="Título"><Input name="title" required minLength={3} maxLength={120} defaultValue={lesson?.title} placeholder="Ex.: Funções do 2º grau" /></Field>
      <Field label="Local ou link"><Input name="location" maxLength={200} defaultValue={lesson?.location ?? "Sala online"} /></Field>
      <Field label="Temas (separados por vírgula)"><Input name="topics" maxLength={300} defaultValue={lesson?.topics.join(", ")} placeholder="Revisão, exercícios" /></Field>
      {mode === "create" && <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Aluno (opcional)"><select name="student" className="h-11 rounded-md border bg-background px-3" defaultValue=""><option value="">Turma aberta</option>{students.map(s => <option key={s.id} value={s.id}>{s.display_name}</option>)}</select></Field>
        <Field label="Vagas"><Input name="seats" type="number" min={1} max={100} defaultValue={1} /></Field>
      </div>}
      <Button disabled={busy} className="h-11">{busy ? "Salvando…" : "Confirmar"} <Check /></Button>
    </form>
  </DialogContent></Dialog>;
}

/* ---------------- dashboard ---------------- */
export function DashboardPage() {
  const me = useMe(); const lessons = useLessons(); const notifs = useNotifications(); const navigate = useNavigate();
  const [form, setForm] = useState<null | "create" | "request">(null);
  if (!me.data) return <AppShell><Loading /></AppShell>;
  const { role, profile } = me.data;
  const now = Date.now();
  const all = lessons.data ?? [];
  const upcoming = all.filter(l => ["agendada", "confirmada", "solicitada"].includes(l.status) && new Date(l.starts_at).getTime() > now);
  const todayKey = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const today = upcoming.filter(l => new Date(l.starts_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === todayKey);
  const pending = all.filter(l => l.status === "solicitada" && l.teacher_id === profile.id);
  const unread = (notifs.data ?? []).filter(n => !n.read_at).length;

  type Shortcut = { label: string; icon: typeof Bell; tone: string; onClick: () => void; count?: number };
  const shortcuts: Shortcut[] = [];
  if (role === "Professor") shortcuts.push({ label: "Marcar aula", icon: CalendarPlus, tone: "bg-primary text-primary-foreground", onClick: () => setForm("create") });
  if (role === "Aluno" || role === "Voluntário") shortcuts.push({ label: "Solicitar aula", icon: CalendarPlus, tone: "bg-primary text-primary-foreground", onClick: () => setForm("request") });
  shortcuts.push({ label: "Minha agenda", icon: CalendarDays, tone: "bg-info text-info-foreground", onClick: () => navigate({ to: "/aulas" }), count: upcoming.length });
  if (role === "Professor") shortcuts.push({ label: "Solicitações", icon: Inbox, tone: "bg-warning text-warning-foreground", onClick: () => navigate({ to: "/aulas", search: { tab: "solicitada" } as never }), count: pending.length });
  if (role === "Professor" || role === "Voluntário") shortcuts.push({ label: "Publicar", icon: MessageCircle, tone: "bg-coral text-coral-foreground", onClick: () => navigate({ to: "/comunidade" }) });
  if (role === "Admin") shortcuts.push({ label: "Aprovar cadastros", icon: Users, tone: "bg-warning text-warning-foreground", onClick: () => navigate({ to: "/usuarios" }) });
  shortcuts.push({ label: "Notificações", icon: Bell, tone: "bg-accent text-accent-foreground", onClick: () => navigate({ to: "/notificacoes" }), count: unread });
  shortcuts.push({ label: "Buscar", icon: Search, tone: "bg-secondary text-secondary-foreground", onClick: () => navigate({ to: "/busca" }) });
  shortcuts.push({ label: "Perfil", icon: User, tone: "bg-success/15 text-success", onClick: () => navigate({ to: "/perfil" }) });
  shortcuts.push({ label: "Configurações", icon: Settings, tone: "bg-muted text-foreground", onClick: () => navigate({ to: "/configuracoes" }) });

  return <AppShell><div className="page-enter">
    <Title eyebrow={new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" })} title={`Olá, ${(profile.display_name || "você").split(" ")[0]}! 👋`} text="Seu próximo passo está logo ali. Vamos aprender?" />
    <section aria-labelledby="qa" className="mb-8">
      <h2 id="qa" className="mb-4 font-display text-xl font-black">Acesso rápido</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {shortcuts.map(s => <button key={s.label} type="button" onClick={s.onClick} className="lift-card relative flex min-h-24 flex-col items-start justify-between gap-3 rounded-xl border bg-card p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <span className={`grid size-10 place-items-center rounded-xl ${s.tone}`}><s.icon className="size-5" aria-hidden /></span>
          <b className="text-sm">{s.label}</b>
          {!!s.count && <span className="absolute right-3 top-3 rounded-full bg-coral px-2 text-xs font-black text-coral-foreground" aria-label={`${s.count} itens`}>{s.count}</span>}
        </button>)}
      </div>
    </section>
    <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Aulas hoje" value={today.length} icon={Clock3} />
      <StatCard label="Próximas aulas" value={upcoming.length} icon={CalendarDays} />
      <StatCard label={role === "Professor" ? "Solicitações pendentes" : "Aguardando confirmação"} value={role === "Professor" ? pending.length : upcoming.filter(l => l.status === "solicitada").length} icon={Inbox} />
      <StatCard label="Não lidas" value={unread} icon={Bell} />
    </div>
    <section aria-labelledby="up">
      <div className="mb-4 flex items-center justify-between"><h2 id="up" className="font-display text-xl font-black">Próximas aulas</h2><Link to="/aulas" className="text-sm font-bold text-primary">Ver agenda</Link></div>
      {lessons.isLoading ? <Loading /> : upcoming.length === 0 ? <Empty icon={CalendarDays} title="Nenhuma aula por vir" text={role === "Professor" ? "Marque sua primeira aula para começar." : role === "Admin" ? "As aulas da plataforma aparecem aqui." : "Solicite uma aula a um professor."} /> :
        <div className="grid gap-3">{upcoming.slice(0, 5).map(l => <LessonRow key={l.id} l={l} />)}</div>}
    </section>
    {form && <LessonForm open onOpenChange={v => !v && setForm(null)} mode={form} />}
  </div></AppShell>;
}
function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Bell }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary"><Icon className="size-5" aria-hidden /></span><span><b className="block font-display text-2xl font-black">{value}</b><span className="text-xs text-muted-foreground">{label}</span></span></CardContent></Card>;
}
function LessonRow({ l, actions }: { l: Lesson; actions?: ReactNode }) {
  const names = useNameMap();
  const teacher = names.get(l.teacher_id)?.display_name ?? "Professor";
  const student = l.student_id ? names.get(l.student_id)?.display_name ?? "Aluno" : "Turma aberta";
  return <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><BookOpen aria-hidden /></span>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="truncate">{l.title}</b><StatusBadge s={l.status} /></div>
      <p className="text-sm text-muted-foreground">{l.subject} · {formatWhen(l.starts_at)} · {l.location}</p>
      <p className="text-xs text-muted-foreground">Professor: {teacher} · Participante: {student}</p>
      {l.topics.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{l.topics.map(t => <Badge key={t} variant="secondary">{t}</Badge>)}</div>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </CardContent></Card>;
}

/* ---------------- lessons ---------------- */
export function LessonsPage() {
  const me = useMe(); const lessons = useLessons(); const qc = useQueryClient();
  const search = useSearch({ strict: false }) as { tab?: string };
  const [tab, setTab] = useState(search.tab ?? "proximas");
  const [form, setForm] = useState<null | { mode: "create" | "request" | "edit"; lesson?: Lesson }>(null);
  const [confirmCancel, setConfirmCancel] = useState<Lesson | null>(null);
  if (!me.data) return <AppShell><Loading /></AppShell>;
  const { role, profile } = me.data;
  const all = lessons.data ?? [];
  const now = Date.now();
  const tabs: [string, string, (l: Lesson) => boolean][] = [
    ["proximas", "Próximas", l => ["agendada", "confirmada"].includes(l.status) && new Date(l.starts_at).getTime() + l.duration_minutes * 60000 > now],
    ["solicitada", "Solicitações", l => l.status === "solicitada"],
    ["concluida", "Concluídas", l => l.status === "concluida" || (["agendada", "confirmada"].includes(l.status) && new Date(l.starts_at).getTime() + l.duration_minutes * 60000 <= now)],
    ["cancelada", "Canceladas", l => l.status === "cancelada"],
  ];
  const current = tabs.find(t => t[0] === tab) ?? tabs[0]!;
  const list = all.filter(current[2]);
  const setStatus = async (l: Lesson, status: string, msg: string) => {
    const { error } = await supabase.from("lessons").update({ status }).eq("id", l.id);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["lessons"] }); qc.invalidateQueries({ queryKey: ["notifications"] }); toast.success(msg);
  };
  const rate = async (l: Lesson, rating: number) => {
    const { error } = await supabase.from("lessons").update({ rating }).eq("id", l.id);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["lessons"] }); toast.success("Obrigado pela avaliação!");
  };
  const action = role === "Professor" ? <Button onClick={() => setForm({ mode: "create" })}><CalendarPlus /> Marcar aula</Button>
    : role === "Admin" ? <Badge variant="secondary" className="h-9 px-3"><Eye className="size-4" /> Somente visualização</Badge>
    : <Button onClick={() => setForm({ mode: "request" })}><CalendarPlus /> Solicitar aula</Button>;
  return <AppShell><div className="page-enter">
    <Title title="Aulas" text="Sua agenda real: agende, confirme, altere, cancele e avalie." action={action} />
    <div role="tablist" className="mb-6 inline-flex flex-wrap rounded-xl border bg-card p-1">{tabs.map(([k, label, fn]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`h-10 rounded-lg px-4 text-sm font-bold ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{label} <span className="opacity-70">({all.filter(fn).length})</span></button>)}</div>
    {lessons.isLoading ? <Loading /> : list.length === 0 ? <Empty icon={CalendarDays} title="Nada por aqui" text="Quando houver aulas nesta categoria, elas aparecem aqui." /> :
      <div className="grid gap-3">{list.map(l => {
        const isTeacher = l.teacher_id === profile.id; const isStudent = l.student_id === profile.id;
        const past = new Date(l.starts_at).getTime() <= now; const open = ["solicitada", "agendada", "confirmada"].includes(l.status);
        return <LessonRow key={l.id} l={l} actions={<>
          {isTeacher && l.status === "solicitada" && <Button size="sm" onClick={() => setStatus(l, "confirmada", "Aula confirmada. Aluno notificado.")}><Check /> Confirmar</Button>}
          {isTeacher && l.status === "agendada" && l.student_id && <Button size="sm" onClick={() => setStatus(l, "confirmada", "Aula confirmada.")}><Check /> Confirmar</Button>}
          {isTeacher && open && !past && <Button size="sm" variant="outline" onClick={() => setForm({ mode: "edit", lesson: l })}><Pencil /> Alterar</Button>}
          {isTeacher && ["agendada", "confirmada"].includes(l.status) && past && <Button size="sm" onClick={() => setStatus(l, "concluida", "Aula concluída. Aluno convidado a avaliar.")}><CheckCircle2 /> Concluir</Button>}
          {(isTeacher || isStudent) && open && !past && <Button size="sm" variant="outline" onClick={() => setConfirmCancel(l)}><XCircle /> Cancelar</Button>}
          {isStudent && l.status === "concluida" && (l.rating ? <Badge className="bg-warning text-warning-foreground">{"★".repeat(l.rating)}</Badge> :
            <span className="flex" role="group" aria-label="Avaliar aula">{[1, 2, 3, 4, 5].map(n => <button key={n} aria-label={`${n} estrelas`} onClick={() => rate(l, n)} className="p-1 text-warning hover:scale-110"><Star className="size-5" /></button>)}</span>)}
        </>} />;
      })}</div>}
    {form && <LessonForm open onOpenChange={v => !v && setForm(null)} mode={form.mode} lesson={form.lesson} />}
    <Dialog open={!!confirmCancel} onOpenChange={v => !v && setConfirmCancel(null)}><DialogContent>
      <DialogHeader><DialogTitle>Cancelar aula?</DialogTitle><DialogDescription>Os participantes serão avisados. Essa ação não pode ser desfeita.</DialogDescription></DialogHeader>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirmCancel(null)}>Voltar</Button><Button variant="destructive" onClick={async () => { const l = confirmCancel!; setConfirmCancel(null); await setStatus(l, "cancelada", "Aula cancelada. Participantes notificados."); }}>Cancelar aula</Button></div>
    </DialogContent></Dialog>
  </div></AppShell>;
}

/* ---------------- notifications center ---------------- */
export function NotificationsPage() {
  const notifs = useNotifications(); const qc = useQueryClient(); const navigate = useNavigate();
  const [cat, setCat] = useState("todas"); const [st, setSt] = useState("todas");
  const list = (notifs.data ?? []).filter(n => (cat === "todas" || n.category === cat) && (st === "todas" || (st === "nao" ? !n.read_at : !!n.read_at)));
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const mark = async (n: Notification, read: boolean) => { await supabase.from("notifications").update({ read_at: read ? new Date().toISOString() : null }).eq("id", n.id); refresh(); };
  const del = async (n: Notification) => { await supabase.from("notifications").delete().eq("id", n.id); refresh(); toast.success("Notificação excluída."); };
  const markAll = async () => { await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null); refresh(); toast.success("Todas marcadas como lidas."); };
  const unread = (notifs.data ?? []).filter(n => !n.read_at).length;
  return <AppShell><div className="page-enter">
    <Title title="Notificações" text={`${unread} não lidas · o histórico fica salvo na sua conta.`} action={unread > 0 ? <Button variant="outline" onClick={markAll}><Check /> Marcar todas como lidas</Button> : undefined} />
    <div className="mb-5 flex flex-wrap gap-3">
      <select aria-label="Filtrar por categoria" value={cat} onChange={e => setCat(e.target.value)} className="h-11 rounded-xl border bg-card px-3 text-sm font-bold"><option value="todas">Todas as categorias</option>{Object.entries(categoryLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select aria-label="Filtrar por leitura" value={st} onChange={e => setSt(e.target.value)} className="h-11 rounded-xl border bg-card px-3 text-sm font-bold"><option value="todas">Lidas e não lidas</option><option value="nao">Não lidas</option><option value="lidas">Lidas</option></select>
    </div>
    {notifs.isLoading ? <Loading /> : list.length === 0 ? <Empty icon={Bell} title="Você não possui notificações" text="Quando algo acontecer nas suas aulas, você será avisado aqui." /> :
      <ul className="grid gap-2">{list.map(n => <li key={n.id}><Card className={n.read_at ? "" : "border-primary/40 bg-secondary/40"}><CardContent className="flex items-start gap-3 p-4">
        <span className={`mt-2 size-2.5 shrink-0 rounded-full ${n.read_at ? "border border-muted-foreground" : "bg-coral"}`} aria-hidden />
        <button className="min-w-0 flex-1 text-left" onClick={async () => { if (!n.read_at) await mark(n, true); navigate({ to: n.link ?? "/notificacoes" }); }}>
          <div className="flex flex-wrap items-center gap-2"><b>{n.title}</b><Badge variant="secondary">{categoryLabel[n.category] ?? n.category}</Badge>{!n.read_at && <span className="text-xs font-bold text-coral">Nova</span>}</div>
          <p className="text-sm text-muted-foreground">{n.body}</p>
          <p className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {relTime(n.created_at)}</p>
        </button>
        <div className="flex shrink-0 gap-1">
          <Button size="icon" variant="ghost" aria-label={n.read_at ? "Marcar como não lida" : "Marcar como lida"} onClick={() => mark(n, !n.read_at)}>{n.read_at ? <BellRing /> : <Check />}</Button>
          <Button size="icon" variant="ghost" aria-label="Excluir notificação" onClick={() => del(n)}><Trash2 /></Button>
        </div>
      </CardContent></Card></li>)}</ul>}
  </div></AppShell>;
}

/* ---------------- profile ---------------- */
const MAX = 5 * 1024 * 1024;
function checkImage(file: File, kind: "avatar" | "banner"): Promise<string | null> {
  return new Promise(resolve => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return resolve("Use JPG, PNG ou WEBP.");
    if (file.size > MAX) return resolve("A imagem deve ter até 5 MB.");
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); const min = kind === "avatar" ? [128, 128] : [600, 150]; resolve(img.width < min[0]! || img.height < min[1]! ? `Dimensão mínima: ${min[0]}×${min[1]} px.` : null); };
    img.onerror = () => resolve("Arquivo de imagem inválido.");
    img.src = url;
  });
}
export function ProfilePage() {
  const me = useMe(); const lessons = useLessons(); const qc = useQueryClient();
  const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ kind: "avatar" | "banner"; file: File; url: string } | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null); const bannerInput = useRef<HTMLInputElement>(null);
  const bannerUrl = useMediaUrl(me.data?.profile.banner_url);
  if (!me.data) return <AppShell><Loading /></AppShell>;
  const { profile: p, role } = me.data;
  const done = (lessons.data ?? []).filter(l => l.status === "concluida");
  const ratings = done.filter(l => l.teacher_id === p.id && l.rating).map(l => l.rating!);
  const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2) : "—";
  const links = Array.isArray(p.links) ? (p.links as string[]) : [];
  const refresh = () => { qc.invalidateQueries({ queryKey: ["me"] }); qc.invalidateQueries({ queryKey: ["directory"] }); };

  const pick = async (kind: "avatar" | "banner", file?: File) => {
    if (!file) return; const err = await checkImage(file, kind);
    if (err) return void toast.error(err);
    setPreview({ kind, file, url: URL.createObjectURL(file) });
  };
  const upload = async () => {
    if (!preview) return; setBusy(true);
    const ext = preview.file.type.split("/")[1]; const path = `${p.id}/${preview.kind}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("profile-media").upload(path, preview.file, { contentType: preview.file.type });
    if (up.error) { setBusy(false); return void toast.error("Falha no envio: " + up.error.message); }
    const old = preview.kind === "avatar" ? p.avatar_url : p.banner_url;
    const { error } = await supabase.from("profiles").update(preview.kind === "avatar" ? { avatar_url: path } : { banner_url: path }).eq("id", p.id);
    if (old) await supabase.storage.from("profile-media").remove([old]);
    setBusy(false); setPreview(null);
    if (error) return void toast.error(error.message);
    refresh(); toast.success(preview.kind === "avatar" ? "Foto atualizada!" : "Capa atualizada!");
  };
  const removeImg = async (kind: "avatar" | "banner") => {
    const old = kind === "avatar" ? p.avatar_url : p.banner_url; if (!old) return;
    await supabase.storage.from("profile-media").remove([old]);
    await supabase.from("profiles").update(kind === "avatar" ? { avatar_url: null } : { banner_url: null }).eq("id", p.id);
    refresh(); toast.success("Imagem removida.");
  };
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const display_name = String(f.get("display_name") ?? "").trim();
    const username = String(f.get("username") ?? "").trim().toLowerCase().replace(/^@/, "") || null;
    if (display_name.length < 2) return void toast.error("Informe um nome com pelo menos 2 letras.");
    if (username && !/^[a-z0-9_]{3,30}$/.test(username)) return void toast.error("Usuário: 3 a 30 letras minúsculas, números ou _.");
    const linkList = String(f.get("links") ?? "").split(/\s+/).map(s => s.trim()).filter(Boolean).slice(0, 5);
    if (linkList.some(l => !/^https?:\/\/.+\..+/.test(l))) return void toast.error("Links devem começar com http:// ou https://");
    setBusy(true);
    const { error } = await supabase.from("profiles").update({
      display_name, username, bio: String(f.get("bio") ?? "").slice(0, 400), city: String(f.get("city") ?? "").slice(0, 80),
      subjects: String(f.get("subjects") ?? "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 10), links: linkList,
    }).eq("id", p.id);
    setBusy(false);
    if (error) return void toast.error(error.code === "23505" ? "Esse nome de usuário já está em uso." : error.message);
    refresh(); setEditing(false); toast.success("Perfil salvo!");
  };
  return <AppShell><div className="page-enter">
    <Card className="overflow-hidden">
      <div className="relative h-40 bg-cover bg-center sm:h-56 bridge-gradient" style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined}>
        <div className="absolute right-3 top-3 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => bannerInput.current?.click()}><ImagePlus /> Capa</Button>
          {p.banner_url && <Button size="sm" variant="secondary" aria-label="Remover capa" onClick={() => removeImg("banner")}><Trash2 /></Button>}
        </div>
        <input ref={bannerInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => { pick("banner", e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <CardContent className="relative p-5 sm:p-7">
        <div className="-mt-16 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="relative w-fit"><UserAvatar name={p.display_name} path={p.avatar_url} className="size-28 border-4 border-card text-2xl" />
            <div className="mt-2 flex gap-1"><Button size="sm" variant="outline" onClick={() => avatarInput.current?.click()}><ImagePlus /> Foto</Button>{p.avatar_url && <Button size="sm" variant="ghost" aria-label="Remover foto" onClick={() => removeImg("avatar")}><Trash2 /></Button>}</div>
            <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => { pick("avatar", e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2"><h1 className="font-display text-3xl font-black">{p.display_name}</h1>
              {role === "Professor" && p.approval_status === "aprovado" && <Badge className="gap-1 bg-success text-success-foreground"><CheckCircle2 className="size-3" /> Certificado validado</Badge>}
              {role === "Voluntário" && p.approval_status === "aprovado" && <Badge className="gap-1 bg-coral text-coral-foreground"><ShieldCheck className="size-3" /> Escolaridade validada</Badge>}
              <Badge variant="secondary">{role}</Badge></div>
            <p className="text-muted-foreground">{p.username ? `@${p.username}` : "Defina seu @usuario"} {p.city && `· ${p.city}`}</p>
          </div>
          <Button onClick={() => setEditing(true)}><Pencil /> Editar perfil</Button>
        </div>
        {p.bio && <p className="mt-5 max-w-2xl">{p.bio}</p>}
        {links.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{links.map(l => <a key={l} href={l} target="_blank" rel="noreferrer noopener" className="text-sm font-bold text-primary underline">{l.replace(/^https?:\/\//, "")}</a>)}</div>}
        {p.subjects.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{p.subjects.map(s => <Badge key={s} variant="secondary">{s}</Badge>)}</div>}
        <p className="mt-4 text-xs text-muted-foreground"><Lock className="mr-1 inline size-3" />E-mail {p.show_email ? "visível" : "oculto"} para outros usuários · perfil {p.public_profile ? "público" : "privado"} — altere em Configurações.</p>
      </CardContent>
    </Card>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <StatCard label="Aulas concluídas" value={done.length} icon={CheckCircle2} />
      <StatCard label="Aulas no total" value={(lessons.data ?? []).length} icon={CalendarDays} />
      <Card><CardContent className="flex items-center gap-3 p-4"><span className="grid size-11 place-items-center rounded-xl bg-warning/20 text-warning-foreground"><Star className="size-5" /></span><span><b className="block font-display text-2xl font-black">{avg}</b><span className="text-xs text-muted-foreground">Média de avaliações ({ratings.length})</span></span></CardContent></Card>
    </div>
    <h2 className="mb-3 mt-8 font-display text-xl font-black">Histórico</h2>
    {done.length === 0 ? <Empty icon={BookOpen} title="Sem aulas concluídas ainda" text="Seu histórico aparece aqui após a primeira aula." /> : <div className="grid gap-3">{done.map(l => <LessonRow key={l.id} l={l} />)}</div>}

    <Dialog open={editing} onOpenChange={setEditing}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Editar perfil</DialogTitle><DialogDescription>Essas informações podem ser vistas por outros usuários se seu perfil for público.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="grid gap-4">
        <Field label="Nome de exibição"><Input name="display_name" defaultValue={p.display_name} required maxLength={60} /></Field>
        <Field label="Nome de usuário" hint="Ex.: gerson_jr"><Input name="username" defaultValue={p.username ?? ""} maxLength={31} placeholder="@usuario" /></Field>
        <Field label="E-mail da conta" hint="Para alterar, use Configurações › Conta."><Input value={p.email ?? ""} disabled /></Field>
        <Field label="Cidade"><Input name="city" defaultValue={p.city} maxLength={80} /></Field>
        <Field label="Biografia"><textarea name="bio" defaultValue={p.bio} maxLength={400} rows={3} className="rounded-md border bg-background p-3 text-sm font-normal" /></Field>
        <Field label="Disciplinas (vírgula)"><Input name="subjects" defaultValue={p.subjects.join(", ")} maxLength={200} /></Field>
        <Field label="Links (separados por espaço, até 5)"><Input name="links" defaultValue={links.join(" ")} maxLength={500} placeholder="https://..." /></Field>
        <Button disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
      </form></DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={v => !v && setPreview(null)}><DialogContent><DialogHeader><DialogTitle>Pré-visualização</DialogTitle><DialogDescription>Confira a imagem antes de salvar.</DialogDescription></DialogHeader>
      {preview && <img src={preview.url} alt="Pré-visualização" className={preview.kind === "avatar" ? "mx-auto size-40 rounded-2xl object-cover" : "aspect-[4/1] w-full rounded-xl object-cover"} />}
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setPreview(null)}>Cancelar</Button><Button disabled={busy} onClick={upload}>{busy ? "Enviando…" : "Salvar imagem"}</Button></div>
    </DialogContent></Dialog>
  </div></AppShell>;
}

/* ---------------- settings ---------------- */
export function SettingsPage() {
  const me = useMe(); const qc = useQueryClient(); const navigate = useNavigate();
  const del = useServerFn(deleteMyAccount);
  const [pwOpen, setPwOpen] = useState(false); const [delOpen, setDelOpen] = useState(false); const [busy, setBusy] = useState(false);
  if (!me.data) return <AppShell><Loading /></AppShell>;
  const s = me.data.settings; const p = me.data.profile;
  const setS = async (patch: Partial<UserSettings>) => {
    const next = { ...s, ...patch }; applySettings(next);
    qc.setQueryData(["me", p.id], { ...me.data, settings: next });
    const { error } = await supabase.from("user_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("user_id", p.id);
    if (error) { toast.error("Não foi possível salvar."); qc.invalidateQueries({ queryKey: ["me"] }); }
  };
  const setP = async (patch: Partial<Profile>) => {
    const { error } = await supabase.from("profiles").update(patch).eq("id", p.id);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["me"] }); qc.invalidateQueries({ queryKey: ["directory"] }); toast.success("Privacidade atualizada.");
  };
  const askPush = async (on: boolean) => {
    if (!on) return void setS({ notify_push: false });
    if (typeof Notification === "undefined") return void toast.error("Seu navegador não suporta notificações.");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return void toast.error("Permissão negada no navegador. Libere nas configurações do site.");
    setS({ notify_push: true });
  };
  const test = () => {
    if (s.notify_inapp) toast("🔔 Teste de alerta", { description: "Assim chegam seus avisos." });
    if (s.notify_sound) playChime();
    if (s.notify_push && !showBrowserNotification("Ponte 404", "Teste de notificação do navegador")) toast.error("Permissão do navegador não concedida.");
  };
  const changePw = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const cur = String(f.get("current")); const nw = String(f.get("new")); const cf = String(f.get("confirm"));
    if (nw.length < 8 || !/[0-9]/.test(nw) || !/[a-zA-Z]/.test(nw)) return void toast.error("A nova senha precisa de 8+ caracteres com letras e números.");
    if (nw !== cf) return void toast.error("As senhas não coincidem.");
    setBusy(true);
    const re = await supabase.auth.signInWithPassword({ email: p.email!, password: cur });
    if (re.error) { setBusy(false); return void toast.error("Senha atual incorreta."); }
    const { error } = await supabase.auth.updateUser({ password: nw, current_password: cur } as never);
    setBusy(false);
    if (error) return void toast.error("Não foi possível alterar: " + error.message);
    setPwOpen(false); toast.success("Senha alterada!");
  };
  const out = async (scope: "local" | "others") => {
    if (scope === "others") { const { error } = await supabase.auth.signOut({ scope: "others" }); if (error) toast.error(error.message); else toast.success("Outras sessões encerradas."); return; }
    await signOut(qc); navigate({ to: "/", replace: true });
  };
  const removeAccount = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const confirm = String(new FormData(e.currentTarget).get("confirm"));
    if (confirm !== "EXCLUIR") return void toast.error('Digite EXCLUIR para confirmar.');
    setBusy(true);
    try { await del({ data: { confirm } }); await signOut(qc); toast.success("Conta excluída."); navigate({ to: "/", replace: true }); }
    catch { toast.error("Não foi possível excluir a conta agora."); } finally { setBusy(false); }
  };
  const Section = ({ title, icon: Icon, children }: { title: string; icon: typeof Bell; children: ReactNode }) => <Card><CardContent className="grid gap-3 p-5"><h2 className="flex items-center gap-2 font-display text-lg font-black"><Icon className="size-5 text-primary" aria-hidden /> {title}</h2>{children}</CardContent></Card>;
  return <AppShell><div className="page-enter">
    <Title title="Configurações" text="Tudo aqui é salvo na sua conta e vale em todas as telas e aparelhos." />
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Aparência" icon={Sun}>
        <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2">{([["light", "Claro", Sun], ["dark", "Escuro", Moon], ["system", "Sistema", Monitor]] as const).map(([v, l, I]) => <button key={v} role="radio" aria-checked={s.theme === v} onClick={() => setS({ theme: v })} className={`flex h-14 flex-col items-center justify-center rounded-xl border text-sm font-bold ${s.theme === v ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}><I className="size-4" aria-hidden />{l}</button>)}</div>
        <Toggle label="Alto contraste" checked={s.high_contrast} onChange={v => setS({ high_contrast: v })} />
        <Toggle label="Reduzir animações" checked={s.reduce_motion} onChange={v => setS({ reduce_motion: v })} hint="Também respeitamos a preferência do seu sistema." />
        <label className="grid gap-2 rounded-xl border bg-background px-4 py-3 text-sm font-bold">Tamanho do texto: {s.text_scale}%<input type="range" min={90} max={130} step={10} value={s.text_scale} onChange={e => setS({ text_scale: Number(e.target.value) })} className="accent-primary" /></label>
      </Section>
      <Section title="Notificações e lembretes" icon={Bell}>
        <Toggle label="Alertas na tela" checked={s.notify_inapp} onChange={v => setS({ notify_inapp: v })} hint="O histórico continua sendo salvo mesmo desligado." />
        <Toggle label="Notificações do navegador" checked={s.notify_push} onChange={askPush} hint={typeof Notification !== "undefined" && Notification.permission === "denied" ? "Bloqueado no navegador — libere nas configurações do site." : "Avisa quando a aba estiver aberta em segundo plano. Pede permissão."} />
        <Toggle label="Som" checked={s.notify_sound} onChange={v => setS({ notify_sound: v })} />
        <fieldset className="rounded-xl border bg-background px-4 py-3"><legend className="px-1 text-sm font-bold">Categorias que quero receber como alerta</legend><div className="mt-1 flex flex-wrap gap-2">{Object.entries(categoryLabel).map(([k, v]) => { const on = s.categories.includes(k); return <button key={k} aria-pressed={on} onClick={() => setS({ categories: on ? s.categories.filter(c => c !== k) : [...s.categories, k] })} className={`rounded-full border px-3 py-1.5 text-sm font-bold ${on ? "border-primary bg-primary text-primary-foreground" : ""}`}>{on && "✓ "}{v}</button>; })}</div></fieldset>
        <label className="grid gap-2 rounded-xl border bg-background px-4 py-3 text-sm font-bold">Lembrete antes da aula<select value={s.reminder_minutes} onChange={e => setS({ reminder_minutes: Number(e.target.value) })} className="h-10 rounded-md border bg-card px-2"><option value={15}>15 minutos</option><option value={30}>30 minutos</option><option value={60}>1 hora</option></select></label>
        <p className="text-xs text-muted-foreground">E-mail: ainda não há serviço de envio configurado, por isso essa opção não aparece.</p>
        <Button variant="outline" onClick={test}><BellRing /> Testar alertas</Button>
      </Section>
      <Section title="Privacidade" icon={Lock}>
        <Toggle label="Perfil público" checked={p.public_profile} onChange={v => setP({ public_profile: v })} hint="Desligado: você não aparece na busca para outros usuários." />
        <Toggle label="Mostrar meu e-mail" checked={p.show_email} onChange={v => setP({ show_email: v })} hint="Desligado: o e-mail nunca é enviado a outros usuários." />
        <p className="text-xs text-muted-foreground">Sempre visíveis no perfil público: nome, @usuario, foto, capa, bio, cidade, disciplinas e links. Sempre privados: e-mail (salvo se ativado), configurações e notificações.</p>
      </Section>
      <Section title="Conta e segurança" icon={ShieldCheck}>
        <div className="rounded-xl border bg-background px-4 py-3 text-sm"><b>{p.email}</b><br /><span className="text-muted-foreground">Conta criada em {new Date(p.created_at).toLocaleDateString("pt-BR")} · última atividade {p.last_seen_at ? new Date(p.last_seen_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</span></div>
        <Button variant="outline" onClick={() => setPwOpen(true)}><Lock /> Alterar senha</Button>
        <Button variant="outline" onClick={() => out("others")}><Users /> Encerrar outras sessões</Button>
        <Button variant="outline" onClick={() => out("local")}><LogOut /> Sair desta conta</Button>
        <Button variant="destructive" onClick={() => setDelOpen(true)}><Trash2 /> Excluir minha conta</Button>
      </Section>
      <Section title="Sobre" icon={Settings}>
        <p className="text-sm text-muted-foreground">Ponte 404 · versão 1.0 · idioma Português (Brasil) · horários em Brasília (UTC−3).</p>
        <p className="text-sm text-muted-foreground">Ajuda: use a navegação por teclado (Tab) — todos os botões têm foco visível e rótulos para leitores de tela.</p>
      </Section>
    </div>
    <Dialog open={pwOpen} onOpenChange={setPwOpen}><DialogContent><DialogHeader><DialogTitle>Alterar senha</DialogTitle><DialogDescription>Confirme sua senha atual para continuar.</DialogDescription></DialogHeader>
      <form onSubmit={changePw} className="grid gap-3"><Field label="Senha atual"><Input name="current" type="password" required autoComplete="current-password" /></Field><Field label="Nova senha" hint="8+ caracteres com letras e números"><Input name="new" type="password" required minLength={8} autoComplete="new-password" /></Field><Field label="Confirmar nova senha"><Input name="confirm" type="password" required autoComplete="new-password" /></Field><Button disabled={busy}>{busy ? "Alterando…" : "Alterar senha"}</Button></form>
    </DialogContent></Dialog>
    <Dialog open={delOpen} onOpenChange={setDelOpen}><DialogContent><DialogHeader><DialogTitle>Excluir conta?</DialogTitle><DialogDescription>Seu perfil, fotos, notificações e configurações serão apagados e suas aulas futuras canceladas. Não dá para desfazer.</DialogDescription></DialogHeader>
      <form onSubmit={removeAccount} className="grid gap-3"><Field label='Digite EXCLUIR para confirmar'><Input name="confirm" required autoComplete="off" /></Field><Button variant="destructive" disabled={busy}>{busy ? "Excluindo…" : "Excluir definitivamente"}</Button></form>
    </DialogContent></Dialog>
  </div></AppShell>;
}

/* ---------------- search (real instructors) ---------------- */
export function SearchPage() {
  const me = useMe(); const dir = useDirectory();
  const search = useSearch({ strict: false }) as { q?: string };
  const [q, setQ] = useState(search.q ?? ""); const [type, setType] = useState("todos");
  const [req, setReq] = useState<PublicProfile | null>(null); const [view, setView] = useState<PublicProfile | null>(null);
  const list = (dir.data ?? []).filter(p => (p.role === "professor" || p.role === "voluntario") && p.approval_status === "aprovado" && p.id !== me.data?.profile.id)
    .filter(p => type === "todos" || p.role === type)
    .filter(p => !q || [p.display_name, p.username, ...(p.subjects ?? [])].join(" ").toLowerCase().includes(q.toLowerCase()));
  const canRequest = me.data?.role === "Aluno" || me.data?.role === "Voluntário";
  return <AppShell><div className="page-enter">
    <Title title="Buscar instrutores" text="Professores e voluntários aprovados na plataforma." />
    <div className="mb-6 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar" value={q} onChange={e => setQ(e.target.value)} className="h-12 pl-11" placeholder="Nome ou disciplina" maxLength={80} /></div>
      <select aria-label="Tipo de instrutor" value={type} onChange={e => setType(e.target.value)} className="h-12 rounded-md border bg-card px-3 font-bold"><option value="todos">Todos</option><option value="professor">Professores</option><option value="voluntario">Voluntários</option></select></div>
    {dir.isLoading ? <Loading /> : list.length === 0 ? <Empty icon={Search} title="Nenhum instrutor encontrado" text="Tente outra disciplina ou limpe os filtros." action={<Button variant="outline" onClick={() => { setQ(""); setType("todos"); }}>Limpar filtros</Button>} /> :
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{list.map(p => <Card key={p.id} className="lift-card"><CardContent className="p-5">
        <div className="flex items-center gap-3"><UserAvatar name={p.display_name} path={p.avatar_url} className="size-14" /><div className="min-w-0"><b className="block truncate">{p.display_name}</b><span className="text-sm text-muted-foreground">{p.username ? `@${p.username}` : roleLabel[p.role!]}</span></div></div>
        <div className="mt-3">{p.role === "professor" ? <Badge className="gap-1 bg-success text-success-foreground"><CheckCircle2 className="size-3" /> Certificado validado</Badge> : <Badge className="gap-1 bg-coral text-coral-foreground"><ShieldCheck className="size-3" /> Escolaridade validada</Badge>}</div>
        {p.subjects?.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{p.subjects.map(s => <Badge key={s} variant="secondary">{s}</Badge>)}</div>}
        <div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setView(p)}>Ver perfil</Button>{canRequest && p.role === "professor" && <Button className="flex-1" onClick={() => setReq(p)}>Solicitar aula</Button>}</div>
      </CardContent></Card>)}</div>}
    {req && <LessonForm open onOpenChange={v => !v && setReq(null)} mode="request" teacherId={req.id} />}
    <Dialog open={!!view} onOpenChange={v => !v && setView(null)}><DialogContent>{view && <><DialogHeader><DialogTitle>{view.display_name}</DialogTitle><DialogDescription>{view.username ? `@${view.username} · ` : ""}{roleLabel[view.role!]}{view.city ? ` · ${view.city}` : ""}</DialogDescription></DialogHeader>
      <p className="text-sm">{view.bio || "Sem biografia."}</p>{view.email && <p className="text-sm"><b>E-mail:</b> {view.email}</p>}</>}</DialogContent></Dialog>
  </div></AppShell>;
}

/* ---------------- admin users ---------------- */
type AdminRow = Profile & { roles: string[] };
export function UsersPage() {
  const me = useMe(); const qc = useQueryClient();
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [status, setStatus] = useState("todos"); const [type, setType] = useState("todos"); const [q, setQ] = useState("");
  const [doc, setDoc] = useState<AdminRow | null>(null); const [reason, setReason] = useState("");
  const isAdmin = me.data?.role === "Admin";
  const load = async () => {
    const [p, r] = await Promise.all([supabase.from("profiles").select("*").order("created_at", { ascending: false }), supabase.from("user_roles").select("user_id, role")]);
    if (p.error) return void toast.error(p.error.message);
    setRows(p.data.map(x => ({ ...x, roles: (r.data ?? []).filter(y => y.user_id === x.id).map(y => y.role) })));
  };
  if (isAdmin && rows === null) void load();
  if (!me.data) return <AppShell><Loading /></AppShell>;
  if (!isAdmin) return <AppShell><Empty icon={Lock} title="Acesso restrito" text="Somente administradores podem gerenciar usuários." /></AppShell>;
  const update = async (id: string, patch: Partial<Profile>, msg: string) => {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) return void toast.error(error.message);
    toast.success(msg); setDoc(null); setReason(""); load(); qc.invalidateQueries({ queryKey: ["directory"] });
  };
  const list = (rows ?? []).filter(r => (status === "todos" || (status === "suspenso" ? r.suspended : r.approval_status === status && !r.suspended)) && (type === "todos" || r.roles.includes(type)) && (!q || `${r.display_name} ${r.email}`.toLowerCase().includes(q.toLowerCase())));
  return <AppShell><div className="page-enter">
    <Title title="Gerenciar usuários" text="Aprove documentos, suspenda ou reative contas." />
    <div className="mb-5 flex flex-col gap-3 sm:flex-row"><Input aria-label="Buscar usuário" value={q} onChange={e => setQ(e.target.value)} placeholder="Nome ou e-mail" className="h-11" maxLength={80} />
      <select aria-label="Tipo" value={type} onChange={e => setType(e.target.value)} className="h-11 rounded-md border bg-card px-3 font-bold"><option value="todos">Todos os tipos</option><option value="aluno">Alunos</option><option value="professor">Professores</option><option value="voluntario">Voluntários</option><option value="admin">Admins</option></select>
      <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value)} className="h-11 rounded-md border bg-card px-3 font-bold"><option value="todos">Todos os status</option><option value="pendente">Pendentes</option><option value="aprovado">Aprovados</option><option value="reprovado">Reprovados</option><option value="suspenso">Suspensos</option></select></div>
    {rows === null ? <Loading /> : list.length === 0 ? <Empty icon={Users} title="Nenhum usuário" text="Ajuste os filtros." /> :
      <div className="grid gap-3">{list.map(r => <Card key={r.id}><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <UserAvatar name={r.display_name} path={r.avatar_url} />
        <div className="min-w-0 flex-1"><b className="block truncate">{r.display_name}</b><span className="text-sm text-muted-foreground">{r.email} · {r.roles.map(x => roleLabel[x as keyof typeof roleLabel]).join(", ")}</span></div>
        <Badge className={r.suspended ? "bg-destructive text-destructive-foreground" : r.approval_status === "aprovado" ? "bg-success text-success-foreground" : r.approval_status === "pendente" ? "bg-warning text-warning-foreground" : "bg-destructive text-destructive-foreground"}>{r.suspended ? "Suspenso" : r.approval_status}</Badge>
        <div className="flex flex-wrap gap-2">
          {(r.roles.includes("professor") || r.roles.includes("voluntario")) && <Button size="sm" variant="outline" onClick={() => setDoc(r)}><Eye /> Documento</Button>}
          {r.id !== me.data!.profile.id && <Button size="sm" variant="outline" onClick={() => update(r.id, { suspended: !r.suspended }, r.suspended ? "Conta reativada." : "Conta suspensa.")}><Ban /> {r.suspended ? "Reativar" : "Suspender"}</Button>}
        </div>
      </CardContent></Card>)}</div>}
    <Dialog open={!!doc} onOpenChange={v => !v && setDoc(null)}><DialogContent>{doc && <><DialogHeader><DialogTitle>Validar {doc.display_name}</DialogTitle><DialogDescription>Documento informado no cadastro: {doc.document_name ?? "não enviado"}.</DialogDescription></DialogHeader>
      <Field label="Motivo (obrigatório para reprovar)"><Input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="Ex.: documento ilegível" /></Field>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { if (!reason.trim()) return void toast.error("Informe o motivo."); update(doc.id, { approval_status: "reprovado", rejection_reason: reason.trim() }, "Cadastro reprovado. Usuário notificado."); }}><XCircle /> Reprovar</Button>
        <Button onClick={() => update(doc.id, { approval_status: "aprovado", rejection_reason: null }, "Cadastro aprovado. Usuário notificado.")}><Check /> Aprovar</Button></div></>}</DialogContent></Dialog>
  </div></AppShell>;
}
