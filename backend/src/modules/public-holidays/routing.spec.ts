import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { PublicHolidayController } from './public-holiday.controller';
import { PublicHolidayService } from './public-holiday.service';

/**
 * `calendar/:year` and `calendar/:year/:month` sit under the same prefix as
 * `:id`, so which handler answers is a claim about how Nest matches segments —
 * and one worth checking rather than asserting in a comment. If `:id` ever
 * swallowed `calendar`, `GET /public-holidays/calendar/2027` would answer 404
 * for a holiday nobody asked for, and every unit test in the module would still
 * pass.
 *
 * The pipe is the global one, so the parameter rules are exercised through the
 * real routes rather than only through their DTOs.
 */
describe('public-holidays routing', () => {
  let app: INestApplication;

  const service = {
    findOne: jest.fn().mockResolvedValue({ id: 'hol-1' }),
    findYear: jest.fn().mockResolvedValue([]),
    findMonth: jest.fn().mockResolvedValue([]),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PublicHolidayController],
      providers: [{ provide: PublicHolidayService, useValue: service }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('routes a single segment to the holiday', async () => {
    await request(app.getHttpServer())
      .get('/public-holidays/hol-1')
      .expect(200);

    expect(service.findOne).toHaveBeenCalledWith('hol-1');
    expect(service.findYear).not.toHaveBeenCalled();
  });

  it('routes the calendar segment to the year, not to the holiday', async () => {
    await request(app.getHttpServer())
      .get('/public-holidays/calendar/2027')
      .expect(200);

    expect(service.findYear).toHaveBeenCalledWith(2027);
    expect(service.findOne).not.toHaveBeenCalled();
  });

  it('routes the deeper calendar segment to the month', async () => {
    await request(app.getHttpServer())
      .get('/public-holidays/calendar/2027/5')
      .expect(200);

    expect(service.findMonth).toHaveBeenCalledWith(2027, 5);
    expect(service.findYear).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range year at the route, not in the service', async () => {
    await request(app.getHttpServer())
      .get('/public-holidays/calendar/20227')
      .expect(400);

    expect(service.findYear).not.toHaveBeenCalled();
  });

  it('rejects a thirteenth month rather than rolling into the next year', async () => {
    await request(app.getHttpServer())
      .get('/public-holidays/calendar/2027/13')
      .expect(400);

    expect(service.findMonth).not.toHaveBeenCalled();
  });

  it('has no fourth calendar segment', async () => {
    await request(app.getHttpServer())
      .get('/public-holidays/calendar/2027/5/1')
      .expect(404);
  });
});
