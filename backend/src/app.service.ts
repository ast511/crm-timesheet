import { Injectable } from '@nestjs/common';

import { GreetingResponseDto } from './dto/greeting-response.dto';

const GREETING_MESSAGE = 'Hello from the backend';

@Injectable()
export class AppService {
  getGreeting(): GreetingResponseDto {
    return { message: GREETING_MESSAGE };
  }
}
