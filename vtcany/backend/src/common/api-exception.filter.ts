import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

// Envelope loi chuan cho moi client: { error: { code, message } }.
// FE/CMS chi can doc error.code thay vi parse tung status.
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body: any = exception.getResponse();
      const message = typeof body === 'string' ? body : body?.error?.message || body?.message || exception.message;
      const code = typeof body === 'object' && body?.error?.code ? body.error.code : this.codeFor(status);
      res.status(status).json({ error: { code, message } });
      return;
    }
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: 'internal_error', message: 'internal error' },
    });
  }

  codeFor(status: number): string {
    switch (status) {
      case 400:
        return 'bad_request';
      case 401:
        return 'unauthorized';
      case 403:
        return 'forbidden';
      case 404:
        return 'not_found';
      case 429:
        return 'rate_limited';
      default:
        return 'error';
    }
  }
}
