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

import { workStateLabel } from "@/lib/ai/work-status";
describe("status display", () => {
  it("shows sentence case", () => { expect(workStateLabel("THINKING")).toBe("Thinking"); expect(workStateLabel("REASONING")).toBe("Reasoning"); });
});

import { activitySummary } from "@/lib/ai/work-status";

describe("activitySummary (Task 4 activity history)", () => {
  it("keeps only stages that really ran, in display form", () => {
    const a = activitySummary(["thinking", "searching_web", "writing", "finalizing"] as any, 42.4);
    expect(a).toEqual({ seconds: 42, steps: ["Thinking", "Searching", "Writing", "Finalizing"] });
  });
  it("merges consecutive duplicates and drops hidden stages", () => {
    const a = activitySummary(["thinking", "thinking", "switching_provider", "validating_requirements", "reviewing_answer"] as any, 5);
    expect(a!.steps).toEqual(["Thinking", "Validating"]);
  });
  it("returns null when nothing displayable ran — never fabricates activity", () => {
    expect(activitySummary(["switching_provider"] as any, 3)).toBeNull();
    expect(activitySummary([], 3)).toBeNull();
  });
  it("uses the real measured seconds, never negative", () => {
    expect(activitySummary(["thinking"] as any, -2)!.seconds).toBe(0);
    expect(activitySummary(["thinking"] as any, 7.6)!.seconds).toBe(8);
  });
});
