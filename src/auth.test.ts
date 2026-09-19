import { describe, it, expect, beforeAll } from "vitest";
import {
  makeJWT,
  validateJWT,
  hashPassword,
  checkPasswordHash,
} from "./auth.js";

describe("JWT", () => {
  const userID = "test-user-id";
  const secret = "test-secret";
  const expiresIn = 3600;

  it("should create and validate a JWT", () => {
    const token = makeJWT(userID, expiresIn, secret);

    const result = validateJWT(token, secret);

    expect(result).toBe(userID);
  });

  it("should reject an expired JWT", () => {
    const token = makeJWT(userID, -1, secret);

    expect(() => validateJWT(token, secret)).toThrow("Invalid token");
  });

  it("should reject a JWT signed with the wrong secret", () => {
    const token = makeJWT(userID, expiresIn, secret);

    expect(() => validateJWT(token, "wrong-secret")).toThrow(
      "Invalid token",
    );
  });
});

describe("Password Hashing", () => {
  const password1 = "correctPassword123!";
  const password2 = "anotherPassword456!";

  let hash1: string;
  let hash2: string;

  beforeAll(async () => {
    hash1 = await hashPassword(password1);
    hash2 = await hashPassword(password2);
  });

  it("should return true for the correct password", async () => {
    const result = await checkPasswordHash(password1, hash1);

    expect(result).toBe(true);
  });

  it("should return false for the wrong password", async () => {
    const result = await checkPasswordHash(password2, hash1);

    expect(result).toBe(false);
  });

  it("should return false when comparing different hashes", async () => {
    const result = await checkPasswordHash(password1, hash2);

    expect(result).toBe(false);
  });
});
