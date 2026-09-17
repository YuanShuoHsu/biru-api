import {
  describedPeriod,
  parseDataGovResources,
  parseHealthGrades,
  parseLaborGrades,
  rocPeriod,
} from './rule-source';

describe('Official insurance grade sources', () => {
  it('converts ROC effective dates and resource labels to payroll periods', () => {
    expect(rocPeriod('1150101')).toBe('2026-01');
    expect(rocPeriod('1141201')).toBe('2025-12');
    expect(rocPeriod('')).toBeNull();
    expect(rocPeriod('2026-01')).toBeNull();
    expect(describedPeriod('115年1月全民健康保險投保金額分級表')).toBe(
      '2026-01',
    );
    expect(describedPeriod('勞工保險投保薪資分級表(115年1月1日起適用)')).toBe(
      '2026-01',
    );
    expect(describedPeriod('2026年1月全民健康保險投保金額分級表')).toBe(
      '2026-01',
    );
    expect(describedPeriod('投保金額分級表')).toBeNull();
  });
  it('reads the data.gov.tw distribution list', () => {
    const resources = parseDataGovResources({
      result: {
        distribution: [
          {
            resourceDescription: '115年1月',
            resourceFormat: 'csv',
            resourceDownloadUrl: 'https://example.test/a.csv',
          },
          { resourceDescription: '無下載網址' },
        ],
      },
    });
    expect(resources).toEqual([
      {
        description: '115年1月',
        format: 'CSV',
        url: 'https://example.test/a.csv',
      },
    ]);
    expect(parseDataGovResources({})).toEqual([]);
  });
  it('separates the general and part-time labor ladders and sorts them', () => {
    const payload = [
      {
        適用起日: '1150101',
        身分別: '一般勞工',
        月投保薪資: '30300',
      },
      {
        適用起日: '1150101',
        身分別: '一般勞工',
        月投保薪資: '29500',
      },
      {
        適用起日: '1150101',
        身分別: '部分工時勞工',
        月投保薪資: '13500',
      },
      {
        適用起日: '1140101',
        身分別: '一般勞工',
        月投保薪資: '28590',
      },
      {
        適用起日: '1150101',
        身分別: '部分工時勞工',
        月投保薪資: '11100',
      },
      {
        適用起日: '1150101',
        身分別: '庇護性身心障礙者',
        月投保薪資: '6000',
      },
    ];
    const grades = parseLaborGrades(payload, '一般勞工');
    expect(grades.get('2026-01')).toEqual([29500, 30300]);
    expect(grades.get('2025-01')).toEqual([28590]);
    const partTime = parseLaborGrades(payload, '部分工時勞工');
    expect(partTime.get('2026-01')).toEqual([11100, 13500]);
    expect(partTime.has('2025-01')).toBe(false);
  });
  it('accepts the web service envelope as well as the bare array', () => {
    const grades = parseLaborGrades(
      {
        success: true,
        result: {
          records: [
            { 適用起日: '1150101', 身分別: '一般勞工', 月投保薪資: '45800' },
          ],
        },
      },
      '一般勞工',
    );
    expect(grades.get('2026-01')).toEqual([45800]);
  });
  it('parses the health ladder past its byte order mark', () => {
    const csv =
      '﻿組別級距,投保等級,月投保金額（元）,實際薪資月額（元）\n' +
      '第一組級距1200元,1,29500,29500以下\n' +
      '第二組級距1500元,2,30300,29501-30300\n' +
      '\n';
    expect(parseHealthGrades(csv)).toEqual([29500, 30300]);
    expect(parseHealthGrades('')).toEqual([]);
  });
  it('follows the amount column by name when the source reorders it', () => {
    const csv =
      '投保等級,月投保金額（元）,組別級距,實際薪資月額（元）\n' +
      '1,29500,第一組級距1200元,29500以下\n' +
      '2,30300,第二組級距1500元,29501-30300\n';
    expect(parseHealthGrades(csv)).toEqual([29500, 30300]);
    expect(parseHealthGrades('投保等級,實際薪資月額（元）\n1,29500')).toEqual(
      [],
    );
  });
});
