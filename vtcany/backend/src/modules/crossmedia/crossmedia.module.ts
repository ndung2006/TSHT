// Goi 1C: module chuyen doi cheo. CatalogService va EpaperService deu da
// export tu module cua chung; NewsService export tu NewsModule — khong can
// sua module chung nao.
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NewsModule } from '../news/news.module';
import { CatalogModule } from '../catalog/catalog.module';
import { EpaperModule } from '../epaper/epaper.module';
import { CrossmediaController } from './crossmedia.controller';
import { CrossmediaService } from './crossmedia.service';

@Module({
  imports: [AuthModule, NewsModule, CatalogModule, EpaperModule],
  controllers: [CrossmediaController],
  providers: [CrossmediaService],
})
export class CrossmediaModule {}
