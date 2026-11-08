import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { CommentsService } from './comments.service';
import {
  HideAllByAuthorDto,
  HideCommentDto,
  RejectCommentDto,
  ReplyCommentDto,
  UpdateCommentSettingsDto,
} from './comments.dto';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { RolesService } from '../auth/roles.service';
import { hasModulePermission } from '../auth/permissions.catalog';
import { fallbackPermissionMap } from '../auth/admin-token';

// Controller CMS (§3.5). Doc hang kiem duyet: comments:view; moi thao
// tac kiem duyet + cai dat: comments:publish. ip/userAgent chi tra
// khi caller co comments:publish.
@UseGuards(PermissionsGuard)
@Controller('admin/comments')
export class AdminCommentsController {
  constructor(private comments: CommentsService, private roles: RolesService) {}

  // Caller co comments:publish khong (de quyet dinh co tra ip/ua).
  // Giong PermissionsGuard: DB-first, null -> fallback map theo role
  // trong JWT (token CMS cu chua co Role trong DB).
  private async canPublish(req: any): Promise<boolean> {
    try {
      const map = (await this.roles.permissionMapForAdmin(req.user?.sub || '')) || fallbackPermissionMap(req.user);
      return hasModulePermission(map, 'comments:publish');
    } catch {
      return hasModulePermission(fallbackPermissionMap(req.user), 'comments:publish');
    }
  }

  @RequirePerms('comments:view')
  @Get()
  async list(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('articleId') articleId?: string,
    @Query('q') q?: string,
    @Query('flagged') flagged?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const canPublish = await this.canPublish(req);
    return this.comments.adminList(
      { status, articleId, q, flagged, page: Number(page) || 1, limit: Number(limit) || 20 },
      canPublish,
    );
  }

  @RequirePerms('comments:publish')
  @Get(':id/reports')
  async listReports(@Param('id') id: string) {
    return this.comments.listReports(id);
  }

  @RequirePerms('comments:publish')
  @Get('settings')
  async getSettings() {
    return this.comments.getSettingsAdmin();
  }

  @RequirePerms('comments:publish')
  @Put('settings')
  async putSettings(@Req() req: any, @Body() dto: UpdateCommentSettingsDto) {
    return this.comments.updateSettingsAdmin(req.user?.sub || '', { ...(dto || {}) });
  }

  @RequirePerms('comments:publish')
  @Post(':id/approve')
  async approve(@Req() req: any, @Param('id') id: string) {
    return this.comments.approve(req.user?.sub || '', id);
  }

  @RequirePerms('comments:publish')
  @Post(':id/reject')
  async reject(@Req() req: any, @Param('id') id: string, @Body() dto: RejectCommentDto) {
    return this.comments.reject(req.user?.sub || '', id, dto?.reason);
  }

  @RequirePerms('comments:publish')
  @Post(':id/hide')
  async hide(@Req() req: any, @Param('id') id: string, @Body() dto: HideCommentDto) {
    return this.comments.hide(req.user?.sub || '', id, dto?.reason);
  }

  @RequirePerms('comments:publish')
  @Post(':id/reply')
  async reply(@Req() req: any, @Param('id') id: string, @Body() dto: ReplyCommentDto) {
    return this.comments.reply(req.user?.sub || '', id, dto?.body, req);
  }

  @RequirePerms('comments:publish')
  @Post(':id/ban-author')
  async banAuthor(@Req() req: any, @Param('id') id: string) {
    return this.comments.banAuthor(req.user?.sub || '', id);
  }

  @RequirePerms('comments:publish')
  @Post(':id/hide-all-by-author')
  async hideAllByAuthor(@Req() req: any, @Param('id') id: string, @Body() dto: HideAllByAuthorDto) {
    return this.comments.hideAllByAuthor(req.user?.sub || '', id, dto?.reason);
  }
}
