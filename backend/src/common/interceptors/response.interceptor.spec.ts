import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';

import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  const context = {} as ExecutionContext;

  /** Pushes a handler result through the interceptor. */
  const wrap = <T>(handlerResult: T): Promise<unknown> => {
    const next: CallHandler<T> = { handle: () => of(handlerResult) };

    return firstValueFrom(
      new ResponseInterceptor<T>().intercept(context, next),
    );
  };

  it('wraps an object', async () => {
    await expect(wrap({ id: '1' })).resolves.toEqual({
      success: true,
      data: { id: '1' },
    });
  });

  it('wraps an array without flattening it', async () => {
    await expect(wrap([{ id: '1' }, { id: '2' }])).resolves.toEqual({
      success: true,
      data: [{ id: '1' }, { id: '2' }],
    });
  });

  it('wraps an empty response as null data', async () => {
    await expect(wrap(undefined)).resolves.toEqual({
      success: true,
      data: null,
    });
  });

  it('preserves falsy payloads that are not empty', async () => {
    await expect(wrap(0)).resolves.toEqual({ success: true, data: 0 });
    await expect(wrap(false)).resolves.toEqual({ success: true, data: false });
    await expect(wrap('')).resolves.toEqual({ success: true, data: '' });
  });

  it('leaves errors to the exception filter', async () => {
    const failure = new Error('handler failed');
    const next: CallHandler = { handle: () => throwError(() => failure) };

    await expect(
      firstValueFrom(new ResponseInterceptor().intercept(context, next)),
    ).rejects.toBe(failure);
  });
});
