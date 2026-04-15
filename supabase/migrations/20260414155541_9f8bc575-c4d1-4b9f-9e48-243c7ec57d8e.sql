
-- Add unique constraint to prevent duplicate sets per session exercise
ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_session_exercise_set_unique
  UNIQUE (session_exercise_id, set_number);
