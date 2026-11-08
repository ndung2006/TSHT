import { Body, Controller, Headers, HttpException, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommentsService } from './comments.service';
import { parseCleanupMetaRequest } from './comments-helpers';

// Endpoint noi bo cho worker don IP/User-Agent binh luan cu (thiet ke
// §6.2, them sau khi subagent worker phat hien worker khong co Prisma/pg
// nen khong the truy van DB truc tiep). Worker goi POST
// /internal/cleanup-old-comment-meta voi 2 op (xem
// vtcany/worker/src/cleanup-old-comment-meta.ts):
//   { op: 'list',  cutoff: <ISO> } -> { rows: [{ id, createdAt, ip, userAgent }] }
//   { op: 'clear', ids: string[] } -> { cleared: number }
// Guard bang shared secret MEDIA_WEBHOOK_SECRET (header x-webhook-secret),
// giong /internal/transcode-queue va /internal/rollup-daily — khong JWT.
// Cutoff do worker tinh (12 thang = 365 ngay) va gui kem; backend chi ap
// dung, khong tu tinh lai.
@Controller()
export class CommentsInternalController {
  constructor(
    private readonly comments: CommentsService,
    private readonly config: ConfigService,
  ) {}

  @Post('internal/cleanup-old-comment-meta')
  async cleanup(@Headers('x-webhook-secret') secret: string, @Body() body: any) {
    const expected = this.config.get<string>('MEDIA_WEBHOOK_SECRET', '');
    if (!expected || secret !== expected) {
      throw new HttpException('forbidden', HttpStatus.FORBIDDEN);
    }
    let req: ReturnType<typeof parseCleanupMetaRequest>;
    try {
      req = parseCleanupMetaRequest(body);
    } catch (e: any) {
      throw new HttpException(
        { error: { code: e.code || 'bad_request', message: e.message || 'bad request' } },
        e.status || HttpStatus.BAD_REQUEST,
      );
    }
    if (req.op === 'list') {
      const rows = await this.comments.listStaleCommentMeta(req.cutoff);
      return { rows };
    }
    const cleared = await this.comments.clearCommentMeta(req.ids);
    return { cleared };
  }
}
