/** 合同类型在库里以中文存储，展示时按语言翻译。 */
const CONTRACT_KEYS: Record<string, string> = {
  "正式员工": "sheet.person.contractRegular",
  "外包": "sheet.person.contractOutsourced",
  "实习生": "sheet.person.contractIntern",
  "外部顾问": "sheet.person.contractConsultant",
  "访问学者": "sheet.person.contractVisitingScholar",
};

export function contractLabel(t: (k: string) => string, value?: string | null): string | null {
  if (!value) return null;
  const key = CONTRACT_KEYS[value];
  return key ? t(key) : value;
}
