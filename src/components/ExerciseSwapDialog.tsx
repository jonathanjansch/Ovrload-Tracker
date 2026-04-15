import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Dumbbell } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSwap: (exerciseId: string, exerciseName: string, muscleGroupName?: string) => void;
}

export function ExerciseSwapDialog({ open, onClose, onSwap }: Props) {
  const { user } = useAuth();
  const [exercises, setExercises] = useState<(Tables<"exercises"> & { muscle_group_name?: string })[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    // RLS returns system + user exercises
    supabase
      .from("exercises")
      .select("*, muscle_groups(name)")
      .order("name")
      .then(({ data }) => {
        if (data) setExercises(data.map((e: any) => ({ ...e, muscle_group_name: e.muscle_groups?.name })));
      });
  }, [open, user]);

  const filtered = exercises.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-sm max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="font-heading">Swap Exercise</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">Choose a replacement exercise.</DialogDescription>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10" />
        </div>
        <div className="space-y-1 max-h-[50vh] overflow-y-auto">
          {filtered.map((e) => (
            <button
              key={e.id}
              onClick={() => onSwap(e.id, e.name, e.muscle_group_name)}
              className="flex w-full items-center justify-between rounded-lg bg-secondary p-3 text-left hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-2">
                <Dumbbell className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{e.name}</span>
              </div>
              {e.muscle_group_name && <Badge variant="secondary" className="text-[10px]">{e.muscle_group_name}</Badge>}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
