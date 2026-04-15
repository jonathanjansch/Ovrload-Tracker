import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_app/stopwatch")({
  component: StopwatchPage,
});

function StopwatchPage() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  const start = useCallback(() => {
    startTimeRef.current = Date.now() - elapsed;
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 50);
    setRunning(true);
  }, [elapsed]);

  const pause = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    setElapsed(0);
  }, []);

  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  const centis = Math.floor((elapsed % 1000) / 10);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-4 pb-24">
      <h1 className="text-lg font-semibold text-foreground">Stopwatch</h1>

      <div className="font-mono text-6xl font-bold tracking-tight text-foreground sm:text-7xl">
        {hours > 0 && <span>{pad(hours)}:</span>}
        <span>{pad(minutes)}</span>
        <span className="text-muted-foreground">:</span>
        <span>{pad(seconds)}</span>
        <span className="text-muted-foreground text-4xl sm:text-5xl">.{pad(centis)}</span>
      </div>

      <div className="flex items-center gap-4">
        {running ? (
          <Button
            onClick={pause}
            size="lg"
            variant="outline"
            className="h-14 w-32 text-base"
          >
            <Pause className="mr-2 h-5 w-5" />
            Pause
          </Button>
        ) : (
          <button
            onClick={start}
            className="inline-flex h-14 w-32 items-center justify-center rounded-md bg-gradient-to-r from-[#FAC83E] to-[#EE732E] text-base font-semibold text-black shadow hover:opacity-90 transition-opacity"
          >
            <Play className="mr-2 h-5 w-5" />
            Start
          </button>
        )}

        {elapsed > 0 && !running && (
          <Button
            onClick={reset}
            size="lg"
            variant="secondary"
            className="h-14 w-32 text-base"
          >
            <RotateCcw className="mr-2 h-5 w-5" />
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
