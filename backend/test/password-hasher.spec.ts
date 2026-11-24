import { describe, expect, it } from "vitest";
import { Argon2idPasswordHasher } from "../src/modules/auth/password-hasher";

describe("Argon2idPasswordHasher", () => {
  it("creates an Argon2id hash and verifies only the matching password", async () => {
    const hasher = new Argon2idPasswordHasher();
    const encodedHash = await hasher.hash("a-strong-password");

    expect(encodedHash.startsWith("$argon2id$")).toBe(true);
    await expect(hasher.verify(encodedHash, "a-strong-password")).resolves.toBe(
      true,
    );
    await expect(hasher.verify(encodedHash, "a-different-password")).resolves.toBe(
      false,
    );
    await expect(hasher.verify("$2b$legacy-bcrypt-hash", "password")).resolves.toBe(
      false,
    );
  });
});
