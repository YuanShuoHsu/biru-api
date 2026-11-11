import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { DonateCodesService } from './donate-codes.service.js';

describe('DonateCodesService', () => {
  let service: DonateCodesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DonateCodesService],
    }).compile();

    service = module.get<DonateCodesService>(DonateCodesService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('電子發票 API 沒有回應時逾時放棄，保留原本的捐贈碼', async () => {
    const loaded = [{ donateCode: '919', donateNm: '社團法人範例協會' }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(loaded)),
    );
    await service.refresh();
    expect(service.getAll()).toEqual(loaded);

    const timeout = new AbortController();
    const timeoutSpy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(timeout.signal);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(init.signal?.reason),
            ),
          ),
      );

    const refresh = service.refresh();
    timeout.abort(new DOMException('timed out', 'TimeoutError'));
    await refresh;

    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
    expect(fetchSpy).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: timeout.signal }),
    );
    expect(service.getAll()).toEqual(loaded);
  });

  it('上次更新失敗時重試，成功後不再重試', async () => {
    const loaded = [{ donateCode: '919', donateNm: '社團法人範例協會' }];
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response(JSON.stringify(loaded)));

    await service.refresh();
    expect(() => service.getAll()).toThrow(ServiceUnavailableException);

    await service.retryFailedRefresh();
    expect(service.getAll()).toEqual(loaded);

    await service.retryFailedRefresh();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('上次更新成功時不重試', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify([{ donateCode: '919', donateNm: '社團法人範例協會' }]),
        ),
      );

    await service.refresh();
    await service.retryFailedRefresh();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('還沒取得清單時回 503，不回空陣列', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new TypeError('fetch failed'),
    );

    await service.refresh();

    expect(() => service.getAll()).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'donateCodesUnavailable' }),
      }),
    );
  });

  it('電子發票 API 回傳空清單時保留原本的捐贈碼並稍後重試', async () => {
    const loaded = [{ donateCode: '919', donateNm: '社團法人範例協會' }];
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(loaded)))
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(new Response(JSON.stringify(loaded)));

    await service.refresh();
    await service.refresh();
    expect(service.getAll()).toEqual(loaded);

    await service.retryFailedRefresh();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
