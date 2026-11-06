import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Redefinir senha — Ponte 404" },
    { name: "description", content: "Crie uma nova senha para sua conta na Ponte 404." },
    { property: "og:title", content: "Redefinir senha — Ponte 404" },
    { property: "og:description", content: "Crie uma nova senha para sua conta." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pw = String(f.get("pw")); const cf = String(f.get("cf"));
    if (pw.length < 8 || !/[0-9]/.test(pw) || !/[a-zA-Z]/.test(pw)) { toast.error("8+ caracteres com letras e números."); return; }
    if (pw !== cf) { toast.error("As senhas não coincidem."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error("Link inválido ou expirado. Peça um novo."); return; }
    toast.success("Senha redefinida!");
    navigate({ to: "/dashboard" });
  };
  return <main className="grid min-h-dvh place-items-center bg-background p-5">
    <form onSubmit={submit} className="grid w-full max-w-sm gap-4 rounded-2xl border bg-card p-6">
      <h1 className="font-display text-2xl font-black">Nova senha</h1>
      <label className="grid gap-2 text-sm font-bold">Nova senha<Input name="pw" type="password" autoComplete="new-password" required minLength={8} /></label>
      <label className="grid gap-2 text-sm font-bold">Confirmar<Input name="cf" type="password" autoComplete="new-password" required /></label>
      <Button disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</Button>
    </form>
  </main>;
}
