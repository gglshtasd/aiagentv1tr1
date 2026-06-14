
> **Note to Agents:** This file contains the architectural context, build commands, and strict coding standards for the `aiagentv1tr1` platform. You must review and adhere to these rules before modifying the codebase.

### **1. Project Overview**

`aiagentv1tr1` is an AI coding platform and gateway. It serves as a tiered execution engine (Chat, Git, Sandbox) with built-in token optimization, financial ledger enforcement (monthly INR credit limits), and memory profiling.

### **2. Tech Stack & Architecture**

* **Framework:** Next.js (utilizing the Pages Router, located in `src/pages/`).


* **Language:** TypeScript (strict mode enabled via `tsconfig.json`).


* **Styling:** Tailwind CSS (`tailwind.config.js`, `postcss.config.js`).


* **Database & Auth:** Supabase (PostgreSQL). Schema migrations are stored in `db/schema.sql`.


* **Testing:** Jest/Vitest for unit testing (located in `tests/unit/`).



### **3. Directory Structure Guide**

When navigating or creating files, adhere strictly to this established structure:

* `src/pages/`: Contains all frontend routes and API endpoints.


* `src/pages/api/`: All serverless backend endpoints (e.g., `/api/chat`, `/api/sandbox`, `/api/git`).




* `src/components/`: Reusable React UI components (e.g., `ModelSelector.tsx`).


* `src/lib/`: Core backend logic, utilities, and integrations:


* `supabase.ts` / `supabase-client.ts`: Database and authentication initialization.


* `tier-classifier.ts`: Logic for routing tasks to Chat, Git, or Sandbox tiers.


* `token-limiter.ts`: Billing and rate-limiting guardrails.




* `tests/unit/`: Unit tests matching the files in `src/lib/` (e.g., `tier-classifier.test.ts`).



### **4. Agent Rules of Engagement**

* **Strict Typing:** Always define explicit TypeScript interfaces in `src/types/` (e.g., `api.ts`) before implementing new API routes. Do not use `any`.


* **Database Migrations:** If a feature requires modifying a database table, you must update `db/schema.sql` first before writing application logic.


* **API Standards:** All endpoints in `src/pages/api/` must route through the middleware (`src/middleware.ts`) for authentication and token validation before execution.


* **Testing Requirement:** If you modify core logic in `src/lib/`, you must run and update the corresponding tests in `tests/unit/`.



---

Now that we have the instruction manual for the autonomous agents sorted out, should we move on to drafting the custom Next.js API middleware to hook up the **LLMLingua** token compressor?
