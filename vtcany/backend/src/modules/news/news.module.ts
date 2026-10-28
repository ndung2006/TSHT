import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { NewsCategoryController, NewsCategoryPublicController, NewsController, NewsPublicController } from './news.controller';
import { PageViewController } from './pageview.controller';
import { PageViewService } from './pageview.service';
import { NewsService } from './news.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [NewsController, NewsCategoryController, NewsPublicController, NewsCategoryPublicController, PageViewController],
  providers: [NewsService, PageViewService],
  exports: [NewsService],
})
export class NewsModule {}
