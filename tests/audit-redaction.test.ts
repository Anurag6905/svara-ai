import { describe, expect, it } from "vitest";
import { redactMetadata } from "@/lib/audit";

describe("audit metadata redaction", () => {
  it("redacts phone numbers, transcript text and credentials, keeps safe fields", () => {
    const out = redactMetadata({
      phoneNumber: "+919800000000",
      transcriptText: "I need 5 lakh",
      otp: "123456",
      email: "x@y.demo",
      role: "AGENT",
      count: 3,
      nested: { phone: "98000", rows: 12 },
    });
    expect(out).toEqual({
      phoneNumber: "[redacted]",
      transcriptText: "[redacted]",
      otp: "[redacted]",
      email: "[redacted]",
      role: "AGENT",
      count: 3,
      nested: { phone: "[redacted]", rows: 12 },
    });
  });
});
