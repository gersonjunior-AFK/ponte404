import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { confirm: string }) => {
    if (input?.confirm !== "EXCLUIR") throw new Error("Confirmação inválida");
    return input;
  })
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    await supabaseAdmin.from("notifications").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_settings").delete().eq("user_id", uid);
    await supabaseAdmin.from("lessons").update({ status: "cancelada" }).or(`teacher_id.eq.${uid},student_id.eq.${uid}`).in("status", ["solicitada", "agendada", "confirmada"]);
    const { data: files } = await supabaseAdmin.storage.from("profile-media").list(uid);
    if (files?.length) await supabaseAdmin.storage.from("profile-media").remove(files.map(f => `${uid}/${f.name}`));
    const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (error) throw new Error("Não foi possível excluir a conta agora.");
    return { ok: true };
  });
