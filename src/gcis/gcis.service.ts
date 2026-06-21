import { Injectable } from '@nestjs/common';

export interface BusinessInfo {
  name: string;
  address: string;
}

interface GcisCompany {
  Business_Accounting_NO: string;
  Company_Location: string;
  Company_Name: string;
  Company_Status_Desc: string;
}

const GCIS_API_URL =
  'https://data.gcis.nat.gov.tw/od/data/api/5F64D864-61CB-4D0D-8AD9-492047CC1EA6';

@Injectable()
export class GcisService {
  async findByBusinessNo(businessNo: string): Promise<BusinessInfo | null> {
    const filter = encodeURIComponent(
      `Business_Accounting_NO eq ${businessNo}`,
    );
    const query = `$filter=${filter}&$format=json&$skip=0&$top=1`;

    const res = await fetch(`${GCIS_API_URL}?${query}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;

    const text = await res.text();
    if (!text.trim()) return null;

    const data: GcisCompany[] = JSON.parse(text) as GcisCompany[];
    if (!data.length) return null;

    const company = data[0];

    return {
      address: company.Company_Location,
      name: company.Company_Name,
    };
  }
}
