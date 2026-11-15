import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const PRESETS = [60, 90, 120, 180];

// Short beep with the Web Audio API (vibration alone does nothing on iPhone)
function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Audio not available; ignore
  }
}

export function RestTimer() {
  // Count down to a fixed end time so it stays correct if the phone sleeps or the tab is in the background
  const [endAt, setEndAt] = useState<number | null>(null);
  const [initialTime, setInitialTime] = useState(90);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endAt === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= endAt) {
        setEndAt(null);
        try { navigator.vibrate?.(500); } catch { /* not supported */ }
        beep();
      }
    }, 250);
    return () => clearInterval(id);
  }, [endAt]);

  const startTimer = useCallback((time: number) => {
    setInitialTime(time);
    setNow(Date.now());
    setEndAt(Date.now() + time * 1000);
  }, []);

  const addTime = (s: number) => {
    if (endAt === null) return;
    setInitialTime((i) => i + s);
    setEndAt(endAt + s * 1000);
  };

  const reset = () => setEndAt(null);

  const seconds = endAt === null ? 0 : Math.max(0, Math.ceil((endAt - now) / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const progress = initialTime > 0 ? (seconds / initialTime) * 100 : 0;

  return (
    <div className="mx-auto max-w-lg pt-3">
      <div className="rounded-xl bg-card border border-border p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-heading text-sm font-semibold">Rest Timer</span>
          {endAt !== null && (
            <button onClick={reset} className="text-muted-foreground hover:text-foreground" aria-label="Stop timer">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {endAt !== null ? (
          <div className="text-center">
            <div className="relative w-full h-2 rounded-full bg-secondary mb-2 overflow-hidden">
              <div className="h-full gradient-accent transition-all rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex items-center justify-center gap-4">
              <span className="font-heading text-3xl font-bold tabular-nums">
                {mins}:{secs.toString().padStart(2, "0")}
              </span>
              <Button onClick={() => addTime(30)} variant="secondary" className="h-9 px-3 text-sm">+30s</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((p) => (
              <Button key={p} onClick={() => startTimer(p)} variant="secondary" className="h-10 font-medium">
                {`${Math.floor(p / 60)}:${(p % 60).toString().padStart(2, "0")}`}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
