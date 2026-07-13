-- =============================================================================
-- VIDA+ — Usuários de teste por papel
-- Execute no SQL Editor do Supabase
-- =============================================================================
-- CREDENCIAIS:
--   administrador  admin@vidaplus.com       / Admin@vida2024
--   moderador      moderador@vidaplus.com   / Moder@vida2024
--   voluntario     voluntario@vidaplus.com  / Volun@vida2024
--   cadastrado     usuario@vidaplus.com     / User@vida2024
-- =============================================================================

-- ─── ADMINISTRADOR ────────────────────────────────────────────────────────────
DO $$
DECLARE
  uid UUID;
BEGIN
  -- Verifica se já existe
  SELECT id INTO uid FROM auth.users WHERE email = 'admin@vidaplus.com';

  IF uid IS NULL THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role,
      email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_user_meta_data, raw_app_meta_data,
      is_super_admin, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'admin@vidaplus.com',
      crypt('Admin@vida2024', gen_salt('bf')),
      now(), now(), now(),
      '{"display_name": "Administrador"}'::jsonb,
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      false, '', '', '', ''
    );
  END IF;

  INSERT INTO public.users (id, display_name, role, status)
  VALUES (uid, 'Administrador', 'administrador'::public.user_role, 'ativo')
  ON CONFLICT (id) DO UPDATE
    SET role = 'administrador'::public.user_role,
        display_name = 'Administrador';

  INSERT INTO public.user_profiles (user_id, nickname)
  VALUES (uid, 'Admin')
  ON CONFLICT (user_id) DO NOTHING;
END $$;

-- ─── MODERADOR ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  uid UUID;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'moderador@vidaplus.com';

  IF uid IS NULL THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role,
      email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_user_meta_data, raw_app_meta_data,
      is_super_admin, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'moderador@vidaplus.com',
      crypt('Moder@vida2024', gen_salt('bf')),
      now(), now(), now(),
      '{"display_name": "Moderador"}'::jsonb,
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      false, '', '', '', ''
    );
  END IF;

  INSERT INTO public.users (id, display_name, role, status)
  VALUES (uid, 'Moderador', 'moderador'::public.user_role, 'ativo')
  ON CONFLICT (id) DO UPDATE
    SET role = 'moderador'::public.user_role,
        display_name = 'Moderador';

  INSERT INTO public.user_profiles (user_id, nickname)
  VALUES (uid, 'Moderador')
  ON CONFLICT (user_id) DO NOTHING;
END $$;

-- ─── VOLUNTÁRIO ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  uid UUID;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'voluntario@vidaplus.com';

  IF uid IS NULL THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role,
      email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_user_meta_data, raw_app_meta_data,
      is_super_admin, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'voluntario@vidaplus.com',
      crypt('Volun@vida2024', gen_salt('bf')),
      now(), now(), now(),
      '{"display_name": "Voluntario Teste"}'::jsonb,
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      false, '', '', '', ''
    );
  END IF;

  INSERT INTO public.users (id, display_name, role, status)
  VALUES (uid, 'Voluntario Teste', 'voluntario'::public.user_role, 'ativo')
  ON CONFLICT (id) DO UPDATE
    SET role = 'voluntario'::public.user_role,
        display_name = 'Voluntario Teste';

  INSERT INTO public.user_profiles (user_id, nickname)
  VALUES (uid, 'Voluntario')
  ON CONFLICT (user_id) DO NOTHING;

  -- Perfil de voluntário aprovado e pronto para atender
  INSERT INTO public.volunteer_profiles (
    user_id, availability_status, training_status, risk_level_allowed, total_chats
  )
  VALUES (uid, 'offline', 'concluido', 'baixo', 0)
  ON CONFLICT (user_id) DO NOTHING;
END $$;

-- ─── USUÁRIO CADASTRADO ───────────────────────────────────────────────────────
DO $$
DECLARE
  uid UUID;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'usuario@vidaplus.com';

  IF uid IS NULL THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role,
      email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_user_meta_data, raw_app_meta_data,
      is_super_admin, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'usuario@vidaplus.com',
      crypt('User@vida2024', gen_salt('bf')),
      now(), now(), now(),
      '{"display_name": "Usuario Teste"}'::jsonb,
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      false, '', '', '', ''
    );
  END IF;

  INSERT INTO public.users (id, display_name, role, status)
  VALUES (uid, 'Usuario Teste', 'cadastrado'::public.user_role, 'ativo')
  ON CONFLICT (id) DO UPDATE
    SET role = 'cadastrado'::public.user_role,
        display_name = 'Usuario Teste';

  INSERT INTO public.user_profiles (user_id, nickname)
  VALUES (uid, 'Usuario')
  ON CONFLICT (user_id) DO NOTHING;
END $$;
