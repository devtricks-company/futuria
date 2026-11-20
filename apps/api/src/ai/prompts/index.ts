import type { AiStep } from '@futuria/shared';
import { INTAKE_INSTRUCTIONS, INTAKE_PROMPT_VERSION } from './intake.js';
import { MODEL_INSTRUCTIONS, MODEL_PROMPT_VERSION } from './model.js';
import { NARRATIVE_INSTRUCTIONS, NARRATIVE_PROMPT_VERSION } from './narrative.js';

export { CAREER_LEAP_SYSTEM } from './career-leap.js';
export { intakeUserMessage } from './intake.js';
export { modelUserMessage } from './model.js';
export { narrativeUserMessage } from './narrative.js';

/** Step instructions and their versions. Bump a version whenever its prompt text changes. */
export const STEP_PROMPTS: Record<AiStep, { version: string; instructions: string }> = {
  intake: { version: INTAKE_PROMPT_VERSION, instructions: INTAKE_INSTRUCTIONS },
  model: { version: MODEL_PROMPT_VERSION, instructions: MODEL_INSTRUCTIONS },
  narrative: { version: NARRATIVE_PROMPT_VERSION, instructions: NARRATIVE_INSTRUCTIONS },
};

/** Stored on each simulation: which prompt set produced its AI content. */
export const PROMPT_SET_VERSION = [
  INTAKE_PROMPT_VERSION,
  MODEL_PROMPT_VERSION,
  NARRATIVE_PROMPT_VERSION,
].join(',');
