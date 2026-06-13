# AI Gateway Platform: Copilot Agent Setup & Context Guide

## Project Overview

**AI Gateway Platform** is a secure, cost-optimized AI request routing & pooling system running on **Vercel (frontend) + Supabase (data) + AWS Bedrock + E2E Networks (execution)**.

**Core Mission:**
- Pool AWS Bedrock and E2E Network compute credits under a single gateway
- Apply custom cost markups per user tier (chat, git, sandbox)
- Enforce strict model access via role-based database rules
- Compress/cache tokens to maximize efficiency
- Provide zero-cost control plane (all management UI on serverless free tier)
- Collect telemetry without impacting token budget

**Target Users:** Dev teams with heterogeneous AI needs (chat, code analysis, interactive sandboxes)

---

## Architecture Components

### 1. **Frontend (Vercel Next.js)**
- **Invite-only auth system** (Supabase Auth or custom JWT)
- **Admin control panel** at `/admin` (protected, role-gated)
- **Role-based UI rendering** (display available models based on `user_model_access` table)
- **Request submission interface** (multi-tier selection, prompt input, token preview)
- **Usage dashboard** (per-user token spend, cost breakdown by tier)
- Framework: Next.js 13+ (App Router)
- Styling: Tailwind CSS
- State: React Query for API caching
- Auth: Supabase PostgREST with JWT tokens

### 2. **Backend Services (Vercel API Routes)**

#### **Pre-Flight Classifier** (`/api/classify`)
- Accepts: `{ prompt, user_id, requested_tier }`
- Validates user model access from `user_model_access` table
- Routes request to appropriate tier:
  - **Chat tier** → AWS Bedrock (Claude/Llama models)
  - **Git tier** → GitHub Actions workflow dispatch
  - **Sandbox tier** → E2E Networks provisioning
- Returns: `{ tier, model, estimated_tokens, estimated_cost, request_id }`

#### **Token Optimization Pipeline**
- **Prompt Compression** (LLMLingua): Reduce input tokens by 30-50% via semantic importance scoring
- **Token Caching** (GPTCache): Semantic deduplication of recent requests
- **AWS Bedrock Prompt Caching**: Native caching for system prompts (25% cost reduction on repeats)
- **Strict Token Limits**: Hardcoded max_tokens per tier in config
  - Chat: 4k context, 2k completion
  - Git: 8k context, 4k completion
  - Sandbox: 16k context, 8k completion

#### **Telemetry Pipeline**
- **PostHog integration** (event tracking without token consumption)
- Tracks: request routing, token usage, error rates, tier distribution
- Dashboard: `/admin/analytics`

#### **Request Handlers**
- `/api/chat` - AWS Bedrock proxy with LiteLLM
- `/api/git` - GitHub Actions dispatch + polling
- `/api/sandbox` - E2E Networks session manager
- `/api/usage` - Read-only usage aggregation

### 3. **Data Layer (Supabase PostgreSQL)**

#### **Core Tables**
```sql
-- Users & Authentication
users (id, email, role, created_at, updated_at)

-- Model Access Control
user_model_access (
  id, user_id, model_name, tier,
  max_tokens_per_month, max_tokens_per_request,
  cost_multiplier, enabled, created_at
)

-- Request Tracking
admin_requests (
  id, user_id, request_id, tier, model,
  input_tokens, output_tokens, cached_tokens,
  cost_usd, status, created_at, completed_at
)

-- Admin Controls
tier_config (
  tier_name, model_list, max_concurrent,
  cost_per_1k_tokens, compression_enabled, cache_enabled
)

-- E2E Networks Sessions (if using)
e2e_sessions (
  id, user_id, request_id, instance_id, 
  status, idle_timeout_sec, created_at, ended_at
)
```

#### **Key Constraints**
- Row-level security (RLS) enabled on all tables
- Service role used only for admin operations
- Anon role for public endpoints (with strict WHERE clauses)

### 4. **Execution Tiers**

| Tier | Compute | Model | Latency | Cost | Use Case |
|------|---------|-------|---------|------|----------|
| **Chat** | AWS Bedrock | Claude 3.5 Sonnet, Llama 3.1 405B | <2s | $0.003/1k tokens | General QA, summarization |
| **Git** | GitHub Actions | Custom Python scripts | Async (5min-1hr) | $0.0015/1k tokens + compute | Code analysis, refactoring |
| **Sandbox** | E2E Networks | Ubuntu 22.04 + custom env | <30s setup + execution | $0.002/1k tokens + instance/min | Interactive debugging, live coding |

---

## File Structure (Build Order)

```
/repo-root
├── COPILOT_CONTEXT.md          ← This file (primary agent guide)
├── ARCHITECTURE.md             ← System diagrams & flow charts
├── API_SPECS.md                ← OpenAPI spec for all routes
├── README.md                   ← User-facing project description
├── .env.example                ← Template for env variables
│
├── /src
│   ├── /pages
│   │   ├── /api
│   │   │   ├── classify.ts     ← Pre-flight classifier (PRIORITY #1)
│   │   │   ├── chat.ts         ← Bedrock proxy
│   │   │   ├── git.ts          ← GitHub Actions dispatcher
│   │   │   ├── sandbox.ts      ← E2E Networks manager
│   │   │   ├── usage.ts        ← Aggregated usage stats
│   │   │   └── /auth
│   │   │       └── [...nextauth].ts (if using NextAuth)
│   │   │
│   │   ├── /admin
│   │   │   ├── dashboard.tsx   ← Admin control panel
│   │   │   ├── users.tsx       ← User management
│   │   │   ├── models.tsx      ← Model/tier config UI
│   │   │   └── analytics.tsx   ← PostHog dashboard
│   │   │
│   │   ├── /chat
│   │   │   ├── page.tsx        ← Chat interface
│   │   │   └── layout.tsx
│   │   │
│   │   └── index.tsx           ← Landing page
│   │
│   ├── /lib
│   │   ├── tier-classifier.ts  ← Routing logic (PRIORITY #1)
│   │   ├── token-limiter.ts    ← Max token enforcement
│   │   ├── cache-manager.ts    ← GPTCache + Bedrock cache
│   │   ├── compression.ts      ← LLMLingua wrapper
│   │   ├── bedrock-client.ts   ← AWS SDK wrapper
│   │   ├── e2e-manager.ts      ← E2E Networks provisioning
│   │   ├── github-actions.ts   ← GitHub API wrapper
│   │   ├── telemetry.ts        ← PostHog client
│   │   ├── supabase.ts         ← Supabase client config
│   │   ├── auth-utils.ts       ← JWT/session logic
│   │   └── validators.ts       ← Input regex/schema validation
│   │
│   ├── /components
│   │   ├── RequestForm.tsx      ← Unified request submission
│   │   ├── TierSelector.tsx     ← Tier selection UI
│   │   ├── TokenPreview.tsx     ← Real-time token estimate
│   │   ├── CostDisplay.tsx      ← Cost breakdown
│   │   ├── AdminGuard.tsx       ← Role-based render guard
│   │   └── /admin
│   │       ├── UserTable.tsx
│   │       ├── ModelAccessForm.tsx
│   │       └── AnalyticsDashboard.tsx
│   │
│   ├── /types
│   │   ├── index.ts            ← Shared TypeScript types
│   │   ├── api.ts              ← API request/response shapes
│   │   └── database.ts         ← DB row types
│   │
│   ├── /middleware
│   │   ├── auth.ts             ← JWT verification
│   │   ├── rate-limit.ts       ← Per-user rate limiting
│   │   └── admin-check.ts      ← Admin role verification
│   │
│   ├── /styles
│   │   └── globals.css         ← Tailwind config
│   │
│   └── layout.tsx              ← Root layout
│
├── /db
│   ├── schema.sql              ← Full DDL for all tables
│   ├── migrations/
│   │   ├── 001_init.sql        ← Initial schema
│   │   ├── 002_user_model_access.sql
│   │   ├── 003_tier_config.sql
│   │   └── 004_rls_policies.sql
│   │
│   ├── seeds/
│   │   └── dev.sql             ← Sample data for local dev
│   │
│   └── README.md               ← DB setup instructions
│
├── /docs
│   ├── ARCHITECTURE.md         ← System design deep-dive
│   ├── DEPLOYMENT.md           ← Vercel + Supabase deploy steps
│   ├── API_SPECS.md            ← OpenAPI/route documentation
│   ├── COST_SIMULATION.md      ← Cost formulas & examples
│   ├── TESTING.md              ← Test strategy & commands
│   └── TROUBLESHOOTING.md      ← Common issues & fixes
│
├── /tests
│   ├── unit/
│   │   ├── tier-classifier.test.ts
│   │   ├── token-limiter.test.ts
│   │   └── compression.test.ts
│   │
│   └── integration/
│       ├── api.classify.test.ts
│       ├── bedrock-integration.test.ts
│       └── e2e-provisioning.test.ts
│
├── package.json                ← Dependencies
├── next.config.js              ← Next.js config
├── tsconfig.json               ← TypeScript config
├── tailwind.config.js          ← Tailwind config
├── .env.example                ← Env variable template
└── .gitignore

```

---

## Key Implementation Tasks (Prioritized)

### **Phase 1: Foundation (Week 1)**
- [ ] **TASK 1.1** - Create Supabase database schema (users, user_model_access, admin_requests)
- [ ] **TASK 1.2** - Set up Vercel project with Next.js 13+ (App Router)
- [ ] **TASK 1.3** - Implement Supabase auth (invite-only signup)
- [ ] **TASK 1.4** - Create pre-flight classifier logic & route `/api/classify`
- [ ] **TASK 1.5** - Build tier-based access enforcement (check user_model_access in DB)

### **Phase 2: Token Optimization (Week 2)**
- [ ] **TASK 2.1** - Integrate LLMLingua for prompt compression
- [ ] **TASK 2.2** - Implement GPTCache with semantic matching
- [ ] **TASK 2.3** - Add AWS Bedrock prompt caching (via LiteLLM)
- [ ] **TASK 2.4** - Create token limiter middleware (enforce max_tokens per tier)
- [ ] **TASK 2.5** - Build token preview UI component

### **Phase 3: Execution Tiers (Week 3)**
- [ ] **TASK 3.1** - AWS Bedrock integration (`/api/chat` route)
- [ ] **TASK 3.2** - GitHub Actions dispatcher (`/api/git` route)
- [ ] **TASK 3.3** - E2E Networks provisioner with 15-min idle kill-switch (`/api/sandbox`)
- [ ] **TASK 3.4** - Unified request tracking table (admin_requests)

### **Phase 4: Telemetry & Admin Panel (Week 4)**
- [ ] **TASK 4.1** - PostHog integration for event tracking
- [ ] **TASK 4.2** - Admin dashboard (`/admin/dashboard`) with analytics
- [ ] **TASK 4.3** - User management UI (`/admin/users`)
- [ ] **TASK 4.4** - Model access control UI (`/admin/models`)
- [ ] **TASK 4.5** - Usage/cost breakdown dashboard

### **Phase 5: Hardening (Week 5)**
- [ ] **TASK 5.1** - Input validation (regex + Llama Guard for safety)
- [ ] **TASK 5.2** - Rate limiting per user + tier
- [ ] **TASK 5.3** - Cost guardrail alerts
- [ ] **TASK 5.4** - Comprehensive test suite (unit + integration)
- [ ] **TASK 5.5** - Security audit & deployment checklist

---

## Coding Standards & Constraints

### **Cost Guardrails (Non-Negotiable)**
```typescript
// In /lib/token-limiter.ts
const TIER_LIMITS = {
  CHAT: { context_max: 4000, completion_max: 2000, monthly_max: 100_000 },
  GIT: { context_max: 8000, completion_max: 4000, monthly_max: 50_000 },
  SANDBOX: { context_max: 16_000, completion_max: 8000, monthly_max: 25_000 }
};

// Hardcoded max tokens - CANNOT be overridden by user input
function enforceTokenLimit(tokens: number, tier: Tier): void {
  if (tokens > TIER_LIMITS[tier].monthly_max) {
    throw new Error(`Exceeds ${tier} monthly limit`);
  }
}
```

### **E2E Networks Kill-Switch (Required)**
```typescript
// In /lib/e2e-manager.ts
const IDLE_TIMEOUT_SECONDS = 15 * 60; // 15 minutes

async function provisionInstance(sessionId: string): Promise<void> {
  const instance = await e2eClient.create({
    image: 'ubuntu:22.04',
    idleTimeout: IDLE_TIMEOUT_SECONDS,
  });
  // Instance auto-terminates after 15 min inactivity
}
```

### **Token Compression (Required for all tiers)**
```typescript
// In /lib/compression.ts
import { LLMLingua } from 'llmlingua';

async function compressPrompt(fullPrompt: string): Promise<string> {
  const llmlingua = new LLMLingua();
  return await llmlingua.compress(fullPrompt, {
    target_ratio: 0.5, // Aim for 50% reduction
    min_tokens_to_remove: 10,
  });
}

// Usage: Always compress before sending to LLM
const compressed = await compressPrompt(userPrompt);
const response = await bedrock.invoke(compressed); // Reduced tokens
```

### **Semantic Caching (Optional but recommended)**
```typescript
// In /lib/cache-manager.ts
import GPTCache from 'gptcache';

const cache = new GPTCache({
  similarity_threshold: 0.95,
  ttl_seconds: 3600,
});

async function cachedBedrock(prompt: string): Promise<string> {
  // Check semantic cache first
  const cached = await cache.get(prompt);
  if (cached) return cached;
  
  // If miss, call Bedrock
  const response = await bedrock.invoke(prompt);
  await cache.set(prompt, response);
  return response;
}
```

### **Input Validation (Strict)**
```typescript
// In /lib/validators.ts
const PROMPT_REGEX = /^[a-zA-Z0-9\s\.\,\!\?\-\'\"]{1,10000}$/;
const USER_ID_REGEX = /^[a-z0-9]{8,}$/;

function validatePrompt(prompt: string): boolean {
  return PROMPT_REGEX.test(prompt) && prompt.length > 0;
}

function validateUserId(id: string): boolean {
  return USER_ID_REGEX.test(id);
}

// Also: Use Llama Guard for safety
const safetyCheck = await llamaGuard.check(prompt);
if (safetyCheck.isFlagged) {
  throw new Error('Prompt violates safety policy');
}
```

### **API Response Format (Consistent)**
```typescript
// All routes must return this shape
interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  requestId: string;
  timestamp: ISO8601String;
}

// Example
return res.json({
  success: true,
  data: { tier: 'CHAT', estimatedCost: 0.003, estimatedTokens: 150 },
  requestId: 'req_abc123',
  timestamp: new Date().toISOString(),
});
```

### **Database Operations (Always use Supabase client)**
```typescript
// In /lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Server-side only
);

// Example query with RLS enforcement
const { data, error } = await supabase
  .from('user_model_access')
  .select('*')
  .eq('user_id', req.user.id) // RLS will enforce this
  .single();
```

---

## Environment Variables & Secrets

### **Required `.env.local` (Vercel)**
```bash
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxx...
SUPABASE_ANON_KEY=eyJxx...

# AWS Bedrock
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# E2E Networks
E2E_API_KEY=key_...
E2E_API_URL=https://api.e2enetworks.com

# GitHub (for Actions dispatch)
GITHUB_PAT=ghp_...
GITHUB_WORKFLOW_REPO=owner/repo

# PostHog (telemetry)
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.posthog.com

# Auth
JWT_SECRET=your-random-secret-key-min-32-chars
NEXTAUTH_SECRET=your-nextauth-secret

# Cost Multipliers (for markup)
CHAT_COST_MULTIPLIER=1.5
GIT_COST_MULTIPLIER=1.2
SANDBOX_COST_MULTIPLIER=1.8
```

---

## Testing & Deployment Checklist

### **Pre-Deployment Verification**

- [ ] **Security**
  - [ ] All secrets in `.env.local` (never in git)
  - [ ] RLS enabled on all Supabase tables
  - [ ] JWT token validation on every API route
  - [ ] CORS properly configured
  - [ ] Input validation on all routes (regex + Llama Guard)
  
- [ ] **Cost Guardrails**
  - [ ] Max token limits enforced per tier
  - [ ] Cost multipliers applied correctly
  - [ ] E2E idle timeout set to 15 minutes
  - [ ] Monthly spend cap alerts configured
  
- [ ] **Functionality**
  - [ ] Pre-flight classifier routes correctly to all three tiers
  - [ ] Token compression reduces input by >30%
  - [ ] Cache hit rate >20% on repeated prompts
  - [ ] Admin can modify user_model_access
  - [ ] Usage dashboard shows accurate token counts
  
- [ ] **Performance**
  - [ ] Classify latency <500ms
  - [ ] Chat responses <2s (p95)
  - [ ] Admin dashboard loads <1s
  - [ ] No N+1 queries in user endpoints
  
- [ ] **Testing**
  - [ ] Unit tests for tier-classifier (100% coverage)
  - [ ] Unit tests for token-limiter (100% coverage)
  - [ ] Integration tests for /api/classify
  - [ ] Integration tests for Bedrock proxy
  - [ ] Load test: 100 concurrent requests
  
- [ ] **Monitoring**
  - [ ] PostHog events flowing correctly
  - [ ] Error rate <0.5%
  - [ ] Vercel build time <2min
  - [ ] Database query logs healthy

### **Deployment Steps**

1. **Local Testing**
   ```bash
   npm install
   npm run test
   npm run build
   npm run dev
   ```

2. **Supabase Setup**
   ```bash
   supabase link --project-ref xxxxx
   supabase db push # Applies migrations
   supabase seed dev # Loads test data
   ```

3. **Vercel Deployment**
   ```bash
   vercel env pull # Loads .env.local
   vercel deploy --prod
   ```

4. **Post-Deploy Smoke Tests**
   - Test `/api/classify` with valid request
   - Test admin panel login
   - Test token compression works
   - Verify PostHog events in dashboard

---

## Copilot Agent Instructions

### **When Using GitHub Coding Agent**

The coding agent should follow these principles:

1. **Reference this file in the problem statement** — link to `COPILOT_CONTEXT.md` to ensure consistency
2. **Implement one task at a time** — follow the Phase/Priority order above
3. **Always include tests** — unit tests for lib functions, integration tests for API routes
4. **Update relevant docs** — after completing a task, update `ARCHITECTURE.md` or API_SPECS.md
5. **Follow the file structure** — place files in the exact paths specified above
6. **Use TypeScript** — strict mode enabled, no `any` types
7. **Type safety first** — define types in `/src/types` before implementation

### **Example Agent Prompt**

```
Using COPILOT_CONTEXT.md as your guide, implement TASK 1.4:
Create the pre-flight classifier route at /api/classify that:
1. Accepts POST { prompt, user_id, requested_tier }
2. Validates user_id is in the database
3. Checks user_model_access table for tier permission
4. Returns { tier, model, estimated_tokens, estimated_cost }
5. Include TypeScript types in /src/types/api.ts
6. Write unit tests in /tests/unit/tier-classifier.test.ts
7. Include error handling for invalid inputs (use validators.ts)
```

---

## Quick Reference: Cost Formulas

**Token Cost Calculation:**
```
base_cost = (input_tokens + output_tokens) / 1000 * base_rate
after_compression = base_cost * 0.7 (LLMLingua ~30% reduction)
after_markup = after_compression * tier_cost_multiplier
final_cost = after_markup + cache_hit_discount
```

**Example:**
- Chat tier, Claude 3.5 Sonnet: $0.003/1k input, $0.015/1k output
- User input: 5,000 tokens (compressed to 3,500)
- Model output: 2,000 tokens
- Cost = ((3500 + 2000) / 1000 * 0.009) * 1.5 markup = $0.0825
- If cached: $0.0825 * 0.75 (25% discount) = $0.0619

---

## Contact & Support

- **Documentation:** See `/docs/` directory
- **Issues:** GitHub Issues with labels (bug, enhancement, question)
- **Code Questions:** Reference specific files in this guide

Last updated: June 2026
