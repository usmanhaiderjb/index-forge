/**
 * Is there an IndexForge server at this origin, and is it healthy?
 *
 * Three outcomes rather than a boolean, because they need different handling:
 *
 *   fail      nothing answered, or what answered is not an IndexForge server
 *   degraded  an IndexForge server answered but a dependency of its own is down
 *   ok        an IndexForge server answered and is healthy
 *
 * The distinction matters. `/api/health` returns 503 when Postgres or Redis is
 * unreachable, so treating any non-2xx as "cannot connect" would make the
 * desktop app refuse to open a running server whose Redis had merely fallen
 * over — a dashboard that would still have loaded, and would have explained the
 * problem far better than a connection dialog can.
 */

export type ServerCheck =
  | { kind: "ok" }
  | { kind: "degraded"; message: string }
  | { kind: "fail"; message: string };

type HealthBody = {
  ok?: boolean;
  checks?: Record<string, { ok?: boolean; detail?: string }>;
};

/**
 * Node's fetch reports almost every network failure as the single string
 * "fetch failed" and hides the real reason on `error.cause`. Surfacing that
 * string verbatim tells the user nothing and looks like a bug in this app; the
 * distinction between "nothing is listening", "no such host" and "the
 * certificate is bad" is exactly what they need to fix it.
 */
function describeNetworkError(error: unknown, origin: string): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/abort|timeout|timed out/i.test(message)) {
    return `No answer from ${origin} within 6 seconds.`;
  }

  const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;

  switch (cause?.code) {
    case "ECONNREFUSED":
      return `Nothing is listening at ${origin}. Is the IndexForge server running?`;
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `Cannot find the host in ${origin}. Check the address for a typo.`;
    case "ECONNRESET":
      return `${origin} closed the connection. If it only serves HTTPS, use https:// here.`;
    case "CERT_HAS_EXPIRED":
      return `The certificate for ${origin} has expired.`;
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
      return `${origin} uses a self-signed certificate, which this app will not accept.`;
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      return `The certificate for ${origin} could not be verified.`;
    default:
      return cause?.code
        ? `Could not reach ${origin} (${cause.code}).`
        : `Could not reach ${origin}. ${message}`;
  }
}

export async function checkServer(origin: string): Promise<ServerCheck> {
  let target: URL;
  try {
    target = new URL("/api/health", origin);
  } catch {
    return { kind: "fail", message: `${origin} is not a valid address.` };
  }

  let response: Response;
  try {
    response = await fetch(target, {
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
      headers: { accept: "application/json" },
    });
  } catch (error) {
    return { kind: "fail", message: describeNetworkError(error, origin) };
  }

  // A typo that lands on some other web server would connect happily and then
  // load a stranger's page into a window holding the session. Requiring a route
  // only the IndexForge app serves is what rules that out.
  if (response.status === 404) {
    return {
      kind: "fail",
      message: `${origin} answered, but it is not an IndexForge server — it has no /api/health.`,
    };
  }

  let body: HealthBody | null = null;
  try {
    body = (await response.json()) as HealthBody;
  } catch {
    body = null;
  }

  if (!body || typeof body.ok !== "boolean" || !body.checks) {
    return {
      kind: "fail",
      message: `${origin} answered with HTTP ${response.status}, but not with an IndexForge health report.`,
    };
  }

  if (body.ok) return { kind: "ok" };

  const down = Object.entries(body.checks)
    .filter(([, check]) => !check?.ok)
    .map(([name]) => name);

  return {
    kind: "degraded",
    message:
      down.length > 0
        ? `Connected, but the server reports ${down.join(" and ")} unavailable. Some numbers will be missing.`
        : "Connected, but the server reports itself unhealthy.",
  };
}
