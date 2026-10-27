import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { NewsCategoryController, NewsCategoryPublicController, NewsController, NewsPublicController } from './news.controller';
import { NewsService } from './news.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [NewsController, NewsCategoryController, NewsPublicController, NewsCategoryPublicController],
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}
