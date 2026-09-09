import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  COLLEGE_DIRECTORY,
  FALLBACK_PROGRAM_PLAN_COLLEGE,
  getProgramPlanCollege,
  groupProgramPlansByCollege,
  PROGRAM_PLANS,
} from '../app/program-plans.ts';

assert.deepEqual(
  COLLEGE_DIRECTORY.map((entry) => entry.label),
  [
    '基础物理与数学科学学院',
    '物理与光电工程学院',
    '化学与材料科学学院',
    '生命与健康科学学院',
    '药物科学与技术学院',
    '环境学院',
    '分子医学院',
    '智能科学与技术学院',
  ],
);
import {
  calculateCreditSummary,
  getCanonicalCourseId,
  getCourseRequirementType,
  getCourseRoleEligibility,
  reconcileCourseSources,
} from '../app/credit-model.ts';
import {
  calculateProgramGaps,
  courseCountsTowardSemesterMinimum,
  getProgramChecks,
} from '../app/program-rules.ts';
import { generateRecommendationPlans } from '../app/recommendation-engine.ts';

const spring = JSON.parse(
  fs.readFileSync('app/courses-spring.json', 'utf8'),
);
const springNames = new Set(spring.map((course) => course.name));
const requiredSpringNames = [
  '高级红外光电工程导论',
  '信息光子学物理',
  '半导体器件物理学',
  '光电成像原理与技术',
  '数字系统中的模拟电路技术',
  'FPGA电路软硬件设计',
  '专业英语',
  '超快现象与超快光谱',
  '量子光学',
  '数字图像处理',
  '非线性光学导论',
  '高级人工智能',
  '人工智能的数学基础与应用',
  '智能物联网技术及应用',
  '绿色工艺与技术',
  '基因工程',
  '磁性材料',
];
assert.ok(requiredSpringNames.every((name) => springNames.has(name)));
assert.ok(
  spring.every(
    (course) =>
      course.scheduleStatus === 'planned' &&
      course.dataStatus === 'planned_course' &&
      course.capacity === null &&
      course.enrolled === null,
  ),
);
assert.ok(
  spring.every(
    (course) => !course.officialCode || !/^SP/i.test(course.officialCode),
  ),
);

const optical = PROGRAM_PLANS.find((plan) => plan.id === 'optical-master');
const ai = PROGRAM_PLANS.find((plan) => plan.id === 'ai-master');
assert.ok(optical && ai);
const builtInCollegeGroups = groupProgramPlansByCollege(PROGRAM_PLANS);
assert.equal(
  builtInCollegeGroups.find(([college]) => college === '物理与光电工程学院')?.[1].length,
  PROGRAM_PLANS.length,
);
assert.equal(
  getProgramPlanCollege({ college: undefined }),
  FALLBACK_PROGRAM_PLAN_COLLEGE,
);
assert.equal(
  getProgramPlanCollege({ college: '物光学院' }),
  '物理与光电工程学院',
);
const futureCollegePlan = {
  ...optical,
  id: 'future-chemistry-master',
  label: '化学工程 · 专硕',
  program: '化学工程',
  college: '化学与化工学院',
};
assert.equal(
  groupProgramPlansByCollege([...PROGRAM_PLANS, futureCollegePlan]).find(
    ([college]) => college === '化学与化工学院',
  )?.[1][0].program,
  '化学工程',
);

function course(
  name,
  category = '专业课',
  credits = 2,
  code = '00000000000003',
  subject = '电子科学与技术',
  schedules = [],
) {
  return {
    id: name,
    code,
    name,
    category,
    subject,
    credits,
    schedules,
    scheduleStatus: 'confirmed',
    dataStatus: 'official_schedule',
  };
}

const hias = course('HIAS讲堂', '公共选修课', 1, '000000000000X');
const frontier = course('科学前沿讲座', '科学前沿讲座', 1, '0000000000007');
assert.equal(getCourseRequirementType(hias, 'unset', optical), 'publicElective');
assert.equal(
  getCourseRequirementType(frontier, 'unset', optical),
  'professionalElective',
);
assert.equal(
  getCourseRoleEligibility(course('研讨课示例', '研讨课', 1, '0000000000004'), optical)
    .status,
  'ineligible',
);

const listedCore = course('高等光学原理', '专业核心课', 3, '00000000000002');
const listedProfessional = course('激光原理', '专业课', 3, '00000000000003');
const crossMajor = course('其它专业核心课', '专业核心课', 3, '00000000000902');
assert.equal(getCourseRoleEligibility(listedCore, optical).status, 'eligible');
assert.equal(
  getCourseRoleEligibility(
    course('明确共享课程', '专业课', 2, '00000000000003'),
    { ...optical, sharedCourses: ['明确共享课程'] },
  ).recognitionSource,
  'explicit_shared',
);
assert.equal(
  getCourseRoleEligibility(crossMajor, optical).status,
  'approval_required',
);
assert.equal(
  getCourseRoleEligibility(
    course('无依据跨领域课程', '专业课', 2, '00000000000903', '法学'),
    optical,
  ).status,
  'verification',
);
const classificationConflict = course(
  '属性冲突课程',
  '专业课',
  2,
  '00000000000001',
);
assert.equal(reconcileCourseSources(classificationConflict).sourceStatus, 'conflict');
assert.equal(
  getCourseRoleEligibility(classificationConflict, optical).status,
  'verification',
);
assert.equal(getCourseRequirementType(classificationConflict, 'degree', optical), 'pending');

const fourDegreeCourses = [
  listedCore,
  course('光电工程', '专业核心课', 3, '00000000000102'),
  listedProfessional,
  course('红外半导体器件仿真与测试', '专业课', 3, '00000000000103'),
];
const degreeDesignations = Object.fromEntries(
  fourDegreeCourses.map((item) => [
    `family:${getCanonicalCourseId(item)}`,
    'degree',
  ]),
);
const degreeGaps = calculateProgramGaps({
  selectedCourses: fourDegreeCourses,
  designations: degreeDesignations,
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: optical,
  termLabel: '2026 秋季',
});
assert.equal(degreeGaps.coreCount, 2);
assert.equal(degreeGaps.professionalCount, 2);
assert.equal(degreeGaps.professionalDegreeCredits, 12);
const crossSemesterGaps = calculateProgramGaps({
  selectedCourses: fourDegreeCourses,
  semesterCourses: [fourDegreeCourses[0]],
  designations: degreeDesignations,
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: optical,
  termLabel: '2027 春季',
});
assert.equal(crossSemesterGaps.coreCount, 2);
assert.equal(crossSemesterGaps.professionalCount, 2);
assert.equal(crossSemesterGaps.semesterCredits, fourDegreeCourses[0].credits);
const approvalGaps = calculateProgramGaps({
  selectedCourses: [crossMajor],
  designations: { [`family:${getCanonicalCourseId(crossMajor)}`]: 'degree' },
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: optical,
  termLabel: '2026 秋季',
});
assert.equal(approvalGaps.professionalDegreeCredits, 0);
assert.equal(approvalGaps.approvalRequiredCount, 1);
assert.equal(approvalGaps.approvalRequiredDegreeCredits, crossMajor.credits);
assert.equal(approvalGaps.professionalDegreeCreditsWithApproval, crossMajor.credits);
assert.deepEqual(approvalGaps.approvalRequiredCourseNames, ['其它专业核心课']);
const crossMajorBeforeOwnStructure = generateRecommendationPlans({
  courses: [crossMajor],
  selectedCourses: [],
  designations: {},
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: optical,
  termLabel: '2026 秋季',
});
assert.ok(
  crossMajorBeforeOwnStructure.every((plan) => plan.addedCourses.length === 0),
);
const crossMajorAfterOwnStructure = generateRecommendationPlans({
  courses: [crossMajor],
  selectedCourses: fourDegreeCourses,
  designations: degreeDesignations,
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: optical,
  termLabel: '2026 秋季',
});
assert.ok(
  crossMajorAfterOwnStructure.every((plan) => plan.addedCourses.length === 0),
);
// Explicit expansion is independent of whether own 2+2 has been completed.
const expanded = generateRecommendationPlans({
  courses: [crossMajor], selectedCourses: [], designations: {}, historicalRecords: [],
  exemptionStatus: 'normal', plan: optical, termLabel: '2027 春季', allowApprovalRequired: true,
});
assert.ok(expanded.some((p) => p.gaps.approvalRequiredDegreeCredits === 3 && p.candidates[0].designation === 'degree'));

const aiCourses = [
  course('自然语言处理', '专业核心课', 3, '00000000000002'),
  course('人工智能的数学基础与应用', '专业核心课', 2, '00000000000102'),
];
const aiDesignations = Object.fromEntries(
  aiCourses.map((item) => [`family:${getCanonicalCourseId(item)}`, 'degree']),
);
const aiGaps = calculateProgramGaps({
  selectedCourses: aiCourses,
  designations: aiDesignations,
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: ai,
  termLabel: '2026 秋季',
});
assert.equal(aiGaps.coreCount, 2);
assert.equal(aiGaps.specialRules[0]?.satisfied, true);

const hiasSummary = calculateCreditSummary({
  selectedCourses: [hias, frontier],
  designations: {},
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: optical,
});
assert.equal(hiasSummary.publicElectiveCredits, 1);
assert.equal(hiasSummary.ordinaryPublicElectiveCredits, 1);
assert.equal(hiasSummary.professionalElectiveCredits, 1);
assert.equal(courseCountsTowardSemesterMinimum(hias), false);
assert.equal(courseCountsTowardSemesterMinimum(frontier), false);
const innovation = course(
  '创新创业实践及案例研究',
  '公共选修课',
  1,
  '280216120100MX001',
  '管理科学与工程',
);
const publicSystemSummary = calculateCreditSummary({
  selectedCourses: [innovation],
  designations: {},
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: optical,
});
assert.equal(publicSystemSummary.publicElectiveCredits, 1);
assert.equal(publicSystemSummary.ordinaryPublicElectiveCredits, 0);
assert.equal(publicSystemSummary.innovationCredits, 1);

const noWeekOverlap = [
  course('高等光学原理', '专业核心课', 3, '00000000000102', '电子科学与技术', [
    { dayIndex: 1, start: 1, end: 3, weeks: [2, 3] },
  ]),
  course('激光原理', '专业课', 3, '00000000000203', '电子科学与技术', [
    { dayIndex: 1, start: 1, end: 3, weeks: [10, 11] },
  ]),
];
const recommendationPlans = generateRecommendationPlans({
  courses: [
    ...noWeekOverlap,
      course('光电工程', '专业核心课', 3, '00000000000302', '电子科学与技术', [
      { dayIndex: 2, start: 1, end: 2, weeks: [1, 2] },
    ]),
  ],
  selectedCourses: noWeekOverlap,
  designations: {},
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: optical,
  termLabel: '2026 秋季',
});
assert.ok(recommendationPlans.length <= 3);
assert.ok(
  recommendationPlans.every(
    (plan) => plan.candidates.length <= 10 && plan.conflicts === 0,
  ),
);
const sectionPlans = generateRecommendationPlans({
  courses: [
    course('高等光学原理', '专业核心课', 3, '280216085408P2001-01'),
    course('高等光学原理', '专业核心课', 3, '280216085408P2001-02'),
  ],
  selectedCourses: [],
  designations: {},
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: optical,
  termLabel: '2026 秋季',
});
assert.ok(sectionPlans.every((plan) => plan.addedCourses.length <= 1));

const springGaps = calculateProgramGaps({
  selectedCourses: [listedCore],
  designations: { [`family:${getCanonicalCourseId(listedCore)}`]: 'degree' },
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: optical,
  termLabel: '2026 秋季',
  futureCourses: spring,
});
assert.ok(springGaps.springOpportunity.professional > 0);

const fallChecks = getProgramChecks({
  selectedCourses: [],
  designations: {},
  historicalRecords: [],
  plan: optical,
  gaps: calculateProgramGaps({
    selectedCourses: [],
    designations: {},
    historicalRecords: [],
    exemptionStatus: 'normal',
    plan: optical,
    termLabel: '2026 秋季',
  }),
  termId: '2026-fall',
  conflictCount: 0,
});
assert.ok(fallChecks.some((check) => check.id === 'fall-required-自然辩证法概论'));

console.log(`规则验证通过：${requiredSpringNames.length} 门春季方案课程、课程归类、AI特殊规则、冲突周次和秋季必修检查。`);
