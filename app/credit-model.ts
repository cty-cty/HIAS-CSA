import type { ProgramPlan } from './program-plans';
import {
  getAcademicAllowedSubjects,
  getGraduateProgramKind,
  getGraduateProgramMapping,
} from './graduate-program-mapping';

export type CourseDesignation = 'degree' | 'non-degree' | 'unset';
export type DegreeRole = 'degree' | 'nonDegree';
export type CourseRequirementType =
  | 'publicRequiredDegree'
  | 'professionalDegree'
  | 'professionalElective'
  | 'publicElective'
  | 'publicRequiredNonDegree'
  | 'pending';
export type ExemptionStatus = 'normal' | 'planned' | 'approved';
export type HistoricalModule = 'regular' | 'innovation' | 'hias' | 'unknown';
export type CourseModule = 'regular' | 'innovation' | 'hias';

export type CourseLike = {
  id: string;
  code: string;
  name: string;
  category: string;
  subject: string;
  credits: number;
  level?: string;
  officialCode?: string | null;
  canonicalCourseId?: string;
  scheduleStatus?: 'confirmed' | 'planned';
  dataStatus?: 'official_schedule' | 'planned_course';
  program?: string | null;
  applicablePrograms?: string[];
  applicableStudentTracks?: string[];
  module?: CourseModule;
  requirementType?: CourseRequirementType;
  degreeRole?: DegreeRole;
};

export type RecognitionStatus =
  | 'eligible'
  | 'approval_required'
  | 'verification'
  | 'ineligible';

export type DegreeEligibilityStatus =
  | 'eligible'
  | 'approval_required'
  | 'verification'
  | 'ineligible';

export type DegreeEligibility = {
  status: DegreeEligibilityStatus;
  reason: string;
};

export type CourseClassification = {
  requirementType: CourseRequirementType;
  degreeRole: DegreeRole | null;
};

export type HistoricalRecord = {
  id: string;
  term: string;
  courseName: string;
  courseCode: string;
  credits: number;
  category: string;
  subject?: string;
  designation: CourseDesignation | 'unknown';
  module: HistoricalModule;
  hours?: number;
  attendanceCount?: number;
  courseCount: number | null;
  source?: string;
};

export type CourseCodeCategory =
  | 'subject-core'
  | 'professional-core'
  | 'professional'
  | 'seminar'
  | 'lab'
  | 'practice'
  | 'frontier-lecture'
  | 'public-required'
  | 'public-elective'
  | 'unknown';

const COURSE_CODE_CATEGORY_BY_MARKER: Record<string, CourseCodeCategory> = {
  '1': 'subject-core',
  '2': 'professional-core',
  '3': 'professional',
  '4': 'seminar',
  '5': 'lab',
  '6': 'practice',
  '7': 'frontier-lecture',
  B: 'public-required',
  X: 'public-elective',
};

export function getCourseCodeMarker(code: string) {
  return normalizeCourseCode(code)[13] || '';
}

export function getCourseCodeCategory(code: string): CourseCodeCategory {
  return COURSE_CODE_CATEGORY_BY_MARKER[getCourseCodeMarker(code)] || 'unknown';
}

export function getCourseCodeCategoryLabel(code: string) {
  const labels: Record<CourseCodeCategory, string> = {
    'subject-core': '学科核心课',
    'professional-core': '专业核心课',
    professional: '专业课',
    seminar: '研讨课',
    lab: '实验课',
    practice: '实践课',
    'frontier-lecture': '科学前沿讲座',
    'public-required': '公共必修课',
    'public-elective': '公共选修课',
    unknown: '待核验',
  };
  return labels[getCourseCodeCategory(code)];
}

export const COURSE_REQUIREMENT_TYPE_LABELS: Record<
  CourseRequirementType,
  string
> = {
  publicRequiredDegree: '公共必修学位课',
  professionalDegree: '专业学位课',
  professionalElective: '专业选修课',
  publicElective: '公共选修课',
  publicRequiredNonDegree: '公共必修非学位课',
  pending: '培养要求归属待确认',
};

export function getCourseRequirementTypeLabel(
  requirementType: CourseRequirementType,
) {
  return COURSE_REQUIREMENT_TYPE_LABELS[requirementType];
}

export function isEngineeringEthics(course: Pick<CourseLike, 'name'>) {
  return course.name.replace(/[-—－]?\d+班$/, '') === '工程伦理';
}

export function isPublicRequiredCourse(
  course: Pick<CourseLike, 'code' | 'category'>,
) {
  return (
    getCourseCodeCategory(course.code) === 'public-required' ||
    (getCourseCodeCategory(course.code) === 'unknown' &&
      course.category === '公共必修课')
  );
}

export function isPublicElectiveCourse(
  course: Pick<CourseLike, 'code' | 'category'>,
) {
  return (
    getCourseCodeCategory(course.code) === 'public-elective' ||
    (getCourseCodeCategory(course.code) === 'unknown' &&
      course.category === '公共选修课')
  );
}

export function isDegreeEligibleByCode(
  course: Pick<CourseLike, 'code' | 'category' | 'officialCode'>,
) {
  const codeCategory = getCourseCodeCategory(course.officialCode || course.code);
  if (codeCategory !== 'unknown') {
    return (
      codeCategory === 'subject-core' ||
      codeCategory === 'professional-core' ||
      codeCategory === 'professional'
    );
  }
  return ['学科核心课', '专业核心课', '核心课', '专业课'].includes(course.category);
}

const CORE_CODE_CATEGORIES = ['subject-core', 'professional-core'];

/**
 * 是否属于“学位课 2+2”中的核心课（学科核心课/专业核心课）。
 * 编码可解析时按编码第14位判断；编码未知（如尚未发布的春季课程）按课程类别回退。
 */
export function isCoreDegreeType(
  course: Pick<CourseLike, 'code' | 'category' | 'officialCode'>,
) {
  const codeCategory = getCourseCodeCategory(course.officialCode || course.code);
  if (codeCategory !== 'unknown')
    return CORE_CODE_CATEGORIES.includes(codeCategory);
  return ['学科核心课', '专业核心课', '核心课'].includes(course.category);
}

/** 是否属于“学位课 2+2”中的专业课。编码未知时按课程类别回退。 */
export function isProfessionalDegreeType(
  course: Pick<CourseLike, 'code' | 'category' | 'officialCode'>,
) {
  const codeCategory = getCourseCodeCategory(course.officialCode || course.code);
  if (codeCategory !== 'unknown') return codeCategory === 'professional';
  return course.category === '专业课';
}

export function getDegreeEligibility(
  course: Pick<
    CourseLike,
    'code' | 'officialCode' | 'category' | 'name' | 'subject' | 'program'
  >,
  plan?: ProgramPlan,
): DegreeEligibility {
  if (!isDegreeEligibleByCode(course)) {
    return {
      status: getCourseCodeCategory(course.officialCode || course.code) === 'unknown' &&
        !['公共必修课', '公共选修课', ...NON_DEGREE_ONLY_CATEGORIES].includes(course.category)
        ? 'verification' : 'ineligible',
      reason: '请根据课程官方类型核对学位资格；明确的非学位类型不能作为专业学位课。',
    };
  }
  if (!plan) {
    return {
      status: 'verification',
      reason: '尚未匹配培养方向，学位属性待核验。',
    };
  }

  const kind = getGraduateProgramKind(plan);
  const mapping = getGraduateProgramMapping(plan);
  if (!mapping || kind === 'unknown') {
    return {
      status: 'verification',
      reason: '培养方向未在研究生专业映射表中匹配，暂不能自动核定学位课范围。',
    };
  }

  if (kind === 'academic') {
    const allowedSubjects = getAcademicAllowedSubjects(plan);
    // 课程可能同时归属多个学科（subject 以 、/；分隔），任一命中一级/二级学科范围即认可。
    const subjectTokens = (course.subject ?? '')
      .split(/[、,，;；/]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const inScope = allowedSubjects
      ? subjectTokens.some((subject) => allowedSubjects.has(subject))
      : false;
    if (inScope) {
      return {
        status: 'eligible',
        reason: `属于一级学科“${mapping.firstLevel}”及其已映射二级学科范围。`,
      };
    }
    return {
      status: 'verification',
      reason: `课程学科“${course.subject}”未在该一级学科的映射范围内，需核对培养方案或学院认定。`,
    };
  }

  const isListed =
    [...plan.coreCourses, ...plan.professionalCourses].some(
      (name) => normalizeCourseName(name) === normalizeCourseName(course.name),
    );
  if (!isListed) {
    if ((course.program && [plan.program, plan.code].some((value) => course.program?.includes(value))) ||
      course.subject.split(/[、,，;；/]/).some((subject) => subject.trim() === plan.program)) {
      return { status: 'verification', reason: `课表标注属于${plan.program}，但学院培养方案课程池未列出，请核对正式材料。` };
    }
    return {
      status: 'approval_required',
      reason: `课程官方类别具备学位课资格，但未列入“${plan.program}”本专业培养方案课程池；建议查阅学校官网、学院培养方案和教务系统，核对是否可以设置为学位课。所有课程安排均建议与自己的导师确认是否合理。`,
    };
  }
  return {
    status: 'eligible',
    reason: `属于“${plan.program}”本专业培养方案列出的核心课或专业课。`,
  };
}

export function isCourseEligibleAsDegree(
  course: Pick<
    CourseLike,
    'code' | 'officialCode' | 'category' | 'name' | 'subject' | 'program'
  >,
  plan?: ProgramPlan,
) {
  return getDegreeEligibility(course, plan).status === 'eligible';
}

export function getCourseRoleEligibility(
  course: Pick<
    CourseLike,
    | 'code'
    | 'officialCode'
    | 'category'
    | 'name'
    | 'subject'
    | 'module'
    | 'program'
  >,
  plan?: ProgramPlan,
): DegreeEligibility {
  if (isEngineeringEthics(course)) {
    return {
      status: 'ineligible',
      reason: '《工程伦理》是公共必修非学位课，不能设置为学位课。',
    };
  }
  if (isHiasCourse(course)) {
    return {
      status: 'ineligible',
      reason: 'HIAS讲堂按公共选修课学分登记，不能设置为学位课。',
    };
  }
  if (isPublicRequiredCourse(course)) {
    if (isMastersPublicOutsideGeneralPhd(course, plan)) {
      return { status: 'verification', reason: '学校须知第12页将该课程列为硕士、硕博连读与直博公共必修；不能自动替代普通博士的公共必修要求，其他用途请核对正式材料。' };
    }
    return {
      status: 'eligible',
      reason:
        '公共必修课可按培养方案归入公共必修学位课；特殊课程以明确规则为准。',
    };
  }
  if (isPublicElectiveCourse(course) || isNonDegreeOnly(course)) {
    return {
      status: 'ineligible',
      reason:
        '公共选修课、研讨课、实验课、实践课和科学前沿讲座属于非学位课程。',
    };
  }
  return getDegreeEligibility(course, plan);
}

// 来源：2026创新创业课秋季课表.xlsx。课程编码优先于课程名称，避免同名课程或不同班次被误归类。
export const INNOVATION_COURSE_CODES = new Set([
  '280216120100MX001',
  '280216120100MX003',
  '280216120100MX005',
  '280216120100MX006',
  '280216120100MX009',
  '280216120100MX010',
  '280216120100MX011',
  '280216120100MX017',
  '280216120200MX033',
]);

export const INNOVATION_COURSE_NAMES = new Set([
  '创业管理',
  '创业启程',
  '生物医药数字科创的未来',
  '创新型个性发展心理学',
  '创新创业实践及案例研究',
  '创业融资入门',
  '科技成果转移转化探究与实践',
  '科技创新及方法',
  '品牌与营销管理',
  '创新创业训练营',
  '技术发展与产品创新管理',
  '军工航天领域的商业模式和案例',
  '人工智能产品技术创新及应用案例',
  '创造性思维',
  '思维创新与设计',
  '技术创业',
  '科创产业前沿与人才科技政策体系',
  '前沿科技融合与创新发展',
  '技术创新创业投资与资本运作',
  '科技创业领导力',
]);

export const NON_DEGREE_ONLY_CATEGORIES = new Set([
  '研讨课',
  '实验课',
  '实践课',
  '科学前沿讲座',
]);

export function courseBaseName(name: string) {
  return name.replace(/[-—－]?\d+班$/, '');
}

export function normalizeCourseCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!normalized || /^SP2027-\d+$/.test(normalized) || /^SP\d+$/.test(normalized)) {
    return '';
  }
  return normalized.replace(/-\d+$/, '');
}

export function normalizeCourseName(name: string) {
  return courseBaseName(name)
    .trim()
    .replace(/[\s　]+/g, '')
    .replace(/（/g, '(').replace(/）/g, ')');
}

export function getCanonicalCourseId(
  course: Pick<CourseLike, 'code' | 'name'> &
    Partial<Pick<CourseLike, 'officialCode' | 'canonicalCourseId' | 'subject'>>,
) {
  if (course.canonicalCourseId?.trim()) return course.canonicalCourseId.trim();
  const code = normalizeCourseCode(course.officialCode || course.code);
  if (code) return code;
  return `name:${normalizeCourseName(course.name)}|subject:${normalizeCourseName(course.subject || '')}`;
}

export function coursesShareIdentity(
  left: Pick<CourseLike, 'code' | 'name'> &
    Partial<Pick<CourseLike, 'officialCode' | 'canonicalCourseId' | 'subject'>>,
  right: Pick<CourseLike, 'code' | 'name'> &
    Partial<Pick<CourseLike, 'officialCode' | 'canonicalCourseId' | 'subject'>>,
) {
  const leftCode = normalizeCourseCode(left.officialCode || left.code);
  if (isEnglishCourse(left) && isEnglishCourse(right)) return true;
  const rightCode = normalizeCourseCode(right.officialCode || right.code);
  if (leftCode && rightCode && leftCode === rightCode) return true;
  if (
    left.canonicalCourseId?.trim() &&
    right.canonicalCourseId?.trim() &&
    left.canonicalCourseId.trim() === right.canonicalCourseId.trim()
  ) {
    return true;
  }
  if (leftCode && rightCode) return false;
  return (
    normalizeCourseName(left.name) === normalizeCourseName(right.name) &&
    normalizeCourseName(left.subject || '') === normalizeCourseName(right.subject || '')
  );
}

export function courseFamilyKey(
  course: Pick<CourseLike, 'code' | 'name'> &
    Partial<Pick<CourseLike, 'officialCode' | 'canonicalCourseId' | 'subject'>>,
) {
  if (isEnglishCourse(course)) {
    return 'english-degree-course';
  }
  return getCanonicalCourseId(course);
}

/**
 * 学位属性按“课程”整体标记，而非按“班次”：
 * 同一门课的不同班级（如 新中特-01/02/03班、英语各小班）共用同一个 family key，
 * 保证 1 班标为学位课后，2 班、3 班视为同一属性，不产生“一班是、二班不是”的矛盾。
 * 存储键：`family:<courseFamilyKey>`（读取时兼容旧版按完整课程编码保存的数据）。
 */
export function designationLookupKey(
  course: Pick<CourseLike, 'code' | 'name'>,
) {
  return `family:${courseFamilyKey(course)}`;
}

export function isEnglishCourse(course: Pick<CourseLike, 'code' | 'name'>) {
  return /050200MB001/i.test(course.code) || course.name.startsWith('英语') ||
    normalizeCourseName(course.name) === '硕士学位英语';
}

/** Student-track applicability is not a ban on selecting the course for other purposes. */
function isMastersPublicOutsideGeneralPhd(course: Pick<CourseLike, 'code' | 'name'>, plan?: ProgramPlan) {
  return plan?.studentTrack === 'general_phd' && (isEnglishCourse(course) ||
    ['新时代中国特色社会主义理论与实践', '自然辩证法概论'].includes(normalizeCourseName(course.name)));
}

/** One learning course, regardless of teaching section or planned/official source. */
export function uniqueCourses<T extends Pick<CourseLike, 'code' | 'name'> & Partial<CourseLike>>(courses: T[]): T[] {
  const result: T[] = [];
  for (const course of courses) {
    if (!result.some((other) => coursesShareIdentity(course, other))) result.push(course);
  }
  return result;
}

export function isCourseApplicable(course: Partial<CourseLike>, plan?: ProgramPlan) {
  if (!plan) return true;
  if (course.applicablePrograms?.length && !course.applicablePrograms.includes(plan.program)) return false;
  if (course.applicableStudentTracks?.length && plan.studentTrack && !course.applicableStudentTracks.includes(plan.studentTrack)) return false;
  if (/硕士/.test(plan.degree) && ((course.level ?? '').startsWith('博士') ||
    ['中国马克思主义与当代', '博士学位英语'].includes(course.name ?? ''))) return false;
  return true;
}

export function isInnovationCourse(course: Pick<CourseLike, 'code' | 'name'>) {
  return (
    INNOVATION_COURSE_CODES.has(normalizeCourseCode(course.code)) ||
    INNOVATION_COURSE_NAMES.has(courseBaseName(course.name))
  );
}

export function isHiasCourse(
  course: Pick<CourseLike, 'name'> & { module?: CourseModule },
) {
  return course.module === 'hias' || /HIAS讲堂|人文系列讲座/.test(course.name);
}

export function getCourseModule(
  course: Pick<CourseLike, 'code' | 'name'>,
): CourseModule {
  if (/HIAS讲堂|人文系列讲座/.test(course.name)) return 'hias';
  return isInnovationCourse(course) ? 'innovation' : 'regular';
}

export function isInnovationHistoryRecord(
  record: Pick<HistoricalRecord, 'courseCode' | 'courseName' | 'module'>,
) {
  return (
    record.module === 'innovation' ||
    (record.module === 'unknown' &&
      isInnovationCourse({ code: record.courseCode, name: record.courseName }))
  );
}

export function isNonDegreeOnly(
  course: Pick<CourseLike, 'code' | 'officialCode' | 'category' | 'name' | 'module'>,
) {
  const codeCategory = getCourseCodeCategory(course.officialCode || course.code);
  return (
    ['seminar', 'lab', 'practice', 'frontier-lecture'].includes(codeCategory) ||
    (codeCategory === 'unknown' &&
      NON_DEGREE_ONLY_CATEGORIES.has(course.category)) ||
    isHiasCourse(course) ||
    /科学前沿讲座/.test(course.name)
  );
}

export function getStoredCourseDesignation(
  course: Parameters<typeof designationLookupKey>[0],
  designations: Record<string, CourseDesignation>,
) {
  const legacyKey = `family:${courseBaseName(course.name) || course.code.replace(/-\d+$/, '')}`;
  return designations[designationLookupKey(course)] ?? designations[legacyKey] ?? designations[course.code];
}

export function getCourseDesignation(
  course: Pick<
    CourseLike,
    'code' | 'officialCode' | 'canonicalCourseId' | 'category' | 'name' | 'subject' | 'module' | 'program'
  >,
  designations: Record<string, CourseDesignation>,
  plan?: ProgramPlan,
) {
  const stored = getStoredCourseDesignation(course, designations);
  if (isEngineeringEthics(course)) {
    return 'non-degree';
  }
  if (isHiasCourse(course)) {
    return 'non-degree';
  }
  if (isPublicRequiredCourse(course)) {
    return stored === 'non-degree' ? 'non-degree' : 'degree';
  }
  if (isPublicElectiveCourse(course) || isNonDegreeOnly(course)) {
    return 'non-degree';
  }
  if (
    stored === 'degree' &&
    getCourseRoleEligibility(course, plan).status === 'ineligible'
  ) {
    return 'non-degree';
  }
  if (stored) return stored;
  // A missing designation is a derived default, not a state migration on every
  // render. Explicit degree/non-degree/unset values always remain authoritative.
  if (plan && (isCoreDegreeType(course) || isProfessionalDegreeType(course)) &&
      getCourseRoleEligibility(course, plan).status === 'eligible') return 'degree';
  return 'unset';
}

export function getCourseRequirementType(
  course: Pick<
    CourseLike,
    'code' | 'officialCode' | 'canonicalCourseId' | 'category' | 'name' | 'subject' | 'module' | 'program'
  >,
  designation: CourseDesignation | 'unknown',
  plan?: ProgramPlan,
): CourseRequirementType {
  if (isEngineeringEthics(course)) {
    return 'publicRequiredNonDegree';
  }
  if (isHiasCourse(course)) {
    return 'publicElective';
  }
  if (isPublicRequiredCourse(course)) {
    if (isMastersPublicOutsideGeneralPhd(course, plan)) return 'pending';
    return designation === 'non-degree'
      ? 'publicRequiredNonDegree'
      : 'publicRequiredDegree';
  }
  if (isPublicElectiveCourse(course)) {
    return 'publicElective';
  }
  if (isNonDegreeOnly(course)) {
    return 'professionalElective';
  }

  if (designation === 'degree') {
    return getDegreeEligibility(course, plan).status === 'eligible'
      ? 'professionalDegree'
      : 'pending';
  }
  if (designation === 'non-degree') {
    return 'professionalElective';
  }
  return 'pending';
}

export function classifyCourseRequirement(
  course: Pick<
    CourseLike,
    'code' | 'officialCode' | 'canonicalCourseId' | 'category' | 'name' | 'subject' | 'module' | 'program'
  >,
  designation: CourseDesignation | 'unknown',
  plan?: ProgramPlan,
): CourseClassification {
  const requirementType = getCourseRequirementType(course, designation, plan);
  return {
    requirementType,
    degreeRole:
      designation === 'degree'
        ? 'degree'
        : designation === 'non-degree'
          ? 'nonDegree'
          : null,
  };
}

export type CreditSummary = {
  historicalCredits: number;
  plannedCredits: number;
  /** Planned courses plus approved exemption credits, excluding historical credits. */
  selectionCredits: number;
  duplicatePlannedCredits: number;
  duplicatePlannedCourseCount: number;
  pendingDesignationCredits: number;
  confirmedPlannedCredits: number;
  approvedExemptionCredits: number;
  plannedExemptionCredits: number;
  estimatedCredits: number;
  historicalCategoryCredits: Record<string, number>;
  plannedCategoryCredits: Record<string, number>;
  historicalRequirementCredits: Record<CourseRequirementType, number>;
  plannedRequirementCredits: Record<CourseRequirementType, number>;
  historicalDegreeCredits: number;
  plannedDegreeCredits: number;
  historicalProfessionalDegreeCredits: number;
  plannedProfessionalDegreeCredits: number;
  historicalNonDegreeCredits: number;
  plannedNonDegreeCredits: number;
  publicRequiredCredits: number;
  publicRequiredDegreeCredits: number;
  publicRequiredNonDegreeCredits: number;
  professionalDegreeCredits: number;
  /** Confirmed professional-degree credits plus degree-designated cross-major credits pending approval. */
  professionalDegreeCreditsWithApproval: number;
  /** Degree-designated courses with official 1/2/3 type that need cross-major approval. */
  approvalRequiredDegreeCredits: number;
  /** Degree-designated courses whose degree recognition cannot be determined automatically. */
  verificationDegreeCredits: number;
  professionalElectiveCredits: number;
  publicElectiveCredits: number;
  /** Public-elective-system credits excluding the innovation/entrepreneurship module. */
  ordinaryPublicElectiveCredits: number;
  innovationCredits: number;
  sportsCourseCount: number;
  pendingHistoryCourseCount: boolean;
  historicalRecords: HistoricalRecord[];
};

function sumCredits(records: Array<{ credits: number }>) {
  return records.reduce((sum, record) => sum + record.credits, 0);
}

/**
 * 历史记录允许手动录入，也兼容旧版备份，因此同一课程可能出现多条记录。
 * 同一课程编码只计一次；没有课程编码的记录无法安全判断重复，继续保留。
 * HIAS 讲堂是按参加次数累计的特殊记录，不能按固定编码去重。
 */
function dedupeHistoricalRecords(records: HistoricalRecord[]) {
  const seenCourses: ReturnType<typeof historicalCourseLike>[] = [];
  return records.filter((record) => {
    if (
      !record.credits || !record.courseName.trim() ||
      isHiasCourse({
        name: record.courseName,
        module: record.module === 'hias' ? 'hias' : undefined,
      })
    )
      return true;
    const course = historicalCourseLike(record);
    if (seenCourses.some((other) => coursesShareIdentity(course, other))) return false;
    seenCourses.push(course);
    return true;
  });
}

function addCategoryCredits(
  target: Record<string, number>,
  category: string,
  credits: number,
) {
  target[category] = (target[category] ?? 0) + credits;
}

function addRequirementCredits(
  target: Record<CourseRequirementType, number>,
  requirementType: CourseRequirementType,
  credits: number,
) {
  target[requirementType] = (target[requirementType] ?? 0) + credits;
}

export function historicalCourseLike(record: HistoricalRecord) {
  const courseModule: CourseModule =
    record.module === 'hias'
      ? 'hias'
      : record.module === 'innovation'
        ? 'innovation'
        : 'regular';
  return {
    id: `history:${record.id}`,
    code: record.courseCode,
    name: record.courseName,
    category: record.category,
    subject: record.subject ?? '',
    credits: record.credits,
    module: courseModule,
  };
}

export function calculateCreditSummary({
  selectedCourses,
  designations,
  historicalRecords,
  exemptionStatus,
  plan,
}: {
  selectedCourses: CourseLike[];
  designations: Record<string, CourseDesignation>;
  historicalRecords: HistoricalRecord[];
  exemptionStatus: ExemptionStatus;
  plan?: ProgramPlan;
}): CreditSummary {
  const completedHistory = dedupeHistoricalRecords(
    historicalRecords.filter((record) => record.credits > 0 && isCourseApplicable(historicalCourseLike(record), plan)),
  );
  const inHistory = (course: CourseLike) => completedHistory.some((record) =>
    coursesShareIdentity(course, historicalCourseLike(record)));
  const duplicateSelected = selectedCourses.filter(inHistory);
  const countedSelected = uniqueCourses(selectedCourses).filter(
    (course) =>
      isCourseApplicable(course, plan) &&
      !(exemptionStatus === 'approved' && plan?.studentTrack !== 'general_phd' && isEnglishCourse(course)) &&
      !inHistory(course),
  );
  const historicalCategoryCredits: Record<string, number> = {};
  completedHistory.forEach((record) =>
    addCategoryCredits(
      historicalCategoryCredits,
      isHiasCourse(historicalCourseLike(record)) ? '公共选修课' : record.category,
      record.credits,
    ),
  );
  const plannedCategoryCredits: Record<string, number> = {};
  countedSelected.forEach((course) =>
    addCategoryCredits(plannedCategoryCredits, course.category, course.credits),
  );
  const historicalRequirementCredits: Record<CourseRequirementType, number> = {
    publicRequiredDegree: 0,
    professionalDegree: 0,
    professionalElective: 0,
    publicElective: 0,
    publicRequiredNonDegree: 0,
    pending: 0,
  };
  const plannedRequirementCredits: Record<CourseRequirementType, number> = {
    publicRequiredDegree: 0,
    professionalDegree: 0,
    professionalElective: 0,
    publicElective: 0,
    publicRequiredNonDegree: 0,
    pending: 0,
  };
  const historicalClassifications = completedHistory.map((record) => {
    const course = historicalCourseLike(record);
    const designation = getCourseDesignation(
      course,
      record.designation === 'unknown'
        ? {}
        : { [record.courseCode]: record.designation },
      plan,
    );
    return {
      record,
      course,
      classification: classifyCourseRequirement(course, designation, plan),
    };
  });
  const plannedClassifications = countedSelected.map((course) => {
    const designation = getCourseDesignation(course, designations, plan);
    return {
      course,
      classification: classifyCourseRequirement(course, designation, plan),
    };
  });
  historicalClassifications.forEach(({ record, classification }) =>
    addRequirementCredits(
      historicalRequirementCredits,
      classification.requirementType,
      record.credits,
    ),
  );
  plannedClassifications.forEach(({ course, classification }) =>
    addRequirementCredits(
      plannedRequirementCredits,
      classification.requirementType,
      course.credits,
    ),
  );

  const historicalEnglishCredits = sumCredits(
    completedHistory.filter((record) => isEnglishCourse(historicalCourseLike(record))),
  );
  const hasHistoricalEnglish = historicalEnglishCredits > 0;
  const approvedExemptionCredits =
    exemptionStatus === 'approved' && !hasHistoricalEnglish && plan?.studentTrack !== 'general_phd' ? 3 : 0;
  const plannedExemptionCredits =
    exemptionStatus === 'planned' && !hasHistoricalEnglish && plan?.studentTrack !== 'general_phd' ? 3 : 0;

  const historicalDegreeCredits = sumCredits(
    historicalClassifications
      .filter(({ classification }) => classification.degreeRole === 'degree')
      .map(({ record }) => record),
  );
  const historicalProfessionalDegreeCredits =
    historicalRequirementCredits.professionalDegree;
  const historicalNonDegreeCredits = sumCredits(
    historicalClassifications
      .filter(({ classification }) => classification.degreeRole === 'nonDegree')
      .map(({ record }) => record),
  );
  const plannedDegreeCredits = sumCredits(
    plannedClassifications
      .filter(({ classification }) => classification.degreeRole === 'degree')
      .map(({ course }) => course),
  );
  const plannedProfessionalDegreeCredits =
    plannedRequirementCredits.professionalDegree;
  const plannedNonDegreeCredits = sumCredits(
    plannedClassifications
      .filter(({ classification }) => classification.degreeRole === 'nonDegree')
      .map(({ course }) => course),
  );
  const publicRequiredDegreeCredits =
    historicalRequirementCredits.publicRequiredDegree +
    plannedRequirementCredits.publicRequiredDegree +
    approvedExemptionCredits;
  const publicRequiredNonDegreeCredits =
    historicalRequirementCredits.publicRequiredNonDegree +
    plannedRequirementCredits.publicRequiredNonDegree;
  const professionalDegreeCredits =
    historicalRequirementCredits.professionalDegree +
    plannedRequirementCredits.professionalDegree;
  const approvalRequiredDegreeCredits =
    historicalClassifications
      .filter(
        ({ record, course }) =>
          record.designation === 'degree' &&
          getCourseRoleEligibility(course, plan).status ===
            'approval_required',
      )
      .reduce((sum, { record }) => sum + record.credits, 0) +
    plannedClassifications
      .filter(
        ({ course }) =>
          getCourseDesignation(course, designations, plan) === 'degree' &&
          getCourseRoleEligibility(course, plan).status ===
            'approval_required',
      )
      .reduce((sum, { course }) => sum + course.credits, 0);
  const verificationDegreeCredits =
    historicalClassifications
      .filter(
        ({ record, course }) =>
          (isCoreDegreeType(course) || isProfessionalDegreeType(course)) &&
          record.designation === 'degree' &&
          getCourseRoleEligibility(course, plan).status === 'verification',
      )
      .reduce((sum, { record }) => sum + record.credits, 0) +
    plannedClassifications
      .filter(
        ({ course }) =>
          (isCoreDegreeType(course) || isProfessionalDegreeType(course)) &&
          getCourseDesignation(course, designations, plan) === 'degree' &&
          getCourseRoleEligibility(course, plan).status === 'verification',
      )
      .reduce((sum, { course }) => sum + course.credits, 0);
  const professionalElectiveCredits =
    historicalRequirementCredits.professionalElective +
    plannedRequirementCredits.professionalElective;
  const publicElectiveCredits =
    historicalRequirementCredits.publicElective +
    plannedRequirementCredits.publicElective;
  const innovationCredits =
    completedHistory
      .filter(isInnovationHistoryRecord)
      .reduce((sum, record) => sum + record.credits, 0) +
    countedSelected
      .filter(isInnovationCourse)
      .reduce((sum, course) => sum + course.credits, 0);

  return {
    historicalCredits: sumCredits(completedHistory),
    plannedCredits: sumCredits(countedSelected),
    selectionCredits: sumCredits(countedSelected) + approvedExemptionCredits,
    duplicatePlannedCredits: sumCredits(duplicateSelected),
    duplicatePlannedCourseCount: duplicateSelected.length,
    pendingDesignationCredits: sumCredits(
      countedSelected.filter(
        (course) =>
          getCourseDesignation(course, designations, plan) === 'unset',
      ),
    ),
    confirmedPlannedCredits:
      sumCredits(countedSelected) -
      sumCredits(
        countedSelected.filter(
          (course) =>
            getCourseDesignation(course, designations, plan) === 'unset',
        ),
      ),
    approvedExemptionCredits,
    plannedExemptionCredits,
    estimatedCredits:
      sumCredits(completedHistory) +
      sumCredits(countedSelected) +
      approvedExemptionCredits,
    historicalCategoryCredits,
    plannedCategoryCredits,
    historicalRequirementCredits,
    plannedRequirementCredits,
    historicalDegreeCredits,
    plannedDegreeCredits,
    historicalProfessionalDegreeCredits,
    plannedProfessionalDegreeCredits,
    historicalNonDegreeCredits,
    plannedNonDegreeCredits,
    publicRequiredCredits:
      publicRequiredDegreeCredits + publicRequiredNonDegreeCredits,
    publicRequiredDegreeCredits,
    publicRequiredNonDegreeCredits,
    professionalDegreeCredits,
    professionalDegreeCreditsWithApproval:
      professionalDegreeCredits + approvalRequiredDegreeCredits,
    approvalRequiredDegreeCredits,
    verificationDegreeCredits,
    professionalElectiveCredits,
    publicElectiveCredits,
    ordinaryPublicElectiveCredits: Math.max(
      0,
      publicElectiveCredits - innovationCredits,
    ),
    innovationCredits,
    sportsCourseCount: countedSelected.filter(
      (course) => course.subject === '体育学',
    ).length,
    pendingHistoryCourseCount: historicalRecords.some(
      (record) => record.courseCount === null,
    ),
    historicalRecords: completedHistory,
  };
}

export function getPlanCourseCounts({
  courses,
  plan,
  designations,
  historicalRecords,
}: {
  courses: CourseLike[];
  plan: ProgramPlan;
  designations: Record<string, CourseDesignation>;
  historicalRecords: HistoricalRecord[];
}) {
  const countable = uniqueCourses(courses).filter((course) => isCourseApplicable(course, plan) &&
    !historicalRecords.some((record) => record.credits > 0 && coursesShareIdentity(course, historicalCourseLike(record))));
  const selectedCoreCount = countable.filter(
    (course) =>
      getCourseDesignation(course, designations, plan) === 'degree' &&
      getDegreeEligibility(course, plan).status === 'eligible' &&
      isCoreDegreeType(course),
  ).length;
  const selectedProfessionalCount = countable.filter(
    (course) =>
      getCourseDesignation(course, designations, plan) === 'degree' &&
      getDegreeEligibility(course, plan).status === 'eligible' &&
      isProfessionalDegreeType(course),
  ).length;
  const historicalCoreCount = dedupeHistoricalRecords(historicalRecords).filter(
    (record) =>
      record.credits > 0 && record.courseName &&
      record.designation === 'degree' &&
      getDegreeEligibility(
        {
          code: record.courseCode,
          name: record.courseName,
          category: record.category,
          subject: record.subject ?? '',
        },
        plan,
      ).status === 'eligible' &&
      isCoreDegreeType({ code: record.courseCode, category: record.category }),
  ).length;
  const historicalProfessionalCount = dedupeHistoricalRecords(
    historicalRecords,
  ).filter(
    (record) =>
      record.credits > 0 && record.courseName &&
      record.designation === 'degree' &&
      getDegreeEligibility(
        {
          code: record.courseCode,
          name: record.courseName,
          category: record.category,
          subject: record.subject ?? '',
        },
        plan,
      ).status === 'eligible' &&
      isProfessionalDegreeType({
        code: record.courseCode,
        category: record.category,
      }),
  ).length;
  return {
    coreCount: selectedCoreCount + historicalCoreCount,
    professionalCount: selectedProfessionalCount + historicalProfessionalCount,
    historicalCoreCount,
    historicalProfessionalCount,
  };
}
