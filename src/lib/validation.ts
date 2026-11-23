import { z } from "zod";
import {
  MAX_OWNER_PASSWORD_LENGTH,
  MIN_OWNER_PASSWORD_LENGTH,
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

/** Passwords are never trimmed or otherwise modified. */
export const ownerPasswordSchema = z
  .string({ error: "Owner password is required." })
  .min(MIN_OWNER_PASSWORD_LENGTH, `Password must be at least ${MIN_OWNER_PASSWORD_LENGTH} characters.`)
  .max(MAX_OWNER_PASSWORD_LENGTH, `Password must be at most ${MAX_OWNER_PASSWORD_LENGTH} characters.`)
  .refine(
    (pw) => new TextEncoder().encode(pw).length <= MAX_OWNER_PASSWORD_LENGTH,
    `Password is too long (max ${MAX_OWNER_PASSWORD_LENGTH} bytes; some characters count as more than one).`,
  );

/** For verification we only need "some string"; the hash comparison decides. */
const ownerPasswordInputSchema = z
  .string({ error: "Owner password is required." })
  .min(1, "Owner password is required.")
  .max(256, "Incorrect owner password.");

export const createWheelSchema = z
  .object({
    name: wheelNameSchema,
    items: itemsSchema,
    ownerPassword: ownerPasswordSchema,
    confirmPassword: z.string({ error: "Please confirm the password." }),
  })
  .refine((v) => v.ownerPassword === v.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const itemLabelSchema = z
  .string({ error: "Item label is required." })
  .trim()
  .min(1, "Item label can't be empty.")
  .max(MAX_ITEM_LENGTH, `Each item must be at most ${MAX_ITEM_LENGTH} characters.`);

const itemIdSchema = z.string().min(1).max(100);

export const updateWheelSchema = z
  .object({
    ownerPassword: ownerPasswordInputSchema,
    name: wheelNameSchema.optional(),
    addItems: z.array(itemLabelSchema).max(MAX_ITEMS).optional(),
    updateItems: z.array(z.object({ id: itemIdSchema, label: itemLabelSchema })).max(MAX_ITEMS).optional(),
    removeItemIds: z.array(itemIdSchema).max(MAX_ITEMS).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      Boolean(v.addItems?.length || v.updateItems?.length || v.removeItemIds?.length),
    { message: "Nothing to update." },
  )
  .refine(
    (v) => {
      const ids = [...(v.updateItems ?? []).map((u) => u.id), ...(v.removeItemIds ?? [])];
      return new Set(ids).size === ids.length;
    },
    { message: "Each item can only be changed once per request." },
  );

export const ownerAuthSchema = z.object({ ownerPassword: ownerPasswordInputSchema });

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
export type UpdateWheelInput = z.infer<typeof updateWheelSchema>;
export type SpinRequestInput = z.infer<typeof spinRequestSchema>;

/** First human-readable message from a Zod error. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request.";
}
