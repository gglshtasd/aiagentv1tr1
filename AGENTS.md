# 🤖 Agent Rules of Engagement for aiagentv1tr1

**Target Stack:** Next.js (Pages Router), TypeScript, Tailwind CSS, Supabase PostgreSQL.

## 1. Directory Strictness
- `src/pages/api/`: ALL backend code goes here. 
- `src/lib/`: Core utilities (Supabase clients, token limiters).
- `db/schema.sql`: Database schema. If you need a new table, YOU MUST write the SQL here first before writing TS code.

## 2. API & Routing Rules
- All AI calls MUST be routed through our LiteLLM proxy via `LITELLM_PROXY_URL` using the standard OpenAI JSON payload format. DO NOT use the AWS Bedrock SDK directly.
- All endpoints must verify JWTs using `supabaseAdmin.auth.getUser()`.

## 3. Database Rules
- Never bypass Row Level Security (RLS) on the client side. 
- Use the Service Role Key (`SUPABASE_SERVICE_ROLE_KEY`) ONLY inside `src/pages/api/` for admin/ledger tasks.

## 4. UI/UX Rules
- Use Tailwind CSS strictly. Do not create raw `.css` files unless absolutely necessary in `globals.css`.
- Rely on dark mode aesthetics (`bg-gray-900`, `text-gray-100`).
