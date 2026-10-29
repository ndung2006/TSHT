// Goi 1C: endpoint chuyen doi cheo (xem crossmedia-map.ts ve pham vi).
// Gate duy nhat: 'articles:create' — tao ban nhap la tao bai viet; khong
// them quyen moi. ValidationPipe whitelist:true o main.ts nen DTO phai khai
// bao du truong (bai hoc tu loi 1B: formatData bi luoc vi thieu khai bao).
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { RolesService } from '../auth/roles.service';
import { CrossmediaService } from './crossmedia.service';

class FromTvDto {
  @IsString()
  entity!: string;

  @IsString()
  id!: string;
}

class FromEpaperDto {
  @IsString()
  publicId!: string;
}

@UseGuards(PermissionsGuard)
@Controller('admin/crossmedia')
export class CrossmediaController {
  constructor(
    private readonly crossmedia: CrossmediaService,
    private readonly roles: RolesService,
  ) {}

  private async actor(req: any) {
    const id = await this.roles.adminIdentity(req.user?.sub || '');
    return { id: req.user?.sub || null, username: req.user?.username || req.user?.sub || null, roleName: id?.roleName || null };
  }

  @RequirePerms('articles:create')
  @Post('from-tv')
  async fromTv(@Body() dto: FromTvDto, @Req() req: any) {
    return this.crossmedia.fromTv(dto?.entity, dto?.id, await this.actor(req));
  }

  @RequirePerms('articles:create')
  @Post('from-epaper')
  async fromEpaper(@Body() dto: FromEpaperDto, @Req() req: any) {
    return this.crossmedia.fromEpaper(dto?.publicId, await this.actor(req));
  }
}
