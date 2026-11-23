import "server-only";
import { ObjectId } from "mongodb";
import { WHEEL_STATUS } from "@/constants/wheel";
import { getWheelsCollection, isDuplicateKeyError } from "@/lib/database";
import { Errors } from "@/lib/errors";
import { buildWheelItems, generateShareCode } from "@/lib/utils";
import { shareCodeSchema, type CreateWheelInput } from "@/lib/validation";
import type { WheelDocument, WheelResponse } from "@/types/wheel";
import { hashOwnerPassword } from "@/lib/owner-service";

const MAX_CODE_ATTEMPTS = 5;

export async function createWheel(input: CreateWheelInput): Promise<WheelDocument> {
  const wheels = await getWheelsCollection();
  const now = new Date();
  const items = buildWheelItems(input.items);
  const ownerPasswordHash = await hashOwnerPassword(input.ownerPassword);

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const doc: WheelDocument = {
      _id: new ObjectId(),
      code: generateShareCode(),
      name: input.name,
      ownerPasswordHash,
      status: WHEEL_STATUS.ACTIVE,
      items,
      participants: [],
      results: [],
      totalItems: items.length,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    try {
      await wheels.insertOne(doc);
      return doc;
    } catch (error) {
      // Collision on the unique code index: try a fresh code.
      if (isDuplicateKeyError(error)) continue;
      throw error;
    }
  }
  throw new Error("Could not generate a unique share code.");
}

export async function findWheelByCode(code: string): Promise<WheelDocument | null> {
  if (!shareCodeSchema.safeParse(code).success) return null;
  const wheels = await getWheelsCollection();
  return wheels.findOne({ code });
}

export async function getPublicWheel(code: string): Promise<WheelResponse> {
  const wheel = await findWheelByCode(code);
  if (!wheel) throw Errors.wheelNotFound();
  return toPublicWheel(wheel);
}

/** Strips internal fields (_id, ownerPasswordHash) and serialises dates. */
export function toPublicWheel(wheel: WheelDocument): WheelResponse {
  return {
    code: wheel.code,
    name: wheel.name,
    status: wheel.status,
    ownerManaged: Boolean(wheel.ownerPasswordHash),
    items: wheel.items.map(({ id, label }) => ({ id, label })),
    participants: wheel.participants.map((p) => ({
      participantId: p.participantId,
      name: p.name,
      joinedAt: p.joinedAt.toISOString(),
    })),
    results: wheel.results.map((r) => ({
      requestId: r.requestId,
      participantId: r.participantId,
      participantName: r.participantName,
      itemId: r.itemId,
      itemLabel: r.itemLabel,
      spunAt: r.spunAt.toISOString(),
    })),
    totalItems: wheel.totalItems,
    remainingItems: wheel.items.length,
    createdAt: wheel.createdAt.toISOString(),
    updatedAt: wheel.updatedAt.toISOString(),
    completedAt: wheel.completedAt ? wheel.completedAt.toISOString() : null,
  };
}

export function buildShareUrl(code: string, requestUrl: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(requestUrl).origin;
  return new URL(`/w/${code}`, base.endsWith("/") ? base : `${base}/`).toString();
}
