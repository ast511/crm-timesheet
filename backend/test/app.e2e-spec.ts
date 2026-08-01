import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { API_BASE_PATH } from '../src/config/api.constants';
import { configureApp } from '../src/config/app.setup';

const ALLOWED_ORIGIN = 'http://localhost:5173';

describe('Application endpoints (e2e)', () => {
  // Typing the app with `App` keeps `getHttpServer()` strongly typed for supertest.
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Set before the module is compiled: @nestjs/config reads process.env, and
    // dotenv never overwrites a value that is already there.
    process.env.CORS_ORIGINS = ALLOWED_ORIGIN;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it(`GET ${API_BASE_PATH} returns the greeting`, () => {
    return request(app.getHttpServer())
      .get(API_BASE_PATH)
      .expect(200)
      .expect({ message: 'Hello from the backend' });
  });

  it(`GET ${API_BASE_PATH}/health returns the health status`, () => {
    return request(app.getHttpServer())
      .get(`${API_BASE_PATH}/health`)
      .expect(200)
      .expect({ status: 'ok', service: 'backend' });
  });

  it('GET /health without the prefix is not routed', () => {
    return request(app.getHttpServer()).get('/health').expect(404);
  });

  it('answers an allowed origin with the CORS headers', () => {
    return request(app.getHttpServer())
      .get(`${API_BASE_PATH}/health`)
      .set('Origin', ALLOWED_ORIGIN)
      .expect(200)
      .expect('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
      .expect('Access-Control-Allow-Credentials', 'true');
  });

  it('sends no CORS headers to an origin that is not allowed', async () => {
    const response = await request(app.getHttpServer())
      .get(`${API_BASE_PATH}/health`)
      .set('Origin', 'https://evil.example.com')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
