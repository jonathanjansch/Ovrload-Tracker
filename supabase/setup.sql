-- Ovrload Tracker: komplett databas-setup. Klistra in i Supabase > SQL Editor och kör en gång.

-- ===== supabase/migrations/20260414153005_bddaffc4-0648-4b81-8089-2e6ab868b88f.sql =====

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Muscle groups (shared reference, seeded by app)
CREATE TABLE public.muscle_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.muscle_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can read muscle groups" ON public.muscle_groups FOR SELECT TO authenticated USING (true);

-- Exercises (per user)
CREATE TABLE public.exercises (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  muscle_group_id UUID REFERENCES public.muscle_groups(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own exercises" ON public.exercises FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own exercises" ON public.exercises FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own exercises" ON public.exercises FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own exercises" ON public.exercises FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_exercises_updated_at BEFORE UPDATE ON public.exercises FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Workout templates
CREATE TABLE public.workout_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own templates" ON public.workout_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own templates" ON public.workout_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates" ON public.workout_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates" ON public.workout_templates FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_workout_templates_updated_at BEFORE UPDATE ON public.workout_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Template exercises (junction)
CREATE TABLE public.template_exercises (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  sets_count INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.template_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own template exercises" ON public.template_exercises FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.workout_templates wt WHERE wt.id = template_id AND wt.user_id = auth.uid())
);
CREATE POLICY "Users can create own template exercises" ON public.template_exercises FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.workout_templates wt WHERE wt.id = template_id AND wt.user_id = auth.uid())
);
CREATE POLICY "Users can update own template exercises" ON public.template_exercises FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.workout_templates wt WHERE wt.id = template_id AND wt.user_id = auth.uid())
);
CREATE POLICY "Users can delete own template exercises" ON public.template_exercises FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.workout_templates wt WHERE wt.id = template_id AND wt.user_id = auth.uid())
);

-- Workout sessions
CREATE TABLE public.workout_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.workout_templates(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sessions" ON public.workout_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own sessions" ON public.workout_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.workout_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON public.workout_sessions FOR DELETE USING (auth.uid() = user_id);

-- Workout sets
CREATE TABLE public.workout_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  weight NUMERIC(7,2),
  reps INTEGER,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sets" ON public.workout_sets FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.workout_sessions ws WHERE ws.id = session_id AND ws.user_id = auth.uid())
);
CREATE POLICY "Users can create own sets" ON public.workout_sets FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.workout_sessions ws WHERE ws.id = session_id AND ws.user_id = auth.uid())
);
CREATE POLICY "Users can update own sets" ON public.workout_sets FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.workout_sessions ws WHERE ws.id = session_id AND ws.user_id = auth.uid())
);
CREATE POLICY "Users can delete own sets" ON public.workout_sets FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.workout_sessions ws WHERE ws.id = session_id AND ws.user_id = auth.uid())
);

-- Seed muscle groups
INSERT INTO public.muscle_groups (name) VALUES
  ('Chest'), ('Back'), ('Shoulders'), ('Biceps'), ('Triceps'), ('Legs'), ('Core'), ('Cardio');

-- ===== supabase/migrations/20260414154318_e170858a-faec-4e96-8667-46fdc86316e8.sql =====

-- ============================================================
-- 1. Add status column to workout_sessions
-- ============================================================
ALTER TABLE public.workout_sessions
  ADD COLUMN status text NOT NULL DEFAULT 'in_progress';

UPDATE public.workout_sessions SET status = 'completed' WHERE finished_at IS NOT NULL;

-- ============================================================
-- 2. Create workout_session_exercises table
-- ============================================================
CREATE TABLE public.workout_session_exercises (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id),
  order_index integer NOT NULL DEFAULT 0,
  planned_sets integer NOT NULL DEFAULT 3,
  is_swapped boolean NOT NULL DEFAULT false,
  original_exercise_id uuid REFERENCES public.exercises(id),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_wse_session_id ON public.workout_session_exercises(session_id);

ALTER TABLE public.workout_session_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own session exercises"
  ON public.workout_session_exercises FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.workout_sessions ws
    WHERE ws.id = workout_session_exercises.session_id AND ws.user_id = auth.uid()
  ));

CREATE POLICY "Users can create own session exercises"
  ON public.workout_session_exercises FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workout_sessions ws
    WHERE ws.id = workout_session_exercises.session_id AND ws.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own session exercises"
  ON public.workout_session_exercises FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.workout_sessions ws
    WHERE ws.id = workout_session_exercises.session_id AND ws.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own session exercises"
  ON public.workout_session_exercises FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.workout_sessions ws
    WHERE ws.id = workout_session_exercises.session_id AND ws.user_id = auth.uid()
  ));

-- ============================================================
-- 3. Restructure workout_sets
-- ============================================================

-- Add new column (nullable initially for migration)
ALTER TABLE public.workout_sets
  ADD COLUMN session_exercise_id uuid REFERENCES public.workout_session_exercises(id) ON DELETE CASCADE;

-- Migrate existing data
INSERT INTO public.workout_session_exercises (session_id, exercise_id, order_index, planned_sets)
SELECT DISTINCT ws_set.session_id, ws_set.exercise_id, 0, 3
FROM public.workout_sets ws_set
WHERE ws_set.session_exercise_id IS NULL;

UPDATE public.workout_sets ws_set
SET session_exercise_id = wse.id
FROM public.workout_session_exercises wse
WHERE ws_set.session_id = wse.session_id
  AND ws_set.exercise_id = wse.exercise_id
  AND ws_set.session_exercise_id IS NULL;

-- Make NOT NULL
ALTER TABLE public.workout_sets
  ALTER COLUMN session_exercise_id SET NOT NULL;

-- Drop old RLS policies BEFORE dropping columns
DROP POLICY IF EXISTS "Users can view own sets" ON public.workout_sets;
DROP POLICY IF EXISTS "Users can create own sets" ON public.workout_sets;
DROP POLICY IF EXISTS "Users can update own sets" ON public.workout_sets;
DROP POLICY IF EXISTS "Users can delete own sets" ON public.workout_sets;

-- Now drop old columns
ALTER TABLE public.workout_sets DROP COLUMN session_id;
ALTER TABLE public.workout_sets DROP COLUMN exercise_id;

CREATE INDEX idx_ws_session_exercise_id ON public.workout_sets(session_exercise_id);

-- New RLS policies
CREATE POLICY "Users can view own sets"
  ON public.workout_sets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.workout_session_exercises wse
    JOIN public.workout_sessions ws ON ws.id = wse.session_id
    WHERE wse.id = workout_sets.session_exercise_id AND ws.user_id = auth.uid()
  ));

CREATE POLICY "Users can create own sets"
  ON public.workout_sets FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workout_session_exercises wse
    JOIN public.workout_sessions ws ON ws.id = wse.session_id
    WHERE wse.id = workout_sets.session_exercise_id AND ws.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own sets"
  ON public.workout_sets FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.workout_session_exercises wse
    JOIN public.workout_sessions ws ON ws.id = wse.session_id
    WHERE wse.id = workout_sets.session_exercise_id AND ws.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own sets"
  ON public.workout_sets FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.workout_session_exercises wse
    JOIN public.workout_sessions ws ON ws.id = wse.session_id
    WHERE wse.id = workout_sets.session_exercise_id AND ws.user_id = auth.uid()
  ));

-- ============================================================
-- 4. Update exercises table
-- ============================================================
ALTER TABLE public.exercises
  ADD COLUMN is_system boolean NOT NULL DEFAULT false;

ALTER TABLE public.exercises
  ALTER COLUMN user_id DROP NOT NULL;

DROP POLICY IF EXISTS "Users can view own exercises" ON public.exercises;
DROP POLICY IF EXISTS "Users can create own exercises" ON public.exercises;
DROP POLICY IF EXISTS "Users can update own exercises" ON public.exercises;
DROP POLICY IF EXISTS "Users can delete own exercises" ON public.exercises;

CREATE POLICY "Users can view exercises"
  ON public.exercises FOR SELECT
  TO authenticated
  USING (is_system = true OR user_id = auth.uid());

CREATE POLICY "Users can create own exercises"
  ON public.exercises FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Users can update own exercises"
  ON public.exercises FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Users can delete own exercises"
  ON public.exercises FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND is_system = false);

-- ===== supabase/migrations/20260414155541_9f8bc575-c4d1-4b9f-9e48-243c7ec57d8e.sql =====

-- Add unique constraint to prevent duplicate sets per session exercise
ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_session_exercise_set_unique
  UNIQUE (session_exercise_id, set_number);
