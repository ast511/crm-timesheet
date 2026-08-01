import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from './prisma.service';

/**
 * The connection string is never dialled here: the driver adapter builds its
 * pool lazily and both lifecycle hooks are stubbed, so these tests need no
 * database.
 */
const CONNECTION_STRING =
  'postgresql://user:password@localhost:5432/db?schema=public';

describe('PrismaService', () => {
  let prismaService: PrismaService;
  let getOrThrow: jest.Mock;

  beforeEach(async () => {
    getOrThrow = jest.fn().mockReturnValue(CONNECTION_STRING);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        { provide: ConfigService, useValue: { getOrThrow } },
      ],
    }).compile();

    prismaService = moduleRef.get(PrismaService);
  });

  it('reads the connection string from configuration', () => {
    expect(getOrThrow).toHaveBeenCalledWith('DATABASE_URL');
  });

  it('connects when the module starts', async () => {
    const connect = jest
      .spyOn(prismaService, '$connect')
      .mockResolvedValue(undefined);

    await prismaService.onModuleInit();

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('disconnects when the module stops', async () => {
    const disconnect = jest
      .spyOn(prismaService, '$disconnect')
      .mockResolvedValue(undefined);

    await prismaService.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
