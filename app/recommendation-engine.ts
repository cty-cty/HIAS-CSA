import { coursesShareIdentity, designationLookupKey, getCourseRoleEligibility, historicalCourseLike, isCourseApplicable, isCoreDegreeType, isProfessionalDegreeType, isPublicRequiredCourse, isEnglishCourse, uniqueCourses, type CourseDesignation, type HistoricalRecord, type RecognitionSource } from './credit-model';
import type { SourceStatus } from './source-reconciliation';
import { isPlannedCourse } from './course-data';
import { calculateProgramGaps, courseOpportunity, getProgramChecks, type ProgramCourse, type ProgramGaps } from './program-rules';
import type { ProgramPlan } from './program-plans';

export type RecommendationObjective = 'requirements' | 'balanced' | 'concentrated';
export type CourseContribution = {
  coreGapFilled: number; professionalGapFilled: number;
  professionalDegreeCreditsAdded: number; supplementaryDegreeCreditsAdded: number;
  totalCreditsAdded: number; semesterCreditsAdded: number;
  specialRulesFilled: string[]; overFulfillment: boolean;
};
export type RecommendationCandidate = {
  course: ProgramCourse; designation: CourseDesignation; reasons: string[];
  recognition: ReturnType<typeof getCourseRoleEligibility>;
  recognitionSource?: RecognitionSource; sourceStatus?: SourceStatus;
  contribution: CourseContribution; opportunity: ReturnType<typeof courseOpportunity>;
  verificationRequired: boolean; verificationReasons: string[];
};
export type WorkloadMetrics = {
  weeklyDensity: number; weekendCourseCount: number; closedExamCount: number;
  reportCourseCount: number; longSessionCount: number;
};
export type RecommendationPlan = {
  id: string; label: string; addedCourses: ProgramCourse[]; candidates: RecommendationCandidate[];
  gaps: ProgramGaps; metrics: WorkloadMetrics; conflicts: number; reasons: string[];
  semesterTotalCredits: number; remainingIssues: string[];
};
type Context = {
  selectedCourses: ProgramCourse[];
  /** All terms, separate from the locked active-semester timetable. */
  programCourses?: ProgramCourse[];
  designations: Record<string, CourseDesignation>; historicalRecords: HistoricalRecord[];
  plan: ProgramPlan; termLabel: string; termId?: string; futureCourses?: ProgramCourse[];
  exemptionStatus?: Parameters<typeof calculateProgramGaps>[0]['exemptionStatus'];
};
export function schedulesConflict(left: ProgramCourse, right: ProgramCourse) {
  if (isPlannedCourse(left) || isPlannedCourse(right)) return false;
  return (left.schedules ?? []).some((a) => (right.schedules ?? []).some((b) =>
    a.dayIndex >= 0 && a.dayIndex === b.dayIndex && a.start > 0 && b.start > 0 &&
    a.start <= b.end && b.start <= a.end && a.weeks.some((week) => b.weeks.includes(week))));
}
function validSchedule(course: ProgramCourse) {
  return !isPlannedCourse(course) && !!course.schedules?.length && course.schedules.every((s) =>
    s.dayIndex >= 0 && s.dayIndex < 7 && s.start > 0 && s.end >= s.start && s.weeks.length > 0);
}
function conflictCount(courses: ProgramCourse[]) {
  return courses.reduce((sum, c, i) => sum + courses.slice(i + 1).filter((other) => schedulesConflict(c, other)).length, 0);
}
function examMode(course: ProgramCourse) {
  return (course as ProgramCourse & { examMode?: string }).examMode ?? '';
}
export function calculateWorkload(courses: ProgramCourse[]): WorkloadMetrics {
  const weekly = new Map<number, number>();
  courses.filter((c) => !isPlannedCourse(c)).forEach((c) => c.schedules?.forEach((s) => s.weeks.forEach((w) =>
    weekly.set(w, (weekly.get(w) ?? 0) + s.end - s.start + 1))));
  return {
    weeklyDensity: Math.max(0, ...weekly.values()),
    weekendCourseCount: courses.filter((c) => validSchedule(c) && c.schedules?.some((s) => s.dayIndex >= 5)).length,
    closedExamCount: courses.filter((c) => /闭卷/.test(examMode(c))).length,
    reportCourseCount: courses.filter((c) => /报告|论文|综述|汇报|大作业/.test(examMode(c))).length,
    longSessionCount: courses.filter((c) => validSchedule(c) && c.schedules?.some((s) => s.end - s.start >= 3)).length,
  };
}
function proposedDesignation(course: ProgramCourse, plan: ProgramPlan, gaps?: ProgramGaps): CourseDesignation {
  const status = getCourseRoleEligibility(course, plan).status;
  if (isPublicRequiredCourse(course) && status === 'eligible') return 'degree';
  if ((status === 'eligible' || status === 'approval_required') && (isCoreDegreeType(course) || isProfessionalDegreeType(course))) {
    const fillsOwnCount = status === 'eligible' && gaps && (
      (isCoreDegreeType(course) && gaps.coreTarget !== null && gaps.coreCount < gaps.coreTarget) ||
      (isProfessionalDegreeType(course) && gaps.professionalTarget !== null && gaps.professionalCount < gaps.professionalTarget));
    if (!gaps || status === 'approval_required' || gaps.professionalDegreeGap > 0 || fillsOwnCount) return 'degree';
    // After confirmed degree credits AND own course counts are sufficient,
    // additional professional courses can fill the non-degree category instead.
    return 'non-degree';
  }
  return 'non-degree';
}
function stateFor(context: Context, candidates: RecommendationCandidate[]) {
  const additions = candidates.map((c) => c.course);
  const designations = { ...context.designations };
  candidates.forEach((item) => { designations[designationLookupKey(item.course)] = item.designation; });
  const semesterCourses = [...context.selectedCourses, ...additions];
  const selectedCourses = uniqueCourses([...(context.programCourses ?? context.selectedCourses), ...additions]);
  const gaps = calculateProgramGaps({ ...context, selectedCourses, semesterCourses, designations, exemptionStatus: context.exemptionStatus ?? 'normal' });
  return { gaps, selectedCourses, semesterCourses, designations };
}
function contribution(before: ProgramGaps, after: ProgramGaps): CourseContribution {
  const coreGapFilled = Math.max(0, (before.coreTarget ?? 0) - before.coreCount) - Math.max(0, (after.coreTarget ?? 0) - after.coreCount);
  const professionalGapFilled = Math.max(0, (before.professionalTarget ?? 0) - before.professionalCount) - Math.max(0, (after.professionalTarget ?? 0) - after.professionalCount);
  return {
    coreGapFilled, professionalGapFilled,
    professionalDegreeCreditsAdded: after.professionalDegreeCredits - before.professionalDegreeCredits,
    supplementaryDegreeCreditsAdded: after.approvalRequiredDegreeCredits - before.approvalRequiredDegreeCredits,
    totalCreditsAdded: after.totalCredits - before.totalCredits,
    semesterCreditsAdded: after.semesterCredits - before.semesterCredits,
    specialRulesFilled: after.specialRules.filter((r) => r.satisfied && !before.specialRules.find((b) => b.id === r.id)?.satisfied).map((r) => r.id),
    overFulfillment: coreGapFilled === 0 && professionalGapFilled === 0 && before.professionalDegreeGap === 0,
  };
}
export function evaluateCourseContribution(course: ProgramCourse, context: Context) {
  const candidate = { course, designation: proposedDesignation(course, context.plan, stateFor(context, []).gaps) } as RecommendationCandidate;
  return contribution(stateFor(context, []).gaps, stateFor(context, [candidate]).gaps);
}
function hardIssues(context: Context, state: ReturnType<typeof stateFor>) {
  return getProgramChecks({ ...context, selectedCourses: state.semesterCourses, designations: state.designations,
    gaps: state.gaps, termId: context.termId ?? (/2026.*秋/.test(context.termLabel) ? '2026-fall' : ''), conflictCount: conflictCount(state.semesterCourses) })
    .filter((check) => check.severity === 'must_handle');
}
const gapLabels = {
  publicRequiredDegreeGap: '公共必修学位课', publicRequiredNonDegreeGap: '公共必修非学位课',
  professionalNonDegreeGap: '专业选修', publicElectiveGap: '普通公共选修', innovationGap: '创新创业', semesterCreditGap: '本学期有效学分',
} as const;
function makeCandidate(course: ProgramCourse, context: Context, before: ReturnType<typeof stateFor>, prior: RecommendationCandidate[]) {
  const recognition = getCourseRoleEligibility(course, context.plan);
  const candidate: RecommendationCandidate = { course, designation: proposedDesignation(course, context.plan, before.gaps), recognition,
    recognitionSource: recognition.recognitionSource,
    sourceStatus: recognition.sourceStatus,
    opportunity: courseOpportunity(course), contribution: {} as CourseContribution, reasons: [],
    verificationRequired: !validSchedule(course) || recognition.status === 'approval_required' || recognition.status === 'verification' || recognition.sourceStatus === 'conflict',
    verificationReasons: [
      ...(!validSchedule(course) ? ['排课未知：仅供培养规划，不能确认整套方案无时间冲突'] : []),
      ...(['approval_required', 'verification'].includes(recognition.status) ? ['请查阅正式材料核对学位属性'] : []),
      ...(recognition.sourceStatus === 'conflict' ? ['课程编号与类别字段存在来源冲突'] : []),
    ],
  };
  const after = stateFor(context, [...prior, candidate]);
  candidate.contribution = contribution(before.gaps, after.gaps);
  const c = candidate.contribution;
  if (c.coreGapFilled) candidate.reasons.push('核心课进度 ' + before.gaps.coreCount + ' → ' + after.gaps.coreCount + ' / ' + after.gaps.coreTarget);
  if (c.professionalGapFilled) candidate.reasons.push('专业课进度 ' + before.gaps.professionalCount + ' → ' + after.gaps.professionalCount + ' / ' + after.gaps.professionalTarget);
  if (c.professionalDegreeCreditsAdded) candidate.reasons.push('增加 ' + c.professionalDegreeCreditsAdded + ' 学分方案认可范围内的专业学位课');
  if (c.supplementaryDegreeCreditsAdded) candidate.reasons.push('非本专业专业类课程补充 ' + c.supplementaryDegreeCreditsAdded + ' 学分，不能替代本专业门数要求');
  for (const key of Object.keys(gapLabels) as Array<keyof typeof gapLabels>) {
    const n = before.gaps[key] - after.gaps[key];
    if (n > 0) candidate.reasons.push('补充' + gapLabels[key] + '缺口 ' + n + ' 学分');
  }
  if (c.specialRulesFilled.length) candidate.reasons.push('满足特殊培养规则');
  if (validSchedule(course)) candidate.reasons.push('正式教学班，与已锁定课程无已知冲突');
  return { candidate, after };
}

/** Dynamic bounded greedy search: at most 3 × 10 × N evaluations, no subset enumeration. */
export function generateRecommendationPlans(context: Context & { courses: ProgramCourse[]; allowApprovalRequired?: boolean; excludedCourseIds?: string[] }): RecommendationPlan[] {
  const initial = stateFor(context, []);
  const known = [...initial.selectedCourses, ...context.historicalRecords.filter((r) => r.credits > 0).map(historicalCourseLike)];
  const pool = context.courses.filter((course) => isCourseApplicable(course, context.plan) &&
    !context.excludedCourseIds?.includes(course.id) && !known.some((c) => coursesShareIdentity(c, course)) &&
    !(context.exemptionStatus === 'approved' && context.plan.studentTrack !== 'general_phd' && isEnglishCourse(course)));
  const objectives: Array<[RecommendationObjective, string]> = [['requirements', '推荐方案'], ['balanced', '均衡方案'], ['concentrated', '时间集中方案']];
  const results: RecommendationPlan[] = [];
  for (const [objective, label] of objectives) {
    const chosen: RecommendationCandidate[] = [];
    let state = initial;
    for (let step = 0; step < 10; step++) {
      const currentHard = hardIssues(context, state);
      // Complete this semester, not the entire degree in one semester.
      if (!currentHard.length) break;
      let best: { candidate: RecommendationCandidate; after: ReturnType<typeof stateFor>; score: number } | undefined;
      for (const course of pool) {
        if (chosen.some((c) => coursesShareIdentity(c.course, course)) || state.semesterCourses.some((c) => schedulesConflict(c, course))) continue;
        if (course.subject === '体育学' && state.semesterCourses.some((c) => c.subject === '体育学')) continue;
        const recognition = getCourseRoleEligibility(course, context.plan);
        if (['approval_required', 'verification'].includes(recognition.status) && !context.allowApprovalRequired) continue;
        const { candidate, after } = makeCandidate(course, context, state, chosen);
        const b = state.gaps, a = after.gaps, c = candidate.contribution;
        const hardFilled = currentHard.length - hardIssues(context, after).length;
        if (hardFilled <= 0 && b.semesterCreditGap <= a.semesterCreditGap) continue;
        const springCore = b.springOpportunity.core >= Math.max(0, (b.coreTarget ?? 0) - b.coreCount);
        const springProf = b.springOpportunity.professional >= Math.max(0, (b.professionalTarget ?? 0) - b.professionalCount);
        let score = hardFilled * 100 + (b.semesterCreditGap - a.semesterCreditGap) * 15 +
          c.coreGapFilled * (springCore ? 8 : 25) + c.professionalGapFilled * (springProf ? 8 : 22) +
          (b.professionalDegreeGap - a.professionalDegreeGap) * 3 + c.specialRulesFilled.length * 25;
        for (const key of Object.keys(gapLabels) as Array<keyof typeof gapLabels>) {
          if (key !== 'semesterCreditGap') score += (b[key] - a[key]) * 25;
        }
        if (candidate.verificationRequired) score -= 6;
        score -= Math.max(0, c.semesterCreditsAdded - b.semesterCreditGap) * 15;
        if (c.overFulfillment) score -= 3;
        if (objective === 'balanced') score -= calculateWorkload([course]).closedExamCount * 7 + calculateWorkload([course]).weekendCourseCount * 5 + course.credits;
        if (objective === 'concentrated') {
          const days = new Set(state.semesterCourses.flatMap((item) => (item.schedules ?? []).map((s) => s.dayIndex)));
          score -= new Set((course.schedules ?? []).filter((s) => !days.has(s.dayIndex)).map((s) => s.dayIndex)).size * 6;
        }
        if (candidate.opportunity === 'fall_only' && score > 0) score += 2;
        if (score > 0 && (!best || score > best.score)) best = { candidate, after, score };
      }
      if (!best) break;
      chosen.push(best.candidate); state = best.after;
    }
    const signature = chosen.map((c) => c.course.id).sort().join('|');
    if (results.some((r) => r.addedCourses.map((c) => c.id).sort().join('|') === signature)) continue;
    const remainingIssues = hardIssues(context, state).map((check) => check.detail);
    const unknown = state.semesterCourses.filter((course) => !validSchedule(course));
    if (unknown.length) remainingIssues.push('排课待公布：' + unknown.map((c) => c.name).join('、') + '；不能保证无冲突。');
    results.push({ id: objective, label, addedCourses: chosen.map((c) => c.course), candidates: chosen,
      gaps: state.gaps, metrics: calculateWorkload(state.semesterCourses), conflicts: conflictCount(state.semesterCourses),
      semesterTotalCredits: uniqueCourses(state.semesterCourses).reduce((sum, c) => sum + c.credits, 0), remainingIssues,
      reasons: [...new Set(chosen.flatMap((c) => c.reasons))],
    });
  }
  return results;
}
