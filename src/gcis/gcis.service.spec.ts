import { Logger, ServiceUnavailableException } from '@nestjs/common';
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

  it('同時查公司與商業登記，查得到有效公司時取消商業登記查詢且不記錄失敗', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Company_Location: '桃園市大園區中正東路一段',
              Company_Name: '碧露咖啡有限公司',
              Company_Status_Desc: '核准設立',
              Responsible_Name: '王大明',
            },
          ]),
        ),
      )
      .mockImplementationOnce(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(init.signal?.reason),
            ),
          ),
      );

    await expect(service.findByBusinessNo('12345675')).resolves.toEqual({
      address: '桃園市大園區中正東路一段',
      name: '碧露咖啡有限公司',
      representativeName: '王大明',
    });
    await new Promise(setImmediate);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][1]?.signal?.aborted).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('公司查詢還沒回來前就送出商業登記查詢', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockReturnValue(new Promise<Response>(() => undefined));

    void service.findByBusinessNo('15725713');

    const filters = fetchSpy.mock.calls.map(([url]) =>
      new URL(url as string).searchParams.get('$filter'),
    );
    expect(filters).toEqual([
      'Business_Accounting_NO eq 15725713',
      'President_No eq 15725713',
    ]);
  });

  it.each([
    ['停業', { Case_Status_Desc: '停業', Company_Status_Desc: '核准設立' }],
    ['外國公司', { Company_Status_Desc: '核准登記' }],
    ['重整中', { Company_Status_Desc: '重整' }],
  ])('%s的公司直接回傳公司資料', async (_name, status) => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Company_Location: '桃園市大園區中正東路一段',
              Company_Name: '碧露咖啡有限公司',
              Responsible_Name: '王大明',
              ...status,
            },
          ]),
        ),
      )
      .mockReturnValueOnce(new Promise<Response>(() => undefined));

    await expect(service.findByBusinessNo('12345675')).resolves.toEqual({
      address: '桃園市大園區中正東路一段',
      name: '碧露咖啡有限公司',
      representativeName: '王大明',
    });
  });

  it('公司現況不在代碼表內時記錄警告，商業登記查詢失敗也回傳公司資料', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Company_Location: '桃園市大園區中正東路一段',
              Company_Name: '碧露咖啡有限公司',
              Company_Status_Desc: '核准認許',
              Responsible_Name: '王大明',
            },
          ]),
        ),
      )
      .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));

    await expect(service.findByBusinessNo('12345675')).resolves.toEqual({
      address: '桃園市大園區中正東路一段',
      name: '碧露咖啡有限公司',
      representativeName: '王大明',
    });
    expect(warnSpy).toHaveBeenCalledWith('公司現況不在代碼表內：核准認許');
  });

  it('公司已解散時改查商業登記', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Company_Location: '桃園市大園區中正東路一段',
              Company_Name: '碧露咖啡有限公司',
              Company_Status_Desc: '解散',
              Responsible_Name: '王大明',
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Agency: '376610000A',
              Business_Address: '臺南市安南區長安里公學路2段55號1樓',
              Business_Current_Status: '01',
              Business_Name: '鴻燿商品行',
              President_No: '15725713',
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { President_No: '15725713', Responsible_Name: '陳世昌' },
          ]),
        ),
      );

    await expect(service.findByBusinessNo('15725713')).resolves.toEqual({
      address: '臺南市安南區長安里公學路2段55號1樓',
      name: '鴻燿商品行',
      representativeName: '陳世昌',
    });
  });

  it.each([
    ['查無商業登記', []],
    [
      '商業登記都已失效',
      [
        {
          Agency: '376580000A',
          Business_Address: '新竹市東區公園里公園路５７號',
          Business_Current_Status: '03',
          Business_Name: '順祥商行',
          President_No: '15725713',
        },
      ],
    ],
  ])('公司已解散且%s時仍回傳公司資料', async (_name, registrations) => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Company_Location: '桃園市大園區中正東路一段',
              Company_Name: '碧露咖啡有限公司',
              Company_Status_Desc: '解散',
              Responsible_Name: '王大明',
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(registrations)));

    await expect(service.findByBusinessNo('15725713')).resolves.toEqual({
      address: '桃園市大園區中正東路一段',
      name: '碧露咖啡有限公司',
      representativeName: '王大明',
    });
  });

  it('公司已解散且商業登記查詢失敗時回 503，不拿解散的公司充數', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Company_Location: '桃園市大園區中正東路一段',
              Company_Name: '碧露咖啡有限公司',
              Company_Status_Desc: '解散',
              Responsible_Name: '王大明',
            },
          ]),
        ),
      )
      .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));

    await expect(service.findByBusinessNo('15725713')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('公司資料集查詢失敗時仍改查商業登記', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Agency: '376610000A',
              Business_Address: '臺南市安南區長安里公學路2段55號1樓',
              Business_Current_Status: '01',
              Business_Name: '鴻燿商品行',
              President_No: '15725713',
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { President_No: '15725713', Responsible_Name: '陳世昌' },
          ]),
        ),
      );

    await expect(service.findByBusinessNo('15725713')).resolves.toEqual({
      address: '臺南市安南區長安里公學路2段55號1樓',
      name: '鴻燿商品行',
      representativeName: '陳世昌',
    });
  });

  it('公司資料集查詢失敗且查無有效商業登記時回 503', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(new Response('[]'));

    await expect(service.findByBusinessNo('15725713')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it.each([
    ['停業', '02'],
    ['申覆（辯）期', '04'],
    ['列入廢止中', '06'],
  ])('%s的商業登記仍回傳商業資料', async (_name, status) => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Agency: '376610000A',
              Business_Address: '臺南市安南區長安里公學路2段55號1樓',
              Business_Current_Status: status,
              Business_Name: '鴻燿商品行',
              President_No: '15725713',
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { President_No: '15725713', Responsible_Name: '陳世昌' },
          ]),
        ),
      );

    await expect(service.findByBusinessNo('15725713')).resolves.toEqual({
      address: '臺南市安南區長安里公學路2段55號1樓',
      name: '鴻燿商品行',
      representativeName: '陳世昌',
    });
  });

  it('查無公司時改查商業登記，再以申登機關代碼補上負責人', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Agency: '376610000A',
              Business_Address: '臺南市安南區長安里公學路2段55號1樓',
              Business_Current_Status: '01',
              Business_Name: '鴻燿商品行',
              President_No: '15725713',
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { President_No: '15725713', Responsible_Name: '陳世昌' },
          ]),
        ),
      );

    await expect(service.findByBusinessNo('15725713')).resolves.toEqual({
      address: '臺南市安南區長安里公學路2段55號1樓',
      name: '鴻燿商品行',
      representativeName: '陳世昌',
    });

    const filters = fetchSpy.mock.calls.map(([url]) =>
      new URL(url as string).searchParams.get('$filter'),
    );
    expect(filters).toEqual([
      'Business_Accounting_NO eq 15725713',
      'President_No eq 15725713',
      'President_No eq 15725713 and Agency eq 376610000A',
    ]);
  });

  it('商業登記查不到負責人時仍回傳名稱與地址', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Agency: '376610000A',
              Business_Address: '臺南市安南區長安里公學路2段55號1樓',
              Business_Current_Status: '01',
              Business_Name: '鴻燿商品行',
              President_No: '15725713',
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(new Response('[]'));

    await expect(service.findByBusinessNo('15725713')).resolves.toEqual({
      address: '臺南市安南區長安里公學路2段55號1樓',
      name: '鴻燿商品行',
      representativeName: '',
    });
  });

  it('同一統編有多筆商業登記時取仍有效的那筆', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Agency: '376580000A',
              Business_Address: '新竹市東區公園里公園路５７號',
              Business_Current_Status: '03',
              Business_Name: '順祥商行',
              President_No: '15725713',
            },
            {
              Agency: '376610000A',
              Business_Address: '臺南市安南區長安里公學路2段55號1樓',
              Business_Current_Status: '01',
              Business_Name: '鴻燿商品行',
              President_No: '15725713',
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { President_No: '15725713', Responsible_Name: '陳世昌' },
          ]),
        ),
      );

    await expect(service.findByBusinessNo('15725713')).resolves.toEqual({
      address: '臺南市安南區長安里公學路2段55號1樓',
      name: '鴻燿商品行',
      representativeName: '陳世昌',
    });
    expect(
      new URL(fetchSpy.mock.calls[2][0] as string).searchParams.get('$filter'),
    ).toBe('President_No eq 15725713 and Agency eq 376610000A');
  });

  it('商業登記都已失效時視為查無，也不查負責人', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Agency: '376580000A',
              Business_Address: '新竹市東區公園里公園路５７號',
              Business_Current_Status: '03',
              Business_Name: '順祥商行',
              President_No: '15725713',
            },
          ]),
        ),
      );

    await expect(service.findByBusinessNo('15725713')).resolves.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('商業現況代碼不在代碼表內時記錄警告並回傳商業資料', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Agency: '376610000A',
              Business_Address: '臺南市安南區長安里公學路2段55號1樓',
              Business_Current_Status: '1',
              Business_Name: '鴻燿商品行',
              President_No: '15725713',
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { President_No: '15725713', Responsible_Name: '陳世昌' },
          ]),
        ),
      );

    await expect(service.findByBusinessNo('15725713')).resolves.toEqual({
      address: '臺南市安南區長安里公學路2段55號1樓',
      name: '鴻燿商品行',
      representativeName: '陳世昌',
    });
    expect(warnSpy).toHaveBeenCalledWith('商業現況代碼不在代碼表內：1');
  });

  it('負責人查詢失敗時仍回傳名稱與地址', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Agency: '376610000A',
              Business_Address: '臺南市安南區長安里公學路2段55號1樓',
              Business_Current_Status: '01',
              Business_Name: '鴻燿商品行',
              President_No: '15725713',
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(new Response('', { status: 500 }));

    await expect(service.findByBusinessNo('15725713')).resolves.toEqual({
      address: '臺南市安南區長安里公學路2段55號1樓',
      name: '鴻燿商品行',
      representativeName: '',
    });
  });

  it.each([
    ['缺少', undefined],
    ['格式不符', '376610000A or 1 eq 1'],
  ])('申登機關代碼%s時不查負責人並記錄警告', async (_name, agency) => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Agency: agency,
              Business_Address: '臺南市安南區長安里公學路2段55號1樓',
              Business_Current_Status: '01',
              Business_Name: '鴻燿商品行',
              President_No: '15725713',
            },
          ]),
        ),
      );

    await expect(service.findByBusinessNo('15725713')).resolves.toEqual({
      address: '臺南市安南區長安里公學路2段55號1樓',
      name: '鴻燿商品行',
      representativeName: '',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(`申登機關代碼格式不符：${agency}`);
  });

  it('查無公司也查無商業登記時視為查無', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('[]')),
    );

    await expect(service.findByBusinessNo('15725713')).resolves.toBeNull();
  });

  it('查無公司後商業登記查詢失敗時回 503', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(new Response('', { status: 500 }));

    await expect(service.findByBusinessNo('15725713')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it.each([
    ['空白回應', ''],
    ['空陣列', '[]'],
  ])('%s時視為查無公司或商業登記', async (_name, body) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(body)),
    );

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
      .mockImplementation(() => Promise.resolve(new Response('[]')));
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');

    await service.findByBusinessNo('12345678');

    expect(timeoutSpy).toHaveBeenCalledWith(10000);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('一次查詢的所有請求共用同一個 10 秒期限', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              Agency: '376610000A',
              Business_Address: '臺南市安南區長安里公學路2段55號1樓',
              Business_Current_Status: '01',
              Business_Name: '鴻燿商品行',
              President_No: '15725713',
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(new Response('[]'));
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const anySpy = vi.spyOn(AbortSignal, 'any');

    await service.findByBusinessNo('15725713');

    expect(timeoutSpy).toHaveBeenCalledOnce();
    const [deadline] = timeoutSpy.mock.results.map(({ value }) => value);
    const [registrationSignal] = anySpy.mock.results.map(({ value }) => value);
    expect(anySpy.mock.calls[0][0]).toContain(deadline);
    expect(fetchSpy.mock.calls.map(([, init]) => init?.signal)).toEqual([
      deadline,
      registrationSignal,
      deadline,
    ]);
  });
});
