import { SetMetadata } from '@nestjs/common';

export const ALLOW_ANONYMOUS_KEY = 'futuria:allowAnonymous';

/**
 * Lets signed-out visitors (an `x-anon-id` header, no account) reach a route. Everything else
 * answers them 401 `signup_required`: running a simulation is the signup gate (journey step 5).
 */
export const AllowAnonymous = () => SetMetadata(ALLOW_ANONYMOUS_KEY, true);
