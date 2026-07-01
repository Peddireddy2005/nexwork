import { describe, it, expect } from "vitest";
import { addOptimistic, mergeHistory, parseDevice, removeMessage, sortByCreated, upsertRealtimeMessage } from "./messageSync";

const mk = (id, content, created_at, user_id = "u1") => ({ id, content, created_at, user_id });

describe("messageSync.upsertRealtimeMessage", () => {
  it("dedupes when the same server id arrives twice (rapid realtime duplicate)", () => {
    const a = mk("s1", "hi", "2026-06-03T10:00:00.000Z");
    let list = [];
    list = upsertRealtimeMessage(list, a);
    list = upsertRealtimeMessage(list, a);
    list = upsertRealtimeMessage(list, a);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("s1");
  });

  it("replaces optimistic temp with server-confirmed message of same content", () => {
    const temp = mk("temp-123", "hello", "2026-06-03T10:00:00.000Z");
    const server = mk("s1", "hello", "2026-06-03T10:00:00.500Z");
    let list = addOptimistic([], temp);
    list = upsertRealtimeMessage(list, server);
    expect(list.map((m) => m.id)).toEqual(["s1"]);
  });

  it("keeps ordering when messages arrive out of order", () => {
    const m1 = mk("s1", "a", "2026-06-03T10:00:00.000Z");
    const m2 = mk("s2", "b", "2026-06-03T10:00:01.000Z");
    const m3 = mk("s3", "c", "2026-06-03T10:00:02.000Z");
    let list = [];
    list = upsertRealtimeMessage(list, m3);
    list = upsertRealtimeMessage(list, m1);
    list = upsertRealtimeMessage(list, m2);
    expect(list.map((m) => m.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("handles rapid resends of distinct optimistic messages without losing any", () => {
    let list = [];
    for (let i = 0; i < 5; i++) {
      list = addOptimistic(list, mk(`temp-${i}`, `m${i}`, `2026-06-03T10:00:0${i}.000Z`));
    }
    [3, 0, 4, 2, 1].forEach((i) => {
      list = upsertRealtimeMessage(list, mk(`s${i}`, `m${i}`, `2026-06-03T10:00:0${i}.500Z`));
    });
    expect(list).toHaveLength(5);
    expect(list.every((m) => !m.id.startsWith("temp-"))).toBe(true);
    expect(list.map((m) => m.content)).toEqual(["m0", "m1", "m2", "m3", "m4"]);
  });
});

describe("messageSync.mergeHistory (network drop recovery)", () => {
  it("preserves pending optimistic temps when re-fetching history after reconnect", () => {
    const history = [mk("s1", "old1", "2026-06-03T09:00:00.000Z"), mk("s2", "old2", "2026-06-03T09:00:01.000Z")];
    const pending = [mk("temp-x", "sent-during-outage", "2026-06-03T09:00:02.000Z")];
    const merged = mergeHistory(pending, history);
    expect(merged.map((m) => m.id)).toEqual(["s1", "s2", "temp-x"]);
  });

  it("drops optimistic temp if server already has the same content (avoid duplicate after reconnect)", () => {
    const pending = [mk("temp-x", "reconnected", "2026-06-03T09:00:02.000Z")];
    const history = [mk("s1", "reconnected", "2026-06-03T09:00:02.100Z")];
    const merged = mergeHistory(pending, history);
    expect(merged.map((m) => m.id)).toEqual(["s1"]);
  });

  it("repeated history re-fetches are idempotent", () => {
    const history = [mk("s1", "a", "2026-06-03T09:00:00.000Z"), mk("s2", "b", "2026-06-03T09:00:01.000Z")];
    let list = mergeHistory([], history);
    list = mergeHistory(list, history);
    list = mergeHistory(list, history);
    expect(list).toHaveLength(2);
    expect(list.map((m) => m.id)).toEqual(["s1", "s2"]);
  });
});

describe("messageSync utility", () => {
  it("removeMessage removes by id and is a no-op when missing", () => {
    const list = [mk("s1", "a", "2026-06-03T09:00:00.000Z")];
    expect(removeMessage(list, "nope")).toEqual(list);
    expect(removeMessage(list, "s1")).toEqual([]);
  });

  it("sortByCreated is stable and ascending", () => {
    const out = sortByCreated([mk("b", "b", "2026-06-03T10:00:01.000Z"), mk("a", "a", "2026-06-03T10:00:00.000Z")]);
    expect(out.map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("parseDevice", () => {
  it("detects desktop Chrome on Windows", () => {
    const d = parseDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36");
    expect(d.type).toBe("Desktop");
    expect(d.os).toBe("Windows");
    expect(d.browser).toBe("Chrome");
  });
  it("detects iPhone Safari as Mobile / iOS", () => {
    const d = parseDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1 Mobile/15E148 Safari/604.1");
    expect(d.type).toBe("Mobile");
    expect(d.os).toBe("iOS");
    expect(d.browser).toBe("Safari");
  });
  it("detects iPad as Tablet", () => {
    const d = parseDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1 Mobile/15E148 Safari/604.1");
    expect(d.type).toBe("Tablet");
  });
});
