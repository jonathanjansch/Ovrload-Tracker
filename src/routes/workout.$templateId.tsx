import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Check, RefreshCw, Timer, Plus } from "lucide-react";
import { RestTimer } from "@/components/RestTimer";
import { ExerciseSwapDialog } from "@/components/ExerciseSwapDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/workout/$templateId")({
  component: WorkoutPage,
});

type SetData = {
  id?: string;
  session_exercise_id: string;
  set_number: number;
  weight: number;
  reps: number;
  completed: boolean;
  prev_weight?: number;
  prev_reps?: number;
};

type ExerciseBlock = {
  session_exercise_id: string;
  exercise_id: string;
  exercise_name: string;
  muscle_group_name?: string;
  planned_sets: number;
  sets: SetData[];
  original_exercise_id: string;
  is_swapped: boolean;
};

function WorkoutPage() {
  const { templateId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState<ExerciseBlock[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictSession, setConflictSession] = useState<{ id: string; template_name: string | null; template_id: string | null } | null>(null);

  // Refs for latest state (avoids stale closures)
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // Track in-flight saves to prevent duplicates
  const savingKeys = useRef(new Set<string>());
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Upsert a single set to DB (safe against duplicates via unique constraint)
  const saveSet = useCallback(async (set: SetData) => {
    if (!set.session_exercise_id) return;
    const key = `${set.session_exercise_id}-${set.set_number}`;

    // Skip if already saving this exact key
    if (savingKeys.current.has(key)) return;
    savingKeys.current.add(key);

    try {
      const payload = {
        session_exercise_id: set.session_exercise_id,
        set_number: set.set_number,
        weight: set.weight === 0 ? 0 : (set.weight ?? null),
        reps: set.reps === 0 ? 0 : (set.reps ?? null),
        completed: set.completed,
      };

      if (set.id) {
        const { error } = await supabase.from("workout_sets").update(payload).eq("id", set.id);
        if (error) throw error;
      } else {
        // Use upsert with the unique constraint to prevent duplicates
        const { data, error } = await supabase
          .from("workout_sets")
          .upsert(payload, { onConflict: "session_exercise_id,set_number" })
          .select("id")
          .single();
        if (error) throw error;
        if (data) set.id = data.id;
      }
    } catch (err) {
      toast.error("Failed to save set. Check your connection.");
    } finally {
      savingKeys.current.delete(key);
    }
  }, []);

  const debounceSave = useCallback((set: SetData) => {
    const key = `${set.session_exercise_id}-${set.set_number}`;
    const existing = debounceTimers.current.get(key);
    if (existing) clearTimeout(existing);
    debounceTimers.current.set(key, setTimeout(() => {
      saveSet(set);
      debounceTimers.current.delete(key);
    }, 500));
  }, [saveSet]);

  // Flush using ref to always get latest blocks
  const flushSaves = useCallback(async () => {
    debounceTimers.current.forEach((timer) => clearTimeout(timer));
    debounceTimers.current.clear();
    const currentBlocks = blocksRef.current;
    const allSets = currentBlocks.flatMap((b) =>
      b.sets.map((s) => ({
        session_exercise_id: s.session_exercise_id,
        set_number: s.set_number,
        weight: s.weight === 0 ? 0 : (s.weight ?? null),
        reps: s.reps === 0 ? 0 : (s.reps ?? null),
        completed: s.completed,
      }))
    );
    if (allSets.length === 0) return;
    const { error } = await supabase
      .from("workout_sets")
      .upsert(allSets, { onConflict: "session_exercise_id,set_number" });
    if (error) throw error;
  }, []);

  useEffect(() => {
    if (!user) return;
    initSession();
  }, [user, templateId]);

  const initSession = async () => {
    if (!user) return;

    // Check for ANY existing in-progress session (regardless of template)
    const { data: existingSessions } = await supabase
      .from("workout_sessions")
      .select("id, template_id, status, workout_templates(name)")
      .eq("user_id", user.id)
      .eq("status", "in_progress")
      .limit(1)
      .maybeSingle();

    if (existingSessions) {
      // If it's the same template, resume directly
      if (existingSessions.template_id === templateId) {
        await resumeSession(existingSessions.id);
        return;
      }
      // Different template — show conflict dialog
      setConflictSession({
        id: existingSessions.id,
        template_name: (existingSessions as any).workout_templates?.name ?? null,
        template_id: existingSessions.template_id,
      });
      setLoading(false);
      setShowConflictDialog(true);
      return;
    }

    await createNewSession();
  };

  const createNewSession = async () => {
    if (!user) return;
    setLoading(true);

    const { data: template } = await supabase.from("workout_templates").select("name").eq("id", templateId).single();
    if (!template) {
      toast.error("Template not found");
      navigate({ to: "/" });
      return;
    }
    setTemplateName(template.name);

    const { data: templateExercises } = await supabase
      .from("template_exercises")
      .select("*, exercises(id, name, muscle_groups(name))")
      .eq("template_id", templateId)
      .order("sort_order");

    if (!templateExercises || templateExercises.length === 0) {
      toast.error("This template has no exercises. Add some first.");
      navigate({ to: "/" });
      return;
    }

    const { data: session, error: sessionErr } = await supabase
      .from("workout_sessions")
      .insert({ user_id: user!.id, template_id: templateId, status: "in_progress" })
      .select("id")
      .single();

    if (sessionErr || !session) { toast.error("Failed to start workout"); setLoading(false); return; }
    setSessionId(session.id);

    const sessionExerciseInserts = templateExercises.map((te: any, idx: number) => ({
      session_id: session.id,
      exercise_id: te.exercises.id,
      order_index: te.sort_order ?? idx,
      planned_sets: te.sets_count,
      is_swapped: false,
    }));

    const { data: sessionExercises, error: seErr } = await supabase
      .from("workout_session_exercises")
      .insert(sessionExerciseInserts)
      .select("id, exercise_id, order_index, planned_sets");

    if (seErr || !sessionExercises) { toast.error("Failed to initialize exercises"); setLoading(false); return; }

    // Previous session for "prev" values
    const { data: lastSession } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("user_id", user!.id)
      .eq("template_id", templateId)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let prevSets: any[] = [];
    if (lastSession) {
      const { data: prevSE } = await supabase
        .from("workout_session_exercises")
        .select("id, exercise_id")
        .eq("session_id", lastSession.id);
      if (prevSE && prevSE.length > 0) {
        const { data } = await supabase
          .from("workout_sets")
          .select("*")
          .in("session_exercise_id", prevSE.map((se) => se.id));
        if (data) {
          const seToEx = new Map(prevSE.map((se) => [se.id, se.exercise_id]));
          prevSets = data.map((s) => ({ ...s, exercise_id: seToEx.get(s.session_exercise_id) }));
        }
      }
    }

    const newBlocks: ExerciseBlock[] = sessionExercises.map((se: any) => {
      const te = templateExercises.find((t: any) => t.exercises.id === se.exercise_id);
      const ex = te?.exercises;
      const exercisePrevSets = prevSets.filter((s: any) => s.exercise_id === se.exercise_id);
      const sets: SetData[] = Array.from({ length: se.planned_sets }, (_, i) => {
        const prev = exercisePrevSets.find((s: any) => s.set_number === i + 1);
        return {
          session_exercise_id: se.id,
          set_number: i + 1,
          weight: prev?.weight ?? 0,
          reps: prev?.reps ?? 0,
          completed: false,
          prev_weight: prev?.weight != null ? prev.weight : undefined,
          prev_reps: prev?.reps != null ? prev.reps : undefined,
        };
      });
      return {
        session_exercise_id: se.id,
        exercise_id: se.exercise_id,
        exercise_name: ex?.name ?? "Unknown",
        muscle_group_name: ex?.muscle_groups?.name,
        planned_sets: se.planned_sets,
        sets,
        original_exercise_id: se.exercise_id,
        is_swapped: false,
      };
    });

    setBlocks(newBlocks);
    setLoading(false);
  };

  const resumeSession = async (sId: string) => {
    setSessionId(sId);
    const { data: session } = await supabase
      .from("workout_sessions")
      .select("*, workout_templates(name)")
      .eq("id", sId)
      .single();
    if (session) setTemplateName((session as any).workout_templates?.name ?? "Workout");

    const { data: sessionExercises } = await supabase
      .from("workout_session_exercises")
      .select("*, exercises(id, name, muscle_groups(name))")
      .eq("session_id", sId)
      .order("order_index");

    if (!sessionExercises) { setLoading(false); return; }

    const seIds = sessionExercises.map((se: any) => se.id);
    let existingSets: any[] = [];
    if (seIds.length > 0) {
      const { data } = await supabase.from("workout_sets").select("*").in("session_exercise_id", seIds);
      if (data) existingSets = data;
    }

    const newBlocks: ExerciseBlock[] = sessionExercises.map((se: any) => {
      const ex = se.exercises;
      const seSets = existingSets.filter((s: any) => s.session_exercise_id === se.id);
      const sets: SetData[] = Array.from({ length: se.planned_sets }, (_, i) => {
        const existing = seSets.find((s: any) => s.set_number === i + 1);
        return {
          id: existing?.id,
          session_exercise_id: se.id,
          set_number: i + 1,
          weight: existing?.weight ?? 0,
          reps: existing?.reps ?? 0,
          completed: existing?.completed ?? false,
        };
      });
      return {
        session_exercise_id: se.id,
        exercise_id: se.exercise_id,
        exercise_name: ex?.name ?? "Unknown",
        muscle_group_name: ex?.muscle_groups?.name,
        planned_sets: se.planned_sets,
        sets,
        original_exercise_id: se.original_exercise_id ?? se.exercise_id,
        is_swapped: se.is_swapped,
      };
    });

    setBlocks(newBlocks);
    setLoading(false);
  };

  const handleDiscardConflictAndStart = async () => {
    if (conflictSession) {
      const { error } = await supabase.from("workout_sessions").update({ status: "cancelled" }).eq("id", conflictSession.id);
      if (error) { toast.error("Failed to discard previous workout"); return; }
    }
    setShowConflictDialog(false);
    setConflictSession(null);
    await createNewSession();
  };

  const handleResumeConflict = () => {
    if (conflictSession?.template_id) {
      setShowConflictDialog(false);
      navigate({ to: "/workout/$templateId", params: { templateId: conflictSession.template_id } } as any);
    }
  };

  const updateSet = useCallback((blockIdx: number, setIdx: number, field: "weight" | "reps", delta: number) => {
    setBlocks((prev) => {
      const newBlocks = [...prev];
      const block = { ...newBlocks[blockIdx] };
      const sets = [...block.sets];
      const set = { ...sets[setIdx] };
      if (field === "weight") set.weight = Math.max(0, +(set.weight + delta).toFixed(2));
      else set.reps = Math.max(0, set.reps + delta);
      sets[setIdx] = set;
      block.sets = sets;
      newBlocks[blockIdx] = block;
      debounceSave(set);
      return newBlocks;
    });
  }, [debounceSave]);

  const toggleComplete = useCallback((blockIdx: number, setIdx: number) => {
    setBlocks((prev) => {
      const newBlocks = [...prev];
      const block = { ...newBlocks[blockIdx] };
      const sets = [...block.sets];
      const wasCompleted = sets[setIdx].completed;
      const set = { ...sets[setIdx], completed: !wasCompleted };
      sets[setIdx] = set;
      block.sets = sets;
      newBlocks[blockIdx] = block;
      debounceSave(set);
      // Haptic + visual feedback on completion
      if (!wasCompleted) {
        try { navigator.vibrate?.(50); } catch {}
      }
      return newBlocks;
    });
  }, [debounceSave]);

  // Add set to a block
  const addSet = useCallback(async (blockIdx: number) => {
    const block = blocksRef.current[blockIdx];
    if (!block) return;
    const lastSet = block.sets[block.sets.length - 1];
    const newSetNumber = block.sets.length + 1;
    const newSet: SetData = {
      session_exercise_id: block.session_exercise_id,
      set_number: newSetNumber,
      weight: lastSet?.weight ?? 0,
      reps: lastSet?.reps ?? 0,
      completed: false,
    };
    setBlocks((prev) => {
      const newBlocks = [...prev];
      const b = { ...newBlocks[blockIdx] };
      b.sets = [...b.sets, newSet];
      b.planned_sets = newSetNumber;
      newBlocks[blockIdx] = b;
      return newBlocks;
    });
    // Update planned_sets in DB
    await supabase
      .from("workout_session_exercises")
      .update({ planned_sets: newSetNumber })
      .eq("id", block.session_exercise_id);
    // Save the new set
    debounceSave(newSet);
  }, [debounceSave]);

  const setFieldValue = useCallback((blockIdx: number, setIdx: number, field: "weight" | "reps", value: number) => {
    setBlocks((prev) => {
      const newBlocks = [...prev];
      const block = { ...newBlocks[blockIdx] };
      const sets = [...block.sets];
      const set = { ...sets[setIdx], [field]: Math.max(0, value) };
      sets[setIdx] = set;
      block.sets = sets;
      newBlocks[blockIdx] = block;
      debounceSave(set);
      return newBlocks;
    });
  }, [debounceSave]);

  const handleSwap = async (blockIdx: number, newExerciseId: string, newExerciseName: string, muscleGroupName?: string) => {
    const block = blocks[blockIdx];
    const { error } = await supabase
      .from("workout_session_exercises")
      .update({ exercise_id: newExerciseId, is_swapped: true, original_exercise_id: block.original_exercise_id })
      .eq("id", block.session_exercise_id);

    if (error) { toast.error("Failed to swap exercise"); return; }

    setBlocks((prev) => {
      const newBlocks = [...prev];
      const b = { ...newBlocks[blockIdx] };
      b.exercise_id = newExerciseId;
      b.exercise_name = newExerciseName;
      b.muscle_group_name = muscleGroupName;
      b.is_swapped = true;
      b.sets = b.sets.map((s) => ({ ...s, weight: 0, reps: 0, prev_weight: undefined, prev_reps: undefined, completed: false }));
      newBlocks[blockIdx] = b;
      return newBlocks;
    });
    setSwapIndex(null);
  };

  const finishWorkout = async () => {
    if (!user || !sessionIdRef.current) return;
    setFinishing(true);
    try {
      await flushSaves();
      const { error } = await supabase
        .from("workout_sessions")
        .update({ status: "completed", finished_at: new Date().toISOString() })
        .eq("id", sessionIdRef.current);
      if (error) throw error;
      toast.success("Workout saved!");
      navigate({ to: "/" });
    } catch {
      toast.error("Failed to finish workout. Please try again.");
      setFinishing(false);
    }
  };

  const cancelWorkout = async () => {
    if (!sessionIdRef.current) return;
    const { error } = await supabase.from("workout_sessions").update({ status: "cancelled" }).eq("id", sessionIdRef.current);
    if (error) { toast.error("Failed to cancel workout"); return; }
    navigate({ to: "/" });
  };

  // Elapsed timer
  const [elapsed, setElapsed] = useState("0:00");
  const startedAtRef = useRef<Date | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    supabase.from("workout_sessions").select("started_at").eq("id", sessionId).single().then(({ data }) => {
      if (data) startedAtRef.current = new Date(data.started_at);
    });
  }, [sessionId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!startedAtRef.current) return;
      const diff = Math.floor((Date.now() - startedAtRef.current.getTime()) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : `${m}:${s.toString().padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Track recently completed sets for animation
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<string>>(new Set());

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-lg px-4 py-3">
        <div className="mx-auto max-w-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCancelDialog(true)} className="rounded-full p-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="font-heading text-lg font-bold">{templateName}</h1>
              <p className="text-xs text-muted-foreground">
                <span className="tabular-nums font-medium text-primary">{elapsed}</span>
                <span className="mx-1">·</span>auto-saving
              </p>
            </div>
          </div>
          <button onClick={() => setShowTimer(!showTimer)} className="rounded-full p-2 text-muted-foreground hover:text-primary">
            <Timer className="h-5 w-5" />
          </button>
        </div>
      </div>

      {showTimer && <RestTimer />}

      <div className="mx-auto max-w-lg px-4 pt-4 space-y-4">
        {blocks.map((block, bIdx) => (
          <Card key={block.session_exercise_id} className="bg-card border-border overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-heading">{block.exercise_name}</CardTitle>
                  {block.muscle_group_name && <Badge variant="secondary" className="text-[10px]">{block.muscle_group_name}</Badge>}
                  {block.is_swapped && <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">swapped</Badge>}
                </div>
                <button onClick={() => setSwapIndex(bIdx)} className="rounded p-1.5 text-muted-foreground hover:text-primary">
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-2 text-[10px] text-muted-foreground font-medium px-1 uppercase tracking-wider">
                <span>Set</span><span className="text-center">Weight (kg)</span><span className="text-center">Reps</span><span>Done</span>
              </div>
              {block.sets.map((set, sIdx) => {
                const setKey = `${block.session_exercise_id}-${set.set_number}`;
                return (
                <div key={sIdx} className={`grid grid-cols-[auto_1fr_1fr_auto] gap-x-2 items-center rounded-lg p-2 transition-all duration-300 ${set.completed ? "bg-primary/10" : "bg-secondary"} ${recentlyCompleted.has(setKey) ? "scale-[1.02] ring-1 ring-primary/40" : ""}`}>
                  <span className="w-6 text-center text-xs font-bold text-muted-foreground">{set.set_number}</span>
                  <div className="flex flex-col items-center gap-1">
                    {set.prev_weight != null && <span className="text-[10px] text-muted-foreground">prev: {set.prev_weight}</span>}
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateSet(bIdx, sIdx, "weight", -1.25)} className="min-h-[44px] min-w-[44px] rounded bg-background text-xs font-bold flex items-center justify-center active:bg-accent">-1.25</button>
                      <input type="number" value={set.weight !== null && set.weight !== undefined ? set.weight : ""} onChange={(e) => { const v = e.target.value; setFieldValue(bIdx, sIdx, "weight", v === "" ? 0 : parseFloat(v)); }} className="h-10 w-14 rounded bg-background text-center text-sm font-semibold border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="0" />
                      <button onClick={() => updateSet(bIdx, sIdx, "weight", 1.25)} className="min-h-[44px] min-w-[44px] rounded bg-background text-xs font-bold flex items-center justify-center active:bg-accent">+1.25</button>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    {set.prev_reps != null && <span className="text-[10px] text-muted-foreground">prev: {set.prev_reps}</span>}
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateSet(bIdx, sIdx, "reps", -1)} className="min-h-[44px] min-w-[44px] rounded bg-background text-xs font-bold flex items-center justify-center active:bg-accent">-1</button>
                      <input type="number" value={set.reps !== null && set.reps !== undefined ? set.reps : ""} onChange={(e) => { const v = e.target.value; setFieldValue(bIdx, sIdx, "reps", v === "" ? 0 : parseInt(v)); }} className="h-10 w-10 rounded bg-background text-center text-sm font-semibold border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="0" />
                      <button onClick={() => updateSet(bIdx, sIdx, "reps", 1)} className="min-h-[44px] min-w-[44px] rounded bg-background text-xs font-bold flex items-center justify-center active:bg-accent">+1</button>
                    </div>
                  </div>
                  <button onClick={() => {
                    toggleComplete(bIdx, sIdx);
                    if (!set.completed) {
                      setRecentlyCompleted((prev) => new Set(prev).add(setKey));
                      setTimeout(() => setRecentlyCompleted((prev) => { const n = new Set(prev); n.delete(setKey); return n; }), 400);
                    }
                  }} className={`min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center transition-all duration-200 ${set.completed ? "gradient-accent text-primary-foreground scale-110" : "bg-background text-muted-foreground"}`}>
                    <Check className="h-4 w-4" />
                  </button>
                </div>
                );
              })}
              <button onClick={() => addSet(bIdx)} className="flex items-center justify-center gap-1 w-full py-2 mt-1 text-xs text-muted-foreground hover:text-primary transition-colors rounded-lg hover:bg-secondary">
                <Plus className="h-3.5 w-3.5" /> Add Set
              </button>
            </CardContent>
          </Card>
        ))}

        <Button onClick={finishWorkout} disabled={finishing} className="h-14 w-full gradient-accent text-primary-foreground font-heading text-lg font-semibold">
          {finishing ? "Saving..." : "Finish Workout"}
        </Button>
      </div>

      {/* Cancel confirmation dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="bg-card border-border max-w-xs">
          <DialogHeader>
            <DialogTitle className="font-heading">Leave Workout?</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Choose what to do with your current workout.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Your progress is auto-saved. You can resume this workout later from the home screen.</p>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button onClick={() => { setShowCancelDialog(false); navigate({ to: "/" }); }} variant="secondary" className="w-full">
              Keep & Resume Later
            </Button>
            <Button onClick={() => { setShowCancelDialog(false); cancelWorkout(); }} variant="destructive" className="w-full">
              Discard Workout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conflict dialog: existing in-progress session */}
      <Dialog open={showConflictDialog} onOpenChange={() => {}}>
        <DialogContent className="bg-card border-border max-w-xs" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-heading">Active Workout Found</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">You have an unfinished workout session.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You have an in-progress workout{conflictSession?.template_name ? ` (${conflictSession.template_name})` : ""}. What would you like to do?
          </p>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button onClick={handleResumeConflict} className="w-full gradient-accent text-primary-foreground">
              Resume Previous Workout
            </Button>
            <Button onClick={handleDiscardConflictAndStart} variant="destructive" className="w-full">
              Discard & Start New
            </Button>
            <Button onClick={() => { setShowConflictDialog(false); navigate({ to: "/" }); }} variant="ghost" className="w-full">
              Go Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {swapIndex !== null && (
        <ExerciseSwapDialog open={true} onClose={() => setSwapIndex(null)} onSwap={(exId, exName, mgName) => handleSwap(swapIndex, exId, exName, mgName)} />
      )}
    </div>
  );
}
