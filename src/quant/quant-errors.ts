import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const quantErrorCodes = [
  'agentConnectExpired',
  'agentNotNeeded',
  'agentTokenInvalid',
  'aiBacktestCostLimitReached',
  'aiBacktestNotFound',
  'aiBacktestNotResumable',
  'aiKeyInvalid',
  'aiKeyMissing',
  'aiRequestClosed',
  'aiRequestNotFound',
  'botAlreadyStarted',
  'botCredentialRequired',
  'botNotFound',
  'botNotPionexFuturesGrid',
  'botNotPionexGrid',
  'botNotRunning',
  'botNotSignal',
  'botNotWebhook',
  'botOrderLimitUnsupported',
  'botStillRunning',
  'credentialInvalid',
  'credentialNotFound',
  'dcaInvestmentTooSmall',
  'exchangeError',
  'exchangeRejected',
  'futuresGridInvestmentTooSmall',
  'futuresGridNeutralProfitStop',
  'futuresGridOperationIncomplete',
  'futuresGridStopLimitRequired',
  'futuresLeverageAboveSymbol',
  'futuresPositionMismatch',
  'futuresStrategyPaperOnly',
  'futuresSymbolBusy',
  'futuresSymbolInUse',
  'gridInvestmentTooSmall',
  'gridRangeInvalid',
  'gridSpacingTooSmall',
  'indicatorConditionIncomplete',
  'orderAmountAboveInvestment',
  'orderAmountRejected',
  'orderFieldsFuturesLimit',
  'orderFieldsLimit',
  'orderFieldsMarketBuy',
  'orderFieldsMarketSell',
  'orderNotFound',
  'orderSizeRejected',
  'signalBotLiveOnly',
] as const;

export type QuantErrorCode = (typeof quantErrorCodes)[number];

const errorBody = (code: QuantErrorCode, args?: Record<string, unknown>) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.quant.${code}`, {
      args,
    }) ?? code,
});

export const badRequestError = (
  code: QuantErrorCode,
  args?: Record<string, unknown>,
) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code, args) });

export const conflictError = (code: QuantErrorCode) =>
  new ConflictException({ error: 'Conflict', ...errorBody(code) });

export const notFoundError = (code: QuantErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });

export const unauthorizedError = (code: QuantErrorCode) =>
  new UnauthorizedException({ error: 'Unauthorized', ...errorBody(code) });
