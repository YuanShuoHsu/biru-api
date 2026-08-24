import type { ConfigService } from '@nestjs/config';

import type { EcpayMode } from './types/ecpay.types';

export const getEcpayMode = (configService: ConfigService): EcpayMode => {
  const mode = configService.getOrThrow<string>('ECPAY_OPERATION_MODE');

  if (mode !== 'Test' && mode !== 'Production')
    throw new Error(
      `ECPAY_OPERATION_MODE must be "Test" or "Production", got ${mode}`,
    );

  return mode;
};
