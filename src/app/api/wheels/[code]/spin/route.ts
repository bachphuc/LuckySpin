import { fail, ok, readJson } from "@/lib/api-response";
import { Errors } from "@/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { spinWheel } from "@/lib/spin-service";
import { firstIssueMessage, spinRequestSchema } from "@/lib/validation";
import type { SpinResponse } from "@/types/wheel";

export async function POST(request: Request, ctx: RouteContext<"/api/wheels/[code]/spin">) {
  try {
    const { code } = await ctx.params;
    await enforceRateLimit(request, RATE_LIMITS.spin);

    // The body never contains a desired result; only who is spinning and the idempotency key.
    const parsed = spinRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) throw Errors.invalidRequest(firstIssueMessage(parsed.error));

    const outcome = await spinWheel(code, parsed.data);
    return ok<SpinResponse>({
      result: outcome.result,
      remainingItems: outcome.remainingItems,
      status: outcome.status,
    });
  } catch (error) {
    return fail(error);
  }
}
