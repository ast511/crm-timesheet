import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AppService } from './app.service';
import { ApiOkEnvelope } from './common/swagger/api-envelope-response.decorator';
import { ApiPublicRouteErrors } from './common/swagger/api-standard-errors.decorator';
import { API_TAG } from './config/swagger-tags';
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
@ApiTags(API_TAG.Service)
@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({
    summary: 'Greeting at the root of the API',
    description:
      'Proves the service answers at all. No padlock, and that is not an oversight: this is reached by somebody checking a URL and by whatever pings the service, neither of which has an account. It exposes a fixed sentence and nothing about anybody.',
  })
  @ApiOkEnvelope(GreetingResponseDto)
  @ApiPublicRouteErrors()
  @Get()
  getGreeting(): GreetingResponseDto {
    return this.appService.getGreeting();
  }
}
