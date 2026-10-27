import { Controller, Get, HttpException, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MoviesService } from './movies.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Public (ẩn danh xem được). Chỉ /favorite yêu cầu JWT.
@Controller('movies')
export class MoviesController {
  constructor(private movies: MoviesService, private jwt: JwtService) {}

  private optionalUserId(req: any): string | undefined {
    const header: string = req.headers?.authorization || '';
    const [, token] = header.split(' ');
    if (!token) return undefined;
    try {
      const payload = this.jwt.verify(token);
      return payload?.sub;
    } catch {
      return undefined;
    }
  }

  private toHttp(e: any): never {
    const status = e?.status === 404 ? HttpStatus.NOT_FOUND : e?.status === 400 ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR;
    throw new HttpException({ error: { code: status === 404 ? 'not_found' : 'bad_request', message: e?.message } }, status);
  }

  // GET /api/v1/movies/{public_id} (Mục 3B).
  @Get(':publicId')
  async detail(@Param('publicId') publicId: string, @Req() req: any) {
    try {
      return await this.movies.detail(publicId, this.optionalUserId(req));
    } catch (e) {
      this.toHttp(e);
    }
  }

  @Get(':publicId/episodes')
  async episodes(@Param('publicId') publicId: string) {
    try {
      return await this.movies.episodeList(publicId);
    } catch (e) {
      this.toHttp(e);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post(':publicId/favorite')
  async favorite(@Param('publicId') publicId: string, @Req() req: any) {
    try {
      return await this.movies.toggleFavorite(req.user.sub, publicId);
    } catch (e) {
      this.toHttp(e);
    }
  }
}
