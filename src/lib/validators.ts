import type { ClassifyRequest, Tier } from '../types/api';

export const PROMPT_REGEX = /^[\p{L}\p{N}\p{P}\p{S}\s]+$/u;
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_TIERS: Tier[] = ['CHAT', 'GIT', 'SANDBOX'];

export function isValidEmail(value: string): boolean {
  if (value.length < 5 || value.length > 320 || /\s/.test(value)) {
    return false;
  }

  const atIndex = value.indexOf('@');
  if (atIndex <= 0 || atIndex !== value.lastIndexOf('@')) {
    return false;
  }

  const localPart = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  if (!localPart || domain.length < 3 || domain.startsWith('.') || domain.endsWith('.')) {
    return false;
  }

  const dotIndex = domain.indexOf('.');
  return dotIndex > 0 && dotIndex < domain.length - 1;
}

export function validatePrompt(prompt: string): string | null {
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return 'prompt is required';
  }

  if (prompt.length > 10000) {
    return 'prompt exceeds max length of 10,000 characters';
  }

  if (!PROMPT_REGEX.test(prompt)) {
    return 'prompt contains invalid characters';
  }

  return null;
}

export function validateUserId(userId: string): string | null {
  if (typeof userId !== 'string' || userId.length === 0) {
    return 'user_id is required';
  }

  if (!UUID_REGEX.test(userId) && !isValidEmail(userId)) {
    return 'user_id must be a valid UUID or email';
  }

  return null;
}

export function validateRequestedTier(tier: string): string | null {
  if (!VALID_TIERS.includes(tier as Tier)) {
    return 'requested_tier must be one of CHAT, GIT, SANDBOX';
  }

  return null;
}

export function validateClassifyRequest(input: ClassifyRequest): string[] {
  const errors: string[] = [];

  const promptError = validatePrompt(input.prompt);
  if (promptError) {
    errors.push(promptError);
  }

  const userIdError = validateUserId(input.user_id);
  if (userIdError) {
    errors.push(userIdError);
  }

  const tierError = validateRequestedTier(input.requested_tier);
  if (tierError) {
    errors.push(tierError);
  }

  return errors;
}
