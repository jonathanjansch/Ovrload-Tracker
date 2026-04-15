import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, LayoutTemplate, ChevronUp, ChevronDown, Trash2, X, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/templates")({
  component: TemplatesPage,
});

type TemplateWithCount = Tables<"workout_templates"> & { exercise_count: number };
type ExerciseEntry = {
  exercise_id: string;
  exercise_name: string;
  muscle_group_name?: string;
  sets_count: number;
  sort_order: number;
};

function TemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TemplateWithCount[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [entries, setEntries] = useState<ExerciseEntry[]>([]);
  const [exercises, setExercises] = useState<(Tables<"exercises"> & { muscle_group_name?: string })[]>([]);
  const [selectedExercise, setSelectedExercise] = useState("");
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit mode state
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [originalName, setOriginalName] = useState("");
  const [originalEntries, setOriginalEntries] = useState<ExerciseEntry[]>([]);

  const fetchTemplates = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("workout_templates")
      .select("*, template_exercises(id)")
      .eq("user_id", user.id)
      .order("name");
    if (error) { toast.error("Failed to load templates"); return; }
    if (data) {
      setTemplates(data.map((t: any) => ({ ...t, exercise_count: t.template_exercises?.length || 0 })));
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchTemplates();
    supabase.from("exercises").select("*, muscle_groups(name)").order("name").then(({ data }) => {
      if (data) setExercises(data.map((e: any) => ({ ...e, muscle_group_name: e.muscle_groups?.name })));
    });
  }, [user]);

  const resetDialog = () => {
    setEditingTemplateId(null);
    setTemplateName("");
    setEntries([]);
    setOriginalName("");
    setOriginalEntries([]);
    setSelectedExercise("");
  };

  const isDirty = () => {
    if (templateName !== originalName) return true;
    return JSON.stringify(entries) !== JSON.stringify(originalEntries);
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && isDirty()) {
      if (!confirm("Discard unsaved changes?")) return;
    }
    if (!open) resetDialog();
    setDialogOpen(open);
  };

  const openForCreate = () => {
    resetDialog();
    setDialogOpen(true);
  };

  const openForEdit = async (id: string, name: string) => {
    resetDialog();
    setEditingTemplateId(id);
    setTemplateName(name);
    setOriginalName(name);

    const { data, error } = await supabase
      .from("template_exercises")
      .select("exercise_id, sort_order, sets_count, exercises(name, muscle_groups(name))")
      .eq("template_id", id)
      .order("sort_order");

    if (error) { toast.error("Failed to load template exercises"); return; }

    const mapped: ExerciseEntry[] = (data || []).map((te: any) => ({
      exercise_id: te.exercise_id,
      exercise_name: te.exercises?.name || "Unknown",
      muscle_group_name: te.exercises?.muscle_groups?.name,
      sets_count: te.sets_count,
      sort_order: te.sort_order,
    }));

    setEntries(mapped);
    setOriginalEntries(mapped);
    setDialogOpen(true);
  };

  const addExercise = () => {
    const ex = exercises.find((e) => e.id === selectedExercise);
    if (!ex || entries.some((e) => e.exercise_id === ex.id)) return;
    setEntries([...entries, { exercise_id: ex.id, exercise_name: ex.name, muscle_group_name: ex.muscle_group_name, sets_count: 3, sort_order: entries.length }]);
    setSelectedExercise("");
  };

  const moveEntry = (index: number, dir: -1 | 1) => {
    const arr = [...entries];
    const target = index + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    arr.forEach((e, i) => (e.sort_order = i));
    setEntries(arr);
  };

  const removeEntry = (index: number) => setEntries(entries.filter((_, i) => i !== index));

  const updateSets = (index: number, count: number) => {
    const arr = [...entries];
    arr[index].sets_count = Math.max(1, Math.min(10, count));
    setEntries(arr);
  };

  const saveTemplate = async () => {
    if (!user || !templateName.trim() || entries.length === 0) return;
    setSaving(true);

    if (editingTemplateId) {
      // Update existing template
      const { error: nameErr } = await supabase
        .from("workout_templates")
        .update({ name: templateName.trim() })
        .eq("id", editingTemplateId);
      if (nameErr) { toast.error("Failed to update template name"); setSaving(false); return; }

      // Delete old exercises and re-insert
      const { error: delErr } = await supabase
        .from("template_exercises")
        .delete()
        .eq("template_id", editingTemplateId);
      if (delErr) { toast.error("Failed to update exercises"); setSaving(false); return; }

      const { error: insErr } = await supabase.from("template_exercises").insert(
        entries.map((e, i) => ({ template_id: editingTemplateId, exercise_id: e.exercise_id, sort_order: i, sets_count: e.sets_count }))
      );
      if (insErr) { toast.error("Failed to save exercises"); setSaving(false); return; }

      toast.success("Template updated!");
    } else {
      // Create new template
      const { data: template, error: tErr } = await supabase.from("workout_templates").insert({ user_id: user.id, name: templateName.trim() }).select("id").single();
      if (tErr || !template) { toast.error("Failed to create template"); setSaving(false); return; }

      const { error: teErr } = await supabase.from("template_exercises").insert(
        entries.map((e, i) => ({ template_id: template.id, exercise_id: e.exercise_id, sort_order: i, sets_count: e.sets_count }))
      );
      if (teErr) { toast.error("Failed to save template exercises"); setSaving(false); return; }

      toast.success("Template created!");
    }

    resetDialog();
    setDialogOpen(false);
    setSaving(false);
    fetchTemplates();
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    const { error } = await supabase.from("workout_templates").delete().eq("id", id);
    if (error) { toast.error("Failed to delete template"); return; }
    toast.success("Template deleted");
    fetchTemplates();
  };

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-heading text-xl font-bold">Templates</h1>
        <Button onClick={openForCreate} size="icon" className="gradient-accent text-primary-foreground h-10 w-10">
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <LayoutTemplate className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-muted-foreground text-sm">Create your first workout template.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <Card key={t.id} className="bg-card border-border">
              <CardContent className="flex items-center justify-between p-4">
                <button
                  type="button"
                  className="flex-1 text-left min-w-0"
                  onClick={() => openForEdit(t.id, t.name)}
                >
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.exercise_count} exercises</p>
                </button>
                <button onClick={() => deleteTemplate(t.id)} className="rounded-full p-2 text-muted-foreground hover:text-destructive shrink-0 ml-2">
                  <Trash2 className="h-4 w-4" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="bg-card border-border max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">{editingTemplateId ? "Edit Template" : "New Template"}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">{editingTemplateId ? "Modify exercises and settings." : "Add exercises to your template."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input placeholder="e.g. Push Day" value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="h-12" />
            </div>
            <div className="space-y-2">
              <Label>Add Exercise</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or muscle group..."
                  value={exerciseSearch}
                  onChange={(e) => setExerciseSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                  className="h-12 pl-9"
                />
              </div>
              {searchFocused && (() => {
                const q = exerciseSearch.trim().toLowerCase();
                const filtered = exercises.filter(
                  (e) =>
                    !entries.some((en) => en.exercise_id === e.id) &&
                    (!q ||
                      e.name.toLowerCase().includes(q) ||
                      (e.muscle_group_name || "").toLowerCase().includes(q))
                );
                return filtered.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto rounded-lg border border-border bg-background">
                    {filtered.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-secondary transition-colors"
                        onClick={() => {
                          setEntries([...entries, { exercise_id: e.id, exercise_name: e.name, muscle_group_name: e.muscle_group_name, sets_count: 3, sort_order: entries.length }]);
                          setExerciseSearch("");
                        }}
                      >
                        <span className="font-medium">{e.name}</span>
                        {e.muscle_group_name && <Badge variant="secondary" className="text-[10px] ml-2 shrink-0">{e.muscle_group_name}</Badge>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground px-1">No matching exercises found.</p>
                );
              })()}
            </div>
            {entries.length > 0 && (
              <div className="space-y-2">
                <Label>Exercises ({entries.length})</Label>
                {entries.map((entry, i) => (
                  <div key={entry.exercise_id} className="flex items-center gap-2 rounded-lg bg-secondary p-3">
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveEntry(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                      <button onClick={() => moveEntry(i, 1)} disabled={i === entries.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.exercise_name}</p>
                      {entry.muscle_group_name && <Badge variant="secondary" className="text-[10px] mt-0.5">{entry.muscle_group_name}</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateSets(i, entry.sets_count - 1)} className="h-7 w-7 rounded bg-background text-sm font-bold flex items-center justify-center">-</button>
                      <span className="w-6 text-center text-sm">{entry.sets_count}</span>
                      <button onClick={() => updateSets(i, entry.sets_count + 1)} className="h-7 w-7 rounded bg-background text-sm font-bold flex items-center justify-center">+</button>
                      <span className="text-[10px] text-muted-foreground">sets</span>
                    </div>
                    <button onClick={() => removeEntry(i)} className="text-muted-foreground hover:text-destructive ml-1"><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={saveTemplate} disabled={saving || !templateName.trim() || entries.length === 0} className="gradient-accent text-primary-foreground w-full h-12">
              {saving ? "Saving..." : editingTemplateId ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
