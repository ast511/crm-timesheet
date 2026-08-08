import { Controller, Get } from '@nestjs/common';

import { AppService } from './app.service';
import { GreetingResponseDto } from './dto/greeting-response.dto';
import { Public } from './modules/auth/decorators/public.decorator';

/**
 * The root of the API — a greeting that proves the service answers at all.
 *
 * `@Public()` since Feature 032, which made a valid access token the default for
 * every route. This one is reached by somebody checking a URL and by whatever
 * pings the service; neither has an account, and requiring one would turn "is it
 * up" into "is it up and do I have credentials", which are different questions.
 * It exposes a version string and nothing about anybody.
 */
@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getGreeting(): GreetingResponseDto {
    return this.appService.getGreeting();
  }
}
