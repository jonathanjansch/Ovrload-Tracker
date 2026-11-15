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
import { Plus, Search, Dumbbell, Lock, Trash2 } from "lucide-react";

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
  const [editingId, setEditingId] = useState<string | null>(null);

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

  const openForCreate = () => {
    setEditingId(null);
    setNewName("");
    setNewGroupId("");
    setDialogOpen(true);
  };

  const openForEdit = (e: Tables<"exercises">) => {
    if (e.is_system) return;
    setEditingId(e.id);
    setNewName(e.name);
    setNewGroupId(e.muscle_group_id ?? "");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setNewName("");
    setNewGroupId("");
  };

  const saveExercise = async () => {
    if (!user || !newName.trim()) return;
    setSaving(true);
    const fields = { name: newName.trim(), muscle_group_id: newGroupId || null };
    const { error } = editingId
      ? await supabase.from("exercises").update(fields).eq("id", editingId)
      : await supabase.from("exercises").insert({ ...fields, user_id: user.id, is_system: false });
    setSaving(false);
    if (error) { toast.error(editingId ? "Failed to update exercise" : "Failed to create exercise"); return; }
    toast.success(editingId ? "Exercise updated!" : "Exercise added!");
    closeDialog();
    fetchExercises();
  };

  const deleteExercise = async () => {
    if (!editingId) return;
    if (!confirm("Delete this exercise? It will also be removed from any templates.")) return;
    setSaving(true);
    // Discarded workouts used to be kept as "cancelled"; they are never shown, so clear them
    // so they don't block deleting an exercise
    if (user) await supabase.from("workout_sessions").delete().eq("user_id", user.id).eq("status", "cancelled");
    const { error } = await supabase.from("exercises").delete().eq("id", editingId);
    setSaving(false);
    if (error) {
      // 23503 = still referenced by logged workouts; deleting would break your history
      toast.error(
        error.code === "23503"
          ? "This exercise is in your workout history, so it can't be deleted. You can rename it instead."
          : "Failed to delete exercise"
      );
      return;
    }
    toast.success("Exercise deleted");
    closeDialog();
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
        <Button onClick={openForCreate} size="icon" className="gradient-accent text-primary-foreground h-10 w-10">
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
            <Card
              key={e.id}
              onClick={() => openForEdit(e)}
              className={`bg-card border-border ${e.is_system ? "" : "cursor-pointer transition-colors hover:border-primary/40 active:bg-secondary"}`}
            >
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

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">{editingId ? "Edit Exercise" : "New Exercise"}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {editingId ? "Rename it, change the muscle group, or delete it." : "Add a custom exercise to your library."}
            </DialogDescription>
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
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button onClick={saveExercise} disabled={saving || !newName.trim()} className="gradient-accent text-primary-foreground w-full h-12">
              {saving ? "Saving..." : editingId ? "Save Changes" : "Add Exercise"}
            </Button>
            {editingId && (
              <Button onClick={deleteExercise} disabled={saving} variant="ghost" className="w-full h-10 text-destructive hover:text-destructive gap-2">
                <Trash2 className="h-4 w-4" /> Delete Exercise
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
