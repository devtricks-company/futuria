import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import mongoose from 'mongoose';
import type { ApiErrorBody } from '@futuria/shared';

/** Turns database errors into clean API errors instead of generic 500s. */
@Catch(mongoose.Error.CastError, mongoose.Error.ValidationError, mongoose.mongo.MongoServerError)
export class MongoExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MongoExceptionFilter.name);

  catch(exception: Error, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let body: ApiErrorBody;

    if (exception instanceof mongoose.Error.CastError) {
      body = {
        statusCode: 400,
        error: 'Bad Request',
        code: 'invalid_value',
        message: `Invalid value for ${exception.path}`,
      };
    } else if (exception instanceof mongoose.Error.ValidationError) {
      body = {
        statusCode: 400,
        error: 'Bad Request',
        code: 'validation_failed',
        message: 'Document validation failed',
        issues: Object.values(exception.errors).map((e) => ({ path: e.path, message: e.message })),
      };
    } else if ((exception as { code?: number }).code === 11000) {
      body = {
        statusCode: 409,
        error: 'Conflict',
        code: 'duplicate',
        message: 'Resource already exists',
      };
    } else {
      this.logger.error(exception.message, exception.stack);
      body = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'Database error',
      };
    }
    res.status(body.statusCode).json(body);
  }
}
