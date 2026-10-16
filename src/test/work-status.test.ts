import { describe, it, expect } from "vitest";
import { WORK_STATES, workStateForJob, workStateForStage } from "@/lib/ai/work-status";
import { STAGE_LABELS, type TaskStage } from "@/lib/ai/task-events";
import { JOB_STATUSES, isTerminal, type JobStatus } from "@/lib/builder/statuses";

describe("chat worker statuses", () => {
  it("uses exactly the 17 agreed statuses", () => {
    expect([...WORK_STATES]).toEqual(["THINKING", "RETRIEVING", "REASONING", "SEARCHING", "READING", "ANALYZING", "PLANNING", "WRITING", "GENERATING", "EXECUTING", "VALIDATING", "CORRECTING", "FINALIZING", "WAITING", "COMPLETED", "FAILED", "CANCELLED"]);
  });

  it("folds every streamed stage into an agreed status and hides provider switching", () => {
    for (const stage of Object.keys(STAGE_LABELS) as TaskStage[]) {
      const state = workStateForStage(stage);
      if (state) expect(WORK_STATES).toContain(state);
    }
    expect(workStateForStage("switching_provider")).toBeNull();
  });

  it("maps real operations to their status", () => {
    expect(workStateForStage("thinking")).toBe("THINKING");
    expect(workStateForStage("retrieving_context")).toBe("RETRIEVING");
    expect(workStateForStage("writing")).toBe("WRITING");
    expect(workStateForStage("reading_sources")).toBe("READING");
    expect(workStateForStage("fixing_issues")).toBe("CORRECTING");
    expect(workStateForStage("generating_file")).toBe("GENERATING");
    expect(workStateForJob("creating_document")).toBe("GENERATING");
    expect(workStateForJob("validating_output")).toBe("VALIDATING");
    expect(workStateForJob("queued")).toBe("WAITING");
  });

  it("never shows a working status for a finished job", () => {
    const terminal = (Object.keys(JOB_STATUSES) as JobStatus[]).filter(isTerminal);
    for (const status of terminal) expect(workStateForJob(status)).toBeNull();
  });
});
