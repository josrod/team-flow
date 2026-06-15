import { describe, it, expect } from "vitest";
import {
  validateHandoverTopicIds,
  HANDOVER_TOPIC_MESSAGES,
} from "@/lib/handoverValidation";

const catalog = ["topic-1", "topic-2", "topic-3"];

describe("validateHandoverTopicIds", () => {
  it("rejects non-array values", () => {
    const r = validateHandoverTopicIds("topic-1", catalog);
    expect(r.valid).toBe(false);
    expect(r.error).toBe("not-array");
    expect(r.message).toBe(HANDOVER_TOPIC_MESSAGES.notArray);
  });

  it("rejects empty arrays", () => {
    const r = validateHandoverTopicIds([], catalog);
    expect(r.valid).toBe(false);
    expect(r.error).toBe("empty");
    expect(r.message).toBe(HANDOVER_TOPIC_MESSAGES.empty);
  });

  it("rejects arrays with non-string or empty entries", () => {
    expect(validateHandoverTopicIds(["topic-1", ""], catalog).error).toBe(
      "not-array",
    );
    expect(
      validateHandoverTopicIds(["topic-1", 42 as unknown as string], catalog)
        .error,
    ).toBe("not-array");
  });

  it("rejects duplicates", () => {
    const r = validateHandoverTopicIds(["topic-1", "topic-1"], catalog);
    expect(r.valid).toBe(false);
    expect(r.error).toBe("duplicates");
  });

  it("rejects unknown IDs and reports which", () => {
    const r = validateHandoverTopicIds(["topic-1", "ghost"], catalog);
    expect(r.valid).toBe(false);
    expect(r.error).toBe("unknown");
    expect(r.unknownIds).toEqual(["ghost"]);
  });

  it("accepts a non-empty unique subset of valid topics", () => {
    expect(validateHandoverTopicIds(["topic-1"], catalog).valid).toBe(true);
    expect(
      validateHandoverTopicIds(["topic-1", "topic-3"], catalog).valid,
    ).toBe(true);
  });
});
