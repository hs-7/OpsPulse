import { Injectable } from "@nestjs/common";
import { Algorithm, hash, verify } from "@node-rs/argon2";

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(encodedHash: string, password: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER");

@Injectable()
export class Argon2idPasswordHasher implements PasswordHasher {
  public hash(password: string): Promise<string> {
    return hash(password, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  public verify(encodedHash: string, password: string): Promise<boolean> {
    if (!encodedHash.startsWith("$argon2id$")) return Promise.resolve(false);
    return verify(encodedHash, password);
  }
}
