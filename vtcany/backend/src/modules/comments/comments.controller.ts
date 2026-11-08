import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CommentsService } from './comments.service';
import { CreateCommentDto, ReportCommentDto } from './comments.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Controller public + ban doc (§3.3/§3.4). GET list/config khong can
// dang nhap; khi co JWT enduser hop le thi them truong "mine".
@Controller('comments')
export class CommentsController {
  constructor(private comments: CommentsService, private jwt: JwtService) {}

  // JWT tuy chon (mau MoviesController.optionalUserId): khong token
  // hoac token hong -> van tra 200, mine=false. Chi token enduser moi
  // duoc tinh mine (token CMS khong phai ban doc).
  private optionalEnduserId(req: any): string | undefined {
    const header: string = req.headers?.authorization || '';
    const [, token] = header.split(' ');
    if (!token) return undefined;
    try {
      const payload: any = this.jwt.verify(token);
      if (payload?.kind !== 'enduser') return undefined;
      return payload?.sub;
    } catch {
      return undefined;
    }
  }

  private assertEnduser(req: any) {
    const payload = req.user;
    if (!payload || payload.kind !== 'enduser') {
      throw new HttpException('forbidden', HttpStatus.FORBIDDEN);
    }
    return payload;
  }

  @Get('config')
  async config() {
    return this.comments.getPublicConfig();
  }

  @Get()
  async list(
    @Query('articleSlug') articleSlug: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: any,
  ) {
    if (!articleSlug) {
      throw new HttpException(
        { error: { code: 'bad_request', message: 'articleSlug là bắt buộc' } },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.comments.listPublic(articleSlug, Number(page) || 1, Number(limit) || 20, this.optionalEnduserId(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req: any, @Body() dto: CreateCommentDto) {
    const payload = this.assertEnduser(req);
    return this.comments.createComment(payload.sub, dto, req);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  async mine(@Req() req: any, @Query('page') page?: string, @Query('limit') limit?: string) {
    const payload = this.assertEnduser(req);
    return this.comments.listMine(payload.sub, Number(page) || 1, Number(limit) || 20);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const payload = this.assertEnduser(req);
    return this.comments.deleteMine(payload.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/report')
  async report(@Req() req: any, @Param('id') id: string, @Body() dto: ReportCommentDto) {
    const payload = this.assertEnduser(req);
    return this.comments.report(payload.sub, id, dto?.reason);
  }
}
