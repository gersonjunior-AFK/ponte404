<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate redirects to `/`); why: session lives in browser storage.
- Session, current user, notifications and lessons hooks live in `src/lib/ponte-session.tsx`; real pages in `src/components/ponte-real.tsx`, shared layout in `ponte-shell.tsx`; why: one data layer for every screen.
- Notifications are created only by database triggers/functions (`notify`, lesson/profile triggers, `generate_lesson_reminders` run by a 5-min cron) with a unique dedupe key; why: they reflect saved data and never duplicate.
- Roles live in `user_roles` and are checked with `has_role`; never trust client-chosen roles; why: prevents privilege escalation.
- Profile images go to the private `profile-media` bucket under `<user_id>/` and are shown via signed URLs; why: public buckets are blocked in this workspace.
