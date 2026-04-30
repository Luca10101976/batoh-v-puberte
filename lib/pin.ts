import bcrypt from "bcryptjs";

export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 6;
export const PREFERRED_PIN_LENGTH = 6;
const PIN_FORMAT_REGEX = new RegExp(`^\\d{${MIN_PIN_LENGTH},${MAX_PIN_LENGTH}}$`);
const BCRYPT_ROUNDS = 12;

export function normalizePin(value: string) {
  return value.replace(/\D/g, "").slice(0, MAX_PIN_LENGTH);
}

export function isPinFormatValid(pin: string) {
  return PIN_FORMAT_REGEX.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  const normalized = normalizePin(pin);
  if (!isPinFormatValid(normalized)) {
    throw new Error("PIN format is invalid");
  }

  return bcrypt.hash(normalized, BCRYPT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const normalized = normalizePin(pin);
  if (!isPinFormatValid(normalized) || !hash) {
    return false;
  }

  return bcrypt.compare(normalized, hash);
}
