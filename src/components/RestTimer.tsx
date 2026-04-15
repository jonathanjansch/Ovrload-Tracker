import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const PRESETS = [60, 90, 120, 180];

export function RestTimer() {
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [initialTime, setInitialTime] = useState(90);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s <= 1) {
            setIsRunning(false);
            try { navigator.vibrate?.(500); } catch {}
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

  const startTimer = useCallback((time: number) => {
    setInitialTime(time);
    setSeconds(time);
    setIsRunning(true);
  }, []);

  const reset = () => { setIsRunning(false); setSeconds(0); };

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const progress = initialTime > 0 ? (seconds / initialTime) * 100 : 0;

  return (
    <div className="mx-auto max-w-lg px-4 py-3">
      <div className="rounded-xl bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-heading text-sm font-semibold">Rest Timer</span>
          {isRunning && (
            <button onClick={reset} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {isRunning || seconds > 0 ? (
          <div className="text-center">
            <div className="relative w-full h-2 rounded-full bg-secondary mb-3 overflow-hidden">
              <div className="h-full gradient-accent transition-all rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <span className="font-heading text-3xl font-bold tabular-nums">
              {mins}:{secs.toString().padStart(2, "0")}
            </span>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map((p) => (
              <Button
                key={p}
                onClick={() => startTimer(p)}
                variant="secondary"
                className="h-10 min-w-[60px] font-medium"
              >
                {p >= 60 ? `${Math.floor(p / 60)}:${(p % 60).toString().padStart(2, "0")}` : `${p}s`}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
