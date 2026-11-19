import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { config } from 'src/config';

@Catch()
export class SocialAuthExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) {
      return;
    }

    let error = 'server_error';
    if (exception instanceof ForbiddenException) {
      error = 'network_conflict';
    } else if (exception instanceof UnauthorizedException) {
      error = 'unauthorized';
    } else {
      console.error('Social login callback error:', exception);
    }

    res.redirect(`${config.FRONTEND_URL}/callback?error=${error}`);
  }
}
