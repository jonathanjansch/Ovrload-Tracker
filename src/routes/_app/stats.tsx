import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dumbbell, TrendingUp, Target, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { format, subWeeks, endOfWeek, eachWeekOfInterval, startOfWeek } from "date-fns";

export const Route = createFileRoute("/_app/stats")({
  component: StatsPage,
});

const CHART_COLORS = [
  "hsl(38, 95%, 61%)", "hsl(22, 85%, 55%)", "hsl(200, 70%, 55%)", "hsl(150, 60%, 50%)",
  "hsl(280, 60%, 55%)", "hsl(350, 70%, 55%)", "hsl(170, 60%, 50%)", "hsl(50, 80%, 55%)",
];

type SessionRow = { id: string; started_at: string; finished_at: string | null };
type SessionExerciseRow = { id: string; session_id: string; exercise_id: string; exercise_name: string; muscle_group_name: string | null };
type SetRow = { session_exercise_id: string; weight: number | null; reps: number | null; completed: boolean; set_number: number };

function StatsPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionExercises, setSessionExercises] = useState<SessionExerciseRow[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [exercises, setExercises] = useState<{ id: string; name: string }[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) loadStats(); }, [user]);

  // Refetch on visibility change (tab focus)
  useEffect(() => {
    const handler = () => { if (document.visibilityState === "visible" && user) loadStats(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [user]);

  const loadStats = async () => {
    if (!user) return;
    const { data: sessionsData, error: sErr } = await supabase
      .from("workout_sessions")
      .select("id, started_at, finished_at")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("started_at", { ascending: true });

    if (sErr) { toast.error("Failed to load stats"); setLoading(false); return; }
    if (!sessionsData || sessionsData.length === 0) { setLoading(false); return; }
    setSessions(sessionsData);

    const sessionIds = sessionsData.map((s) => s.id);
    // Batch session exercise queries in chunks of 500
    const CHUNK = 500;
    let allSEData: any[] = [];
    for (let i = 0; i < sessionIds.length; i += CHUNK) {
      const chunk = sessionIds.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from("workout_session_exercises")
        .select("id, session_id, exercise_id, exercises!workout_session_exercises_exercise_id_fkey(name, muscle_groups(name))")
        .in("session_id", chunk);
      if (error) console.error("Failed to load session exercises chunk:", error);
      if (data) allSEData.push(...data);
    }

    const mappedSE: SessionExerciseRow[] = allSEData.map((se: any) => ({
      id: se.id, session_id: se.session_id, exercise_id: se.exercise_id,
      exercise_name: se.exercises?.name ?? "Unknown",
      muscle_group_name: se.exercises?.muscle_groups?.name ?? null,
    }));
    setSessionExercises(mappedSE);

    const seIds = mappedSE.map((se) => se.id);
    if (seIds.length > 0) {
      let allSets: SetRow[] = [];
      for (let i = 0; i < seIds.length; i += CHUNK) {
        const chunk = seIds.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("workout_sets")
          .select("session_exercise_id, weight, reps, completed, set_number")
          .in("session_exercise_id", chunk);
        if (error) console.error("Failed to load sets chunk:", error);
        if (data) allSets.push(...(data as SetRow[]));
      }
      setSets(allSets);
    }

    const uniqueExercises = new Map<string, string>();
    mappedSE.forEach((se) => uniqueExercises.set(se.exercise_id, se.exercise_name));
    const exList = Array.from(uniqueExercises, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    setExercises(exList);
    if (exList.length > 0) setSelectedExerciseId(exList[0].id);
    setLoading(false);
  };

  const weeklyData = useMemo(() => {
    if (sessions.length === 0) return [];
    const now = new Date();
    const weeks = eachWeekOfInterval({ start: subWeeks(now, 7), end: now }, { weekStartsOn: 1 });
    return weeks.map((weekStart) => {
      const we = endOfWeek(weekStart, { weekStartsOn: 1 });
      const count = sessions.filter((s) => { const d = new Date(s.started_at); return d >= weekStart && d <= we; }).length;
      return { week: format(weekStart, "MMM d"), workouts: count };
    });
  }, [sessions]);

  const volumeData = useMemo(() => {
    if (sessions.length === 0) return [];
    const now = new Date();
    const weeks = eachWeekOfInterval({ start: subWeeks(now, 7), end: now }, { weekStartsOn: 1 });
    const seToSession = new Map(sessionExercises.map((se) => [se.id, se.session_id]));
    const sessionDates = new Map(sessions.map((s) => [s.id, new Date(s.started_at)]));
    return weeks.map((weekStart) => {
      const we = endOfWeek(weekStart, { weekStartsOn: 1 });
      let volume = 0;
      sets.forEach((set) => {
        if (!set.completed || set.weight == null || set.reps == null) return;
        const sessionId = seToSession.get(set.session_exercise_id);
        if (!sessionId) return;
        const date = sessionDates.get(sessionId);
        if (!date || date < weekStart || date > we) return;
        volume += set.weight * set.reps;
      });
      return { week: format(weekStart, "MMM d"), volume: Math.round(volume) };
    });
  }, [sessions, sessionExercises, sets]);

  const muscleGroupStats = useMemo(() => {
    if (sessions.length === 0) return [];

    const earliest = new Date(sessions[0].started_at);
    const now = new Date();
    const weeks = eachWeekOfInterval({ start: earliest, end: now }, { weekStartsOn: 1 });
    const numWeeks = Math.max(weeks.length, 1);

    const sessionDateMap = new Map(sessions.map((s) => [s.id, new Date(s.started_at)]));
    const seMap = new Map(sessionExercises.map((se) => [se.id, se]));

    // frequency: unique (weekKey, sessionId) per muscle group
    const freqMap = new Map<string, Set<string>>();
    // sets per week: total completed sets per muscle group
    const setsMap = new Map<string, number>();

    // Count frequency: one count per muscle group per session
    sessionExercises.forEach((se) => {
      const group = se.muscle_group_name || "Other";
      const sessionDate = sessionDateMap.get(se.session_id);
      if (!sessionDate) return;
      const weekKey = format(startOfWeek(sessionDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const compositeKey = `${weekKey}::${se.session_id}`;
      if (!freqMap.has(group)) freqMap.set(group, new Set());
      freqMap.get(group)!.add(compositeKey);
    });

    // Count sets per muscle group
    sets.forEach((set) => {
      if (!set.completed) return;
      const se = seMap.get(set.session_exercise_id);
      if (!se) return;
      const group = se.muscle_group_name || "Other";
      setsMap.set(group, (setsMap.get(group) || 0) + 1);
    });

    const allGroups = new Set([...freqMap.keys(), ...setsMap.keys()]);
    return Array.from(allGroups, (name) => ({
      name,
      frequency: (freqMap.get(name)?.size || 0) / numWeeks,
      setsPerWeek: (setsMap.get(name) || 0) / numWeeks,
    })).sort((a, b) => b.frequency - a.frequency);
  }, [sessions, sessionExercises, sets]);

  const personalBests = useMemo(() => {
    if (!selectedExerciseId) return [];
    const relevantSEIds = new Set(sessionExercises.filter((se) => se.exercise_id === selectedExerciseId).map((se) => se.id));
    const repMaxes = new Map<number, number>();
    sets.forEach((set) => {
      if (!relevantSEIds.has(set.session_exercise_id)) return;
      if (!set.completed || set.weight == null || set.reps == null) return;
      const current = repMaxes.get(set.reps) || 0;
      if (set.weight > current) repMaxes.set(set.reps, set.weight);
    });
    return Array.from(repMaxes, ([reps, weight]) => ({ reps, weight })).sort((a, b) => a.reps - b.reps);
  }, [selectedExerciseId, sessionExercises, sets]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-6 pb-24">
        <h1 className="font-heading text-xl font-bold mb-4">Statistics</h1>
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-muted-foreground text-sm">Complete your first workout to see stats.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalSessions = sessions.length;
  const totalVolume = sets.reduce((acc, s) => {
    if (s.completed && s.weight != null && s.reps != null) return acc + s.weight * s.reps;
    return acc;
  }, 0);

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-24 space-y-6">
      <h1 className="font-heading text-xl font-bold">Statistics</h1>
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-card border-border"><CardContent className="p-4 text-center">
          <Dumbbell className="h-5 w-5 mx-auto mb-1 text-primary" />
          <p className="text-2xl font-heading font-bold">{totalSessions}</p>
          <p className="text-[11px] text-muted-foreground">Workouts</p>
        </CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-4 text-center">
          <TrendingUp className="h-5 w-5 mx-auto mb-1 text-primary" />
          <p className="text-2xl font-heading font-bold">{totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(0)}k` : totalVolume}</p>
          <p className="text-[11px] text-muted-foreground">Total Volume (kg)</p>
        </CardContent></Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-heading">Workouts / Week</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={weeklyData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(0 0% 60%)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(0 0% 60%)" }} />
              <Tooltip contentStyle={{ background: "hsl(0 0% 8%)", border: "1px solid hsl(0 0% 20%)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "hsl(0 0% 60%)" }} />
              <Bar dataKey="workouts" fill="hsl(38, 95%, 61%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-heading">Volume Over Time (kg)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={volumeData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(0 0% 60%)" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(0 0% 60%)" }} />
              <Tooltip contentStyle={{ background: "hsl(0 0% 8%)", border: "1px solid hsl(0 0% 20%)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "hsl(0 0% 60%)" }} />
              <Line type="monotone" dataKey="volume" stroke="hsl(22, 85%, 55%)" strokeWidth={2} dot={{ fill: "hsl(22, 85%, 55%)", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-heading flex items-center gap-2"><Target className="h-4 w-4" /> Muscle Group Stats</CardTitle></CardHeader>
        <CardContent>
          {muscleGroupStats.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No data yet.</p> : (
            <div className="space-y-3">
              <div className="flex gap-4">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart><Pie data={muscleGroupStats.map((mg) => ({ name: mg.name, value: mg.frequency }))} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={2}>
                    {muscleGroupStats.map((_: unknown, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie></PieChart>
                </ResponsiveContainer>
                <div className="flex-1 py-1">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5 px-1">
                    <span>Muscle Group</span>
                    <div className="flex gap-4">
                      <span className="w-12 text-right">Freq/wk</span>
                      <span className="w-12 text-right">Sets/wk</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {muscleGroupStats.map((mg, i) => (
                      <div key={mg.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} /><span className="truncate">{mg.name}</span></div>
                        <div className="flex gap-4">
                          <span className="w-12 text-right font-medium">{mg.frequency.toFixed(1)}x</span>
                          <span className="w-12 text-right text-muted-foreground">{mg.setsPerWeek.toFixed(1)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-heading flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" /> Personal Bests</CardTitle></CardHeader>
        <CardContent>
          <Select value={selectedExerciseId} onValueChange={setSelectedExerciseId}>
            <SelectTrigger className="h-10 mb-3"><SelectValue placeholder="Select exercise" /></SelectTrigger>
            <SelectContent position="popper" className="z-50 max-h-60">{exercises.map((ex) => <SelectItem key={ex.id} value={ex.id}>{ex.name}</SelectItem>)}</SelectContent>
          </Select>
          {personalBests.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No completed sets for this exercise.</p> : (
            <div className="space-y-2">
              {personalBests.map((pb) => (
                <div key={pb.reps} className="flex items-center justify-between rounded-lg bg-secondary px-4 py-3">
                  <span className="text-sm"><span className="font-bold text-primary">{pb.reps}</span><span className="text-muted-foreground"> rep{pb.reps !== 1 ? "s" : ""}</span></span>
                  <span className="font-heading font-bold text-lg">{pb.weight} kg</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
