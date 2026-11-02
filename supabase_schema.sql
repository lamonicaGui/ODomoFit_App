-- ============================================================================
-- 🏛️ O DOMO FIT — ARQUITETURA COMPLETA DE BANCO DE DADOS (PostgreSQL 15+ / Supabase)
-- Sistemas: Sistema_Usuarios (App Atleta) & Sistema_Profissionais (Portal Coach/Clinic)
-- Recursos: RLS Completo, LGPD (Saúde Sensível), Triggers Auth, Storage & Stripe
-- ============================================================================

-- 0. EXTENSÕES DO POSTGRESQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TIPOS CUSTOMIZADOS E ENUMS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('student', 'trainer', 'nutritionist', 'nutrologist', 'admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE professional_council AS ENUM ('CREF', 'CRN', 'CRM');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE student_professional_status AS ENUM ('active', 'pending', 'paused', 'terminated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE muscle_group AS ENUM (
        'chest', 'back', 'shoulders', 'biceps', 'triceps', 
        'quadriceps', 'hamstrings', 'glutes', 'calves', 'core', 'cardio', 'full_body'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE evolution_photo_type AS ENUM ('front', 'back', 'side_left', 'side_right');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE post_visibility AS ENUM ('public', 'followers_only', 'private');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE stripe_account_status AS ENUM ('not_created', 'pending_verification', 'active', 'restricted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE transaction_status AS ENUM ('succeeded', 'pending', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 2. TABELAS CENTRAIS DE USUÁRIOS E PROFISSIONAIS
-- ============================================================================

-- 2.1 Perfis de Usuários (conectado ao auth.users do Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'student',
    full_name VARCHAR(150) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    phone VARCHAR(30),
    birth_date DATE,
    is_minor BOOLEAN DEFAULT FALSE,
    parental_consent_verified BOOLEAN DEFAULT FALSE,
    lgpd_terms_accepted_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 Perfil Complementar dos Profissionais (Personal, Nutri, Nutrólogo)
CREATE TABLE IF NOT EXISTS public.professional_profiles (
    profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    council_type professional_council NOT NULL,
    council_number VARCHAR(40) UNIQUE NOT NULL,
    council_verified BOOLEAN DEFAULT FALSE,
    specialties TEXT[] DEFAULT ARRAY[]::TEXT[],
    monthly_consultancy_fee_cents INTEGER NOT NULL DEFAULT 19900, -- R$ 199,00
    bio TEXT,
    rating_avg NUMERIC(3, 2) DEFAULT 5.00,
    ratings_count INTEGER DEFAULT 0,
    active_students_limit INTEGER DEFAULT 50,
    
    -- Stripe Connect Express
    stripe_account_id VARCHAR(100) UNIQUE,
    stripe_account_status stripe_account_status DEFAULT 'not_created',
    stripe_charges_enabled BOOLEAN DEFAULT FALSE,
    stripe_payouts_enabled BOOLEAN DEFAULT FALSE,
    platform_commission_percent NUMERIC(4, 2) DEFAULT 15.00, -- 15% retido pela plataforma
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.3 Vínculos de Consultoria: Aluno <-> Profissional
CREATE TABLE IF NOT EXISTS public.students_professionals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    professional_id UUID NOT NULL REFERENCES public.professional_profiles(profile_id) ON DELETE CASCADE,
    service_type user_role NOT NULL,
    status student_professional_status NOT NULL DEFAULT 'active',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    monthly_agreed_fee_cents INTEGER NOT NULL DEFAULT 19900,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, professional_id, service_type)
);

-- ============================================================================
-- 3. TREINOS, PERIODIZAÇÃO & SESSÕES DE MUSCULAÇÃO
-- ============================================================================

-- 3.1 Biblioteca de Exercícios Base
CREATE TABLE IF NOT EXISTS public.exercises_library (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL UNIQUE,
    muscle_group muscle_group NOT NULL,
    equipment VARCHAR(80),
    description TEXT,
    demonstration_video_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.2 Programas de Treino (Periodização)
CREATE TABLE IF NOT EXISTS public.workout_programs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    prescribed_by_id UUID REFERENCES public.professional_profiles(profile_id) ON DELETE SET NULL,
    is_autonomous BOOLEAN DEFAULT FALSE,
    title VARCHAR(120) NOT NULL,
    description TEXT,
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.3 Rotinas / Divisões do Programa (Treino A, Treino B, etc.)
CREATE TABLE IF NOT EXISTS public.workout_routines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    program_id UUID NOT NULL REFERENCES public.workout_programs(id) ON DELETE CASCADE,
    division_letter VARCHAR(5) NOT NULL, -- Ex: 'A', 'B', 'C', 'D'
    name VARCHAR(100) NOT NULL, -- Ex: 'A - Peito & Tríceps Hipertrofia'
    target_focus VARCHAR(150),
    order_index INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.4 Exercícios Prescritos na Rotina
CREATE TABLE IF NOT EXISTS public.workout_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    routine_id UUID NOT NULL REFERENCES public.workout_routines(id) ON DELETE CASCADE,
    exercise_name VARCHAR(150) NOT NULL,
    muscle_group muscle_group NOT NULL,
    sets_count INTEGER NOT NULL DEFAULT 4,
    reps_target VARCHAR(50) NOT NULL DEFAULT '8-12',
    target_rpe NUMERIC(3, 1) DEFAULT 8.0,
    rest_seconds INTEGER DEFAULT 90,
    technique_notes TEXT,
    video_url TEXT,
    order_index INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.5 Histórico de Sessões Executadas pelo Aluno
CREATE TABLE IF NOT EXISTS public.workout_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    routine_id UUID REFERENCES public.workout_routines(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    duration_minutes INTEGER,
    total_volume_kg NUMERIC(10, 2) DEFAULT 0,
    prs_count INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.6 Registro de Séries Executadas (Cargas, Repetições, RPE e PR)
CREATE TABLE IF NOT EXISTS public.workout_log_sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    log_id UUID NOT NULL REFERENCES public.workout_logs(id) ON DELETE CASCADE,
    exercise_name VARCHAR(150) NOT NULL,
    set_number INTEGER NOT NULL,
    weight_kg NUMERIC(6, 2) NOT NULL,
    reps_completed INTEGER NOT NULL,
    rpe NUMERIC(3, 1),
    is_pr BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. NUTRIÇÃO (PLANOS ALIMENTARES, REFEIÇÕES E MACROS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nutrition_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    nutritionist_id UUID REFERENCES public.professional_profiles(profile_id) ON DELETE SET NULL,
    title VARCHAR(120) NOT NULL,
    target_calories INTEGER NOT NULL,
    target_protein_g INTEGER NOT NULL,
    target_carbs_g INTEGER NOT NULL,
    target_fat_g INTEGER NOT NULL,
    target_water_ml INTEGER DEFAULT 3000,
    supplements_prescription JSONB DEFAULT '[]'::JSONB,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.meal_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES public.nutrition_plans(id) ON DELETE CASCADE,
    meal_name VARCHAR(100) NOT NULL, -- Ex: 'Café da Manhã', 'Almoço', 'Pós-Treino'
    suggested_time TIME,
    order_index INTEGER DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.meal_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meal_id UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
    food_name VARCHAR(150) NOT NULL,
    portion VARCHAR(80) NOT NULL,
    calories INTEGER DEFAULT 0,
    protein_g NUMERIC(5, 1) DEFAULT 0,
    carbs_g NUMERIC(5, 1) DEFAULT 0,
    fat_g NUMERIC(5, 1) DEFAULT 0,
    order_index INTEGER DEFAULT 1
);

-- ============================================================================
-- 5. REDE SOCIAL FITNESS (FEED, POSTS, CURTIDAS E COMENTÁRIOS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.social_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type VARCHAR(20) DEFAULT 'image',
    caption TEXT,
    is_pr_achievement BOOLEAN DEFAULT FALSE,
    pr_exercise_name VARCHAR(100),
    pr_weight_kg NUMERIC(6, 2),
    visibility post_visibility DEFAULT 'public',
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.post_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.post_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 6. COMUNIDADES, DESAFIOS E CHAT EM TEMPO REAL
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    banner_url TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    target_days INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.challenge_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    checkins_count INTEGER DEFAULT 0,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(challenge_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_a_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    participant_b_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(participant_a_id, participant_b_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    media_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 7. ANAMNESE CLÍNICA, DADOS SENSÍVEIS (LGPD ART. 5º) E FOTOS DE EVOLUÇÃO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.anamnesis_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    professional_id UUID REFERENCES public.professional_profiles(profile_id) ON DELETE SET NULL,
    blood_type VARCHAR(5),
    injuries TEXT[] DEFAULT ARRAY[]::TEXT[],
    medications TEXT[] DEFAULT ARRAY[]::TEXT[],
    allergies TEXT[] DEFAULT ARRAY[]::TEXT[],
    weight_kg NUMERIC(5, 2) NOT NULL,
    height_cm INTEGER NOT NULL,
    body_fat_percent NUMERIC(4, 1),
    confidential_notes TEXT,
    explicit_consent_given BOOLEAN DEFAULT TRUE,
    consent_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.evolution_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    photo_type evolution_photo_type NOT NULL,
    storage_path TEXT NOT NULL,
    taken_at DATE NOT NULL DEFAULT CURRENT_DATE,
    blur_filter_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 8. MARKETPLACE STRIPE CONNECT & REPASSES FINANCEIROS (15% / 85%)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stripe_split_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    professional_id UUID NOT NULL REFERENCES public.professional_profiles(profile_id) ON DELETE RESTRICT,
    stripe_charge_id VARCHAR(100) UNIQUE NOT NULL,
    stripe_transfer_id VARCHAR(100),
    gross_amount_cents INTEGER NOT NULL,
    platform_fee_cents INTEGER NOT NULL, -- 15%
    professional_net_cents INTEGER NOT NULL, -- 85%
    status transaction_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 9. ÍNDICES DE ALTA PERFORMANCE (B-TREE)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

CREATE INDEX IF NOT EXISTS idx_professional_profiles_council ON public.professional_profiles(council_type, council_number);
CREATE INDEX IF NOT EXISTS idx_students_professionals_student ON public.students_professionals(student_id);
CREATE INDEX IF NOT EXISTS idx_students_professionals_pro ON public.students_professionals(professional_id);
CREATE INDEX IF NOT EXISTS idx_students_professionals_status ON public.students_professionals(status);

CREATE INDEX IF NOT EXISTS idx_workout_programs_student ON public.workout_programs(student_id);
CREATE INDEX IF NOT EXISTS idx_workout_programs_prescriber ON public.workout_programs(prescribed_by_id);
CREATE INDEX IF NOT EXISTS idx_workout_routines_program ON public.workout_routines(program_id);
CREATE INDEX IF NOT EXISTS idx_workout_items_routine ON public.workout_items(routine_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_student ON public.workout_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_workout_log_sets_log ON public.workout_log_sets(log_id);

CREATE INDEX IF NOT EXISTS idx_nutrition_plans_student ON public.nutrition_plans(student_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_plan ON public.meal_plans(plan_id);
CREATE INDEX IF NOT EXISTS idx_meal_items_meal ON public.meal_items(meal_id);

CREATE INDEX IF NOT EXISTS idx_social_posts_author ON public.social_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_created_at ON public.social_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON public.post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON public.post_comments(post_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON public.chat_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anamnesis_student ON public.anamnesis_records(student_id);
CREATE INDEX IF NOT EXISTS idx_evolution_photos_student ON public.evolution_photos(student_id);

-- ============================================================================
-- 10. FUNÇÕES E GATILHOS (TRIGGERS) DO SISTEMA
-- ============================================================================

-- 10.1 Atualização Automática de 'updated_at'
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_professional_profiles_updated_at BEFORE UPDATE ON public.professional_profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_workout_programs_updated_at BEFORE UPDATE ON public.workout_programs FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_nutrition_plans_updated_at BEFORE UPDATE ON public.nutrition_plans FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_social_posts_updated_at BEFORE UPDATE ON public.social_posts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 10.2 Criação Automática de Perfil no Signup do Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    raw_role text;
    user_role_val public.user_role;
    user_full_name text;
    user_username text;
    user_avatar text;
BEGIN
    raw_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');
    IF raw_role IN ('student', 'trainer', 'nutritionist', 'nutrologist', 'admin') THEN
        user_role_val := raw_role::public.user_role;
    ELSE
        user_role_val := 'student'::public.user_role;
    END IF;

    user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
    user_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1) || '_' || substr(NEW.id::text, 1, 4));
    user_avatar := COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', null);

    INSERT INTO public.profiles (
        id,
        role,
        full_name,
        username,
        email,
        avatar_url,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        user_role_val,
        user_full_name,
        user_username,
        NEW.email,
        user_avatar,
        NOW(),
        NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
        updated_at = NOW();

    -- Se cadastrado como profissional, inicializa o perfil profissional
    IF user_role_val IN ('trainer', 'nutritionist', 'nutrologist') THEN
        INSERT INTO public.professional_profiles (
            profile_id,
            council_type,
            council_number,
            created_at,
            updated_at
        ) VALUES (
            NEW.id,
            CASE 
                WHEN user_role_val = 'trainer' THEN 'CREF'::professional_council
                WHEN user_role_val = 'nutritionist' THEN 'CRN'::professional_council
                ELSE 'CRM'::professional_council
            END,
            'PENDENTE-' || substr(NEW.id::text, 1, 8),
            NOW(),
            NOW()
        ) ON CONFLICT (profile_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 10.3 Contadores Automáticos de Likes e Comentários
CREATE OR REPLACE FUNCTION public.handle_post_like_counters()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE public.social_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.social_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_likes_count ON public.post_likes;
CREATE TRIGGER trg_post_likes_count
    AFTER INSERT OR DELETE ON public.post_likes
    FOR EACH ROW EXECUTE FUNCTION public.handle_post_like_counters();

CREATE OR REPLACE FUNCTION public.handle_post_comment_counters()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE public.social_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.social_posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_comments_count ON public.post_comments;
CREATE TRIGGER trg_post_comments_count
    AFTER INSERT OR DELETE ON public.post_comments
    FOR EACH ROW EXECUTE FUNCTION public.handle_post_comment_counters();

-- ============================================================================
-- 11. ROW LEVEL SECURITY (RLS) E POLÍTICAS DE ACESSO
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students_professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_log_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamnesis_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_split_transactions ENABLE ROW LEVEL SECURITY;

-- 11.1 Políticas: profiles
DROP POLICY IF EXISTS "Perfis visiveis por usuarios autenticados" ON public.profiles;
CREATE POLICY "Perfis visiveis por usuarios autenticados" 
ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuarios editam proprio perfil" ON public.profiles;
CREATE POLICY "Usuarios editam proprio perfil" 
ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- 11.2 Políticas: professional_profiles
DROP POLICY IF EXISTS "Perfis de profissionais publicos" ON public.professional_profiles;
CREATE POLICY "Perfis de profissionais publicos" 
ON public.professional_profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Profissional edita proprio perfil" ON public.professional_profiles;
CREATE POLICY "Profissional edita proprio perfil" 
ON public.professional_profiles FOR ALL TO authenticated USING (auth.uid() = profile_id);

-- 11.3 Políticas: students_professionals
DROP POLICY IF EXISTS "Aluno ou profissional veem seu vinculo" ON public.students_professionals;
CREATE POLICY "Aluno ou profissional veem seu vinculo" 
ON public.students_professionals FOR SELECT TO authenticated 
USING (auth.uid() = student_id OR auth.uid() = professional_id);

DROP POLICY IF EXISTS "Gerenciamento do vinculo por partes envolvidas" ON public.students_professionals;
CREATE POLICY "Gerenciamento do vinculo por partes envolvidas" 
ON public.students_professionals FOR ALL TO authenticated 
USING (auth.uid() = student_id OR auth.uid() = professional_id);

-- 11.4 Políticas: exercises_library
DROP POLICY IF EXISTS "Biblioteca de exercicios acessivel por todos" ON public.exercises_library;
CREATE POLICY "Biblioteca de exercicios acessivel por todos" 
ON public.exercises_library FOR SELECT TO authenticated USING (true);

-- 11.5 Políticas: workout_programs, routines e items
DROP POLICY IF EXISTS "Aluno e treinador veem programas de treino" ON public.workout_programs;
CREATE POLICY "Aluno e treinador veem programas de treino" 
ON public.workout_programs FOR SELECT TO authenticated 
USING (
    student_id = auth.uid() 
    OR prescribed_by_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.students_professionals sp 
        WHERE sp.student_id = workout_programs.student_id 
        AND sp.professional_id = auth.uid() 
        AND sp.status = 'active'
    )
);

DROP POLICY IF EXISTS "Aluno e treinador gerenciam programas de treino" ON public.workout_programs;
CREATE POLICY "Aluno e treinador gerenciam programas de treino" 
ON public.workout_programs FOR ALL TO authenticated 
USING (
    student_id = auth.uid() 
    OR prescribed_by_id = auth.uid()
);

DROP POLICY IF EXISTS "Acesso a rotinas de treino" ON public.workout_routines;
CREATE POLICY "Acesso a rotinas de treino" 
ON public.workout_routines FOR ALL TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.workout_programs wp 
        WHERE wp.id = workout_routines.program_id 
        AND (wp.student_id = auth.uid() OR wp.prescribed_by_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Acesso a exercicios da rotina" ON public.workout_items;
CREATE POLICY "Acesso a exercicios da rotina" 
ON public.workout_items FOR ALL TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.workout_routines wr
        JOIN public.workout_programs wp ON wp.id = wr.program_id
        WHERE wr.id = workout_items.routine_id 
        AND (wp.student_id = auth.uid() OR wp.prescribed_by_id = auth.uid())
    )
);

-- 11.6 Políticas: workout_logs e workout_log_sets
DROP POLICY IF EXISTS "Logs de treino do aluno" ON public.workout_logs;
CREATE POLICY "Logs de treino do aluno" 
ON public.workout_logs FOR ALL TO authenticated 
USING (
    student_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.students_professionals sp 
        WHERE sp.student_id = workout_logs.student_id 
        AND sp.professional_id = auth.uid() 
        AND sp.status = 'active'
    )
);

DROP POLICY IF EXISTS "Series do log de treino" ON public.workout_log_sets;
CREATE POLICY "Series do log de treino" 
ON public.workout_log_sets FOR ALL TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.workout_logs wl 
        WHERE wl.id = workout_log_sets.log_id 
        AND (
            wl.student_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.students_professionals sp 
                WHERE sp.student_id = wl.student_id 
                AND sp.professional_id = auth.uid() 
                AND sp.status = 'active'
            )
        )
    )
);

-- 11.7 Políticas: nutrition_plans, meal_plans e meal_items
DROP POLICY IF EXISTS "Planos nutricionais do aluno e nutri" ON public.nutrition_plans;
CREATE POLICY "Planos nutricionais do aluno e nutri" 
ON public.nutrition_plans FOR ALL TO authenticated 
USING (
    student_id = auth.uid() 
    OR nutritionist_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.students_professionals sp 
        WHERE sp.student_id = nutrition_plans.student_id 
        AND sp.professional_id = auth.uid() 
        AND sp.status = 'active'
    )
);

DROP POLICY IF EXISTS "Refeicoes do plano nutricional" ON public.meal_plans;
CREATE POLICY "Refeicoes do plano nutricional" 
ON public.meal_plans FOR ALL TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.nutrition_plans np 
        WHERE np.id = meal_plans.plan_id 
        AND (np.student_id = auth.uid() OR np.nutritionist_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Itens de alimentos da refeicao" ON public.meal_items;
CREATE POLICY "Itens de alimentos da refeicao" 
ON public.meal_items FOR ALL TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.meal_plans mp
        JOIN public.nutrition_plans np ON np.id = mp.plan_id
        WHERE mp.id = meal_items.meal_id 
        AND (np.student_id = auth.uid() OR np.nutritionist_id = auth.uid())
    )
);

-- 11.8 Políticas: social_posts, likes e comentários
DROP POLICY IF EXISTS "Posts publicos visiveis a todos" ON public.social_posts;
CREATE POLICY "Posts publicos visiveis a todos" 
ON public.social_posts FOR SELECT TO authenticated 
USING (visibility = 'public' OR author_id = auth.uid());

DROP POLICY IF EXISTS "Autor gerencia seus posts" ON public.social_posts;
CREATE POLICY "Autor gerencia seus posts" 
ON public.social_posts FOR ALL TO authenticated 
USING (author_id = auth.uid());

DROP POLICY IF EXISTS "Likes visiveis por autenticados" ON public.post_likes;
CREATE POLICY "Likes visiveis por autenticados" 
ON public.post_likes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuario curte e descurte posts" ON public.post_likes;
CREATE POLICY "Usuario curte e descurte posts" 
ON public.post_likes FOR ALL TO authenticated 
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Comentarios visiveis por autenticados" ON public.post_comments;
CREATE POLICY "Comentarios visiveis por autenticados" 
ON public.post_comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Autor cria e remove seus comentarios" ON public.post_comments;
CREATE POLICY "Autor cria e remove seus comentarios" 
ON public.post_comments FOR ALL TO authenticated 
USING (author_id = auth.uid());

-- 11.9 Políticas: chat_conversations e chat_messages
DROP POLICY IF EXISTS "Participantes acessam suas conversas" ON public.chat_conversations;
CREATE POLICY "Participantes acessam suas conversas" 
ON public.chat_conversations FOR ALL TO authenticated 
USING (participant_a_id = auth.uid() OR participant_b_id = auth.uid());

DROP POLICY IF EXISTS "Participantes leem e enviam mensagens" ON public.chat_messages;
CREATE POLICY "Participantes leem e enviam mensagens" 
ON public.chat_messages FOR ALL TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.chat_conversations cc 
        WHERE cc.id = chat_messages.conversation_id 
        AND (cc.participant_a_id = auth.uid() OR cc.participant_b_id = auth.uid())
    )
);

-- 11.10 Políticas: Anamnese e Fotos de Evolução (LGPD)
DROP POLICY IF EXISTS "Anamnese privada do aluno e seu profissional" ON public.anamnesis_records;
CREATE POLICY "Anamnese privada do aluno e seu profissional" 
ON public.anamnesis_records FOR ALL TO authenticated 
USING (
    student_id = auth.uid() 
    OR professional_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.students_professionals sp 
        WHERE sp.student_id = anamnesis_records.student_id 
        AND sp.professional_id = auth.uid() 
        AND sp.status = 'active'
    )
);

DROP POLICY IF EXISTS "Fotos de evolucao privadas do aluno e coach" ON public.evolution_photos;
CREATE POLICY "Fotos de evolucao privadas do aluno e coach" 
ON public.evolution_photos FOR ALL TO authenticated 
USING (
    student_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.students_professionals sp 
        WHERE sp.student_id = evolution_photos.student_id 
        AND sp.professional_id = auth.uid() 
        AND sp.status = 'active'
    )
);

-- 11.11 Políticas: stripe_split_transactions
DROP POLICY IF EXISTS "Transacoes visiveis pelas partes envolvidas" ON public.stripe_split_transactions;
CREATE POLICY "Transacoes visiveis pelas partes envolvidas" 
ON public.stripe_split_transactions FOR SELECT TO authenticated 
USING (student_id = auth.uid() OR professional_id = auth.uid());

-- ============================================================================
-- 12. STORAGE BUCKETS (SUPABASE STORAGE CONFIGURATION)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true) 
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('social-posts', 'social-posts', true) 
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('evolution-photos', 'evolution-photos', false) 
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-media', 'chat-media', false) 
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage
DROP POLICY IF EXISTS "Avatares acessiveis publicamente" ON storage.objects;
CREATE POLICY "Avatares acessiveis publicamente" 
ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Upload de avatar pelo proprio usuario" ON storage.objects;
CREATE POLICY "Upload de avatar pelo proprio usuario" 
ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Fotos sociais acessiveis publicamente" ON storage.objects;
CREATE POLICY "Fotos sociais acessiveis publicamente" 
ON storage.objects FOR SELECT USING (bucket_id = 'social-posts');

DROP POLICY IF EXISTS "Upload de post pelo autor" ON storage.objects;
CREATE POLICY "Upload de post pelo autor" 
ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'social-posts');

DROP POLICY IF EXISTS "Fotos de evolucao acessiveis apenas pelo dono" ON storage.objects;
CREATE POLICY "Fotos de evolucao acessiveis apenas pelo dono" 
ON storage.objects FOR ALL TO authenticated 
USING (bucket_id = 'evolution-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- 13. SEED INICIAL: BIBLIOTECA BASE DE EXERCÍCIOS DE MUSCULAÇÃO
-- ============================================================================

INSERT INTO public.exercises_library (name, muscle_group, equipment, description) VALUES
('Supino Reto com Barra', 'chest', 'Barra e Banco Reto', 'Exercício multiarticular de base para peitoral maior, deltóide anterior e tríceps.'),
('Supino Inclinado com Halteres', 'chest', 'Halteres e Banco Inclinado', 'Foco na porção clavicular (superior) do peitoral maior.'),
('Crucifixo no Crossover', 'chest', 'Polia Regulável', 'Isolador para peitoral com tensão mecânica contínua em toda amplitude.'),
('Puxada Alta Aberta', 'back', 'Polia Alta', 'Trabalho de largura dorsal (grande dorsal e redondo maior).'),
('Remada Curvada com Barra', 'back', 'Barra Olímpica', 'Exercício composto para densidade dorsal, rombóides e trapézio médio.'),
('Remada Baixa Triângulo', 'back', 'Polia Baixa', 'Foco na região central das costas e latíssimo.'),
('Desenvolvimento Militar com Halteres', 'shoulders', 'Halteres', 'Hipertrofia do deltóide anterior e lateral com estabilização do core.'),
('Elevação Lateral na Polia', 'shoulders', 'Cabo Baixo', 'Isolamento máximo do deltóide lateral com curva de força linear.'),
('Agachamento Livre com Barra', 'quadriceps', 'Barra Olímpica e Rack', 'Rei dos exercícios de membros inferiores para quadríceps e glúteos.'),
('Leg Press 45°', 'quadriceps', 'Máquina Leg 45', 'Sobrecarga progressiva para membros inferiores com menor compressão na coluna.'),
('Cadeira Extensora', 'quadriceps', 'Máquina Extensora', 'Isolador para o reto femoral e vastos.'),
('Stiff com Halteres', 'hamstrings', 'Halteres', 'Alongamento sob tensão para isquiotibiais e glúteos.'),
('Mesa Flexora', 'hamstrings', 'Máquina Flexora', 'Flexão de joelhos para trabalho isolado de posteriores.'),
('Elevação Pélvica com Barra', 'glutes', 'Barra e Banco', 'Ativação máxima e extensão de quadril para glúteo máximo.'),
('Rosca Direta com Barra W', 'biceps', 'Barra W', 'Trabalho para bíceps braquial e braquiorradial.'),
('Tríceps Corda no Crossover', 'triceps', 'Polia Alta e Corda', 'Isolador para as 3 cabeças do tríceps com ênfase na cabeça lateral.')
ON CONFLICT (name) DO NOTHING;
