import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';

import { buildCorsOptions } from '../../../config/cors.config';

/**
 * The official NestJS Socket.IO adapter, with this deployment's CORS allowlist
 * applied.
 *
 * Nest already uses `IoAdapter` by default, so this class exists for exactly one
 * reason: a `@WebSocketGateway({ cors })` option is evaluated when the class is
 * *decorated*, which happens at import time — before `ConfigModule` has read
 * `.env` and before a `ConfigService` exists. Hardcoding origins there would
 * break the project's rule that no URL is written into the code, and reading
 * `process.env` directly would read it too early. Configuring the adapter is
 * where the environment is available and the decorator is not.
 *
 * The allowlist is **the same `buildCorsOptions` the HTTP side uses**, not a
 * second copy: a browser that may call `GET /api/v1/notifications` is exactly the
 * browser that may open a socket for the same inbox, and two lists would
 * eventually disagree — with the socket the half that fails silently, since a
 * blocked upgrade looks like a network problem rather than a refusal.
 *
 * Subclassed rather than replaced. Everything else — the handshake, the message
 * binding, the acknowledgement handling, the shutdown — is the official adapter's
 * behaviour, unchanged.
 */
export class NotificationSocketIoAdapter extends IoAdapter {
  private readonly cors: ServerOptions['cors'];

  constructor(app: INestApplicationContext) {
    super(app);

    // Read once, in the constructor, for the reason `EmailService` builds its
    // transporter once: the allowlist is a property of the deployment and cannot
    // change while the process runs, so re-reading it per connection would be
    // work bought for nothing.
    this.cors = buildCorsOptions(
      app.get(ConfigService),
    ) as ServerOptions['cors'];
  }

  /**
   * Creates the Socket.IO server with the allowlist merged in.
   *
   * The caller's options are spread first, so an option Nest passes is preserved
   * and only `cors` is decided here.
   */
  override createIOServer(
    port: number,
    options?: Partial<ServerOptions>,
  ): Server {
    return super.createIOServer(port, {
      ...options,
      cors: this.cors,
    }) as Server;
  }
}
