import { BadRequestException, Injectable } from '@nestjs/common';

import { I18nContext, I18nService } from 'nestjs-i18n';

import type { I18nTranslations } from 'src/generated/i18n.generated';

import { QuantAccountService } from '../account/quant-account.service';
import type {
  QuantKolDto,
  QuantKolOrderDto,
  QuantKolQueryDto,
} from '../dto/quant-kol.dto';
import { PionexApiError, PionexRestClient } from '../pionex/pionex-rest.client';

// https://www.pionex.com/docs/api-docs/bot-api/kol
interface PionexKolOrder {
  base: string;
  buOrderData?: {
    bottom?: string;
    curPrice?: string;
    gridApr?: string;
    initPrice?: string;
    leverage?: string;
    quoteInvestment?: string;
    rota?: string;
    row?: number;
    top?: string;
    trend?: QuantKolOrderDto['trend'];
  };
  buOrderId: string;
  buOrderType: string;
  createTime: number;
  isTop?: boolean;
  quote: string;
  status: string;
}

interface PionexKolList {
  filterOptions?: { symbolList?: string[] };
  hasMore: boolean;
  kolInfo?: { avatar?: string; nickname?: string };
  results?: PionexKolOrder[];
  topResults?: PionexKolOrder[];
  total: number;
}

// 實測查不到的分享碼回 BOT_INTERNAL_ERROR，不是文件寫的參數錯誤
const SHARE_CODE_NOT_FOUND_CODES = new Set([
  'BOT_INTERNAL_ERROR',
  'BOT_INVALID_ARGUMENT',
]);

const toNumber = (value?: string | number | null) =>
  value === undefined || value === null || value === ''
    ? undefined
    : Number(value);

// 合約網格的交易對以 BTC.PERP／USDT 表示，換成行情用的 BTC_USDT_PERP
const toMarketSymbol = (base: string, quote: string) =>
  base.endsWith('.PERP')
    ? `${base.slice(0, -'.PERP'.length)}_${quote}_PERP`
    : `${base}_${quote}`;

const toOrder = (order: PionexKolOrder): QuantKolOrderDto => {
  const data = order.buOrderData ?? {};

  return {
    bottom: toNumber(data.bottom),
    createTime: order.createTime,
    currentPrice: toNumber(data.curPrice),
    gridApr: toNumber(data.gridApr),
    id: order.buOrderId,
    initPrice: toNumber(data.initPrice),
    investment: toNumber(data.quoteInvestment),
    leverage: toNumber(data.leverage),
    pinned: !!order.isTop,
    row: data.row,
    status: order.status,
    symbol: toMarketSymbol(order.base, order.quote),
    top: toNumber(data.top),
    totalReturn: toNumber(data.rota),
    trend: data.trend,
    type: order.buOrderType,
  };
};

@Injectable()
export class QuantKolService {
  constructor(
    private readonly account: QuantAccountService,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly rest: PionexRestClient,
  ) {}

  async list(
    userId: string,
    credentialId: string,
    { limit, page, shareCode, symbol, trend }: QuantKolQueryDto,
  ): Promise<QuantKolDto> {
    const credentials = await this.account.resolveCredentials(
      userId,
      credentialId,
    );
    const data = await this.account.withExchangeError(() =>
      this.rest
        .signed<PionexKolList>(
          credentials,
          'GET',
          '/api/v1/bot/kol/selectCopyTradeList',
          {
            params: {
              buOrderType: 'futures_grid',
              limit,
              page,
              shareCode,
              symbol,
              trend,
            },
          },
        )
        .catch((error: unknown) => {
          if (
            error instanceof PionexApiError &&
            SHARE_CODE_NOT_FOUND_CODES.has(error.code)
          )
            throw new BadRequestException(
              this.i18n.t('common.quant.kolShareCodeNotFound', {
                lang: I18nContext.current()?.lang,
              }),
            );
          throw error;
        }),
    );
    const pinned = page === 1 ? (data.topResults ?? []) : [];
    const pinnedIds = new Set(pinned.map(({ buOrderId }) => buOrderId));

    return {
      avatar: data.kolInfo?.avatar,
      hasMore: data.hasMore,
      nickname: data.kolInfo?.nickname ?? shareCode,
      orders: [
        ...pinned.map((order) => toOrder({ ...order, isTop: true })),
        ...(data.results ?? [])
          .filter(({ buOrderId }) => !pinnedIds.has(buOrderId))
          .map(toOrder),
      ],
      symbols: data.filterOptions?.symbolList ?? [],
      total: data.total,
    };
  }
}
