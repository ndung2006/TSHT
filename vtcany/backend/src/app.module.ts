import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { ContentModule } from './modules/content/content.module';
import { PlaybackModule } from './modules/playback/playback.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { AuditModule } from './modules/audit/audit.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { LayoutModule } from './modules/layout/layout.module';
import { MoviesModule } from './modules/movies/movies.module';
import { TvModule } from './modules/tv/tv.module';
import { SearchModule } from './modules/search/search.module';
import { AdminModule } from './modules/admin/admin.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { EpaperModule } from './modules/epaper/epaper.module';
import { NewsModule } from './modules/news/news.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { DistributionModule } from './modules/distribution/distribution.module';
import { ZoneModule } from './modules/zones/zone.module';
import { CrossmediaModule } from './modules/crossmedia/crossmedia.module';
import { EventsModule } from './modules/events/events.module';
import { LiveblogModule } from './modules/liveblog/liveblog.module';
import { AdsModule } from './modules/ads/ads.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    AuditModule,
    ContentModule,
    PlaybackModule,
    TelemetryModule,
    UploadsModule,
    LayoutModule,
    MoviesModule,
    TvModule,
    SearchModule,
    AdminModule,
    CatalogModule,
    EpaperModule,
    NewsModule,
    DepartmentsModule,
    DistributionModule,
    ZoneModule,
    CrossmediaModule,
    EventsModule,
    LiveblogModule,
    AdsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
