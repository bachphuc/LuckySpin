import "server-only";
import type { Filter } from "mongodb";
import { MAX_SPIN_ATTEMPTS, WHEEL_STATUS } from "@/constants/wheel";
import { getWheelsCollection } from "@/lib/database";
import { Errors } from "@/lib/errors";
import { secureRandomIndex } from "@/lib/utils";
import { shareCodeSchema, type SpinRequestInput } from "@/lib/validation";
import type {
  Participant,
  SpinResponse,
  SpinResult,
  WheelDocument,
  WheelStatus,
} from "@/types/wheel";

export interface SpinOutcome extends SpinResponse {
  /** true when this was a retry of a request that had already succeeded. */
  replayed: boolean;
}

function toOutcome(
  result: SpinResult,
  remainingItems: number,
  status: WheelStatus,
  replayed: boolean,
): SpinOutcome {
  return {
    result: {
      itemId: result.itemId,
      itemLabel: result.itemLabel,
      participantName: result.participantName,
      spunAt: result.spunAt.toISOString(),
    },
    remainingItems,
    status,
    replayed,
  };
}

/**
 * Concurrency-safe spin.
 *
 * Optimistic loop: read the wheel, pick a random remaining item, then commit
 * with ONE findOneAndUpdate whose filter re-checks every invariant (wheel
 * ACTIVE, participant absent, request absent, chosen item still present).
 * If anything changed in between, the filter misses, nothing is written, and
 * we reload and try again.
 *
 * The update is an aggregation pipeline so that removing the item, recording
 * the participant + result, and flipping to COMPLETED when the list becomes
 * empty all happen in the same atomic single-document write.
 */
export async function spinWheel(code: string, input: SpinRequestInput): Promise<SpinOutcome> {
  if (!shareCodeSchema.safeParse(code).success) throw Errors.wheelNotFound();
  const wheels = await getWheelsCollection();
  const { participantId, participantName, requestId } = input;

  for (let attempt = 0; attempt < MAX_SPIN_ATTEMPTS; attempt++) {
    const wheel = await wheels.findOne({ code });
    if (!wheel) throw Errors.wheelNotFound();

    // Idempotency: the same requestId always yields the same answer.
    const previous = wheel.results.find((r) => r.requestId === requestId);
    if (previous) {
      if (previous.participantId !== participantId) {
        throw Errors.invalidRequest("This requestId has already been used.");
      }
      return toOutcome(previous, wheel.items.length, wheel.status, true);
    }

    if (wheel.participants.some((p) => p.participantId === participantId)) {
      throw Errors.alreadySpun();
    }
    if (wheel.status === WHEEL_STATUS.COMPLETED) throw Errors.wheelCompleted();

    if (wheel.items.length === 0) {
      // Defensive only: the last successful spin completes the wheel atomically,
      // so an ACTIVE wheel with no items should never exist.
      await markEmptyWheelCompleted(code);
      throw Errors.wheelCompleted();
    }

    const item = wheel.items[secureRandomIndex(wheel.items.length)];
    const now = new Date();
    const participant: Participant = { participantId, name: participantName, joinedAt: now };
    const result: SpinResult = {
      requestId,
      participantId,
      participantName,
      itemId: item.id,
      itemLabel: item.label,
      spunAt: now,
    };

    const filter: Filter<WheelDocument> = {
      code,
      status: WHEEL_STATUS.ACTIVE,
      participants: { $not: { $elemMatch: { participantId } } },
      "results.requestId": { $ne: requestId },
      items: { $elemMatch: { id: item.id } },
    };

    const updated = await wheels.findOneAndUpdate(filter, buildSpinPipeline(item.id, participant, result, now), {
      returnDocument: "after",
      projection: { status: 1, items: 1 },
    });

    if (updated) {
      return toOutcome(result, updated.items.length, updated.status, false);
    }
    // Lost a race (item taken, participant/request recorded, or wheel completed). Reload.
  }

  throw Errors.spinConflict();
}

/**
 * User-controlled strings (names, labels) are wrapped in $literal so a value
 * such as "$items" can never be interpreted as a field path or operator.
 */
function buildSpinPipeline(itemId: string, participant: Participant, result: SpinResult, now: Date) {
  const isEmpty = { $eq: [{ $size: "$items" }, 0] };
  return [
    {
      $set: {
        items: {
          $filter: {
            input: "$items",
            as: "item",
            cond: { $ne: ["$$item.id", { $literal: itemId }] },
          },
        },
        participants: { $concatArrays: ["$participants", [{ $literal: participant }]] },
        results: { $concatArrays: ["$results", [{ $literal: result }]] },
        updatedAt: { $literal: now },
      },
    },
    {
      // Runs on the post-removal `items`, still inside the same atomic write.
      $set: {
        status: { $cond: [isEmpty, WHEEL_STATUS.COMPLETED, "$status"] },
        completedAt: { $cond: [isEmpty, { $literal: now }, "$completedAt"] },
      },
    },
  ];
}

async function markEmptyWheelCompleted(code: string): Promise<void> {
  const wheels = await getWheelsCollection();
  const now = new Date();
  await wheels.updateOne(
    { code, status: WHEEL_STATUS.ACTIVE, items: { $size: 0 } },
    { $set: { status: WHEEL_STATUS.COMPLETED, completedAt: now, updatedAt: now } },
  );
}
