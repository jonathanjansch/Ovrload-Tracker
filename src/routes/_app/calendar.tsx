import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Dumbbell, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from "date-fns";

export const Route = createFileRoute("/_app/calendar")({
  component: CalendarPage,
});

type SessionSummary = {
  id: string;
  started_at: string;
  finished_at: string;
  template_name: string | null;
};

type SessionDetail = {
  id: string;
  started_at: string;
  finished_at: string;
  template_name: string | null;
  exercises: {
    session_exercise_id: string;
    exercise_name: string;
    muscle_group_name?: string;
    is_swapped: boolean;
    original_exercise_name?: string;
    order_index: number;
    sets: { set_number: number; weight: number | null; reps: number | null; completed: boolean }[];
  }[];
};

function CalendarPage() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [workoutDates, setWorkoutDates] = useState<Map<string, SessionSummary[]>>(new Map());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchCalendarData = useCallback(() => {
    if (!user) return;
    const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd'T'23:59:59");

    supabase
      .from("workout_sessions")
      .select("id, started_at, finished_at, status, workout_templates(name)")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("started_at", monthStart)
      .lte("started_at", monthEnd)
      .order("started_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { toast.error("Failed to load calendar data"); return; }
        const map = new Map<string, SessionSummary[]>();
        if (data) {
          for (const s of data) {
            const dateKey = format(new Date(s.started_at), "yyyy-MM-dd");
            const entry: SessionSummary = {
              id: s.id,
              started_at: s.started_at,
              finished_at: s.finished_at!,
              template_name: (s as any).workout_templates?.name ?? null,
            };
            const existing = map.get(dateKey) || [];
            existing.push(entry);
            map.set(dateKey, existing);
          }
        }
        setWorkoutDates(map);
      });
  }, [user, currentMonth]);

  useEffect(() => { fetchCalendarData(); }, [fetchCalendarData]);

  // Refetch on visibility change
  useEffect(() => {
    const handler = () => { if (document.visibilityState === "visible") fetchCalendarData(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [fetchCalendarData]);

  const loadSessionDetail = async (sessionId: string) => {
    setLoadingDetail(true);
    const { data: sessionExercises, error: seError } = await supabase
      .from("workout_session_exercises")
      .select("id, exercise_id, order_index, is_swapped, original_exercise_id, exercises!workout_session_exercises_exercise_id_fkey(name, muscle_groups(name))")
      .eq("session_id", sessionId)
      .order("order_index");

    if (seError || !sessionExercises) { toast.error("Failed to load session details"); setLoadingDetail(false); return; }

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

    setSelectedSession({
      id: sessionId,
      started_at: session?.started_at ?? "",
      finished_at: session?.finished_at ?? "",
      template_name: (session as any)?.workout_templates?.name ?? null,
      exercises,
    });
    setLoadingDetail(false);
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calStart, end: calEnd });
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const selectedDateSessions = selectedDate ? workoutDates.get(format(selectedDate, "yyyy-MM-dd")) || [] : [];

  if (selectedSession) {
    const duration = selectedSession.finished_at
      ? Math.round((new Date(selectedSession.finished_at).getTime() - new Date(selectedSession.started_at).getTime()) / 60000)
      : null;

    return (
      <div className="mx-auto max-w-lg px-4 pt-6 pb-24">
        <button onClick={() => setSelectedSession(null)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="mb-6">
          <h1 className="font-heading text-xl font-bold">{selectedSession.template_name || "Free Workout"}</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(selectedSession.started_at), "EEEE, MMM d, yyyy · h:mm a")}
            {duration != null && ` · ${duration} min`}
          </p>
        </div>
        <div className="space-y-4">
          {selectedSession.exercises.map((ex) => (
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
                  {ex.sets.map((s) => (
                    <div key={s.set_number} className={`grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 items-center rounded-lg px-1 py-1.5 text-sm ${s.completed ? "text-foreground" : "text-muted-foreground"}`}>
                      <span className="font-bold text-muted-foreground">{s.set_number}</span>
                      <span>{s.weight ?? "—"} kg</span>
                      <span>{s.reps ?? "—"}</span>
                      {s.completed && <Check className="h-3.5 w-3.5 text-primary" />}
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
    <div className="mx-auto max-w-lg px-4 pt-6 pb-24">
      <h1 className="font-heading text-xl font-bold mb-4">Calendar</h1>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 rounded-full hover:bg-secondary"><ChevronLeft className="h-5 w-5" /></button>
        <h2 className="font-heading text-lg font-semibold">{format(currentMonth, "MMMM yyyy")}</h2>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 rounded-full hover:bg-secondary"><ChevronRight className="h-5 w-5" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayNames.map((d) => (
          <div key={d} className="text-center text-[10px] text-muted-foreground font-medium uppercase tracking-wider py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-6">
        {calendarDays.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const hasWorkout = workoutDates.has(dateKey);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          return (
            <button
              key={dateKey}
              onClick={() => setSelectedDate(day)}
              className={`relative flex flex-col items-center justify-center rounded-lg h-11 text-sm transition-colors ${!isCurrentMonth ? "text-muted-foreground/30" : ""} ${isSelected ? "bg-primary/20 text-primary font-bold" : "hover:bg-secondary"} ${isToday && !isSelected ? "ring-1 ring-primary/50" : ""}`}
            >
              {day.getDate()}
              {hasWorkout && isCurrentMonth && <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>
      {selectedDate && (
        <div>
          <h3 className="font-heading text-base font-semibold mb-3">{format(selectedDate, "EEEE, MMM d")}</h3>
          {selectedDateSessions.length === 0 ? (
            <Card className="border-dashed border-border bg-card">
              <CardContent className="flex flex-col items-center justify-center py-6 text-center">
                <p className="text-muted-foreground text-sm">No workouts on this day.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {selectedDateSessions.map((s) => (
                <button key={s.id} onClick={() => loadSessionDetail(s.id)} className="w-full text-left">
                  <Card className="bg-card border-border hover:border-primary/40 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Dumbbell className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-medium">{s.template_name || "Free Workout"}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(s.started_at), "h:mm a")}
                            {s.finished_at && ` · ${Math.round((new Date(s.finished_at).getTime() - new Date(s.started_at).getTime()) / 60000)} min`}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {loadingDetail && (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}
