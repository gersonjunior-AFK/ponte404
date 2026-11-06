CREATE TYPE public.app_role AS ENUM ('admin','professor','voluntario','aluno');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "own roles or admin" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text NOT NULL DEFAULT '',
  username text UNIQUE,
  bio text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  avatar_url text,
  banner_url text,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  subjects text[] NOT NULL DEFAULT '{}',
  grade text,
  document_name text,
  approval_status text NOT NULL DEFAULT 'aprovado',
  rejection_reason text,
  suspended boolean NOT NULL DEFAULT false,
  public_profile boolean NOT NULL DEFAULT true,
  show_email boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT username_format CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,30}$'),
  CONSTRAINT approval_values CHECK (approval_status IN ('pendente','aprovado','reprovado'))
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile or admin read" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "admin profile update" ON public.profiles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') AND auth.uid() IS NOT NULL THEN
    NEW.approval_status := OLD.approval_status;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.suspended := OLD.suspended;
    NEW.email := OLD.email;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_protect BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

CREATE OR REPLACE FUNCTION public.public_profiles()
RETURNS TABLE (id uuid, display_name text, username text, bio text, city text, avatar_url text, banner_url text, links jsonb, subjects text[], role public.app_role, email text, approval_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.display_name, p.username, p.bio, p.city, p.avatar_url, p.banner_url, p.links, p.subjects,
    (SELECT r.role FROM public.user_roles r WHERE r.user_id = p.id AND r.role <> 'admin' ORDER BY r.role LIMIT 1),
    CASE WHEN p.show_email THEN p.email ELSE NULL END,
    p.approval_status
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND (p.public_profile OR p.id = auth.uid()) AND NOT p.suspended
$$;
REVOKE EXECUTE ON FUNCTION public.public_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.public_profiles() TO authenticated;

CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY,
  theme text NOT NULL DEFAULT 'system',
  high_contrast boolean NOT NULL DEFAULT false,
  text_scale int NOT NULL DEFAULT 100,
  reduce_motion boolean NOT NULL DEFAULT false,
  notify_inapp boolean NOT NULL DEFAULT true,
  notify_push boolean NOT NULL DEFAULT false,
  notify_sound boolean NOT NULL DEFAULT false,
  categories text[] NOT NULL DEFAULT ARRAY['aula','lembrete','solicitacao','admin','sistema'],
  reminder_minutes int NOT NULL DEFAULT 30,
  date_format text NOT NULL DEFAULT 'dd/MM/yyyy',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminder_values CHECK (reminder_minutes IN (15,30,60)),
  CONSTRAINT theme_values CHECK (theme IN ('light','dark','system')),
  CONSTRAINT scale_values CHECK (text_scale BETWEEN 90 AND 130)
);
GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.user_settings FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subject text NOT NULL,
  starts_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 60,
  location text NOT NULL DEFAULT 'Sala online',
  teacher_id uuid NOT NULL,
  student_id uuid,
  created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'agendada',
  topics text[] NOT NULL DEFAULT '{}',
  seats int NOT NULL DEFAULT 1,
  rating int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT status_values CHECK (status IN ('solicitada','agendada','confirmada','cancelada','concluida')),
  CONSTRAINT rating_values CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  CONSTRAINT title_len CHECK (char_length(title) BETWEEN 3 AND 120)
);
GRANT SELECT, INSERT, UPDATE ON public.lessons TO authenticated;
GRANT ALL ON public.lessons TO service_role;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read lessons" ON public.lessons FOR SELECT TO authenticated
USING (teacher_id = auth.uid() OR student_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "create lesson by role" ON public.lessons FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND (
  (teacher_id = auth.uid() AND public.has_role(auth.uid(),'professor') AND status = 'agendada')
  OR (student_id = auth.uid() AND teacher_id <> auth.uid() AND status = 'solicitada'
      AND (public.has_role(auth.uid(),'aluno') OR public.has_role(auth.uid(),'voluntario')))
));
CREATE POLICY "participants update lessons" ON public.lessons FOR UPDATE TO authenticated
USING (teacher_id = auth.uid() OR student_id = auth.uid())
WITH CHECK (teacher_id = auth.uid() OR student_id = auth.uid());

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  lesson_id uuid,
  dedupe_key text UNIQUE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own notifications update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own notifications delete" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

CREATE OR REPLACE FUNCTION public.notify(_user uuid, _cat text, _title text, _body text, _link text, _lesson uuid, _key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, category, title, body, link, lesson_id, dedupe_key)
  VALUES (_user, _cat, _title, _body, _link, _lesson, _key)
  ON CONFLICT (dedupe_key) DO NOTHING;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify(uuid,text,text,text,text,uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lesson_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_teacher boolean := (auth.uid() = OLD.teacher_id);
BEGIN
  IF auth.uid() IS NULL THEN NEW.updated_at := now(); RETURN NEW; END IF;
  NEW.teacher_id := OLD.teacher_id; NEW.student_id := OLD.student_id; NEW.created_by := OLD.created_by;
  IF NOT is_teacher THEN
    NEW.title := OLD.title; NEW.subject := OLD.subject; NEW.starts_at := OLD.starts_at;
    NEW.location := OLD.location; NEW.topics := OLD.topics; NEW.seats := OLD.seats; NEW.duration_minutes := OLD.duration_minutes;
    IF NEW.status <> OLD.status AND NEW.status <> 'cancelada' THEN RAISE EXCEPTION 'Ação não permitida'; END IF;
    IF NEW.rating IS DISTINCT FROM OLD.rating AND OLD.status <> 'concluida' THEN RAISE EXCEPTION 'Só é possível avaliar aulas concluídas'; END IF;
  ELSE
    NEW.rating := OLD.rating;
  END IF;
  IF OLD.status IN ('cancelada','concluida') AND NEW.status <> OLD.status THEN RAISE EXCEPTION 'Aula já encerrada'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER lessons_guard BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.lesson_guard();

CREATE OR REPLACE FUNCTION public.lesson_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE whenTxt text := to_char(NEW.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
DECLARE ver text := extract(epoch from now())::text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'solicitada' THEN
      PERFORM public.notify(NEW.teacher_id,'solicitacao','Nova solicitação de aula', NEW.title || ' — ' || whenTxt, '/aulas', NEW.id, 'req:'||NEW.id);
      PERFORM public.notify(NEW.student_id,'aula','Solicitação enviada', 'Aguardando confirmação: ' || NEW.title, '/aulas', NEW.id, 'reqsent:'||NEW.id);
    ELSE
      PERFORM public.notify(NEW.teacher_id,'aula','Aula agendada', NEW.title || ' — ' || whenTxt, '/aulas', NEW.id, 'new:'||NEW.id);
      PERFORM public.notify(NEW.student_id,'aula','Aula agendada para você', NEW.title || ' — ' || whenTxt, '/aulas', NEW.id, 'newst:'||NEW.id);
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'confirmada' THEN
      PERFORM public.notify(NEW.student_id,'aula','Aula confirmada', NEW.title || ' — ' || whenTxt, '/aulas', NEW.id, 'conf:'||NEW.id);
    ELSIF NEW.status = 'cancelada' THEN
      PERFORM public.notify(NEW.student_id,'aula','Aula cancelada', NEW.title || ' (' || whenTxt || ')', '/aulas', NEW.id, 'canc:'||NEW.id||':s');
      PERFORM public.notify(NEW.teacher_id,'aula','Aula cancelada', NEW.title || ' (' || whenTxt || ')', '/aulas', NEW.id, 'canc:'||NEW.id||':t');
    ELSIF NEW.status = 'concluida' THEN
      PERFORM public.notify(NEW.student_id,'aula','Aula concluída — avalie!', NEW.title, '/aulas', NEW.id, 'done:'||NEW.id);
    END IF;
  ELSIF NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.location IS DISTINCT FROM OLD.location OR NEW.title IS DISTINCT FROM OLD.title THEN
    PERFORM public.notify(NEW.student_id,'aula','Aula alterada', NEW.title || ' agora em ' || whenTxt || ' · ' || NEW.location, '/aulas', NEW.id, 'chg:'||NEW.id||':'||ver||':s');
    PERFORM public.notify(NEW.teacher_id,'aula','Aula alterada', NEW.title || ' agora em ' || whenTxt || ' · ' || NEW.location, '/aulas', NEW.id, 'chg:'||NEW.id||':'||ver||':t');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lessons_events AFTER INSERT OR UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.lesson_events();

CREATE OR REPLACE FUNCTION public.generate_lesson_reminders()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; r record;
BEGIN
  FOR r IN
    SELECT l.id, l.title, l.starts_at, u.uid, coalesce(s.reminder_minutes,30) AS mins
    FROM public.lessons l
    CROSS JOIN LATERAL (VALUES (l.teacher_id),(l.student_id)) AS u(uid)
    LEFT JOIN public.user_settings s ON s.user_id = u.uid
    WHERE u.uid IS NOT NULL AND l.status IN ('agendada','confirmada')
      AND l.starts_at > now()
      AND l.starts_at <= now() + make_interval(mins => coalesce(s.reminder_minutes,30))
  LOOP
    PERFORM public.notify(r.uid,'lembrete','Sua aula começa em breve',
      r.title || ' às ' || to_char(r.starts_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI'),
      '/aulas', r.id, 'rem:'||r.id||':'||r.uid||':'||r.mins||':'||extract(epoch from r.starts_at)::bigint);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.generate_lesson_reminders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_lesson_reminders() TO authenticated;

CREATE OR REPLACE FUNCTION public.profile_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NEW.approval_status = 'aprovado' THEN
      PERFORM public.notify(NEW.id,'admin','Cadastro aprovado 🎉','Seu documento foi validado. Seu selo já aparece no perfil.','/perfil',NULL,'appr:'||NEW.id||':'||extract(epoch from now())::text);
    ELSIF NEW.approval_status = 'reprovado' THEN
      PERFORM public.notify(NEW.id,'admin','Cadastro reprovado','Motivo: '||coalesce(NEW.rejection_reason,'não informado'),'/perfil',NULL,'rej:'||NEW.id||':'||extract(epoch from now())::text);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_events AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profile_events();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  req text := coalesce(NEW.raw_user_meta_data->>'role','aluno');
  r public.app_role;
  a record;
BEGIN
  r := CASE WHEN req IN ('professor','voluntario') THEN req::public.app_role ELSE 'aluno'::public.app_role END;
  INSERT INTO public.profiles (id, email, display_name, grade, document_name, subjects, approval_status)
  VALUES (NEW.id, lower(NEW.email),
    left(coalesce(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),60),
    NEW.raw_user_meta_data->>'grade', NEW.raw_user_meta_data->>'document_name',
    CASE WHEN jsonb_typeof(NEW.raw_user_meta_data->'subjects') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'subjects')) ELSE '{}'::text[] END,
    CASE WHEN r IN ('professor','voluntario') THEN 'pendente' ELSE 'aprovado' END);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, r);
  IF lower(NEW.email) = 'gerson@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id);
  PERFORM public.notify(NEW.id,'sistema','Boas-vindas à Ponte 404!','Complete seu perfil e comece sua jornada.','/perfil',NULL,'welcome:'||NEW.id);
  IF r IN ('professor','voluntario') THEN
    FOR a IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      PERFORM public.notify(a.user_id,'admin','Novo cadastro para aprovar', coalesce(NEW.raw_user_meta_data->>'display_name',NEW.email) || ' (' || r::text || ')','/usuarios',NULL,'pend:'||NEW.id||':'||a.user_id);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "profile media read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'profile-media');
CREATE POLICY "profile media insert own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "profile media update own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "profile media delete own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text);
