# Copilot Agent Setup & Context Guide

## Project Overview
[Your AI Gateway project description and objectives]

## Architecture Components
1. **Frontend (Vercel Next.js)**
   - Invite-only auth system
   - Admin control panel at `/admin`
   - Role-based UI rendering
   
2. **Backend Services**
   - Pre-flight classifier (route to chat/git/sandbox)
   - Token optimization (caching, compression)
   - Telemetry pipeline
   
3. **Data Layer (Supabase PostgreSQL)**
   - user_model_access table
   - admin_requests table
   - usage tracking
   
4. **Execution Tiers**
   - Static Chat: AWS Bedrock
   - Async Git: GitHub Actions
   - Live Sandbox: E2E Networks

## File Structure
- `/src` - Next.js app code
- `/db` - Supabase schema & migrations
- `/lib` - Shared utilities, LiteLLM config, caching
- `/api` - Vercel API routes
- `/admin` - Protected admin routes
- `/components` - React components

## Key Implementation Tasks
[Detailed checklist for Copilot to reference when generating code]

## Coding Standards & Constraints
- Cost guardrails: max_tokens hardcoded per tier
- Idle kill-switch on E2E instances (15 min timeout)
- LLMLingua token compression required
- GPTCache for semantic deduplication
- Strict regex validation on all inputs

## Environment Variables & Secrets
[List of required env vars for AWS Bedrock, Supabase, E2E Networks, PostHog]

## Testing & Deployment Checklist
[Pre-deployment verification steps]
