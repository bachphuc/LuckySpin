import { z } from "zod";
import { fail, ok, readJson } from "@/lib/api-response";
import { Errors } from "@/lib/errors";
import { removeSpin } from "@/lib/owner-admin-service";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { firstIssueMessage, ownerAuthSchema } from "@/lib/validation";
import type { RemoveSpinResponse } from "@/types/wheel";

/** Owner: remove a participant's spin so the item returns and they can spin again. */
export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/wheels/[code]/results/[requestId]">,
) {
  try {
    const { code, requestId } = await ctx.params;
    await enforceRateLimit(request, RATE_LIMITS.manage);
    const parsed = ownerAuthSchema.safeParse(await readJson(request));
    if (!parsed.success) throw Errors.invalidRequest(firstIssueMessage(parsed.error));
    if (!z.uuid().safeParse(requestId).success) throw Errors.resultNotFound();
    return ok<RemoveSpinResponse>(await removeSpin(request, code, requestId, parsed.data.ownerPassword));
  } catch (error) {
    return fail(error);
  }
}
