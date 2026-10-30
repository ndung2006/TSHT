// Goi "Chuyen sang bao in": bai bao in duyet lai theo quy trinh bao in.
// Chi can Auth (guard quyen) + Prisma; khong phu thuoc NewsModule vi
// service doc truc tiep bang NewsArticle qua Prisma.
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrintArticleController } from './print-article.controller';
import { PrintArticleService } from './print-article.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [PrintArticleController],
  providers: [PrintArticleService],
  exports: [PrintArticleService],
})
export class PrintArticleModule {}
