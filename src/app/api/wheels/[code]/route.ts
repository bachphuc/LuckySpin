import { fail, ok } from "@/lib/api-response";
import { getPublicWheel } from "@/lib/wheel-service";

export async function GET(_request: Request, ctx: RouteContext<"/api/wheels/[code]">) {
  try {
    const { code } = await ctx.params;
    return ok(await getPublicWheel(code));
  } catch (error) {
    return fail(error);
  }
}
