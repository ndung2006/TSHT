// API Quan ly giao dien: admin (CMS) + cong khai (portal).
// Gate theo module quyen 'site_interface' (xem permissions.catalog);
// full-admin bypass qua '*'. DTO khai du moi truong (whitelist se loc
// truong khong khai, bai hoc tu 1B).
import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { SiteInterfaceService } from './site-interface.service';

class AddRefDto {
  @IsString()
  ref!: string;
}

// SUA 2026-10-31: ids truoc day khong co decorator nen ValidationPipe
// (whitelist) luoc mat -> reorder luon 400 khi danh sach khong rong.
class ReorderDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

class HeaderDto {
  @IsOptional() @IsString() @MaxLength(500) image?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(500) facebook?: string;
  @IsOptional() @IsString() @MaxLength(500) youtube?: string;
  @IsOptional() @IsString() @MaxLength(500) tiktok?: string;
  @IsOptional() @IsString() @MaxLength(500) zalo?: string;
  @IsOptional() @IsString() @MaxLength(100) phone?: string;
}

class FooterDto {
  @IsOptional() @IsString() @MaxLength(500) logo?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MaxLength(1000) copyright?: string;
}

class FaviconDto {
  @IsOptional() @IsString() @MaxLength(500) image?: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

@UseGuards(PermissionsGuard)
@Controller('admin/site-interface')
export class SiteInterfaceAdminController {
  constructor(private readonly site: SiteInterfaceService) {}

  // Picker rieng duoi quyen site_interface:view (khong phu thuoc
  // articles:view) de trang Menu/Trang chu/Hot Link tu dung.
  @RequirePerms('site_interface:view')
  @Get('categories')
  pickerCategories() {
    return this.site.pickerCategories();
  }

  @RequirePerms('site_interface:view')
  @Get('articles')
  pickerArticles(@Query('q') q?: string) {
    return this.site.pickerArticles(q || '');
  }

  // ---- Menu ----
  @RequirePerms('site_interface:view')
  @Get('menu')
  listMenu() {
    return this.site.listMenu();
  }

  @RequirePerms('site_interface:create')
  @Post('menu')
  addMenu(@Body() dto: AddRefDto) {
    return this.site.addMenu(dto.ref);
  }

  @RequirePerms('site_interface:update')
  @Put('menu/reorder')
  reorderMenu(@Body() dto: ReorderDto) {
    return this.site.reorderMenu(dto.ids || []);
  }

  @RequirePerms('site_interface:delete')
  @Delete('menu/:id')
  removeMenu(@Param('id') id: string) {
    return this.site.removeMenu(id);
  }

  // ---- Khoi trang chu ----
  @RequirePerms('site_interface:view')
  @Get('home-sections')
  listHomeSections() {
    return this.site.listHomeSections();
  }

  @RequirePerms('site_interface:create')
  @Post('home-sections')
  addHomeSection(@Body() dto: AddRefDto) {
    return this.site.addHomeSection(dto.ref);
  }

  @RequirePerms('site_interface:update')
  @Put('home-sections/reorder')
  reorderHomeSections(@Body() dto: ReorderDto) {
    return this.site.reorderHomeSections(dto.ids || []);
  }

  @RequirePerms('site_interface:delete')
  @Delete('home-sections/:id')
  removeHomeSection(@Param('id') id: string) {
    return this.site.removeHomeSection(id);
  }

  // ---- Hot link ----
  @RequirePerms('site_interface:view')
  @Get('hot-links')
  listHotLinks() {
    return this.site.listHotLinks();
  }

  @RequirePerms('site_interface:create')
  @Post('hot-links')
  addHotLink(@Body() dto: AddRefDto) {
    return this.site.addHotLink(dto.ref);
  }

  @RequirePerms('site_interface:update')
  @Put('hot-links/reorder')
  reorderHotLinks(@Body() dto: ReorderDto) {
    return this.site.reorderHotLinks(dto.ids || []);
  }

  @RequirePerms('site_interface:delete')
  @Delete('hot-links/:id')
  removeHotLink(@Param('id') id: string) {
    return this.site.removeHotLink(id);
  }

  // ---- Header / Footer / Favicon ----
  @RequirePerms('site_interface:view')
  @Get('header')
  getHeader() {
    return this.site.getHeader();
  }

  @RequirePerms('site_interface:update')
  @Put('header')
  putHeader(@Body() dto: HeaderDto) {
    return this.site.putHeader(dto as any);
  }

  @RequirePerms('site_interface:view')
  @Get('footer')
  getFooter() {
    return this.site.getFooter();
  }

  @RequirePerms('site_interface:update')
  @Put('footer')
  putFooter(@Body() dto: FooterDto) {
    return this.site.putFooter(dto as any);
  }

  @RequirePerms('site_interface:view')
  @Get('favicon')
  getFavicon() {
    return this.site.getFavicon();
  }

  @RequirePerms('site_interface:update')
  @Put('favicon')
  putFavicon(@Body() dto: FaviconDto) {
    return this.site.putFavicon(dto as any);
  }
}

// Cong khai: khong guard (khuon NewsPublicController). Chi tra truong
// cong khai, khong id noi bo, khong thong tin nguoi dung.
@Controller('site-interface')
export class SiteInterfacePublicController {
  constructor(private readonly site: SiteInterfaceService) {}

  @Get()
  getPublic() {
    return this.site.publicPayload();
  }
}
