# 🤖 Agent Rules of Engagement for AI Gateway Platform

**Target Stack:** Next.js (Pages Router), TypeScript, Tailwind CSS, Supabase PostgreSQL.

## 1. Architectural Philosophy
This is a zero-cost, high-efficiency orchestration engine. We heavily utilize AWS free tiers (Lambda, S3) and Azure VMs to avoid Vercel timeouts and egress limits. 

## 2. Directory Strictness
- `src/pages/api/`: ALL backend code goes here. 
- `src/lib/`: Core utilities (Supabase clients, token limiters, AWS SDK wrappers).
- `db/schema.sql`: Database schema. If you need a new table, YOU MUST write the SQL here first before writing TS code.

## 3. API & Routing Rules
- All AI calls MUST be routed through our LiteLLM proxy via `LITELLM_PROXY_URL` using the standard OpenAI JSON payload format.
- DO NOT use native cloud AI SDKs unless writing a specific `try/catch` Failsafe mechanism.
- All endpoints must verify JWTs using `supabaseAdmin.auth.getUser()`.

## 4. Database Rules
- Never bypass Row Level Security (RLS) on the client side. 
- Use the Service Role Key (`SUPABASE_SERVICE_ROLE_KEY`) ONLY inside `src/pages/api/` for admin or billing ledger tasks.
