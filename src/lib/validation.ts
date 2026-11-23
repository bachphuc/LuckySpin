import { z } from "zod";
import {
  MAX_ITEMS,
  MAX_ITEM_LENGTH,
  MAX_PARTICIPANT_NAME_LENGTH,
  MAX_WHEEL_NAME_LENGTH,
  MIN_ITEMS,
  SHARE_CODE_PATTERN,
} from "@/constants/wheel";

export const wheelNameSchema = z
  .string({ error: "Wheel name is required." })
  .trim()
  .min(1, "Wheel name is required.")
  .max(MAX_WHEEL_NAME_LENGTH, `Wheel name must be at most ${MAX_WHEEL_NAME_LENGTH} characters.`);

/**
 * Items arrive as an array of raw strings. The server re-applies the same
 * normalisation as the textarea parser (trim + drop empty) and never trusts the
 * client to have done it.
 */
export const itemsSchema = z
  .array(z.string(), { error: "Items must be a list of strings." })
  .max(MAX_ITEMS * 5, "Too many items.")
  .transform((items) => items.map((s) => s.trim()).filter((s) => s.length > 0))
  .pipe(
    z
      .array(
        z.string().max(MAX_ITEM_LENGTH, `Each item must be at most ${MAX_ITEM_LENGTH} characters.`),
      )
      .min(MIN_ITEMS, `Enter at least ${MIN_ITEMS} items.`)
      .max(MAX_ITEMS, `Enter at most ${MAX_ITEMS} items.`),
  );

export const createWheelSchema = z.object({
  name: wheelNameSchema,
  items: itemsSchema,
});

export const participantNameSchema = z
  .string({ error: "Name is required." })
  .trim()
  .min(1, "Please enter your name.")
  .max(MAX_PARTICIPANT_NAME_LENGTH, `Name must be at most ${MAX_PARTICIPANT_NAME_LENGTH} characters.`);

export const spinRequestSchema = z.object({
  participantId: z.uuid("participantId must be a UUID."),
  participantName: participantNameSchema,
  requestId: z.uuid("requestId must be a UUID."),
});

export const shareCodeSchema = z.string().regex(SHARE_CODE_PATTERN);

export type CreateWheelInput = z.infer<typeof createWheelSchema>;
export type SpinRequestInput = z.infer<typeof spinRequestSchema>;

/** First human-readable message from a Zod error. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request.";
}
