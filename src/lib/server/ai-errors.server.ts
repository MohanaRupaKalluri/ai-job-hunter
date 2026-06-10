// Centralized AI error mapping. Lovable AI Gateway returns 402 when the
// workspace's AI balance is exhausted and 429 when rate-limited. The raw
// upstream messages ("Payment Required", "Too Many Requests") are unhelpful
// to end users, so we translate them into actionable copy that names the
// feature that triggered the request.

export function friendlyAiError(e: unknown, feature: string): Error {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/\b402\b|payment\s*required|insufficient\s*credit|credits?\s*exhaust/i.test(msg)) {
    return new Error(
      `AI credits exhausted. Please add credits or wait for your balance to reset. (Feature: ${feature})`,
    );
  }
  if (/\b429\b|rate.?limit|too many requests/i.test(msg)) {
    return new Error(
      `AI is temporarily rate-limited. Please try again in a moment. (Feature: ${feature})`,
    );
  }
  return e instanceof Error ? e : new Error(msg);
}

export async function withAiErrors<T>(feature: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw friendlyAiError(e, feature);
  }
}