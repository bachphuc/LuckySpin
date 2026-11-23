import type { ApiErrorCode } from "@/types/wheel";

/** Expected, client-safe error. Anything else is reported as a generic 500. */
export class AppError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  invalidRequest: (message = "Invalid request.") => new AppError("INVALID_REQUEST", message, 400),
  wheelNotFound: () => new AppError("WHEEL_NOT_FOUND", "Wheel not found.", 404),
  wheelCompleted: () => new AppError("WHEEL_COMPLETED", "This wheel has no remaining items.", 409),
  alreadySpun: () =>
    new AppError("PARTICIPANT_ALREADY_SPUN", "You have already spun this wheel.", 409),
  noItems: () => new AppError("NO_ITEMS_AVAILABLE", "No items are available to spin.", 409),
  spinConflict: () =>
    new AppError("SPIN_CONFLICT", "The wheel is busy. Please try again.", 409),
  /** Deliberately generic: never says which part was wrong. */
  invalidOwnerPassword: () =>
    new AppError("INVALID_OWNER_PASSWORD", "Incorrect owner password.", 401),
  ownerNotConfigured: () =>
    new AppError(
      "OWNER_NOT_CONFIGURED",
      "This wheel was created before owner management existed and can't be managed.",
      403,
    ),
  resultNotFound: () => new AppError("RESULT_NOT_FOUND", "That spin result no longer exists.", 404),
  itemNotAvailable: () =>
    new AppError(
      "ITEM_NOT_AVAILABLE",
      "That item is no longer available. Awarded items can only be changed after removing the spin.",
      409,
    ),
  rateLimited: () =>
    new AppError("RATE_LIMITED", "Too many requests. Please slow down and try again.", 429),
};
