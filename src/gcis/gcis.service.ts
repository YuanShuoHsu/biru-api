import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

import type { BusinessInfoResponseDto } from './dto/business-info-response.dto.js';

interface GcisCompany {
  Business_Accounting_NO: string;
  Company_Location: string;
  Company_Name: string;
  Company_Status_Desc: string;
  Responsible_Name: string;
}

// https://data.gov.tw/dataset/108337
// https://data.gcis.nat.gov.tw/resources/swagger/index.html
// http://data.gcis.nat.gov.tw/resources/swagger/swagger.json
const GCIS_API_URL =
  'https://data.gcis.nat.gov.tw/od/data/api/5F64D864-61CB-4D0D-8AD9-492047CC1EA6';

@Injectable()
export class GcisService {
  private readonly logger = new Logger(GcisService.name);

  async findByBusinessNo(
    businessNo: string,
  ): Promise<BusinessInfoResponseDto | null> {
    const filter = encodeURIComponent(
      `Business_Accounting_NO eq ${businessNo}`,
    );
    const query = `$filter=${filter}&$format=json&$skip=0&$top=1`;

    let data: GcisCompany[];
    try {
      const res = await fetch(`${GCIS_API_URL}?${query}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();
      if (!text.trim()) return null;

      data = JSON.parse(text) as GcisCompany[];
      if (!Array.isArray(data)) throw new Error('not an array');
    } catch (err) {
      this.logger.warn(`商工登記查詢失敗：${String(err)}`);
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        code: 'lookupUnavailable',
        message:
          I18nContext.current<I18nTranslations>()?.t(
            'common.gcis.lookupUnavailable',
          ) ?? 'lookupUnavailable',
      });
    }
    if (!data.length) return null;

    const company = data[0];

    return {
      address: company.Company_Location,
      name: company.Company_Name,
      representativeName: company.Responsible_Name,
    };
  }
}
