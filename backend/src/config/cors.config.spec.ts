import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { buildCorsOptions } from './cors.config';

describe('buildCorsOptions', () => {
  const buildFrom = (corsOrigins?: string) =>
    buildCorsOptions(new ConfigService({ CORS_ORIGINS: corsOrigins }));

  it('allows the configured origins and keeps credentials enabled', () => {
    const options = buildFrom('http://localhost:5173,https://crm.example.com');

    expect(options.origin).toEqual([
      'http://localhost:5173',
      'https://crm.example.com',
    ]);
    expect(options.credentials).toBe(true);
  });

  it('trims whitespace and drops empty entries', () => {
    const options = buildFrom(
      ' http://localhost:5173 , ,https://crm.example.com,',
    );

    expect(options.origin).toEqual([
      'http://localhost:5173',
      'https://crm.example.com',
    ]);
  });

  it('reflects any origin and disables credentials when configured with *', () => {
    const options = buildFrom('*');

    expect(options.origin).toBe(true);
    expect(options.credentials).toBe(false);
  });

  it('allows no origin and warns when the variable is missing', () => {
    const warn = jest.spyOn(Logger, 'warn').mockImplementation();

    const options = buildFrom(undefined);

    expect(options.origin).toEqual([]);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
