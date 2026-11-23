import "server-only";
import type { Document, Filter } from "mongodb";
import { MAX_ITEMS, WHEEL_STATUS } from "@/constants/wheel";
import { getWheelsCollection } from "@/lib/database";
import { AppError, Errors } from "@/lib/errors";
import { verifyOwner } from "@/lib/owner-service";
import { buildWheelItems } from "@/lib/utils";
import { shareCodeSchema, type UpdateWheelInput } from "@/lib/validation";
import { toPublicWheel } from "@/lib/wheel-service";
import type { RemoveSpinResponse, WheelDocument, WheelResponse } from "@/types/wheel";

const MAX_EDIT_ATTEMPTS = 10;

async function loadWheel(code: string): Promise<WheelDocument> {
  if (!shareCodeSchema.safeParse(code).success) throw Errors.wheelNotFound();
  const wheel = await (await getWheelsCollection()).findOne({ code });
  if (!wheel) throw Errors.wheelNotFound();
  return wheel;
}

/**
 * Owner edit: wheel name and AVAILABLE items only. Awarded items live in
 * `results` and can't be touched here (remove the spin first).
 *
 * One atomic pipeline update whose filter re-checks that every item being
 * edited/removed is still available, so a concurrent spin can't award an item
 * while it's being edited or removed.
 */
export async function updateWheel(
  request: Request,
  code: string,
  input: UpdateWheelInput,
): Promise<WheelResponse> {
  let wheel = await loadWheel(code);
  await verifyOwner(request, wheel, input.ownerPassword);

  const updates = input.updateItems ?? [];
  const removeIds = input.removeItemIds ?? [];
  const touchedIds = [...updates.map((u) => u.id), ...removeIds];
  const added = buildWheelItems(input.addItems ?? []);
  const now = new Date();
  const wheels = await getWheelsCollection();

  for (let attempt = 0; attempt < MAX_EDIT_ATTEMPTS; attempt++) {
    if (attempt > 0) wheel = await loadWheel(code);

    const available = new Set(wheel.items.map((i) => i.id));
    if (touchedIds.some((id) => !available.has(id))) throw Errors.itemNotAvailable();
    const newTotal = wheel.items.length - removeIds.length + added.length + wheel.results.length;
    if (newTotal > MAX_ITEMS) {
      throw new AppError("INVALID_REQUEST", `A wheel can have at most ${MAX_ITEMS} items.`, 400);
    }

    const filter: Filter<WheelDocument> = {
      code,
      // Every edited/removed item must still be available at write time.
      ...(touchedIds.length ? { "items.id": { $all: touchedIds } } : {}),
      // Item cap re-checked atomically (guards concurrent owner edits).
      $expr: {
        $lte: [
          { $add: [{ $size: "$items" }, { $size: "$results" }] },
          MAX_ITEMS - added.length + removeIds.length,
        ],
      },
    };

    const updated = await wheels.findOneAndUpdate(
      filter,
      buildEditPipeline(input.name, updates, removeIds, added, now),
      { returnDocument: "after" },
    );
    if (updated) return toPublicWheel(updated);
  }
  throw Errors.spinConflict();
}

function buildEditPipeline(
  name: string | undefined,
  updates: { id: string; label: string }[],
  removeIds: string[],
  added: { id: string; label: string }[],
  now: Date,
): Document[] {
  const isEmpty = { $eq: [{ $size: "$items" }, 0] };
  return [
    {
      $set: {
        name: name === undefined ? "$name" : { $literal: name },
        items: {
          $concatArrays: [
            {
              $map: {
                input: {
                  $filter: {
                    input: "$items",
                    as: "it",
                    cond: { $not: [{ $in: ["$$it.id", { $literal: removeIds }] }] },
                  },
                },
                as: "it",
                in: {
                  id: "$$it.id", // the id never changes on edit
                  label: {
                    $let: {
                      vars: {
                        u: {
                          $filter: {
                            input: { $literal: updates },
                            as: "u",
                            cond: { $eq: ["$$u.id", "$$it.id"] },
                          },
                        },
                      },
                      in: {
                        $cond: [
                          { $gt: [{ $size: "$$u" }, 0] },
                          { $arrayElemAt: ["$$u.label", 0] },
                          "$$it.label",
                        ],
                      },
                    },
                  },
                },
              },
            },
            { $literal: added },
          ],
        },
        updatedAt: { $literal: now },
      },
    },
    {
      $set: {
        totalItems: { $add: [{ $size: "$items" }, { $size: "$results" }] },
        // Adding items re-opens a completed wheel; removing the last one completes it.
        status: { $cond: [isEmpty, WHEEL_STATUS.COMPLETED, WHEEL_STATUS.ACTIVE] },
        completedAt: {
          $cond: [isEmpty, { $ifNull: ["$completedAt", { $literal: now }] }, null],
        },
      },
    },
  ];
}

/**
 * Remove a participant's spin in ONE atomic update: drop the result, drop that
 * participant, put the item back (only if it isn't already there), and re-open
 * the wheel. The filter requires the result to exist, so concurrent removals of
 * the same result can only succeed once and the item can't be restored twice.
 */
export async function removeSpin(
  request: Request,
  code: string,
  requestId: string,
  ownerPassword: string,
): Promise<RemoveSpinResponse> {
  const wheel = await loadWheel(code);
  await verifyOwner(request, wheel, ownerPassword);

  const wheels = await getWheelsCollection();
  const now = new Date();
  const before = await wheels.findOneAndUpdate(
    { code, "results.requestId": requestId },
    buildRemoveSpinPipeline(requestId, now),
    { returnDocument: "before" },
  );
  const removed = before?.results.find((r) => r.requestId === requestId);
  if (!before || !removed) throw Errors.resultNotFound();

  const alreadyAvailable = before.items.some((i) => i.id === removed.itemId);
  return {
    removedResult: {
      requestId: removed.requestId,
      participantId: removed.participantId,
      participantName: removed.participantName,
      itemId: removed.itemId,
      itemLabel: removed.itemLabel,
    },
    remainingItems: before.items.length + (alreadyAvailable ? 0 : 1),
    status: WHEEL_STATUS.ACTIVE,
  };
}

function buildRemoveSpinPipeline(requestId: string, now: Date): Document[] {
  const rid = { $literal: requestId };
  return [
    {
      $set: {
        _removed: {
          $arrayElemAt: [
            { $filter: { input: "$results", as: "r", cond: { $eq: ["$$r.requestId", rid] } } },
            0,
          ],
        },
      },
    },
    {
      $set: {
        results: { $filter: { input: "$results", as: "r", cond: { $ne: ["$$r.requestId", rid] } } },
        participants: {
          $filter: {
            input: "$participants",
            as: "p",
            cond: { $ne: ["$$p.participantId", "$_removed.participantId"] },
          },
        },
        items: {
          $cond: [
            { $in: ["$_removed.itemId", "$items.id"] },
            "$items",
            { $concatArrays: ["$items", [{ id: "$_removed.itemId", label: "$_removed.itemLabel" }]] },
          ],
        },
        status: WHEEL_STATUS.ACTIVE,
        completedAt: null,
        updatedAt: { $literal: now },
      },
    },
    { $unset: "_removed" },
  ];
}
