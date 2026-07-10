import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { SearchDto } from './dto/search-dashboard.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('totalSKU')
  findTotalSKU() {
    return this.dashboardService.findTotalSKU();
  }

  @Get('totalStockValue')
  findTotalStockValue() {
    return this.dashboardService.findTotalStockValue();
  }

  @Get('MonthlyStockValue')
  findMonthlyStockValue(@Query() dto: SearchDto) {
    return this.dashboardService.findMonthlyStockValue(dto);
  }

  @Get('TopTenStock')
  findTopTenStock(@Query() dto: SearchDto) {
    return this.dashboardService.findTopTenStock(dto);
  }

  @Get('TopTenTransOut')
  findTopTenTransOut(@Query() dto: SearchDto) {
    return this.dashboardService.findTopTenTransOut(dto);
  }
}
