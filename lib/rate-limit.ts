import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MINUTES = 60;
const DEFAULT_BLOCK_MINUTES = 15;

type CheckRateLimitParams = {
  action: string;
  ip?: string | null;
  userId?: string | null;
  limit?: number;
  windowMinutes?: number;
  blockMinutes?: number;
  client?: SupabaseClient;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
  remaining?: number;
};

type RateLimitPolicy = {
  limit: number;
  windowMinutes: number;
  blockMinutes: number;
};

type RateLimitOverride = Partial<RateLimitPolicy>;

type InMemoryBucket = {
  attempts: number;
  windowStartTs: number;
  blockedUntilTs: number | null;
};

const inMemoryBuckets = new Map<string, InMemoryBucket>();
let cachedOverrideRaw: string | null = null;
let cachedOverrides: Record<string, RateLimitOverride> = {};

type RateLimitRow = {
  id: string;
  attempts: number;
  window_start: string;
  blocked_until: string | null;
};

export function getRequestIpAddress(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return request.headers.get("x-real-ip")?.trim() || null;
}

function clampPositiveInt(value: number | undefined, fallback: number) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function toPositiveInt(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
}

function getRateLimitOverrides() {
  const raw = process.env.RATE_LIMIT_OVERRIDES_JSON?.trim() || "";
  if (raw === cachedOverrideRaw) {
    return cachedOverrides;
  }

  cachedOverrideRaw = raw;
  cachedOverrides = {};

  if (!raw) {
    return cachedOverrides;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return cachedOverrides;
    }

    Object.entries(parsed as Record<string, unknown>).forEach(([action, value]) => {
      if (!action.trim() || !value || typeof value !== "object" || Array.isArray(value)) {
        return;
      }

      const data = value as Record<string, unknown>;
      const override: RateLimitOverride = {};
      const limit = toPositiveInt(data.limit);
      const windowMinutes = toPositiveInt(data.windowMinutes);
      const blockMinutes = toPositiveInt(data.blockMinutes);

      if (limit) {
        override.limit = limit;
      }
      if (windowMinutes) {
        override.windowMinutes = windowMinutes;
      }
      if (blockMinutes) {
        override.blockMinutes = blockMinutes;
      }
      if (Object.keys(override).length > 0) {
        cachedOverrides[action.trim()] = override;
      }
    });
  } catch {
    cachedOverrides = {};
  }

  return cachedOverrides;
}

function resolveRateLimitPolicy({
  action,
  limit,
  windowMinutes,
  blockMinutes
}: {
  action: string;
  limit?: number;
  windowMinutes?: number;
  blockMinutes?: number;
}): RateLimitPolicy {
  const base: RateLimitPolicy = {
    limit: clampPositiveInt(limit, DEFAULT_LIMIT),
    windowMinutes: clampPositiveInt(windowMinutes, DEFAULT_WINDOW_MINUTES),
    blockMinutes: clampPositiveInt(blockMinutes, DEFAULT_BLOCK_MINUTES)
  };
  const overrides = getRateLimitOverrides();
  const globalOverride = overrides["*"] ?? {};
  const actionOverride = overrides[action] ?? {};

  return {
    limit: clampPositiveInt(actionOverride.limit ?? globalOverride.limit, base.limit),
    windowMinutes: clampPositiveInt(actionOverride.windowMinutes ?? globalOverride.windowMinutes, base.windowMinutes),
    blockMinutes: clampPositiveInt(actionOverride.blockMinutes ?? globalOverride.blockMinutes, base.blockMinutes)
  };
}

function getRetryAfterSeconds(blockedUntil: string | null, nowTs: number) {
  if (!blockedUntil) {
    return undefined;
  }
  const blockedTs = new Date(blockedUntil).getTime();
  if (!Number.isFinite(blockedTs) || blockedTs <= nowTs) {
    return undefined;
  }
  return Math.max(1, Math.ceil((blockedTs - nowTs) / 1000));
}

async function fetchRateLimitRow(
  client: SupabaseClient,
  actionKey: string,
  ipAddress: string | null,
  userId: string | null
) {
  let query = client
    .from("rate_limits")
    .select("id, attempts, window_start, blocked_until")
    .eq("action_key", actionKey)
    .limit(1);

  query = ipAddress ? query.eq("ip_address", ipAddress) : query.is("ip_address", null);
  query = userId ? query.eq("user_id", userId) : query.is("user_id", null);

  const { data, error } = await query.maybeSingle<RateLimitRow>();
  if (error) {
    throw new Error(`Rate limit read failed: ${error.message}`);
  }
  return data ?? null;
}

export async function checkRateLimit({
  action,
  ip,
  userId,
  limit,
  windowMinutes,
  blockMinutes,
  client
}: CheckRateLimitParams): Promise<RateLimitResult> {
  const actionKey = action.trim();
  if (!actionKey) {
    throw new Error("Rate limit action is required.");
  }

  const ipAddress = ip?.trim() || null;
  const normalizedUserId = userId?.trim() || null;
  const policy = resolveRateLimitPolicy({ action: actionKey, limit, windowMinutes, blockMinutes });
  const maxAttempts = policy.limit;
  const windowMin = policy.windowMinutes;
  const blockMin = policy.blockMinutes;
  const now = new Date();
  const nowIso = now.toISOString();
  const nowTs = now.getTime();
  const windowStartTs = nowTs - windowMin * 60 * 1000;
  const lockUntilIso = new Date(nowTs + blockMin * 60 * 1000).toISOString();
  const supabase = client ?? getSupabaseServerClient();

  const existing = await fetchRateLimitRow(supabase, actionKey, ipAddress, normalizedUserId);

  if (!existing) {
    const { error: insertError } = await supabase.from("rate_limits").insert({
      action_key: actionKey,
      ip_address: ipAddress,
      user_id: normalizedUserId,
      attempts: 1,
      window_start: nowIso,
      blocked_until: null,
      updated_at: nowIso
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return checkRateLimit({
          action: actionKey,
          ip: ipAddress,
          userId: normalizedUserId,
          limit: maxAttempts,
          windowMinutes: windowMin,
          blockMinutes: blockMin,
          client: supabase
        });
      }
      throw new Error(`Rate limit insert failed: ${insertError.message}`);
    }

    return { allowed: true, remaining: Math.max(0, maxAttempts - 1) };
  }

  const retryAfter = getRetryAfterSeconds(existing.blocked_until, nowTs);
  if (retryAfter) {
    return { allowed: false, retryAfterSeconds: retryAfter, remaining: 0 };
  }

  const existingWindowTs = new Date(existing.window_start).getTime();
  const inSameWindow = Number.isFinite(existingWindowTs) && existingWindowTs >= windowStartTs;
  const nextAttempts = inSameWindow ? existing.attempts + 1 : 1;
  const shouldBlock = nextAttempts > maxAttempts;
  const nextBlockedUntil = shouldBlock ? lockUntilIso : null;

  const { error: updateError } = await supabase
    .from("rate_limits")
    .update({
      attempts: nextAttempts,
      window_start: inSameWindow ? existing.window_start : nowIso,
      blocked_until: nextBlockedUntil,
      updated_at: nowIso
    })
    .eq("id", existing.id);

  if (updateError) {
    throw new Error(`Rate limit update failed: ${updateError.message}`);
  }

  if (shouldBlock) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, blockMin * 60),
      remaining: 0
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - nextAttempts)
  };
}

export function checkInMemoryRateLimit({
  action,
  ip,
  userId,
  limit,
  windowMinutes,
  blockMinutes
}: Omit<CheckRateLimitParams, "client">): RateLimitResult {
  const actionKey = action.trim();
  if (!actionKey) {
    return { allowed: true };
  }

  const ipAddress = ip?.trim() || "unknown";
  const normalizedUserId = userId?.trim() || "anonymous";
  const policy = resolveRateLimitPolicy({ action: actionKey, limit, windowMinutes, blockMinutes });
  const maxAttempts = policy.limit;
  const windowMin = policy.windowMinutes;
  const blockMin = policy.blockMinutes;
  const nowTs = Date.now();
  const windowMs = windowMin * 60 * 1000;
  const blockMs = blockMin * 60 * 1000;
  const key = `${actionKey}:${ipAddress}:${normalizedUserId}`;

  const current = inMemoryBuckets.get(key);
  if (!current) {
    inMemoryBuckets.set(key, {
      attempts: 1,
      windowStartTs: nowTs,
      blockedUntilTs: null
    });
    return { allowed: true, remaining: Math.max(0, maxAttempts - 1) };
  }

  if (current.blockedUntilTs && current.blockedUntilTs > nowTs) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.blockedUntilTs - nowTs) / 1000)),
      remaining: 0
    };
  }

  if (current.blockedUntilTs && current.blockedUntilTs <= nowTs) {
    current.blockedUntilTs = null;
    current.attempts = 0;
    current.windowStartTs = nowTs;
  }

  if (nowTs - current.windowStartTs > windowMs) {
    current.attempts = 0;
    current.windowStartTs = nowTs;
  }

  current.attempts += 1;
  if (current.attempts > maxAttempts) {
    current.blockedUntilTs = nowTs + blockMs;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(blockMs / 1000)),
      remaining: 0
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - current.attempts)
  };
}
