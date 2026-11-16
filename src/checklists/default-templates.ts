import type { CreateChecklistTemplateDto } from './dto/checklist-template.dto.js';

const checks = (...labels: string[]) =>
  labels.map((label) => ({ label, type: 'check' as const }));

export const DEFAULT_CHECKLIST_TEMPLATES: CreateChecklistTemplateDto[] = [
  {
    name: '開店',
    timing: 'opening',
    items: checks(
      '開啟照明與空調',
      '咖啡機與磨豆機開機並完成預熱',
      '檢查牛奶與食材的有效期限',
      '清潔吧台、桌面與座位區',
      '確認零用金',
    ),
  },
  {
    name: '打烊',
    timing: 'closing',
    items: checks(
      '清洗咖啡機沖煮頭與蒸氣管',
      '清洗磨豆機、器具與水槽',
      '剩餘食材標示日期後冷藏',
      '清潔地面並清運垃圾與回收',
      '關閉設備電源、照明與空調',
      '門窗上鎖',
    ),
  },
  {
    name: '冷藏冷凍溫度',
    timing: 'anytime',
    // https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=L0040122&flno=8
    items: [
      { label: '冷藏庫溫度', type: 'number', unit: '°C', maxValue: 7 },
      { label: '冷凍庫溫度', type: 'number', unit: '°C', maxValue: -12 },
    ],
  },
];
