import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { DepartmentsService } from './departments.service';

class DepartmentDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}

@UseGuards(PermissionsGuard)
@Controller('admin/departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @RequirePerms('departments:view')
  @Get()
  async list() {
    return this.departments.list();
  }

  @RequirePerms('departments:view')
  @Get(':publicId')
  async get(@Param('publicId') publicId: string) {
    return this.departments.get(publicId);
  }

  @RequirePerms('departments:create')
  @Post()
  async create(@Body() dto: DepartmentDto) {
    return this.departments.create(dto);
  }

  @RequirePerms('departments:update')
  @Patch(':publicId')
  async patch(@Param('publicId') publicId: string, @Body() dto: Partial<DepartmentDto>) {
    return this.departments.patch(publicId, dto);
  }

  @RequirePerms('departments:delete')
  @Delete(':publicId')
  async remove(@Param('publicId') publicId: string) {
    return this.departments.remove(publicId);
  }
}
