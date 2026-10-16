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
