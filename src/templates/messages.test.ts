import { test, expect } from "bun:test";
import { getMessage } from "./messages";

test("getMessage should return formatted welcome message", () => {
    const msg = getMessage("welcome", { minWords: 15 });
    expect(msg).toContain("15");
    expect(msg).toContain("Begründung");
});

test("getMessage should return key if translation is missing", () => {
    const msg = getMessage("non-existent-key");
    expect(msg).toBe("non-existent-key");
});

test("getMessage should handle multiple arguments", () => {
    const msg = getMessage("reason-too-long", { maxChars: 500 });
    expect(msg).toContain("500");
});

test("getMessage should return error-generic", () => {
    const msg = getMessage("error-generic");
    expect(msg).toContain("Entschuldigung");
});
