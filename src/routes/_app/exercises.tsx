import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Dumbbell, Lock } from "lucide-react";

export const Route = createFileRoute("/_app/exercises")({
  component: ExercisesPage,
});

function ExercisesPage() {
  const { user } = useAuth();
  const [exercises, setExercises] = useState<(Tables<"exercises"> & { muscle_group_name?: string })[]>([]);
  const [muscleGroups, setMuscleGroups] = useState<Tables<"muscle_groups">[]>([]);
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchExercises = async () => {
    if (!user) return;
    // RLS now returns system exercises + user's own exercises
    const { data } = await supabase
      .from("exercises")
      .select("*, muscle_groups(name)")
      .order("name");
    if (data) {
      setExercises(
        data.map((e: any) => ({ ...e, muscle_group_name: e.muscle_groups?.name }))
      );
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchExercises();
    supabase.from("muscle_groups").select("*").order("name").then(({ data }) => {
      if (data) setMuscleGroups(data);
    });
  }, [user]);

  const createExercise = async () => {
    if (!user || !newName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("exercises").insert({
      user_id: user.id,
      name: newName.trim(),
      muscle_group_id: newGroupId || null,
      is_system: false,
    });
    if (error) { toast.error("Failed to create exercise"); setSaving(false); return; }
    toast.success("Exercise added!");
    setNewName("");
    setNewGroupId("");
    setDialogOpen(false);
    setSaving(false);
    fetchExercises();
  };

  const filtered = exercises.filter((e) => {
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase());
    const matchesGroup = filterGroup === "all" || e.muscle_group_id === filterGroup;
    return matchesSearch && matchesGroup;
  });

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-heading text-xl font-bold">Exercises</h1>
        <Button onClick={() => setDialogOpen(true)} size="icon" className="gradient-accent text-primary-foreground h-10 w-10">
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <Select value={filterGroup} onValueChange={setFilterGroup}>
          <SelectTrigger className="w-[130px] h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {muscleGroups.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Dumbbell className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-muted-foreground text-sm">
              {exercises.length === 0 ? "Add your first exercise to get started." : "No exercises match your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <Card key={e.id} className="bg-card border-border">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{e.name}</span>
                  {e.is_system && <Lock className="h-3 w-3 text-muted-foreground" />}
                </div>
                {e.muscle_group_name && (
                  <Badge variant="secondary" className="text-xs">{e.muscle_group_name}</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">New Exercise</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Add a custom exercise to your library.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Bench Press"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label>Muscle Group</Label>
              <Select value={newGroupId} onValueChange={setNewGroupId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select muscle group" />
                </SelectTrigger>
                <SelectContent>
                  {muscleGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createExercise} disabled={saving || !newName.trim()} className="gradient-accent text-primary-foreground w-full h-12">
              {saving ? "Saving..." : "Add Exercise"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
