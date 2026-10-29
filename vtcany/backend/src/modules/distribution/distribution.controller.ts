import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { DistributionService } from './distribution.service';

class DistributionDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  caption?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string | null;

  @IsOptional()
  @IsString()
  mediaType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  platforms?: string[];
}

class MarkTargetDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  url?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

@UseGuards(PermissionsGuard)
@Controller('admin/distribution')
export class DistributionAdminController {
  constructor(private readonly dist: DistributionService) {}

  private actor(req: any): string | undefined {
    return req.user?.sub || req.user?.id || undefined;
  }

  @Get()
  @RequirePerms('distribution:view')
  async list() {
    return this.dist.listAdmin();
  }

  @Post()
  @RequirePerms('distribution:create')
  async create(@Body() dto: DistributionDto, @Req() req: any) {
    return this.dist.create(dto, this.actor(req));
  }

  @Patch(':publicId')
  @RequirePerms('distribution:update')
  async update(@Param('publicId') publicId: string, @Body() dto: DistributionDto) {
    return this.dist.update(publicId, dto);
  }

  @Delete(':publicId')
  @RequirePerms('distribution:delete')
  async remove(@Param('publicId') publicId: string) {
    return this.dist.remove(publicId);
  }

  @Post(':publicId/publish')
  @RequirePerms('distribution:publish')
  async publish(@Param('publicId') publicId: string) {
    return this.dist.publish(publicId);
  }

  @Post(':publicId/unpublish')
  @RequirePerms('distribution:publish')
  async unpublish(@Param('publicId') publicId: string) {
    return this.dist.unpublish(publicId);
  }

  // Danh dau thu cong dich facebook/tiktok (dan link that sau khi dang tay).
  @Patch(':publicId/targets/:platform')
  @RequirePerms('distribution:update')
  async markTarget(
    @Param('publicId') publicId: string,
    @Param('platform') platform: string,
    @Body() dto: MarkTargetDto,
  ) {
    return this.dist.markTarget(publicId, platform, dto);
  }
}
