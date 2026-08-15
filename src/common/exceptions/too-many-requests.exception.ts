import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 429 + retryAfter. Mobile app aa `retryAfter` thi j resend timer
 * ("00:45 pachhi fari mokalo") dekhaadi shake chhe.
 */
export class TooManyRequestsException extends HttpException {
  constructor(message: string, readonly retryAfter: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message,
        error: 'Too Many Requests',
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
