import "server-only";
import bcrypt from "bcryptjs";
import { BCRYPT_ROUNDS } from "@/constants/wheel";
import { Errors } from "@/lib/errors";
import { assertOwnerAttemptsAllowed, recordOwnerFailure } from "@/lib/rate-limit";
import type { WheelDocument } from "@/types/wheel";

/** Compared against when a wheel has no owner, so the response time looks the same. */
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash(crypto.randomUUID(), BCRYPT_ROUNDS));

export function hashOwnerPassword(password: string): Promise<string> {
  // The password is passed through untouched (no trim/normalisation).
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verifies the owner password for a management request.
 * - throttles repeated failures (429) before doing any work
 * - legacy wheels without a hash can't be managed (403)
 * - wrong password: 401 with a generic message, failure recorded
 * The password itself is never logged or echoed.
 */
export async function verifyOwner(request: Request, wheel: WheelDocument, password: string): Promise<void> {
  await assertOwnerAttemptsAllowed(request, wheel.code);

  if (!wheel.ownerPasswordHash) {
    await bcrypt.compare(password, await getDummyHash());
    throw Errors.ownerNotConfigured();
  }

  const valid = await bcrypt.compare(password, wheel.ownerPasswordHash);
  if (!valid) {
    await recordOwnerFailure(request, wheel.code);
    throw Errors.invalidOwnerPassword();
  }
}
