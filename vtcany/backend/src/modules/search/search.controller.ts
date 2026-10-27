import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

// Public: GET /api/v1/search?s={query} (Mục 3D).
@Controller('search')
export class SearchController {
  constructor(private search: SearchService) {}

  @Get()
  run(@Query('s') s?: string) {
    return this.search.search(s || '');
  }
}
