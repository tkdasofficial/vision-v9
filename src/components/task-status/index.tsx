import { useEffect, useState } from "react";

/**
 * Work-state line: plain text only — no card, no border, no background, no leading icon.
 * The label always comes from a real backend status; the seconds are real elapsed time.
 */
export default function TaskStatus({ label, startedAt, endedAt, failed = false, cancelled = false }: {
  label: string;
  startedAt: string | Date;
  endedAt?: string;
  failed?: boolean;
  cancelled?: boolean;
}) {
  const [dots, setDots] = useState(0);
  const live = !endedAt && !failed && !cancelled;
  useEffect(() => {
    if (!live) return;
    const dotsTimer = window.setInterval(() => setDots((prev) => (prev + 1) % 4), 400);
    return () => { window.clearInterval(dotsTimer); };
  }, [live]);
  const seconds = Math.max(0, Math.round((Date.parse(endedAt ?? "") - new Date(startedAt).getTime()) / 1000));
  const text = failed ? "Couldn't finish" : cancelled ? "Cancelled" : label;
  return (
    <div role="status" aria-live="polite" className="flex w-full items-baseline gap-2 py-1 text-sm text-muted-foreground">
      <span key={label} className="min-w-0 break-words animate-fade-in font-medium text-foreground">{text}{live && <span className="text-muted-foreground">{".".repeat(dots)}</span>}</span>
      {/* Elapsed time only appears once the task is finished — never while it is running. */}
      {!live && <span className="shrink-0 tabular-nums opacity-70">{seconds}s</span>}
    </div>
  );
}
