export type StudentTrack =
  | 'masters'
  | 'general_phd'
  | 'direct_phd'
  | 'combined_phd';

export type ProgramSpecialRule =
  | {
      id: string;
      type: 'atLeastOneOf' | 'minimumCourseCount';
      minimum: number;
      courseNames: string[];
      courseType?: 'core' | 'professional';
      allowedLevels?: string[];
      degreeOnly?: boolean;
      label: string;
    }
  | {
      id: string;
      type: 'requiredCourse';
      courseNames: string[];
      courseType?: 'core' | 'professional';
      allowedLevels?: string[];
      degreeOnly?: boolean;
      label: string;
    };

export type ProgramPlan = {
  id: string;
  label: string;
  degree: string;
  program: string;
  /** 所属学院分组；旧版自定义方案缺失时归入“其他培养方案”。 */
  college?: string;
  code: string;
  totalCredits: number | null;
  publicRequiredCredits: number | null;
  publicRequiredDegreeCredits?: number | null;
  publicRequiredNonDegreeCredits?: number | null;
  requiredPublicRequiredNonDegreeCourses?: string[];
  degreeCourseCredits: number;
  professionalNonDegreeCredits: number | null;
  publicElectiveCredits: number | null;
  innovationCredits: number | null;
  coreMinimum: number;
  professionalMinimum: number;
  coreCourses: string[];
  professionalCourses: string[];
  sharedCourses?: string[];
  source?: string;
  updatedAt?: string;
  note?: string;
  /** 新字段均为可选，保证旧版本地方案和备份仍可读取。 */
  studentTrack?: StudentTrack;
  specialRules?: ProgramSpecialRule[];
  degreeStructureStatus?: 'confirmed' | 'verification';
};

export type CollegeDirectoryEntry = {
  id: string;
  label: string;
  aliases?: string[];
};

/** 学院一级目录；没有课程或培养方案的学院也可以先占位展示。 */
export const COLLEGE_DIRECTORY: CollegeDirectoryEntry[] = [
  { id: 'physics-mathematics', label: '基础物理与数学科学学院' },
  {
    id: 'physics-optoelectronics',
    label: '物理与光电工程学院',
    aliases: ['物光学院'],
  },
  { id: 'chemistry-materials', label: '化学与材料科学学院' },
  { id: 'life-health', label: '生命与健康科学学院' },
  { id: 'pharmaceutical-science', label: '药物科学与技术学院' },
  { id: 'environment', label: '环境学院' },
  { id: 'molecular-medicine', label: '分子医学院' },
  { id: 'intelligent-science-technology', label: '智能科学与技术学院' },
];

export const FALLBACK_PROGRAM_PLAN_COLLEGE = '其他培养方案';

export function getProgramPlanCollege(
  plan: Pick<ProgramPlan, 'college'>,
): string {
  const college = plan.college?.trim();
  if (!college) return FALLBACK_PROGRAM_PLAN_COLLEGE;
  const directoryEntry = COLLEGE_DIRECTORY.find(
    (entry) => entry.label === college || entry.aliases?.includes(college),
  );
  return directoryEntry?.label ?? college;
}

export function groupProgramPlansByCollege(
  plans: ProgramPlan[],
): Array<[string, ProgramPlan[]]> {
  const groupMap = new Map<string, ProgramPlan[]>();
  plans.forEach((plan) => {
    const college = getProgramPlanCollege(plan);
    const group = groupMap.get(college) ?? [];
    group.push(plan);
    groupMap.set(college, group);
  });
  return [...groupMap.entries()];
}

const PHYSICAL_ELECTRONICS_CORE = [
  '半导体光谱学导论',
  '半导体工艺与制造技术',
  '数学物理方法（电子与通信类）',
  '半导体微纳加工技术',
  '高级红外光电工程导论',
  '信息光子学物理',
  '半导体器件物理学',
];

const PHYSICAL_ELECTRONICS_PROFESSIONAL = [
  '光电探测器件物理与技术',
  '现代传感器技术与应用',
  '主被动光谱探测技术',
  '光电成像原理与技术',
  '数字系统中的模拟电路技术',
];

export const PROGRAM_PLANS: ProgramPlan[] = [
  {
    id: 'physical-master',
    label: '物理电子学 · 学硕',
    degree: '学术型硕士',
    program: '物理电子学',
    college: '物光学院',
    code: '0809 电子科学与技术',
    totalCredits: 30,
    publicRequiredCredits: 7,
    publicRequiredDegreeCredits: 7,
    publicRequiredNonDegreeCredits: 0,
    requiredPublicRequiredNonDegreeCourses: [],
    degreeCourseCredits: 12,
    professionalNonDegreeCredits: null,
    publicElectiveCredits: 2,
    innovationCredits: null,
    coreMinimum: 2,
    professionalMinimum: 2,
    studentTrack: 'masters',
    coreCourses: PHYSICAL_ELECTRONICS_CORE,
    professionalCourses: PHYSICAL_ELECTRONICS_PROFESSIONAL,
  },
  {
    id: 'optical-master',
    label: '光电信息工程 · 专硕',
    degree: '专业型硕士',
    program: '光电信息工程',
    college: '物光学院',
    code: '085408 光电信息工程',
    totalCredits: 25,
    publicRequiredCredits: 8,
    publicRequiredDegreeCredits: 7,
    publicRequiredNonDegreeCredits: 1,
    requiredPublicRequiredNonDegreeCourses: ['工程伦理'],
    degreeCourseCredits: 12,
    professionalNonDegreeCredits: 2,
    publicElectiveCredits: 2,
    innovationCredits: 1,
    coreMinimum: 2,
    professionalMinimum: 2,
    studentTrack: 'masters',
    coreCourses: [
      '集成与微纳光子学',
      '高等光学原理',
      '光电工程',
      '光纤技术原理',
      '光电子材料与器件',
    ],
    professionalCourses: [
      '激光原理',
      '红外半导体器件仿真与测试',
      'FPGA电路软硬件设计',
      '固体光谱学导论',
      '光学薄膜技术及应用',
      '红外智能感知光电探测系统概论',
      '半导体器件物理与工艺',
      '专业英语',
      '超快现象与超快光谱',
      '量子光学',
      '数字图像处理',
      '非线性光学导论',
    ],
    specialRules: [],
  },
  {
    id: 'ai-master',
    label: '人工智能 · 专硕',
    degree: '专业型硕士',
    program: '人工智能',
    college: '物光学院',
    code: '085410 人工智能',
    totalCredits: 25,
    publicRequiredCredits: 8,
    publicRequiredDegreeCredits: 7,
    publicRequiredNonDegreeCredits: 1,
    requiredPublicRequiredNonDegreeCourses: ['工程伦理'],
    degreeCourseCredits: 12,
    professionalNonDegreeCredits: 2,
    publicElectiveCredits: 2,
    innovationCredits: 1,
    coreMinimum: 2,
    professionalMinimum: 2,
    studentTrack: 'masters',
    coreCourses: ['自然语言处理', '高级人工智能', '人工智能的数学基础与应用'],
    professionalCourses: [
      '并行计算与实现技术',
      '计算机网络技术',
      '高级数据库系统',
      '智能物联网技术及应用',
    ],
    note: '核心课程至少选2门，其中至少1门须从《高级人工智能》《自然语言处理》中选择；专业课不包括研讨课和实验课。',
    specialRules: [
      {
        id: 'ai-core-one',
        courseType: 'core',
        type: 'atLeastOneOf',
        minimum: 1,
        courseNames: ['高级人工智能', '自然语言处理'],
        degreeOnly: true,
        label: '《高级人工智能》《自然语言处理》至少1门作为核心学位课',
      },
    ],
  },
  {
    id: 'materials-master',
    label: '材料工程 · 专硕',
    degree: '专业型硕士',
    program: '材料工程',
    college: '物光学院',
    code: '085601 材料工程',
    totalCredits: 25,
    publicRequiredCredits: 8,
    publicRequiredDegreeCredits: 7,
    publicRequiredNonDegreeCredits: 1,
    requiredPublicRequiredNonDegreeCourses: ['工程伦理'],
    degreeCourseCredits: 12,
    professionalNonDegreeCredits: 2,
    publicElectiveCredits: 2,
    innovationCredits: 1,
    coreMinimum: 2,
    professionalMinimum: 2,
    studentTrack: 'masters',
    coreCourses: [
      '有机合成精细化工基础',
      '现代有机波谱分析与运用',
      '材料表面与界面（材料与化工）',
      '材料合成与制备（材料与化工）',
      '固体物理（材料与化工）',
      '固体材料化学（材料与化工）',
    ],
    professionalCourses: [
      '计算材料学专题',
      '绿色工艺与技术',
      '基因工程',
      '光子集成芯片基础（材料与化工）',
      '半导体光子学（材料与化工）',
      '磁性材料',
    ],
  },
  {
    id: 'physical-doctor',
    label: '物理电子学 · 普通招考博士',
    degree: '博士',
    program: '物理电子学',
    college: '物光学院',
    code: '0809 电子科学与技术',
    totalCredits: 38,
    publicRequiredCredits: 11,
    publicRequiredDegreeCredits: 11,
    publicRequiredNonDegreeCredits: 0,
    requiredPublicRequiredNonDegreeCourses: [],
    degreeCourseCredits: 16,
    professionalNonDegreeCredits: null,
    publicElectiveCredits: 2,
    innovationCredits: null,
    coreMinimum: 0,
    professionalMinimum: 0,
    coreCourses: PHYSICAL_ELECTRONICS_CORE,
    professionalCourses: PHYSICAL_ELECTRONICS_PROFESSIONAL,
    studentTrack: 'general_phd',
    degreeStructureStatus: 'verification',
    specialRules: [{
      id: 'general-phd-own-course', type: 'minimumCourseCount', minimum: 1,
      courseNames: [...PHYSICAL_ELECTRONICS_CORE, ...PHYSICAL_ELECTRONICS_PROFESSIONAL],
      degreeOnly: true, allowedLevels: ['硕博通用', '博士'],
      label: '至少1门本学科硕博通用或博士专属核心/专业课作为学位课',
    }],
    note:
      '学院材料已明确：普通招考博士总学分不少于38、公共必修不少于11、专业学位课不少于16、公共选修不少于2。具体博士核心课和专业课门数、不同培养类型的课程结构仍需结合学院方案确认，不套用硕士2+2。',
  },
  ...(['direct_phd', 'combined_phd'] as const).map((studentTrack): ProgramPlan => ({
    id: 'physical-' + studentTrack,
    label: '物理电子学 · ' + (studentTrack === 'direct_phd' ? '直博' : '硕博连读'),
    degree: '博士', program: '物理电子学', college: '物光学院', code: '0809 电子科学与技术',
    studentTrack, totalCredits: null,
    publicRequiredCredits: 11, publicRequiredDegreeCredits: 11,
    publicRequiredNonDegreeCredits: 0, requiredPublicRequiredNonDegreeCourses: [],
    degreeCourseCredits: 16, professionalNonDegreeCredits: null,
    publicElectiveCredits: 2, innovationCredits: null, coreMinimum: 2, professionalMinimum: 2,
    coreCourses: PHYSICAL_ELECTRONICS_CORE, professionalCourses: PHYSICAL_ELECTRONICS_PROFESSIONAL,
    note: '学校须知第10、22页及学院物理电子学课程汇总：专业学位至少16学分，核心2门、专业2门分别核对。总学分及学院补充要求待核验；博士英语认定须结合实际培养阶段。',
  })),
];
