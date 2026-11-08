import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

// DTO cho goi "Binh luan dot 1". KHAI DU MOI field body: global
// ValidationPipe whitelist:true se luoc field khong khai (bug beat
// cuoi 47566bb). Vi vay ca field chi de chan (parentId cua ban doc)
// cung phai khai de service nhan duoc va tra 400 invalid_parent.

export class CreateCommentDto {
  @IsString()
  articleSlug!: string;

  // De @IsOptional de service tra dung ma thiet ke khi thieu/rong
  // (comment_empty) thay vi ValidationPipe tra bad_request chung.
  @IsOptional()
  @IsString()
  body?: string;

  // Ban doc khong duoc tra loi nhau: gui kem -> 400 invalid_parent
  // (service kiem tra). Khai o day de whitelist khong luoc mat.
  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  turnstileToken?: string;
}

export class ReportCommentDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectCommentDto {
  // @IsOptional de thieu/rong reason ve service tra 400 reason_required
  // theo thiet ke §3.5, thay vi ValidationPipe tra bad_request chung.
  @IsOptional()
  @IsString()
  reason?: string;
}

export class HideCommentDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReplyCommentDto {
  // @IsOptional de thieu/rong body ve service tra 400 comment_empty
  // theo thiet ke §3.5, thay vi ValidationPipe tra bad_request chung.
  @IsOptional()
  @IsString()
  body?: string;
}

export class HideAllByAuthorDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateCommentSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['pre', 'post'])
  moderationMode?: 'pre' | 'post';

  @IsOptional()
  @IsBoolean()
  turnstileEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  requirePhoneVerified?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxLength?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dailyLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  ipDailyLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  ipBurstLimit?: number;
}
