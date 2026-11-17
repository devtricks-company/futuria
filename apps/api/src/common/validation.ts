import { BadRequestException, StandardSchemaValidationPipe } from '@nestjs/common';
import type { ApiErrorBody } from '@futuria/shared';

type IssuePath = readonly (PropertyKey | { key: PropertyKey })[] | undefined;

function formatPath(path: IssuePath): string {
  if (!path?.length) return '';
  return path
    .map((segment) => (typeof segment === 'object' ? segment.key : segment))
    .map(String)
    .join('.');
}

/** Zod (Standard Schema) validation for @Body({ schema }) / @Param('id', { schema }). */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => {
      const body: ApiErrorBody = {
        statusCode: 400,
        error: 'Bad Request',
        code: 'validation_failed',
        message: 'Request validation failed',
        issues: issues.map((issue) => ({ path: formatPath(issue.path), message: issue.message })),
      };
      return new BadRequestException(body);
    },
  });
}
