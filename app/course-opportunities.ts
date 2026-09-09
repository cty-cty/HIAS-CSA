import { normalizeCourseName } from './credit-model';

// Source: 物光学院2026-2027课程按专业合并整理.xlsx, four subject sheets, column L.
// Planned opportunity only, never a mandatory semester or a guarantee of offering.
const fallCourses = [
  '半导体光谱学导论', '半导体工艺与制造技术', '数学物理方法（电子与通信类）', '半导体微纳加工技术',
  '光电探测器件物理与技术', '现代传感器技术与应用', '主被动光谱探测技术',
  '集成与微纳光子学', '高等光学原理', '光电工程', '光纤技术原理', '光电子材料与器件',
  '激光原理', '红外半导体器件仿真与测试', '固体光谱学导论', '光学薄膜技术及应用',
  '红外智能感知光电探测系统概论', '半导体器件物理与工艺',
  // 自然语言处理: school notice and college workbook disagree on semester;
  // exclude from fall-only opportunity bonuses until the sources are reconciled.
  '并行计算与实现技术', '计算机网络技术', '高级数据库系统',
  '有机合成精细化工基础', '现代有机波谱分析与运用', '材料表面与界面（材料与化工）',
  '材料合成与制备（材料与化工）', '固体物理（材料与化工）', '固体材料化学（材料与化工）',
  '计算材料学专题', '光子集成芯片基础（材料与化工）', '半导体光子学（材料与化工）',
];
const fallNames = new Set(fallCourses.map(normalizeCourseName));
export function sourceSemesterNote(name: string) {
  const normalized = normalizeCourseName(name);
  if (normalized === 'FPGA电路软硬件设计') return 'both';
  return fallNames.has(normalized) ? 'fall' : undefined;
}
