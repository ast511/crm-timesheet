import { Controller, Get } from '@nestjs/common';

import { AppService } from './app.service';
import { GreetingResponseDto } from './dto/greeting-response.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getGreeting(): GreetingResponseDto {
    return this.appService.getGreeting();
  }
}
