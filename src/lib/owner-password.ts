import { MAX_OWNER_PASSWORD_LENGTH, MIN_OWNER_PASSWORD_LENGTH } from "@/constants/wheel";

/** Client-side mirror of the server rules (instant feedback only). Never trims. */
export function validateNewOwnerPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_OWNER_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_OWNER_PASSWORD_LENGTH} characters.`;
  }
  if (
    password.length > MAX_OWNER_PASSWORD_LENGTH ||
    new TextEncoder().encode(password).length > MAX_OWNER_PASSWORD_LENGTH
  ) {
    return `Password is too long (max ${MAX_OWNER_PASSWORD_LENGTH} characters).`;
  }
  if (password !== confirm) return "Passwords do not match.";
  return null;
}
