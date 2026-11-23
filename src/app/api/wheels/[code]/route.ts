import { fail, ok, readJson } from "@/lib/api-response";
import { Errors } from "@/lib/errors";
import { updateWheel } from "@/lib/owner-admin-service";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { firstIssueMessage, updateWheelSchema } from "@/lib/validation";
import { getPublicWheel } from "@/lib/wheel-service";

export async function GET(_request: Request, ctx: RouteContext<"/api/wheels/[code]">) {
  try {
    const { code } = await ctx.params;
    return ok(await getPublicWheel(code));
  } catch (error) {
    return fail(error);
  }
}

/** Owner: rename the wheel and add/edit/remove available items. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/wheels/[code]">) {
  try {
    const { code } = await ctx.params;
    await enforceRateLimit(request, RATE_LIMITS.manage);
    const parsed = updateWheelSchema.safeParse(await readJson(request));
    if (!parsed.success) throw Errors.invalidRequest(firstIssueMessage(parsed.error));
    return ok(await updateWheel(request, code, parsed.data));
  } catch (error) {
    return fail(error);
  }
}
