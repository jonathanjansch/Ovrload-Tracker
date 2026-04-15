
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
