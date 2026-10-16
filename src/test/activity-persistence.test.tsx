// Activity history must persist across reloads: buildMetadata writes it, rowsToConversation restores it.
import { describe, expect, it } from "vitest";
import { buildMetadata, rowsToConversation } from "@/context/ChatHistoryContext";

describe("activity record persistence", () => {
  it("saves real seconds and steps into message metadata", () => {
    const meta = buildMetadata({ id: "1", role: "assistant", content: "Hi", timestamp: new Date(), activity: { seconds: 12, steps: ["Thinking", "Searching", "Writing"] } } as any);
    expect(meta.activity).toEqual({ seconds: 12, steps: ["Thinking", "Searching", "Writing"] });
  });
  it("restores the activity record from a saved row", () => {
    const rows = [{
      id: "r1", role: "assistant", content: "Done.", created_at: new Date().toISOString(),
      metadata: { activity: { seconds: 12, steps: ["Thinking", "Writing"] } },
    }];
    const [msg] = rowsToConversation(rows);
    expect(msg.activity).toEqual({ seconds: 12, steps: ["Thinking", "Writing"] });
  });
  it("drops malformed or empty activity records instead of fabricating", () => {
    const rows = [{ id: "r1", role: "assistant", content: "x", created_at: new Date().toISOString(), metadata: { activity: { seconds: "many", steps: [] } } }];
    expect(rowsToConversation(rows)[0].activity).toBeUndefined();
  });
  it("round-trips through save and load unchanged", () => {
    const original = { seconds: 7, steps: ["Thinking", "Validating"] };
    const meta = buildMetadata({ id: "1", role: "assistant", content: "x", timestamp: new Date(), activity: original } as any);
    const [msg] = rowsToConversation([{ id: "r1", role: "assistant", content: "x", created_at: new Date().toISOString(), metadata: meta }]);
    expect(msg.activity).toEqual(original);
  });
});
