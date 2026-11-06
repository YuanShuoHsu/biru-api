import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { GcisService } from './gcis.service.js';

describe('GcisService', () => {
  let service: GcisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GcisService],
    }).compile();

    service = module.get<GcisService>(GcisService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('回傳查到的公司名稱、地址與負責人', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            Business_Accounting_NO: '12345678',
            Company_Location: '桃園市大園區中正東路一段',
            Company_Name: '碧露咖啡有限公司',
            Company_Status_Desc: '核准設立',
            Responsible_Name: '王大明',
          },
        ]),
      ),
    );

    await expect(service.findByBusinessNo('12345678')).resolves.toEqual({
      address: '桃園市大園區中正東路一段',
      name: '碧露咖啡有限公司',
      representativeName: '王大明',
    });
  });

  it.each([
    ['空白回應', ''],
    ['空陣列', '[]'],
  ])('%s時視為查無公司', async (_name, body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));

    await expect(service.findByBusinessNo('12345678')).resolves.toBeNull();
  });

  it.each([
    ['回應非 2xx', () => Promise.resolve(new Response('', { status: 500 }))],
    [
      '連線失敗或逾時',
      () => Promise.reject(new DOMException('timed out', 'TimeoutError')),
    ],
    ['回應不是 JSON', () => Promise.resolve(new Response('<html>'))],
    ['回應不是陣列', () => Promise.resolve(new Response('null'))],
  ])('%s時回 503 並帶 lookupUnavailable', async (_name, respond) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(respond);

    const lookup = service.findByBusinessNo('12345678');
    await expect(lookup).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(lookup).rejects.toMatchObject({
      response: { code: 'lookupUnavailable', message: 'lookupUnavailable' },
    });
  });

  it('請求帶逾時', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('[]'));
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');

    await service.findByBusinessNo('12345678');

    expect(timeoutSpy).toHaveBeenCalledWith(10000);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
