import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session-token";

const USER = "6f1c2c1e-1b7f-4d39-9e2b-1f6d2b7a9c01";

describe("session tokens", () => {
  it("round-trips a valid token", () => {
    expect(verifySessionToken(createSessionToken(USER))).toBe(USER);
  });

  it("rejects a tampered user id", () => {
    const token = createSessionToken(USER);
    const forged = token.replace(USER, "00000000-0000-4000-8000-000000000000");
    expect(verifySessionToken(forged)).toBeNull();
  });

  it("rejects an expired token", () => {
    const issued = Date.now() - 1000 * 60 * 60 * 24;
    expect(verifySessionToken(createSessionToken(USER, issued))).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken("abc")).toBeNull();
    expect(verifySessionToken("a.b.c")).toBeNull();
  });
});
