import type { ProgramPlan, ProgramSpecialRule, StudentTrack } from './program-plans';
import { sourceSemesterNote } from './course-opportunities';
import {
  calculateCreditSummary,
  coursesShareIdentity,
  courseFamilyKey,
  historicalCourseLike,
  isCourseApplicable,
  isEnglishCourse,
  uniqueCourses,
  getCanonicalCourseId,
  getCourseDesignation,
  getStoredCourseDesignation,
  getCourseRoleEligibility,
  getPlanCourseCounts,
  isHiasCourse,
  isCoreDegreeType,
  isProfessionalDegreeType,
  type CourseDesignation,
  type CourseLike,
  type HistoricalRecord,
  type RecognitionStatus,
} from './credit-model';

export type ProgramScheduleLike = {
  dayIndex: number;
  start: number;
  end: number;
  weeks: number[];
};

export type ProgramCourse = CourseLike & {
  semesterNote?: string;
  schedules?: ProgramScheduleLike[];
};

export type SpecialRuleProgress = {
  id: string;
  label: string;
  current: number;
  minimum: number;
  satisfied: boolean;
};

export type ProgramGaps = {
  totalCredits: number;
  semesterCredits: number;
  semesterMinimumTarget: number | null;
  semesterCreditGap: number;
  semesterExemptionCredits: number;
  publicRequired: string[];
  publicRequiredDegreeCredits: number;
  publicRequiredNonDegreeCredits: number;
  coreCount: number;
  coreTarget: number | null;
  professionalCount: number;
  professionalTarget: number | null;
  professionalDegreeCredits: number;
  professionalDegreeCreditsWithApproval: number;
  approvalRequiredDegreeCredits: number;
  verificationDegreeCredits: number;
  professionalNonDegreeCredits: number;
  publicElectiveCredits: number;
  ordinaryPublicElectiveCredits: number;
  innovationCredits: number;
  publicElectiveGap: number;
  innovationGap: number;
  professionalDegreeGap: number;
  professionalNonDegreeGap: number;
  publicRequiredDegreeGap: number;
  publicRequiredNonDegreeGap: number;
  professionalRequirementsSatisfied: boolean;
  specialRules: SpecialRuleProgress[];
  approvalRequiredCount: number;
  approvalRequiredCourseNames: string[];
  verificationCount: number;
  verificationCourseNames: string[];
  degreeStructureStatus: 'confirmed' | 'verification';
  track: StudentTrack | undefined;
  springOpportunity: {
    core: number;
    professional: number;
  };
};

export type ProgramCheckSeverity = 'must_handle' | 'progress' | 'verification';

export type ProgramCheck = {
  id: string;
  severity: ProgramCheckSeverity;
  label: string;
  detail: string;
  relatedCourseGroups?: Array<{
    label: string;
    names: string[];
  }>;
};

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function isSemesterMinimumCourse(course: ProgramCourse) {
  return !isHiasCourse(course) && !/科学前沿讲座/.test(`${course.category} ${course.name}`);
}

function normalizedCourseName(name: string) {
  return name.replace(/[-—－]?\d+班$/, '').replace(/[\s　]+/g, '');
}

function specialRuleCurrent(
  rule: ProgramSpecialRule,
  selectedCourses: ProgramCourse[],
  designations: Record<string, CourseDesignation>,
  plan: ProgramPlan,
  historicalRecords: HistoricalRecord[],
) {
  const names = new Set(rule.courseNames.map(normalizedCourseName));
  const matchedSelected = selectedCourses.filter((course) => {
    if (!names.has(normalizedCourseName(course.name))) return false;
    if (!isCourseApplicable(course, plan)) return false;
    if (rule.allowedLevels?.length && !rule.allowedLevels.some((level) => course.level?.includes(level))) return false;
    if (rule.degreeOnly && getCourseRoleEligibility(course, plan).status !== 'eligible') return false;
    if (rule.courseType === 'core' && !isCoreDegreeType(course)) return false;
    if (rule.courseType === 'professional' && !isProfessionalDegreeType(course)) return false;
    return (
      !rule.degreeOnly ||
      getCourseDesignation(course, designations, plan) === 'degree'
    );
  });
  const matchedHistorical = historicalRecords.filter((record) => {
    if (!names.has(normalizedCourseName(record.courseName))) return false;
    const course = historicalCourseLike(record);
    if (record.credits <= 0) return false;
    // Old historical records do not store level; do not invent eligibility.
    if (rule.allowedLevels?.length) return false;
    if (rule.degreeOnly && getCourseRoleEligibility(course, plan).status !== 'eligible') return false;
    if (rule.courseType === 'core' && !isCoreDegreeType(course)) return false;
    if (rule.courseType === 'professional' && !isProfessionalDegreeType(course)) return false;
    return !rule.degreeOnly || record.designation === 'degree';
  });
  return uniqueCourses([...matchedSelected, ...matchedHistorical.map(historicalCourseLike)]).length;
}

function countFuturePlanCourses(
  courses: ProgramCourse[],
  names: string[],
  plan: ProgramPlan,
  kind: 'core' | 'professional',
) {
  const targetNames = new Set(names.map(normalizedCourseName));
  const ids = new Set<string>();
  courses.forEach((course) => {
    if (!targetNames.has(normalizedCourseName(course.name))) return;
    if (getCourseRoleEligibility(course, plan).status !== 'eligible') return;
    const matchesType =
      kind === 'core'
        ? isCoreDegreeType(course)
        : isProfessionalDegreeType(course);
    if (matchesType) ids.add(getCanonicalCourseId(course));
  });
  return ids.size;
}

export function evaluateSpecialRules({
  plan,
  selectedCourses,
  designations,
  historicalRecords,
}: {
  plan: ProgramPlan;
  selectedCourses: ProgramCourse[];
  designations: Record<string, CourseDesignation>;
  historicalRecords: HistoricalRecord[];
}) {
  return (plan.specialRules ?? []).map((rule) => {
    const current = specialRuleCurrent(
      rule,
      selectedCourses,
      designations,
      plan,
      historicalRecords,
    );
    const minimum = 'minimum' in rule ? rule.minimum : rule.courseNames.length;
    return {
      id: rule.id,
      label: rule.label,
      current,
      minimum,
      satisfied: current >= minimum,
    } satisfies SpecialRuleProgress;
  });
}

export function calculateProgramGaps({
  selectedCourses,
  semesterCourses,
  designations,
  historicalRecords,
  exemptionStatus,
  plan,
  termLabel,
  futureCourses,
}: {
  selectedCourses: ProgramCourse[];
  /** Courses selected in the active semester; used only for current-semester checks. */
  semesterCourses?: ProgramCourse[];
  designations: Record<string, CourseDesignation>;
  historicalRecords: HistoricalRecord[];
  exemptionStatus: Parameters<typeof calculateCreditSummary>[0]['exemptionStatus'];
  plan: ProgramPlan;
  termLabel: string;
  futureCourses?: ProgramCourse[];
}): ProgramGaps {
  const currentSemesterCourses = semesterCourses ?? selectedCourses;
  const summary = calculateCreditSummary({
    selectedCourses,
    designations,
    historicalRecords,
    exemptionStatus,
    plan,
  });
  const counts = getPlanCourseCounts({
    courses: selectedCourses,
    plan,
    designations,
    historicalRecords,
  });
  const semesterMinimumTarget = /秋|春/.test(termLabel) ? 10 : null;
  const semesterCredits = uniqueCourses(currentSemesterCourses)
    .filter((course) => isSemesterMinimumCourse(course) && isCourseApplicable(course, plan) &&
      !historicalRecords.some((record) => record.credits > 0 && coursesShareIdentity(course, historicalCourseLike(record))) &&
      !(exemptionStatus === 'approved' && plan.studentTrack !== 'general_phd' && isEnglishCourse(course)))
    .reduce((sum, course) => sum + course.credits, 0);
  const structureVerified = plan.degreeStructureStatus !== 'verification';
  const coreTarget = structureVerified ? plan.coreMinimum : null;
  const professionalTarget = structureVerified ? plan.professionalMinimum : null;
  const publicElectiveTarget = plan.publicElectiveCredits ?? 0;
  const historical = historicalRecords.filter((record) => record.credits > 0);
  const known = uniqueCourses([...historical.map(historicalCourseLike), ...selectedCourses]);
  const remainingFuture = (futureCourses ?? []).filter((course) => !known.some((item) => coursesShareIdentity(course, item)));
  const specialRules = evaluateSpecialRules({ plan, selectedCourses, designations, historicalRecords });
  const pendingNames = (status: RecognitionStatus) => known.filter((course) => {
    const record = historical.find((item) => coursesShareIdentity(historicalCourseLike(item), course));
    const designation = record ? record.designation : getCourseDesignation(course, designations, plan);
    return designation === 'degree' && getCourseRoleEligibility(course, plan).status === status;
  }).map((course) => course.name);
  const approvalNames = pendingNames('approval_required');
  const verificationNames = pendingNames('verification');
  return {
    totalCredits: summary.estimatedCredits,
    semesterCredits,
    semesterMinimumTarget,
    semesterExemptionCredits: summary.approvedExemptionCredits,
    semesterCreditGap:
      semesterMinimumTarget === null
        ? 0
        : Math.max(0, semesterMinimumTarget - semesterCredits),
    publicRequired: (plan.requiredPublicRequiredNonDegreeCourses ?? []).filter((name) => !hasCourseName(known, name)),
    publicRequiredDegreeCredits: summary.publicRequiredDegreeCredits,
    publicRequiredNonDegreeCredits: summary.publicRequiredNonDegreeCredits,
    coreCount: counts.coreCount,
    coreTarget,
    professionalCount: counts.professionalCount,
    professionalTarget,
    professionalDegreeCredits: summary.professionalDegreeCredits,
    professionalDegreeCreditsWithApproval:
      summary.professionalDegreeCreditsWithApproval,
    approvalRequiredDegreeCredits: summary.approvalRequiredDegreeCredits,
    verificationDegreeCredits: summary.verificationDegreeCredits,
    professionalNonDegreeCredits: summary.professionalElectiveCredits,
    publicElectiveCredits: summary.publicElectiveCredits,
    ordinaryPublicElectiveCredits: summary.ordinaryPublicElectiveCredits,
    innovationCredits: summary.innovationCredits,
    publicElectiveGap: Math.max(
      0,
      publicElectiveTarget - summary.ordinaryPublicElectiveCredits,
    ),
    innovationGap: Math.max(0, (plan.innovationCredits ?? 0) - summary.innovationCredits),
    professionalDegreeGap: Math.max(0, plan.degreeCourseCredits - summary.professionalDegreeCredits),
    professionalNonDegreeGap: Math.max(0, (plan.professionalNonDegreeCredits ?? 0) - summary.professionalElectiveCredits),
    publicRequiredDegreeGap: Math.max(0, (plan.publicRequiredDegreeCredits ?? 0) - summary.publicRequiredDegreeCredits),
    publicRequiredNonDegreeGap: Math.max(0, (plan.publicRequiredNonDegreeCredits ?? 0) - summary.publicRequiredNonDegreeCredits),
    professionalRequirementsSatisfied: structureVerified && summary.professionalDegreeCredits >= plan.degreeCourseCredits &&
      counts.coreCount >= plan.coreMinimum && counts.professionalCount >= plan.professionalMinimum && specialRules.every((rule) => rule.satisfied),
    specialRules,
    approvalRequiredCount: approvalNames.length,
    approvalRequiredCourseNames: approvalNames,
    verificationCount: verificationNames.length,
    verificationCourseNames: verificationNames,
    degreeStructureStatus: plan.degreeStructureStatus ?? 'confirmed',
    track: plan.studentTrack,
    springOpportunity: {
      core: futureCourses
        ? countFuturePlanCourses(remainingFuture, plan.coreCourses, plan, 'core')
        : 0,
      professional: futureCourses
        ? countFuturePlanCourses(
            remainingFuture,
            plan.professionalCourses,
            plan,
            'professional',
          )
        : 0,
    },
  };
}

export function courseOpportunity(
  course: Pick<ProgramCourse, 'semesterNote' | 'scheduleStatus'> & { name?: string },
) {
  const note = course.semesterNote?.toLowerCase() ?? sourceSemesterNote(course.name ?? '') ?? '';
  if (/秋、春|秋春|both/.test(note)) return 'both' as const;
  if (/春|spring/.test(note)) return 'spring_only' as const;
  if (/秋|fall/.test(note)) return 'fall_only' as const;
  if (course.scheduleStatus === 'planned') return 'unknown' as const;
  return 'unknown' as const;
}

function hasCourseName(courses: ProgramCourse[], name: string) {
  const target = normalizedCourseName(name);
  return courses.some((course) => normalizedCourseName(course.name) === target);
}

export function getProgramChecks({
  selectedCourses,
  designations,
  historicalRecords,
  plan,
  gaps,
  termId,
  conflictCount,
}: {
  selectedCourses: ProgramCourse[];
  designations: Record<string, CourseDesignation>;
  historicalRecords: HistoricalRecord[];
  plan: ProgramPlan;
  gaps: ProgramGaps;
  termId: string;
  conflictCount: number;
}) {
  const checks: ProgramCheck[] = [];
  if (duplicateCourseIds(selectedCourses).size) checks.push({ id: 'duplicate-courses', severity: 'must_handle', label: '重复教学班', detail: '同一课程只应保留一个教学班。' });
  const inapplicable = selectedCourses.filter((course) => !isCourseApplicable(course, plan));
  if (inapplicable.length) checks.push({ id: 'inapplicable-courses', severity: 'must_handle', label: '课程适用对象不匹配', detail: inapplicable.map((course) => course.name).join('、') + '未计入当前培养规划，请核对培养层次与适用学生类别。' });
  if (conflictCount > 0) {
    checks.push({
      id: 'schedule-conflicts',
      severity: 'must_handle',
      label: '存在时间冲突',
      detail: `当前有 ${conflictCount} 组课程安排在日期、节次和教学周均重叠。`,
    });
  }
  if (gaps.semesterCreditGap > 0) {
    const exemptionUncertain = gaps.semesterExemptionCredits >= gaps.semesterCreditGap;
    checks.push({
      id: 'semester-minimum',
      severity: exemptionUncertain ? 'verification' : 'must_handle',
      label: exemptionUncertain ? '英语免修与学期最低学分口径待确认' : '本学期有效学分不足',
      detail: exemptionUncertain
        ? `不含免修的本学期有效学分为 ${formatNumber(gaps.semesterCredits)} / 10；另有免修 ${formatNumber(gaps.semesterExemptionCredits)} 学分。现有材料未明确免修是否计入学期最低要求，请向教务核对，暂不据此判定选课错误。`
        : `当前有效学分 ${formatNumber(gaps.semesterCredits)} / 10，还差 ${formatNumber(gaps.semesterCreditGap)} 学分。${gaps.semesterExemptionCredits ? '即使计入英语免修仍未达到10学分；具体免修口径请向教务核对。' : ''}`,
    });
  }
  if (selectedCourses.filter((course) => course.subject === '体育学').length > 1) {
    checks.push({
      id: 'sports-limit',
      severity: 'must_handle',
      label: '体育类公选超过每学期一门',
      detail: '请保留一门体育类公共选修课。',
    });
  }
  if (termId === '2026-fall' && (!/博士/.test(plan.degree) || plan.studentTrack === 'direct_phd')) {
    const knownCourses = [
      ...selectedCourses,
      ...historicalRecords.map(
        (record) =>
          ({
            id: `history:${record.id}`,
            code: record.courseCode,
            name: record.courseName,
            category: record.category,
            subject: record.subject ?? '',
            credits: record.credits,
          }) as ProgramCourse,
      ),
    ];
    for (const required of ['新时代中国特色社会主义理论与实践', '自然辩证法概论']) {
      if (!hasCourseName(knownCourses, required)) {
        checks.push({
          id: `fall-required-${required}`,
          severity: 'must_handle',
          label: `一年级秋季必修未选：${required}`,
          detail: '该课程必须在一年级秋季学期修读，请在本学期处理。',
        });
      }
    }
  }
  const illegalDegree = selectedCourses.filter(
    (course) =>
      getStoredCourseDesignation(course, designations) === 'degree' &&
      getCourseRoleEligibility(course, plan).status === 'ineligible',
  );
  if (illegalDegree.length) {
    checks.push({
      id: 'illegal-degree-designation',
      severity: 'must_handle',
      label: '存在不能设置为学位课的课程',
      detail: `${illegalDegree.map((course) => course.name).join('、')} 只能按非学位课程处理。`,
    });
  }
  if (gaps.degreeStructureStatus === 'verification') {
    checks.push({
      id: 'doctoral-structure',
      severity: 'verification',
      label: '培养结构待确认',
      detail: '培养要求需结合具体培养类型及完整学院方案确认，资料不完整时不自动判定门数要求已满足。',
    });
  }
  if (gaps.approvalRequiredCount || gaps.verificationCount) {
    const relatedCourseGroups = [
      ...(gaps.approvalRequiredCourseNames.length
        ? [
            {
              label: '非本专业的专业类课程',
              names: gaps.approvalRequiredCourseNames,
            },
          ]
        : []),
      ...(gaps.verificationCourseNames.length
        ? [
            {
              label: '资料待核验课程',
              names: gaps.verificationCourseNames,
            },
          ]
        : []),
    ];
    checks.push({
      id: 'recognition-pending',
      severity: 'verification',
      label: '请核对以下课程的学位属性',
      detail:
        '建议查阅学校官网、学院培养方案和教务系统，核对这些课程是否可以设置为学位课、适用于当前培养类型。' +
        (gaps.approvalRequiredDegreeCredits + gaps.verificationDegreeCredits > 0
          ? '非本专业专业类课程已纳入规划学分合计，但不能替代本专业的核心与专业门数要求；'
          : '资料不足的课程暂不自动满足对应培养要求；') + '页面不代表学校认定结果。',
      relatedCourseGroups,
    });
  }
  if (
    gaps.approvalRequiredDegreeCredits > 0 &&
    ((gaps.coreTarget !== null && gaps.coreCount < gaps.coreTarget) ||
      (gaps.professionalTarget !== null &&
        gaps.professionalCount < gaps.professionalTarget))
  ) {
    checks.push({
      id: 'supplementary-degree-structure',
      severity: 'verification',
      label: '跨专业学分与本专业门数分开统计',
      detail:
        `当前跨专业核心课/专业课已计入专业学位学分合计；本专业核心课${gaps.coreTarget ?? '待确认'}门和专业课${gaps.professionalTarget ?? '待确认'}门仍需另行满足，不能用跨专业课程替代。`,
    });
  }
  for (const rule of gaps.specialRules.filter((item) => !item.satisfied)) {
    checks.push({
      id: `special-${rule.id}`,
      severity: 'progress',
      label: '特殊培养规则尚未满足',
      detail: `${rule.label}（当前 ${rule.current} / ${rule.minimum}）。`,
    });
  }
  if (gaps.coreTarget !== null && gaps.coreCount < gaps.coreTarget) {
    checks.push({
      id: 'core-progress',
      severity: 'progress',
      label: '核心课培养进度',
      detail:
        gaps.springOpportunity.core > 0
          ? `当前 ${gaps.coreCount} / ${gaps.coreTarget} 门；培养方案仍列出 ${gaps.springOpportunity.core} 门春季计划核心课，可在春季继续完成，具体安排以正式课表为准。`
          : `当前 ${gaps.coreCount} / ${gaps.coreTarget} 门，后续学期仍可完成。`,
    });
  }
  if (
    gaps.professionalTarget !== null &&
    gaps.professionalCount < gaps.professionalTarget
  ) {
    checks.push({
      id: 'professional-progress',
      severity: 'progress',
      label: '专业课培养进度',
      detail:
        gaps.springOpportunity.professional > 0
          ? `当前 ${gaps.professionalCount} / ${gaps.professionalTarget} 门；培养方案仍列出 ${gaps.springOpportunity.professional} 门春季计划专业课，可在春季继续完成，具体安排以正式课表为准。`
          : `当前 ${gaps.professionalCount} / ${gaps.professionalTarget} 门，后续学期仍可完成。`,
    });
  }
  const remainingCategories: string[] = [];
  for (const [, label, gap] of [
    ['degree-credit-progress', '专业学位学分', gaps.professionalDegreeGap],
    ['professional-elective-progress', '专业非学位学分', gaps.professionalNonDegreeGap],
    ['public-degree-progress', '公共必修学位学分', gaps.publicRequiredDegreeGap],
    ['public-nondegree-progress', '公共必修非学位学分', gaps.publicRequiredNonDegreeGap],
    ['public-elective-progress', '普通公共选修学分', gaps.publicElectiveGap],
    ['innovation-progress', '创新创业学分', gaps.innovationGap],
  ] as const) {
    if (gap > 0) remainingCategories.push(label + '还差 ' + formatNumber(gap) + ' 学分');
  }
  if (remainingCategories.length) checks.push({ id: 'category-progress', severity: 'progress', label: '后续学期培养规划',
    detail: remainingCategories.join('；') + '。这些是累计培养进度，不是本学期选课错误。' });
  return checks;
}

export function recognitionStatusLabel(status: RecognitionStatus) {
  if (status === 'eligible') return '方案认可范围内';
  if (status === 'approval_required') return '跨专业·请核对学位属性';
  if (status === 'verification') return '资料待核验';
  return '明确不适用';
}

export function courseCountsTowardSemesterMinimum(course: ProgramCourse) {
  return isSemesterMinimumCourse(course);
}

export function duplicateCourseIds(courses: ProgramCourse[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  courses.forEach((course) => {
    const key = courseFamilyKey(course);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  });
  return duplicates;
}
