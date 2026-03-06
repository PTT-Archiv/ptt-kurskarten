import { Controller, Get, Inject } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('v1')
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Get('health')
  getHealth(): { status: 'ok' } {
    return this.appService.getHealth();
  }
}
