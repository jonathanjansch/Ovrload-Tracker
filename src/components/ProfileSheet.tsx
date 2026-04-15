import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LogOut, Dumbbell, Weight, CalendarDays } from "lucide-react";

interface ProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onSignOut: () => void;
}

export function ProfileSheet({ open, onOpenChange, user, onSignOut }: ProfileSheetProps) {
  const [totalWorkouts, setTotalWorkouts] = useState<number>(0);
  const [totalVolume, setTotalVolume] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);

    const fetchStats = async () => {
      const [countRes, volumeRes] = await Promise.all([
        supabase
          .from("workout_sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "completed"),
        supabase
          .from("workout_sets")
          .select("weight, reps, session_exercise_id, workout_session_exercises!inner(session_id, workout_sessions!inner(user_id, status))")
          .eq("completed", true),
      ]);

      setTotalWorkouts(countRes.count ?? 0);

      let vol = 0;
      if (volumeRes.data) {
        for (const s of volumeRes.data as any[]) {
          const ws = s.workout_session_exercises?.workout_sessions;
          if (ws?.user_id === user.id && ws?.status === "completed") {
            vol += (s.weight ?? 0) * (s.reps ?? 0);
          }
        }
      }
      setTotalVolume(vol);
      setLoading(false);
    };

    fetchStats();
  }, [open, user]);

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "—";

  const formatVolume = (v: number) => {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k kg`;
    return `${v} kg`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-10">
        <SheetHeader className="text-left mb-6">
          <SheetTitle className="font-heading text-lg">My Profile</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            {user?.email}
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="flex flex-col items-center gap-1 rounded-xl bg-secondary p-3">
            <Dumbbell className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold font-heading">
              {loading ? "…" : totalWorkouts}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Workouts</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-xl bg-secondary p-3">
            <Weight className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold font-heading">
              {loading ? "…" : formatVolume(totalVolume)}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Volume</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-xl bg-secondary p-3">
            <CalendarDays className="h-5 w-5 text-primary" />
            <span className="text-sm font-bold font-heading">
              {memberSince}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Member</span>
          </div>
        </div>

        <Button
          onClick={() => { onSignOut(); onOpenChange(false); }}
          variant="destructive"
          className="w-full gap-2"
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </Button>
      </SheetContent>
    </Sheet>
  );
}
