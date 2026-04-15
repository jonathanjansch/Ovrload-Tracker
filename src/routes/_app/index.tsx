import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dumbbell, Plus, ArrowLeft, ArrowRight, Check, Trash2, Pencil, Save, User } from "lucide-react";
import { ProfileSheet } from "@/components/ProfileSheet";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/")({
  component: HomePage,
});

type SessionEntry = Tables<"workout_sessions"> & { template_name?: string };

interface SetDetail {
  set_number: number;
  weight: number | null;
  reps: number | null;
  completed: boolean;
}

interface ExerciseDetail {
  session_exercise_id: string;
  exercise_name: string;
  muscle_group_name?: string;
  is_swapped: boolean;
  original_exercise_name?: string;
  order_index: number;
  sets: SetDetail[];
}

interface SessionDetail {
  id: string;
  started_at: string;
  finished_at: string | null;
  template_name: string | null;
  exercises: ExerciseDetail[];
}

function HomePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [recentSessions, setRecentSessions] = useState<SessionEntry[]>([]);
  const [templates, setTemplates] = useState<Tables<"workout_templates">[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<SessionDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [sessionsRes, templatesRes] = await Promise.all([
      supabase
        .from("workout_sessions")
        .select("*, workout_templates(name)")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("started_at", { ascending: false })
        .limit(5),
      supabase
        .from("workout_templates")
        .select("*")
        .eq("user_id", user.id)
        .order("name"),
    ]);
    if (sessionsRes.data) {
      setRecentSessions(
        sessionsRes.data.map((s: any) => ({
          ...s,
          template_name: s.workout_templates?.name,
        }))
      );
    }
    if (templatesRes.data) setTemplates(templatesRes.data);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const loadSessionDetail = async (sessionId: string, startEditing = false) => {
    setLoadingDetail(true);
    const { data: sessionExercises, error: seError } = await supabase
      .from("workout_session_exercises")
      .select("id, exercise_id, order_index, is_swapped, original_exercise_id, exercises!workout_session_exercises_exercise_id_fkey(name, muscle_groups(name))")
      .eq("session_id", sessionId)
      .order("order_index");

    if (seError || !sessionExercises) {
      toast.error("Failed to load session details");
      setLoadingDetail(false);
      return;
    }

    const swappedOriginalIds = sessionExercises
      .filter((se: any) => se.is_swapped && se.original_exercise_id)
      .map((se: any) => se.original_exercise_id);

    let originalExerciseNames = new Map<string, string>();
    if (swappedOriginalIds.length > 0) {
      const { data: originals } = await supabase
        .from("exercises")
        .select("id, name")
        .in("id", swappedOriginalIds);
      if (originals) originals.forEach((o: any) => originalExerciseNames.set(o.id, o.name));
    }

    const seIds = sessionExercises.map((se: any) => se.id);
    let allSets: any[] = [];
    if (seIds.length > 0) {
      const { data } = await supabase
        .from("workout_sets")
        .select("*")
        .in("session_exercise_id", seIds)
        .order("set_number");
      if (data) allSets = data;
    }

    const { data: session } = await supabase
      .from("workout_sessions")
      .select("id, started_at, finished_at, workout_templates(name)")
      .eq("id", sessionId)
      .single();

    const exercises = sessionExercises.map((se: any) => ({
      session_exercise_id: se.id,
      exercise_name: se.exercises?.name ?? "Unknown",
      muscle_group_name: se.exercises?.muscle_groups?.name,
      is_swapped: se.is_swapped,
      original_exercise_name: se.is_swapped ? originalExerciseNames.get(se.original_exercise_id) : undefined,
      order_index: se.order_index,
      sets: allSets
        .filter((s) => s.session_exercise_id === se.id)
        .map((s) => ({ set_number: s.set_number, weight: s.weight, reps: s.reps, completed: s.completed })),
    }));

    const detail: SessionDetail = {
      id: sessionId,
      started_at: session?.started_at ?? "",
      finished_at: session?.finished_at ?? null,
      template_name: (session as any)?.workout_templates?.name ?? null,
      exercises,
    };

    setSelectedSession(detail);
    if (startEditing) {
      setEditing(true);
      setEditData(JSON.parse(JSON.stringify(detail)));
    } else {
      setEditing(false);
      setEditData(null);
    }
    setLoadingDetail(false);
  };

  const updateEditSet = (exIdx: number, setIdx: number, field: "weight" | "reps", value: string) => {
    if (!editData) return;
    const updated = JSON.parse(JSON.stringify(editData)) as SessionDetail;
    const parsed = value === "" ? null : Number(value);
    updated.exercises[exIdx].sets[setIdx][field] = parsed;
    setEditData(updated);
  };

  const toggleEditSetCompleted = (exIdx: number, setIdx: number) => {
    if (!editData) return;
    const updated = JSON.parse(JSON.stringify(editData)) as SessionDetail;
    updated.exercises[exIdx].sets[setIdx].completed = !updated.exercises[exIdx].sets[setIdx].completed;
    setEditData(updated);
  };

  const saveEdits = async () => {
    if (!editData) return;
    setSaving(true);
    const allSets = editData.exercises.flatMap((ex) =>
      ex.sets.map((s) => ({
        session_exercise_id: ex.session_exercise_id,
        set_number: s.set_number,
        weight: s.weight ?? null,
        reps: s.reps ?? null,
        completed: s.completed,
      }))
    );

    if (allSets.length > 0) {
      const { error } = await supabase
        .from("workout_sets")
        .upsert(allSets, { onConflict: "session_exercise_id,set_number" });
      if (error) {
        toast.error("Failed to save changes");
        setSaving(false);
        return;
      }
    }

    toast.success("Changes saved");
    setSelectedSession(editData);
    setEditing(false);
    setEditData(null);
    setSaving(false);
  };

  const deleteSession = async (sessionId: string) => {
    const { data: seData } = await supabase
      .from("workout_session_exercises")
      .select("id")
      .eq("session_id", sessionId);

    if (seData && seData.length > 0) {
      const seIds = seData.map((se) => se.id);
      await supabase.from("workout_sets").delete().in("session_exercise_id", seIds);
      await supabase.from("workout_session_exercises").delete().eq("session_id", sessionId);
    }

    const { error } = await supabase.from("workout_sessions").delete().eq("id", sessionId);
    if (error) {
      toast.error("Failed to delete workout");
    } else {
      toast.success("Workout deleted");
      if (selectedSession?.id === sessionId) setSelectedSession(null);
      fetchData();
    }
    setDeletingId(null);
  };

  const startWorkout = (templateId: string) => {
    navigate({ to: "/workout/$templateId", params: { templateId } } as any);
    setShowPicker(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Detail view for a selected session
  if (selectedSession) {
    const data = editing && editData ? editData : selectedSession;
    const duration = data.finished_at
      ? Math.round((new Date(data.finished_at).getTime() - new Date(data.started_at).getTime()) / 60000)
      : null;

    return (
      <div className="mx-auto max-w-lg px-4 pt-6 pb-24">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { setSelectedSession(null); setEditing(false); setEditData(null); }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {editing ? (
            <Button onClick={saveEdits} disabled={saving} size="sm" className="gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save"}
            </Button>
          ) : (
            <button
              onClick={() => { setEditing(true); setEditData(JSON.parse(JSON.stringify(selectedSession))); }}
              className="flex items-center gap-1 text-sm text-primary hover:text-primary/80"
            >
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
        </div>
        <div className="mb-6">
          <h1 className="font-heading text-xl font-bold">{data.template_name || "Free Workout"}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(data.started_at).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
            {duration != null && ` · ${duration} min`}
          </p>
        </div>
        <div className="space-y-4">
          {data.exercises.map((ex, exIdx) => (
            <Card key={ex.session_exercise_id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-heading font-semibold">{ex.exercise_name}</span>
                  {ex.muscle_group_name && <Badge variant="secondary" className="text-[10px]">{ex.muscle_group_name}</Badge>}
                  {ex.is_swapped && <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">swapped</Badge>}
                </div>
                {ex.is_swapped && ex.original_exercise_name && (
                  <p className="text-xs text-muted-foreground mb-2">
                    <span className="line-through">{ex.original_exercise_name}</span>
                    <ArrowRight className="inline h-3 w-3 mx-1" />
                    {ex.exercise_name}
                  </p>
                )}
                <div className="space-y-1">
                  <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 text-[10px] text-muted-foreground uppercase tracking-wider px-1">
                    <span>Set</span><span>Weight</span><span>Reps</span><span></span>
                  </div>
                  {ex.sets.length === 0 && (
                    <p className="text-xs text-muted-foreground italic px-1">No set data recorded</p>
                  )}
                  {ex.sets.map((s, setIdx) => (
                    <div key={s.set_number} className={`grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 items-center rounded-lg px-1 py-1.5 text-sm ${s.completed ? "text-foreground" : "text-muted-foreground"}`}>
                      <span className="font-bold text-muted-foreground">{s.set_number}</span>
                      {editing ? (
                        <>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={s.weight ?? ""}
                            onChange={(e) => updateEditSet(exIdx, setIdx, "weight", e.target.value)}
                            className="w-full rounded-md border border-border bg-secondary px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
                            placeholder="kg"
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            value={s.reps ?? ""}
                            onChange={(e) => updateEditSet(exIdx, setIdx, "reps", e.target.value)}
                            className="w-full rounded-md border border-border bg-secondary px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
                            placeholder="reps"
                          />
                        </>
                      ) : (
                        <>
                          <span>{s.weight ?? "—"} kg</span>
                          <span>{s.reps ?? "—"}</span>
                        </>
                      )}
                      {editing ? (
                        <button onClick={() => toggleEditSetCompleted(exIdx, setIdx)} className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${s.completed ? "bg-primary border-primary" : "border-border hover:border-primary/50"}`}>
                          {s.completed && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                        </button>
                      ) : (
                        s.completed && <Check className="h-3.5 w-3.5 text-primary" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold leading-tight">
            <span className="gradient-accent-text logo-font block">OVRLOAD</span>
            <span className="gradient-accent-text logo-font block">TRACKER</span>
          </h1>
          <p className="text-sm text-muted-foreground">Ready to train?</p>
        </div>
        <button
          onClick={() => setProfileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/50 bg-secondary text-primary hover:border-primary transition-colors"
        >
          <User className="h-5 w-5" />
        </button>
      </div>

      <Button
        onClick={() => setShowPicker(true)}
        className="h-14 w-full gradient-accent text-primary-foreground font-heading text-lg font-semibold gap-2"
      >
        <Plus className="h-5 w-5" />
        Log Workout
      </Button>

      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setShowPicker(false)}>
          <div className="w-full max-w-lg rounded-t-2xl bg-card p-6 pb-10" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-heading text-lg font-semibold mb-4">Choose a Template</h2>
            {templates.length === 0 ? (
              <p className="text-muted-foreground text-sm">No templates yet. Create one in the Templates tab.</p>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => startWorkout(t.id)}
                    className="flex w-full items-center gap-3 rounded-xl bg-secondary p-4 text-left hover:bg-accent transition-colors"
                  >
                    <Dumbbell className="h-5 w-5 text-primary" />
                    <span className="font-medium">{t.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="font-heading text-lg font-semibold mb-3">Recent Workouts</h2>
        {recentSessions.length === 0 ? (
          <Card className="border-dashed border-border bg-card">
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <Dumbbell className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm">No workouts yet. Start your first session!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentSessions.map((s) => (
              <Card
                key={s.id}
                className="bg-card border-border cursor-pointer hover:bg-secondary/50 transition-colors"
                onClick={() => loadSessionDetail(s.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{s.template_name || "Free Workout"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(s.started_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {s.finished_at && (
                        <span className="text-xs text-muted-foreground mr-1">
                          {Math.round((new Date(s.finished_at).getTime() - new Date(s.started_at).getTime()) / 60000)} min
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); loadSessionDetail(s.id, true); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingId(s.id); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {loadingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} user={user} onSignOut={signOut} />

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workout</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this workout session and all its data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingId && deleteSession(deletingId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
