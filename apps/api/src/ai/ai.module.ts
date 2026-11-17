import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { AI_PROVIDER } from './ai.types.js';
import { createAiProvider } from './provider-factory.js';

@Global()
@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createAiProvider({
          AI_MODE: config.get('AI_MODE', { infer: true }),
          AI_MODEL: config.get('AI_MODEL', { infer: true }),
          AI_REFUSAL_FALLBACK: config.get('AI_REFUSAL_FALLBACK', { infer: true }),
          AI_PROMPT_CACHE: config.get('AI_PROMPT_CACHE', { infer: true }),
          ANTHROPIC_API_KEY: config.get('ANTHROPIC_API_KEY', { infer: true }),
          ANTHROPIC_AUTH_TOKEN: config.get('ANTHROPIC_AUTH_TOKEN', { infer: true }),
          ANTHROPIC_BASE_URL: config.get('ANTHROPIC_BASE_URL', { infer: true }),
        }),
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
