import { describe, it, expect } from "vitest";
import { applySessionPolicy } from "./sessionPolicy";

const mk = (session_id, device_info, last_active_at, user_id = "u1") => ({
  id: `row-${session_id}`,
  user_id,
  session_id,
  device_info,
  last_active_at,
});

describe("applySessionPolicy — single-device mode", () => {
  it("removes every other session for the user", () => {
    const sessions = [mk("cur", "Desktop · Mac", "2026-06-03T10:00:00Z"), mk("old1", "Desktop · Win", "2026-06-03T09:00:00Z"), mk("old2", "Mobile · iOS", "2026-06-02T09:00:00Z")];
    const r = applySessionPolicy({ sessions, currentSessionId: "cur", currentDeviceInfo: "Desktop · Mac", allowMulti: false });
    expect(r.keep.map((s) => s.session_id)).toEqual(["cur"]);
    expect(r.remove.map((s) => s.session_id).sort()).toEqual(["old1", "old2"]);
  });

  it("still revokes a duplicate session on the same device", () => {
    const sessions = [mk("cur", "Desktop · Mac", "2026-06-03T10:00:00Z"), mk("dup", "Desktop · Mac", "2026-06-03T09:59:00Z")];
    const r = applySessionPolicy({ sessions, currentSessionId: "cur", currentDeviceInfo: "Desktop · Mac", allowMulti: false });
    expect(r.keep).toHaveLength(1);
    expect(r.remove.map((s) => s.session_id)).toEqual(["dup"]);
  });
});

describe("applySessionPolicy — multi-device mode", () => {
  it("permits multiple sessions across distinct devices", () => {
    const sessions = [mk("cur", "Desktop · Mac", "2026-06-03T10:00:00Z"), mk("phone", "Mobile · iOS", "2026-06-03T09:30:00Z"), mk("tab", "Tablet · iPadOS", "2026-06-03T08:30:00Z")];
    const r = applySessionPolicy({ sessions, currentSessionId: "cur", currentDeviceInfo: "Desktop · Mac", allowMulti: true });
    expect(r.keep.map((s) => s.session_id).sort()).toEqual(["cur", "phone", "tab"]);
    expect(r.remove).toEqual([]);
  });

  it("still de-duplicates sessions originating from the same device", () => {
    const sessions = [mk("cur", "Desktop · Mac", "2026-06-03T10:00:00Z"), mk("dup-same-device", "Desktop · Mac", "2026-06-03T09:00:00Z"), mk("phone", "Mobile · iOS", "2026-06-03T09:30:00Z")];
    const r = applySessionPolicy({ sessions, currentSessionId: "cur", currentDeviceInfo: "Desktop · Mac", allowMulti: true });
    expect(r.keep.map((s) => s.session_id).sort()).toEqual(["cur", "phone"]);
    expect(r.remove.map((s) => s.session_id)).toEqual(["dup-same-device"]);
  });

  it("keeps the current session for its device even if an older session is more recent on paper", () => {
    const sessions = [mk("cur", "Desktop · Mac", "2026-06-03T08:00:00Z"), mk("ghost", "Desktop · Mac", "2026-06-03T09:59:00Z")];
    const r = applySessionPolicy({ sessions, currentSessionId: "cur", currentDeviceInfo: "Desktop · Mac", allowMulti: true });
    expect(r.keep.map((s) => s.session_id)).toEqual(["cur"]);
    expect(r.remove.map((s) => s.session_id)).toEqual(["ghost"]);
  });

  it('treats missing device_info as a single "unknown" device bucket', () => {
    const sessions = [mk("cur", null, "2026-06-03T10:00:00Z"), mk("other-unknown", null, "2026-06-03T09:00:00Z"), mk("phone", "Mobile · iOS", "2026-06-03T09:30:00Z")];
    const r = applySessionPolicy({ sessions, currentSessionId: "cur", currentDeviceInfo: null, allowMulti: true });
    expect(r.keep.map((s) => s.session_id).sort()).toEqual(["cur", "phone"]);
    expect(r.remove.map((s) => s.session_id)).toEqual(["other-unknown"]);
  });
});
