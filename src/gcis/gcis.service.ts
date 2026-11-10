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

interface GcisBusinessRegistration {
  Agency: string;
  Business_Address: string;
  Business_Current_Status: string;
  Business_Name: string;
  President_No: string;
}

interface GcisBusinessResponsible {
  President_No: string;
  Responsible_Name: string;
}

// https://data.gov.tw/dataset/22197
// https://data.gov.tw/dataset/44710
// https://data.gov.tw/dataset/108339
// https://data.gcis.nat.gov.tw/resources/swagger/index.html
// http://data.gcis.nat.gov.tw/resources/swagger/swagger.json
const GCIS_API_URL = 'https://data.gcis.nat.gov.tw/od/data/api';
const COMPANY_DATASET = '5F64D864-61CB-4D0D-8AD9-492047CC1EA6';
const BUSINESS_REGISTRATION_DATASET = '426D5542-5F05-43EB-83F9-F1300F14E1F1';
const BUSINESS_RESPONSIBLE_DATASET = '7E6AFA72-AD6A-46D3-8681-ED77951D912D';
const MAX_TOP = 1000;
// https://data.gcis.nat.gov.tw/resources/doc/datacode.odt 表7（公司現況）、表12（商業現況）
// 停業的公司現況仍是核准設立；外國公司的現況是表7 沒列的核准登記
const IN_FORCE_COMPANY_STATUSES = new Set([
  '核准設立',
  '核准設立，但已命令解散',
  '重整',
  '接管',
  '核准登記',
]);
const COMPANY_STATUSES = new Set([
  ...IN_FORCE_COMPANY_STATUSES,
  '解散',
  '撤銷',
  '破產',
  '合併解散',
  '撤回登記',
  '廢止',
  '廢止認許',
  '解散已清算完結',
  '撤銷已清算完結',
  '廢止已清算完結',
  '撤回登記已清算完結',
  '撤銷登記已清算完結',
  '廢止登記已清算完結',
  '撤銷登記',
  '分割解散',
  '終止破產',
  '中止破產',
  '塗銷破產',
  '破產程序終結(終止)',
  '破產程序終結(終止)清算中',
  '破產已清算完結',
  '撤銷無需清算',
  '撤銷許可',
  '廢止許可',
  '撤銷許可已清算完結',
  '廢止許可已清算完結',
  '清理',
  '撤銷公司設立',
  '清理完結',
]);
const IN_FORCE_BUSINESS_STATUSES = new Set(['01', '02', '04', '06']);
const BUSINESS_STATUSES = new Set([
  ...IN_FORCE_BUSINESS_STATUSES,
  '03',
  '05',
  '07',
  '08',
]);
const AGENCY_PATTERN = /^\d{9}[A-Z]$/;

const toBusinessInfo = (company: GcisCompany): BusinessInfoResponseDto => ({
  address: company.Company_Location,
  name: company.Company_Name,
  representativeName: company.Responsible_Name,
});

@Injectable()
export class GcisService {
  private readonly logger = new Logger(GcisService.name);

  async findByBusinessNo(
    businessNo: string,
  ): Promise<BusinessInfoResponseDto | null> {
    const signal = AbortSignal.timeout(10000);
    const registrationCancel = new AbortController();
    const companyLookup = Promise.allSettled([
      this.find<GcisCompany>(
        COMPANY_DATASET,
        `Business_Accounting_NO eq ${businessNo}`,
        signal,
      ),
    ]);
    const registrationLookup = Promise.allSettled([
      this.find<GcisBusinessRegistration>(
        BUSINESS_REGISTRATION_DATASET,
        `President_No eq ${businessNo}`,
        AbortSignal.any([signal, registrationCancel.signal]),
        MAX_TOP,
      ),
    ]);

    const [companyResult] = await companyLookup;
    const company =
      companyResult.status === 'fulfilled' ? companyResult.value[0] : undefined;
    if (
      company &&
      this.isInForce(
        company.Company_Status_Desc,
        IN_FORCE_COMPANY_STATUSES,
        COMPANY_STATUSES,
        '公司現況',
      )
    ) {
      registrationCancel.abort();
      return toBusinessInfo(company);
    }

    const [registrationResult] = await registrationLookup;
    if (registrationResult.status === 'rejected')
      throw registrationResult.reason;
    const business = registrationResult.value.find(
      ({ Business_Current_Status }) =>
        this.isInForce(
          Business_Current_Status,
          IN_FORCE_BUSINESS_STATUSES,
          BUSINESS_STATUSES,
          '商業現況代碼',
        ),
    );
    if (business)
      return {
        address: business.Business_Address,
        name: business.Business_Name,
        representativeName: await this.findResponsibleName(
          businessNo,
          business.Agency,
          signal,
        ),
      };

    if (companyResult.status === 'rejected') throw companyResult.reason;
    // https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0080001&flno=25
    return company ? toBusinessInfo(company) : null;
  }

  private isInForce(
    status: string,
    inForceStatuses: Set<string>,
    statuses: Set<string>,
    label: string,
  ) {
    if (statuses.has(status)) return inForceStatuses.has(status);
    this.logger.warn(`${label}不在代碼表內：${status}`);
    return true;
  }

  private async findResponsibleName(
    businessNo: string,
    agency: string,
    signal: AbortSignal,
  ) {
    if (!AGENCY_PATTERN.test(agency)) {
      this.logger.warn(`申登機關代碼格式不符：${agency}`);
      return '';
    }
    const [responsible] = await this.find<GcisBusinessResponsible>(
      BUSINESS_RESPONSIBLE_DATASET,
      `President_No eq ${businessNo} and Agency eq ${agency}`,
      signal,
    ).catch(() => []);
    return responsible?.Responsible_Name ?? '';
  }

  private async find<T>(
    dataset: string,
    filter: string,
    signal: AbortSignal,
    top = 1,
  ) {
    const query = `$filter=${encodeURIComponent(filter)}&$format=json&$skip=0&$top=${top}`;

    let data: T[];
    try {
      const res = await fetch(`${GCIS_API_URL}/${dataset}?${query}`, {
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();
      if (!text.trim()) return [];

      data = JSON.parse(text) as T[];
      if (!Array.isArray(data)) throw new Error('not an array');
    } catch (err) {
      // https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static
      // 逾時是 TimeoutError 要回 503；AbortError 只來自查到有效公司後取消的商業登記查詢
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      this.logger.warn(`商工登記查詢失敗（${dataset}）：${String(err)}`);
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        code: 'lookupUnavailable',
        message:
          I18nContext.current<I18nTranslations>()?.t(
            'common.gcis.lookupUnavailable',
          ) ?? 'lookupUnavailable',
      });
    }

    return data;
  }
}
