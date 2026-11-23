import { fail, ok, readJson } from "@/lib/api-response";
import { Errors } from "@/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createWheelSchema, firstIssueMessage } from "@/lib/validation";
import { buildShareUrl, createWheel } from "@/lib/wheel-service";
import type { CreateWheelResponse } from "@/types/wheel";

export async function POST(request: Request) {
  try {
    await enforceRateLimit(request, RATE_LIMITS.create);

    const parsed = createWheelSchema.safeParse(await readJson(request));
    if (!parsed.success) throw Errors.invalidRequest(firstIssueMessage(parsed.error));

    const wheel = await createWheel(parsed.data);
    return ok<CreateWheelResponse>(
      {
        code: wheel.code,
        name: wheel.name,
        status: wheel.status,
        shareUrl: buildShareUrl(wheel.code, request.url),
      },
      201,
    );
  } catch (error) {
    return fail(error);
  }
}
