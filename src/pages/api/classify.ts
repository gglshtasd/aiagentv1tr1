import type { NextApiRequest, NextApiResponse } from 'next';
import { PostHog } from 'posthog-node';
import { classifyTierRequest, ClassifierError } from '../../lib/tier-classifier';
import type { APIResponse, ClassifyRequest, ClassifyResponse } from '../../types/api';

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

type RateLimitState = {
  count: number;
  resetAt: number;
};

const rateLimits = new Map<string, RateLimitState>();

function consumeRateLimit(key: string, now = Date.now()): { remaining: number; resetAt: number; exceeded: boolean } {
  const current = rateLimits.get(key);
  if (!current || now >= current.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimits.set(key, { count: 1, resetAt });
    return { remaining: RATE_LIMIT_MAX - 1, resetAt, exceeded: false };
  }

  current.count += 1;
  rateLimits.set(key, current);
  return {
    remaining: Math.max(0, RATE_LIMIT_MAX - current.count),
    resetAt: current.resetAt,
    exceeded: current.count > RATE_LIMIT_MAX,
  };
}

function setRateLimitHeaders(res: NextApiResponse, remaining: number, resetAt: number): void {
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(resetAt / 1000)));
}

function respond(
  res: NextApiResponse<APIResponse<ClassifyResponse>>,
  status: number,
  payload: APIResponse<ClassifyResponse>,
  remaining: number,
  resetAt: number,
): void {
  setRateLimitHeaders(res, remaining, resetAt);
  res.status(status).json(payload);
}

function mapErrorToStatus(error: ClassifierError): number {
  switch (error.code) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'INVALID_USER':
      return 404;
    case 'UNAUTHORIZED_TIER':
      return 403;
    case 'LIMIT_EXCEEDED':
      return 429;
    default:
      return 500;
  }
}

function isClassifyRequest(body: unknown): body is ClassifyRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Partial<ClassifyRequest>;
  return (
    typeof candidate.prompt === 'string' &&
    typeof candidate.user_id === 'string' &&
    typeof candidate.requested_tier === 'string'
  );
}

async function captureClassifyEvent(request: ClassifyRequest, response: ClassifyResponse): Promise<void> {
  const posthogKey = process.env.POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;

  if (!posthogKey) {
    return;
  }

  const client = new PostHog(posthogKey, {
    host: process.env.POSTHOG_HOST ?? process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
  });

  client.capture({
    distinctId: request.user_id,
    event: 'classify_request',
    properties: {
      tier: response.tier,
      model: response.model,
      estimated_tokens: response.estimated_tokens,
      estimated_cost: response.estimated_cost,
      request_id: response.request_id,
    },
  });

  await client.shutdown();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<APIResponse<ClassifyResponse>>,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const rateLimitKey = req.socket.remoteAddress ?? 'anonymous';
  const { remaining, resetAt, exceeded } = consumeRateLimit(rateLimitKey);

  if (exceeded) {
    respond(
      res,
      429,
      {
        success: false,
        error: 'rate limit exceeded',
        requestId: 'req_rate_limited',
        timestamp,
      },
      remaining,
      resetAt,
    );
    return;
  }

  if (req.method !== 'POST') {
    respond(
      res,
      405,
      {
        success: false,
        error: 'method not allowed',
        requestId: 'req_method_not_allowed',
        timestamp,
      },
      remaining,
      resetAt,
    );
    return;
  }

  let body: unknown;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    respond(
      res,
      400,
      {
        success: false,
        error: 'invalid JSON body',
        requestId: 'req_invalid_json',
        timestamp,
      },
      remaining,
      resetAt,
    );
    return;
  }

  if (!isClassifyRequest(body)) {
    respond(
      res,
      400,
      {
        success: false,
        error: 'invalid request body shape',
        requestId: 'req_invalid_body',
        timestamp,
      },
      remaining,
      resetAt,
    );
    return;
  }

  try {
    const classification = await classifyTierRequest(body);
    await captureClassifyEvent(body, classification);

    respond(
      res,
      200,
      {
        success: true,
        data: classification,
        requestId: classification.request_id,
        timestamp,
      },
      remaining,
      resetAt,
    );
  } catch (error) {
    if (error instanceof ClassifierError) {
      respond(
        res,
        mapErrorToStatus(error),
        {
          success: false,
          error: error.message,
          requestId: error.requestId,
          timestamp,
        },
        remaining,
        resetAt,
      );
      return;
    }

    respond(
      res,
      500,
      {
        success: false,
        error: 'unexpected server error',
        requestId: 'req_internal_error',
        timestamp,
      },
      remaining,
      resetAt,
    );
  }
}
