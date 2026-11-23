import type { ObjectId } from "mongodb";
import type { WHEEL_STATUS } from "@/constants/wheel";

export type WheelStatus = (typeof WHEEL_STATUS)[keyof typeof WHEEL_STATUS];

export interface WheelItem {
  id: string;
  label: string;
}

export interface Participant {
  participantId: string;
  name: string;
  joinedAt: Date;
}

export interface SpinResult {
  requestId: string;
  participantId: string;
  participantName: string;
  itemId: string;
  itemLabel: string;
  spunAt: Date;
}

export interface WheelDocument {
  _id: ObjectId;
  code: string;
  name: string;
  status: WheelStatus;
  items: WheelItem[];
  participants: Participant[];
  results: SpinResult[];
  totalItems: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

/* ---------- Public (JSON) shapes returned by the API ---------- */

export interface PublicParticipant {
  participantId: string;
  name: string;
  joinedAt: string;
}

/** requestId is intentionally not exposed. */
export interface PublicSpinResult {
  participantId: string;
  participantName: string;
  itemId: string;
  itemLabel: string;
  spunAt: string;
}

export interface WheelResponse {
  code: string;
  name: string;
  status: WheelStatus;
  items: WheelItem[];
  participants: PublicParticipant[];
  results: PublicSpinResult[];
  totalItems: number;
  remainingItems: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateWheelResponse {
  code: string;
  name: string;
  status: WheelStatus;
  shareUrl: string;
}

export interface SpinResponse {
  result: {
    itemId: string;
    itemLabel: string;
    participantName: string;
    spunAt: string;
  };
  remainingItems: number;
  status: WheelStatus;
}

export type ApiErrorCode =
  | "WHEEL_NOT_FOUND"
  | "WHEEL_COMPLETED"
  | "PARTICIPANT_ALREADY_SPUN"
  | "INVALID_REQUEST"
  | "NO_ITEMS_AVAILABLE"
  | "SPIN_CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_SERVER_ERROR";

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: ApiErrorCode; message: string } };
