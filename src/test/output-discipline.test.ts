// Output Control & Response Discipline (Task 2): the rules are part of every mode's system prompt,
// and file-only requests route to file delivery rather than a written answer.
import { describe, expect, it } from "vitest";
import { systemPromptFor, OUTPUT_DISCIPLINE } from "@/lib/ai/prompts.server";
import { routeRequest } from "@/lib/ai/request-route";

describe("output discipline rules", () => {
  it("requires following requested scope, format, language, structure and detail", () => {
    expect(OUTPUT_DISCIPLINE).toMatch(/scope, format, language, structure and level of detail exactly/);
  });
  it("forbids unrequested additions", () => {
    expect(OUTPUT_DISCIPLINE).toMatch(/Do not add unrequested explanations, alternative versions, summaries, suggestions/);
  });
  it("forbids repeating file contents in chat unless both were requested", () => {
    expect(OUTPUT_DISCIPLINE).toMatch(/file or artifact only, deliver the file with one brief confirmation line; do not repeat the content/);
    expect(OUTPUT_DISCIPLINE).toMatch(/explicitly asked for both the file and its contents, provide both/);
  });
  it("limits clarifying questions to essential missing information", () => {
    expect(OUTPUT_DISCIPLINE).toMatch(/clarifying question only when essential information is missing/);
  });
  it("requires honest, brief errors", () => {
    expect(OUTPUT_DISCIPLINE).toMatch(/state the real reason briefly and honestly/);
  });
});

describe("applied in every mode", () => {
  it.each(["default", "deep", "research", "coding"] as const)("includes the rules in %s mode", (executionMode) => {
    expect(systemPromptFor({ executionMode } as any)).toContain(OUTPUT_DISCIPLINE);
  });
});

describe("file-only requests go to file delivery, not a written repeat", () => {
  it("create a PDF of the story → file route", () => {
    expect(routeRequest("Create a PDF of the story")).toEqual({ kind: "file", format: "pdf" });
  });
  it("save this as a txt file → file route", () => {
    expect(routeRequest("save this as a txt file").kind).toBe("file");
  });
  it("plain questions stay written answers", () => {
    expect(routeRequest("What is the capital of France?").kind).not.toBe("file");
  });
});
