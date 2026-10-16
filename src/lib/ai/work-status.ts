// The worker statuses shown in chat. Each maps to a real backend operation — never simulated.
// "THINKING" is always the first status of a task (the server emits it first); the rest appear only
// when the matching operation actually runs.
import type { JobStatus } from "@/lib/builder/statuses";
import type { TaskStage } from "@/lib/ai/task-events";

/** The only worker-status labels a chat reply may show. */
export const WORK_STATES = [
  "THINKING", "RETRIEVING", "REASONING", "SEARCHING", "READING", "ANALYZING", "PLANNING", "WRITING", "GENERATING",
  "EXECUTING", "VALIDATING", "CORRECTING", "FINALIZING", "WAITING", "COMPLETED", "FAILED", "CANCELLED",
] as const;
export type WorkState = (typeof WORK_STATES)[number];

/** Every streamed task stage, folded into one worker status (null = never shown). */
const STAGE_STATE: Record<TaskStage, WorkState | null> = {
  thinking: "THINKING",
  understanding_request: "THINKING",
  retrieving_context: "RETRIEVING",
  planning: "PLANNING",
  writing: "WRITING",
  analyzing_requirements: "ANALYZING",
  reasoning: "REASONING",
  searching_web: "SEARCHING",
  reading_sources: "READING",
  gathering_information: "RETRIEVING",
  comparing_sources: "ANALYZING",
  fact_checking: "VALIDATING",
  extracting_information: "READING",
  processing: "EXECUTING",
  analyzing_files: "ANALYZING",
  processing_data: "ANALYZING",
  calculating: "EXECUTING",
  executing_code: "EXECUTING",
  running_tests: "VALIDATING",
  generating_file: "GENERATING",
  converting_file: "GENERATING",
  reviewing_answer: "VALIDATING",
  verifying_accuracy: "VALIDATING",
  checking_completeness: "VALIDATING",
  validating_requirements: "VALIDATING",
  detecting_issues: "VALIDATING",
  fixing_issues: "CORRECTING",
  retrying: "CORRECTING",
  building_output: "GENERATING",
  preparing_output: "FINALIZING",
  finalizing: "FINALIZING",
  switching_provider: null, // backend-only routing
  failed: "FAILED",
  cancelled: "CANCELLED",
};

/** Every job status, folded into one worker status (absent = terminal; the job card shows its own outcome). */
const JOB_STATE: Partial<Record<JobStatus, WorkState>> = {
  queued: "WAITING",
  dispatched: "WAITING",
  running: "EXECUTING",
  thinking: "THINKING",
  planning: "PLANNING",
  analyzing: "ANALYZING",
  inspecting: "READING",
  extracting: "READING",
  scanning: "ANALYZING",
  indexing: "EXECUTING",
  generating: "GENERATING",
  writing_files: "WRITING",
  setting_up: "EXECUTING",
  validating: "VALIDATING",
  running_checks: "VALIDATING",
  debugging: "CORRECTING",
  fixing: "CORRECTING",
  compressing: "GENERATING",
  packaging: "GENERATING",
  verifying: "VALIDATING",
  uploading: "FINALIZING",
  downloading: "RETRIEVING",
  processing: "EXECUTING",
  saving: "FINALIZING",
  retrying: "CORRECTING",
  writing_content: "WRITING",
  creating_document: "GENERATING",
  converting_file: "GENERATING",
  validating_output: "VALIDATING",
  saving_file: "FINALIZING",
};

/** Worker status for a streamed task stage; null when it must not appear in the UI. */
export function workStateForStage(stage: TaskStage): WorkState | null {
  return STAGE_STATE[stage] ?? null;
}

/** Worker status for a backend job status. */
export function workStateForJob(status: JobStatus): WorkState | null {
  return JOB_STATE[status] ?? null;
}

/** Display form: first letter capital, rest lowercase ("THINKING" → "Thinking"). */
export function workStateLabel(state: WorkState | null | undefined): string | undefined {
  return state ? state.charAt(0) + state.slice(1).toLowerCase() : undefined;
}

/** A completed reply's persistent activity record: real elapsed seconds plus what actually ran. */
export type ActivitySummary = { seconds: number; steps: string[] };

/**
 * Folds a reply's recorded task stages into a display history: hidden stages dropped,
 * consecutive duplicates merged, labels in display form. Returns null when nothing real ran —
 * the UI shows no activity row rather than a fabricated one. Seconds come from the caller's
 * real measurement, never estimated here.
 */
export function activitySummary(stages: TaskStage[], seconds: number): ActivitySummary | null {
  const steps: string[] = [];
  for (const stage of stages) {
    const label = workStateLabel(workStateForStage(stage));
    if (!label || label === "Completed") continue;
    if (steps[steps.length - 1] !== label) steps.push(label);
  }
  if (!steps.length) return null;
  return { seconds: Math.max(0, Math.round(seconds)), steps };
}
