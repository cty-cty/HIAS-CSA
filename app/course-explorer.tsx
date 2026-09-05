'use client';

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BookOpen,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Info,
  MapPin,
  Presentation,
  Repeat2,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Trash2,
  Users,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PROGRAM_PLANS, type ProgramPlan } from '@/app/program-plans';
import {
  calculateCreditSummary,
  courseFamilyKey,
  getDegreeEligibility,
  getCourseRequirementType,
  getCourseRequirementTypeLabel,
  getCourseRoleEligibility,
  getCourseDesignation,
  getCourseCodeCategory,
  getCourseCodeCategoryLabel,
  getCourseCodeMarker,
  getPlanCourseCounts,
  isEnglishCourse,
  isInnovationCourse,
  isNonDegreeOnly,
  getCourseModule,
  type CourseDesignation,
  type CourseModule,
  type CourseRequirementType,
  type DegreeRole,
  type ExemptionStatus,
  type HistoricalModule,
  type HistoricalRecord,
} from '@/app/credit-model';
import { getGraduateProgramScopeLabel } from '@/app/graduate-program-mapping';

type Schedule = {
  day: string;
  dayIndex: number;
  start: number;
  end: number;
  weeks: number[];
  weeksText: string;
  periodText: string;
  room: string;
};

type Course = {
  id: string;
  code: string;
  name: string;
  englishName: string;
  college: string;
  category: string;
  level: string;
  subject: string;
  hours: string;
  credits: number;
  capacity: number;
  enrolled: number;
  teachingMode: string;
  examMode: string;
  teacher: string;
  schedules: Schedule[];
  module?: CourseModule;
  requirementType?: CourseRequirementType;
  degreeRole?: DegreeRole;
};

type CourseDataset = {
  id: string;
  label: string;
  shortLabel?: string;
  courses: Course[];
  updatedAt?: string;
  audience?: string;
};

const DEFAULT_TERM_ID = '2026-fall';
const DEFAULT_TERM_LABEL = '2026—2027学年(秋)第一学期';
const TERM_TEMPLATES = [
  {
    id: DEFAULT_TERM_ID,
    label: DEFAULT_TERM_LABEL,
    shortLabel: '26—27 秋季',
  },
  {
    id: '2027-spring',
    label: '2026—2027学年(春)第二学期',
    shortLabel: '26—27 春季',
  },
  {
    id: '2027-summer',
    label: '2026—2027学年(夏)第三学期',
    shortLabel: '26—27 夏季',
  },
] as const;
const TERM_TEMPLATE_IDS = new Set<string>(TERM_TEMPLATES.map((term) => term.id));
const COURSE_DATASETS_STORAGE_KEY = 'hias-course-datasets-v1';
const ACTIVE_TERM_STORAGE_KEY = 'hias-active-term-v1';
const SELECTED_BY_TERM_STORAGE_KEY = 'hias-selected-by-term-v1';
const DESIGNATIONS_BY_TERM_STORAGE_KEY = 'hias-designations-by-term-v1';
const PROGRAM_PLANS_STORAGE_KEY = 'hias-program-plans-v1';
const HISTORICAL_RECORDS_STORAGE_KEY = 'hias-historical-records-v1';
const ENGLISH_EXEMPTION_STORAGE_KEY = 'hias-english-exemption-v1';
const LEGACY_SELECTED_STORAGE_KEY = 'ucas-hangzhou-selected';
const BACKUP_VERSION = 2;
const EMPTY_SELECTED_IDS: string[] = [];
const EMPTY_DESIGNATIONS: Record<string, CourseDesignation> = {};

function createTermTemplateDataset(
  termId: string,
  defaultCourses: Course[],
): CourseDataset | null {
  const template = TERM_TEMPLATES.find((term) => term.id === termId);
  if (!template) return null;
  return {
    id: template.id,
    label: template.label,
    shortLabel: template.shortLabel,
    courses: template.id === DEFAULT_TERM_ID ? defaultCourses : [],
    updatedAt: '',
    audience: '2026 级研一新生专用',
  };
}

type ConflictSlot = {
  day: string;
  start: number;
  end: number;
  weeks: number[];
};

type ConflictPair = {
  left: Course;
  right: Course;
  slots: ConflictSlot[];
};

type ExamBucketId = 'closed' | 'open' | 'report' | 'practical' | 'other';

type ExamBucket = {
  id: ExamBucketId;
  label: string;
  description: string;
  tone: string;
};

type NoticeSection = {
  title: string;
  items: Array<{ label: string; detail: string }>;
};

type CheckupItem = {
  id: string;
  title: string;
  value: string;
  detail: string;
  status: 'pass' | 'attention' | 'info';
};

type WebMcpContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: {
        readOnlyHint: boolean;
        untrustedContentHint: boolean;
      };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};

type BackupPayload = {
  version: number;
  app: 'HIAS-CSA';
  savedAt: string;
  activeTermId: string;
  customDatasets: CourseDataset[];
  selectedByTerm: Record<string, string[]>;
  designationsByTerm: Record<string, Record<string, CourseDesignation>>;
  programPlans: ProgramPlan[];
  historicalRecords: HistoricalRecord[];
  englishExemptionStatus: ExemptionStatus;
};

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const PAGE_SIZE = 24;
const EXAM_BUCKETS: ExamBucket[] = [
  {
    id: 'closed',
    label: '闭卷考试',
    description: '需要集中复习与笔试准备',
    tone: 'rose',
  },
  {
    id: 'open',
    label: '开卷考试',
    description: '重在资料整理与理解应用',
    tone: 'blue',
  },
  {
    id: 'report',
    label: '报告 / 论文',
    description: '需要持续阅读、写作或汇报',
    tone: 'amber',
  },
  {
    id: 'practical',
    label: '实践 / 技能',
    description: '以操作、设计或技能考核为主',
    tone: 'emerald',
  },
  {
    id: 'other',
    label: '其他考核',
    description: '以课程文件中的具体说明为准',
    tone: 'slate',
  },
];
const NOTICE_SECTIONS: NoticeSection[] = [
  {
    title: '关键时间节点',
    items: [
      {
        label: '网络选课开始',
        detail: '2026 年 9 月 4 日 12:30',
      },
      {
        label: '选课提交与审核截止',
        detail:
          '2026 年 9 月 18 日 12:30；提交后还需完成导师、培养单位和院系审核。',
      },
      {
        label: '增选课程',
        detail:
          '课程开课两周内提出申请，并关注各审核角色在提交后 10 天内完成审核。',
      },
      {
        label: '退选课程',
        detail: '课程学时完成一半前提出申请；超过时限原则上不再受理。',
      },
      {
        label: '学位课属性变更',
        detail: '课程考核前 10 天提出申请，考核后不能变更。',
      },
    ],
  },
  {
    title: '学分与课程认定',
    items: [
      {
        label: '学期选课量',
        detail:
          '秋季、春季学期原则上均不少于 10 学分；HIAS 讲堂和科学前沿讲座学分不计入该门槛，夏季学期按需选课。',
      },
      {
        label: '核心课与专业课',
        detail:
          '硕士和直博生至少选择 2 门核心课（编号第14位为 1 或 2）和 2 门专业课（编号第14位为 3）作为学位课，具体以个人培养方案为准。',
      },
      {
        label: '非学位课程',
        detail:
          '课程编号第14位为 4、5、6、7 的研讨、实验、实践、科学前沿讲座，以及人文系列讲座（HIAS讲堂），只能作为非学位课修读。编号第14位为 B/X 的公共课程也不计入专业学位课。',
      },
      {
        label: '专业硕士公选课',
        detail:
          '专业型硕士公共选修课至少 3 学分，其中创新创业模块课程 1 学分；程序中的培养方案卡片会分项显示。',
      },
      {
        label: '体育类公选课',
        detail: '每学期限选 1 门；课程编号第 14 位为 X 的课程属于公共选修课。',
      },
    ],
  },
  {
    title: '选课与成绩提醒',
    items: [
      {
        label: '确认前检查',
        detail:
          '在导师和培养单位指导下确定学位/非学位属性，提交后及时提醒导师完成审核；未完成提交或审核的选课可能无法进入名单。',
      },
      {
        label: '课程评估',
        detail:
          '课程进行到约 2/3 时开始课程评估，授课教师学时完成一半后进行教师评估；未按时评估可能影响成绩查询。',
      },
      {
        label: '考试信息',
        detail:
          '考试日期和具体安排以选课系统及学校通知为准；本页的考试压力视图只按课程文件中的考核方式分类。',
      },
      {
        label: '问题咨询',
        detail:
          '其它选课问题可咨询杭高院教务处：0571-86088963；选课系统登录问题可咨询网络中心：010-88256622。',
      },
    ],
  },
];
const COURSE_COLORS = [
  ['#dff2ee', '#147d6f'],
  ['#e9e5fb', '#6251a4'],
  ['#ffe8dd', '#a85834'],
  ['#dceafb', '#326da8'],
  ['#f8edca', '#91701e'],
  ['#f3dfe9', '#9c4b72'],
];

function countsTowardSemesterMinimum(course: Course) {
  return !/科学前沿讲座|HIAS讲堂|人文系列讲座/.test(
    `${course.category} ${course.name}`,
  );
}

function designationLabel(value: CourseDesignation) {
  if (value === 'degree') return '学位课';
  if (value === 'non-degree') return '非学位课';
  return '未确定';
}

function englishStatusLabel(value: ExemptionStatus) {
  return value === 'approved'
    ? '已获得英语免修免考资格'
    : '未获得英语免修免考资格';
}

function englishStatusTone(value: ExemptionStatus) {
  return value === 'approved' ? 'approved' : 'not-qualified';
}

function intersects<T>(left: T[], right: T[]) {
  const lookup = new Set(left);
  return right.some((item) => lookup.has(item));
}

function schedulesConflict(left: Schedule, right: Schedule) {
  return (
    left.dayIndex === right.dayIndex &&
    left.start <= right.end &&
    right.start <= left.end &&
    intersects(left.weeks, right.weeks)
  );
}

function coursesConflict(left: Course, right: Course) {
  return left.schedules.some((a) =>
    right.schedules.some((b) => schedulesConflict(a, b)),
  );
}

function getExamBucket(examMode: string): ExamBucketId {
  if (/闭卷/.test(examMode)) return 'closed';
  if (/开卷/.test(examMode)) return 'open';
  if (/报告|论文|综述|汇报|大作业/.test(examMode)) return 'report';
  if (/实践|技能|实验|设计|作品|答辩/.test(examMode)) return 'practical';
  return 'other';
}

function courseConflictsInWeek(left: Course, right: Course, week: number) {
  return left.schedules.some((a) =>
    right.schedules.some(
      (b) =>
        a.dayIndex === b.dayIndex &&
        a.start <= b.end &&
        b.start <= a.end &&
        a.weeks.includes(week) &&
        b.weeks.includes(week),
    ),
  );
}

function getConflictSlots(left: Course, right: Course) {
  const slots: ConflictSlot[] = [];
  left.schedules.forEach((a) => {
    right.schedules.forEach((b) => {
      if (!schedulesConflict(a, b)) return;
      const weeks = a.weeks.filter((item) => b.weeks.includes(item));
      slots.push({
        day: a.day,
        start: Math.max(a.start, b.start),
        end: Math.min(a.end, b.end),
        weeks,
      });
    });
  });
  return slots;
}

function formatWeekRanges(weeks: number[]) {
  if (!weeks.length) return '周次待定';
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = current;
    previous = current;
  }
  return `第${ranges.join('、')}周`;
}

function formatConflictSlot(slot: ConflictSlot) {
  const periods =
    slot.start === slot.end
      ? `第${slot.start}节`
      : `第${slot.start}-${slot.end}节`;
  return `${slot.day} ${periods} · ${formatWeekRanges(slot.weeks)}`;
}

function formatCredits(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatRequirementProgress(
  actual: number,
  target: number | null | undefined,
) {
  return target === null || target === undefined
    ? `${formatCredits(actual)} 学分 / 待核验`
    : `${formatCredits(actual)} / ${formatCredits(target)} 学分`;
}

function formatEnrollment(course: Course) {
  const capacity = course.capacity > 0 ? course.capacity : null;
  const enrolled = course.enrolled > 0 ? course.enrolled : null;
  if (capacity && enrolled !== null) {
    return `余量 ${Math.max(0, capacity - enrolled)} / ${capacity}（非实时）`;
  }
  if (capacity) return `限选人数 ${capacity} · 已选人数暂无`;
  if (enrolled !== null) return `已选人数 ${enrolled} · 限选人数未提供`;
  return '名额信息未提供';
}

function formatEnrollmentDetail(course: Course) {
  const capacity = course.capacity > 0 ? course.capacity : null;
  const enrolled = course.enrolled > 0 ? course.enrolled : null;
  if (capacity && enrolled !== null)
    return `${enrolled} / ${capacity}（非实时）`;
  if (capacity) return `暂无 / ${capacity}`;
  if (enrolled !== null) return `${enrolled} / 未提供`;
  return '暂无 / 未提供';
}

function courseColor(courseId: string) {
  let hash = 0;
  for (const character of courseId) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return COURSE_COLORS[Math.abs(hash) % COURSE_COLORS.length];
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function templateWeekText(schedule: Schedule) {
  return schedule.weeksText
    .trim()
    .replace(/^第/, '')
    .replace(/周$/, '')
    .replaceAll(',', '、');
}

function isCourse(value: unknown): value is Course {
  if (!value || typeof value !== 'object') return false;
  const course = value as Partial<Course>;
  return (
    typeof course.id === 'string' &&
    typeof course.code === 'string' &&
    typeof course.name === 'string' &&
    typeof course.credits === 'number' &&
    Number.isFinite(course.credits) &&
    course.credits >= 0 &&
    typeof course.englishName === 'string' &&
    typeof course.college === 'string' &&
    typeof course.category === 'string' &&
    typeof course.level === 'string' &&
    typeof course.subject === 'string' &&
    typeof course.hours === 'string' &&
    typeof course.capacity === 'number' &&
    Number.isFinite(course.capacity) &&
    course.capacity >= 0 &&
    typeof course.enrolled === 'number' &&
    Number.isFinite(course.enrolled) &&
    course.enrolled >= 0 &&
    typeof course.teachingMode === 'string' &&
    typeof course.examMode === 'string' &&
    typeof course.teacher === 'string' &&
    Array.isArray(course.schedules) &&
    course.schedules.every((schedule) => {
      if (!schedule || typeof schedule !== 'object') return false;
      const item = schedule as Partial<Schedule>;
      return (
        typeof item.day === 'string' &&
        typeof item.dayIndex === 'number' &&
        Number.isInteger(item.dayIndex) &&
        item.dayIndex >= -1 &&
        item.dayIndex <= 6 &&
        typeof item.start === 'number' &&
        Number.isFinite(item.start) &&
        typeof item.end === 'number' &&
        Number.isFinite(item.end) &&
        item.start >= 0 &&
        item.end >= 0 &&
        item.start <= item.end &&
        Array.isArray(item.weeks) &&
        item.weeks.every(
          (weekValue) =>
            Number.isInteger(weekValue) && weekValue >= 1 && weekValue <= 20,
        ) &&
        typeof item.weeksText === 'string' &&
        typeof item.periodText === 'string' &&
        typeof item.room === 'string'
      );
    })
  );
}

function validateCourseRows(rawCourses: unknown[]) {
  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  const errors: string[] = [];

  rawCourses.forEach((value, index) => {
    const row = index + 1;
    if (!isCourse(value)) {
      errors.push(`第 ${row} 门课程的字段不完整或格式不正确`);
      return;
    }
    if (
      [
        value.id,
        value.code,
        value.name,
        value.college,
        value.category,
        value.level,
        value.subject,
        value.teacher,
        value.teachingMode,
        value.examMode,
      ].some((field) => !field.trim())
    ) {
      errors.push(`第 ${row} 门课程包含空的关键字段`);
    }
    if (value.capacity > 0 && value.enrolled > value.capacity) {
      errors.push(
        `第 ${row} 门课程的已选人数超过限选人数：${value.enrolled}/${value.capacity}`,
      );
    }
    if (seenIds.has(value.id))
      errors.push(`第 ${row} 门课程的 id 重复：${value.id}`);
    if (seenCodes.has(value.code)) {
      errors.push(`第 ${row} 门课程的课程编码重复：${value.code}`);
    }
    seenIds.add(value.id);
    seenCodes.add(value.code);
    value.schedules.forEach((schedule, scheduleIndex) => {
      if (schedule.dayIndex >= 0 && (schedule.start < 1 || schedule.end > 13)) {
        errors.push(
          `第 ${row} 门课程的第 ${scheduleIndex + 1} 条上课安排节次超出 1—13 节`,
        );
      }
    });
  });

  if (errors.length) {
    const preview = errors.slice(0, 6).join('；');
    throw new Error(
      `课程数据校验失败：${preview}${errors.length > 6 ? `（另有 ${errors.length - 6} 项问题）` : ''}`,
    );
  }
}

function isProgramPlan(value: unknown): value is ProgramPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Partial<ProgramPlan>;
  const isNonNegativeNumber = (candidate: unknown) =>
    typeof candidate === 'number' &&
    Number.isFinite(candidate) &&
    candidate >= 0;
  const textFields = [
    plan.id,
    plan.label,
    plan.degree,
    plan.program,
    plan.code,
  ];
  const creditFields = [
    plan.totalCredits,
    plan.publicRequiredCredits,
    plan.publicRequiredDegreeCredits,
    plan.publicRequiredNonDegreeCredits,
    plan.degreeCourseCredits,
    plan.professionalNonDegreeCredits,
    plan.publicElectiveCredits,
    plan.innovationCredits,
    plan.coreMinimum,
    plan.professionalMinimum,
  ];
  return (
    textFields.every((value) => typeof value === 'string' && value.trim()) &&
    creditFields.every(
      (value) =>
        value === undefined || value === null || isNonNegativeNumber(value),
    ) &&
    (plan.publicRequiredCredits === null ||
      isNonNegativeNumber(plan.publicRequiredCredits)) &&
    (plan.publicRequiredDegreeCredits === undefined ||
      plan.publicRequiredDegreeCredits === null ||
      isNonNegativeNumber(plan.publicRequiredDegreeCredits)) &&
    (plan.publicRequiredNonDegreeCredits === undefined ||
      plan.publicRequiredNonDegreeCredits === null ||
      isNonNegativeNumber(plan.publicRequiredNonDegreeCredits)) &&
    (plan.professionalNonDegreeCredits === null ||
      isNonNegativeNumber(plan.professionalNonDegreeCredits)) &&
    (plan.innovationCredits === null ||
      isNonNegativeNumber(plan.innovationCredits)) &&
    Array.isArray(plan.coreCourses) &&
    plan.coreCourses.length > 0 &&
    plan.coreCourses.every(
      (course) => typeof course === 'string' && course.trim(),
    ) &&
    Array.isArray(plan.professionalCourses) &&
    plan.professionalCourses.length > 0 &&
    plan.professionalCourses.every(
      (course) => typeof course === 'string' && course.trim(),
    ) &&
    (plan.source === undefined || typeof plan.source === 'string') &&
    (plan.updatedAt === undefined || typeof plan.updatedAt === 'string') &&
    (plan.note === undefined || typeof plan.note === 'string')
    &&
    (plan.requiredPublicRequiredNonDegreeCourses === undefined ||
      (Array.isArray(plan.requiredPublicRequiredNonDegreeCourses) &&
        plan.requiredPublicRequiredNonDegreeCourses.every(
          (course) => typeof course === 'string' && course.trim(),
        )))
  );
}

function formatUpdatedAt(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN');
}

function parseProgramPlans(text: string): ProgramPlan[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('培养方案文件不是有效的 JSON。');
  }
  const record =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  const rawPlans = Array.isArray(parsed) ? parsed : record?.plans;
  if (!Array.isArray(rawPlans) || !rawPlans.length) {
    throw new Error(
      '没有找到培养方案数组。请上传方案数组或包含 plans 字段的 JSON。',
    );
  }
  if (!rawPlans.every(isProgramPlan)) {
    throw new Error(
      '培养方案字段不完整，至少需要 id、label、degree、program、code、学分要求和课程名称列表。',
    );
  }
  const ids = rawPlans.map((plan) => plan.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('培养方案 id 不能重复，请检查导入文件。');
  }
  return rawPlans;
}

function termIdFromLabel(label: string) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'imported-' + Date.now();
}

function parseCourseDataset(text: string, fileName: string): CourseDataset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('数据文件不是有效的 JSON。请使用课程数据 courses.json。');
  }

  const isObject =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed);
  const record = isObject ? (parsed as Record<string, unknown>) : null;
  const rawCourses = Array.isArray(parsed) ? parsed : record?.courses;
  if (!Array.isArray(rawCourses) || !rawCourses.length) {
    throw new Error(
      '没有找到课程数组。支持直接上传 courses.json，或上传包含 courses 字段的 JSON 文件。',
    );
  }
  validateCourseRows(rawCourses);

  const baseName = fileName.replace(/\.[^/.]+$/, '').trim();
  const labelValue =
    (typeof record?.label === 'string' && record.label.trim()) ||
    (typeof record?.termLabel === 'string' && record.termLabel.trim()) ||
    (typeof record?.term === 'string' && record.term.trim()) ||
    baseName ||
    '导入课程数据';
  const idValue =
    (typeof record?.termId === 'string' && record.termId.trim()) || labelValue;

  return {
    id: termIdFromLabel(idValue),
    label: labelValue,
    courses: rawCourses,
    updatedAt: new Date().toISOString(),
    audience:
      typeof record?.audience === 'string' && record.audience.trim()
        ? record.audience.trim()
        : undefined,
  };
}

function ScheduleLines({ schedules }: { schedules: Schedule[] }) {
  return (
    <div className="space-y-1.5">
      {schedules.map((schedule, index) => (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1"
          key={`${schedule.periodText}-${index}`}
        >
          <span className="font-medium text-slate-800">
            {schedule.periodText}
          </span>
          <span className="text-slate-500">{schedule.weeksText}</span>
          <span className="inline-flex items-center gap-1 text-slate-500">
            <MapPin className="size-3.5" /> {schedule.room}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CourseExplorer({
  initialCourses: defaultCourses,
}: {
  initialCourses: Course[];
}) {
  const [customDatasets, setCustomDatasets] = useState<CourseDataset[]>([]);
  const [activeTermId, setActiveTermId] = useState(DEFAULT_TERM_ID);
  const [selectedByTerm, setSelectedByTerm] = useState<
    Record<string, string[]>
  >({});
  const [designationsByTerm, setDesignationsByTerm] = useState<
    Record<string, Record<string, CourseDesignation>>
  >({});
  const [query, setQuery] = useState('');
  const [college, setCollege] = useState('全部院系');
  const [subject, setSubject] = useState('全部学科/专业');
  const [category, setCategory] = useState('全部类别');
  const [day, setDay] = useState('全部星期');
  const [storageReady, setStorageReady] = useState(false);
  const [dataMessage, setDataMessage] = useState('');
  const [dataError, setDataError] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [onlyNoConflict, setOnlyNoConflict] = useState(false);
  const [view, setView] = useState<
    | 'courses'
    | 'checkup'
    | 'guide'
    | 'notice'
    | 'exams'
    | 'timetable'
    | 'data'
  >('guide');
  const [customProgramPlans, setCustomProgramPlans] = useState<ProgramPlan[]>(
    [],
  );
  const [programPlanId, setProgramPlanId] = useState('optical-master');
  const [programPlanMessage, setProgramPlanMessage] = useState('');
  const [programPlanError, setProgramPlanError] = useState('');
  const [week, setWeek] = useState(2);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [detailCourse, setDetailCourse] = useState<Course | null>(null);
  const [historicalRecords, setHistoricalRecords] = useState<HistoricalRecord[]>(
    [],
  );
  const [englishExemptionStatus, setEnglishExemptionStatus] =
    useState<ExemptionStatus>('normal');
  const [selectionMessage, setSelectionMessage] = useState('');
  const [recommendationDialogOpen, setRecommendationDialogOpen] =
    useState(false);
  const [dataManagementMessage, setDataManagementMessage] = useState('');
  const [dataManagementError, setDataManagementError] = useState('');
  const [restorePreview, setRestorePreview] = useState<{
    payload: BackupPayload;
    summary: string[];
  } | null>(null);
  const [historyDraft, setHistoryDraft] = useState({
    term: '',
    courseName: '',
    courseCode: '',
    credits: '',
    category: '公共必修课',
    designation: 'unknown' as HistoricalRecord['designation'],
    module: 'unknown' as HistoricalModule,
  });
  const [hiasDraft, setHiasDraft] = useState({
    term: '',
    attendanceCount: '',
  });
  const dataFileRef = useRef<HTMLInputElement>(null);
  const programPlanFileRef = useRef<HTMLInputElement>(null);
  const backupFileRef = useRef<HTMLInputElement>(null);
  const activeDataset =
    customDatasets.find((dataset) => dataset.id === activeTermId) ??
    createTermTemplateDataset(activeTermId, defaultCourses) ??
    createTermTemplateDataset(DEFAULT_TERM_ID, defaultCourses)!;
  const isDefaultTerm = activeDataset.id === DEFAULT_TERM_ID;
  const activeTermDisplayLabel = activeDataset.shortLabel || activeDataset.label;
  const audienceLabel =
    activeDataset.audience ||
    (isDefaultTerm ? '2026 级研一新生专用' : '适用对象以课程数据说明为准');
  const heroDescription = isDefaultTerm
    ? '课程数据依据已整理的 2026 年秋季课表与培养方案材料，仅供参考，用于帮助大家模拟选课、查看冲突与规划学分；最终课程安排请以学校正式通知和选课系统为准。'
    : activeDataset.courses.length
      ? `当前使用“${activeDataset.label}”课程数据，仅供参考，用于模拟选课、查看冲突与规划学分；适用年级、培养要求和最终课程安排请以对应学校通知及选课系统为准。`
      : `当前为“${activeDataset.label}”学期模板，尚未载入课程数据；可在“数据管理”中导入本学期课表。培养要求、选课规则和最终课程安排请以对应学校通知及选课系统为准。`;
  const initialCourses = useMemo(
    () =>
      activeDataset.courses.map((course) => ({
        ...course,
        module: getCourseModule(course),
      })),
    [activeDataset.courses],
  );
  const availableDatasets = useMemo(() => {
    const datasetMap = new Map<string, CourseDataset>();
    TERM_TEMPLATES.forEach((term) => {
      const dataset = createTermTemplateDataset(term.id, defaultCourses);
      if (dataset) datasetMap.set(term.id, dataset);
    });
    customDatasets.forEach((dataset) => datasetMap.set(dataset.id, dataset));
    return [...datasetMap.values()];
  }, [customDatasets, defaultCourses]);
  const selectedIds = selectedByTerm[activeTermId] ?? EMPTY_SELECTED_IDS;
  const activeDesignations =
    designationsByTerm[activeTermId] ?? EMPTY_DESIGNATIONS;
  const selectedIdsRef = useRef(selectedIds);
  const recommendationPromptRequestRef = useRef(false);
  const availableProgramPlans = useMemo(() => {
    const planMap = new Map<string, ProgramPlan>();
    [...PROGRAM_PLANS, ...customProgramPlans].forEach((plan) =>
      planMap.set(plan.id, plan),
    );
    return [...planMap.values()];
  }, [customProgramPlans]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    const storedDatasets = window.localStorage.getItem(
      COURSE_DATASETS_STORAGE_KEY,
    );
    const storedActiveTerm = window.localStorage.getItem(
      ACTIVE_TERM_STORAGE_KEY,
    );
    const storedSelections = window.localStorage.getItem(
      SELECTED_BY_TERM_STORAGE_KEY,
    );
    const storedDesignations = window.localStorage.getItem(
      DESIGNATIONS_BY_TERM_STORAGE_KEY,
    );
    const legacySelected = window.localStorage.getItem(
      LEGACY_SELECTED_STORAGE_KEY,
    );
    const storedProgramPlans = window.localStorage.getItem(
      PROGRAM_PLANS_STORAGE_KEY,
    );
    const storedHistoricalRecords = window.localStorage.getItem(
      HISTORICAL_RECORDS_STORAGE_KEY,
    );
    const storedEnglishExemption = window.localStorage.getItem(
      ENGLISH_EXEMPTION_STORAGE_KEY,
    );

    let parsedDatasets: CourseDataset[] = [];
    if (storedDatasets) {
      try {
        const parsed = JSON.parse(storedDatasets);
        if (
          Array.isArray(parsed) &&
          parsed.every(
            (dataset) =>
              dataset &&
              typeof dataset.id === 'string' &&
              typeof dataset.label === 'string' &&
              Array.isArray(dataset.courses) &&
              dataset.courses.every(isCourse) &&
              (dataset.audience === undefined ||
                typeof dataset.audience === 'string'),
          )
        ) {
          parsedDatasets = parsed;
        }
      } catch {
        window.localStorage.removeItem(COURSE_DATASETS_STORAGE_KEY);
      }
    }

    let parsedSelections: Record<string, string[]> = {};
    if (storedSelections) {
      try {
        const parsed = JSON.parse(storedSelections);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsedSelections = Object.fromEntries(
            Object.entries(parsed).filter(
              ([, ids]) =>
                Array.isArray(ids) && ids.every((id) => typeof id === 'string'),
            ),
          ) as Record<string, string[]>;
        }
      } catch {
        window.localStorage.removeItem(SELECTED_BY_TERM_STORAGE_KEY);
      }
    }

    let parsedDesignations: Record<
      string,
      Record<string, CourseDesignation>
    > = {};
    if (storedDesignations) {
      try {
        const parsed = JSON.parse(storedDesignations);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsedDesignations = Object.fromEntries(
            Object.entries(parsed)
              .filter(
                ([, values]) =>
                  values &&
                  typeof values === 'object' &&
                  !Array.isArray(values),
              )
              .map(([termId, values]) => [
                termId,
                Object.fromEntries(
                  Object.entries(values as Record<string, unknown>).filter(
                    ([, value]) =>
                      value === 'degree' ||
                      value === 'non-degree' ||
                      value === 'unset',
                  ),
                ),
              ]),
          ) as Record<string, Record<string, CourseDesignation>>;
        }
      } catch {
        window.localStorage.removeItem(DESIGNATIONS_BY_TERM_STORAGE_KEY);
      }
    }

    let parsedProgramPlans: ProgramPlan[] = [];
    if (storedProgramPlans) {
      try {
        const parsed = JSON.parse(storedProgramPlans);
        if (
          Array.isArray(parsed) &&
          parsed.every(isProgramPlan) &&
          new Set(parsed.map((plan) => plan.id)).size === parsed.length
        ) {
          parsedProgramPlans = parsed;
        }
      } catch {
        window.localStorage.removeItem(PROGRAM_PLANS_STORAGE_KEY);
      }
    }

    let parsedHistoricalRecords: HistoricalRecord[] = [];
    if (storedHistoricalRecords) {
      try {
        const parsed = JSON.parse(storedHistoricalRecords);
        if (
          Array.isArray(parsed) &&
          parsed.every(
            (record) =>
              record &&
              typeof record.id === 'string' &&
              typeof record.term === 'string' &&
              typeof record.courseName === 'string' &&
              typeof record.courseCode === 'string' &&
              typeof record.credits === 'number' &&
              Number.isFinite(record.credits) &&
              record.credits >= 0 &&
              typeof record.category === 'string' &&
              ['degree', 'non-degree', 'unknown'].includes(record.designation) &&
              ['regular', 'innovation', 'hias', 'unknown'].includes(record.module) &&
              (record.hours === undefined ||
                (typeof record.hours === 'number' &&
                  Number.isFinite(record.hours) &&
                  record.hours >= 0)) &&
              (record.attendanceCount === undefined ||
                (typeof record.attendanceCount === 'number' &&
                  Number.isFinite(record.attendanceCount) &&
                  record.attendanceCount >= 0)) &&
              (record.courseCount === null ||
                typeof record.courseCount === 'number'),
          )
        ) {
          parsedHistoricalRecords = parsed;
        }
      } catch {
        window.localStorage.removeItem(HISTORICAL_RECORDS_STORAGE_KEY);
      }
    }
    const parsedExemption: ExemptionStatus =
      storedEnglishExemption === 'planned' || storedEnglishExemption === 'approved'
        ? storedEnglishExemption
        : 'normal';
    if (!Object.keys(parsedSelections).length && legacySelected) {
      try {
        const legacyIds = JSON.parse(legacySelected);
        if (
          Array.isArray(legacyIds) &&
          legacyIds.every((id) => typeof id === 'string')
        ) {
          parsedSelections[DEFAULT_TERM_ID] = legacyIds;
        }
      } catch {
        window.localStorage.removeItem(LEGACY_SELECTED_STORAGE_KEY);
      }
    }

    const nextActiveTerm =
      storedActiveTerm &&
      (TERM_TEMPLATE_IDS.has(storedActiveTerm) ||
        parsedDatasets.some((dataset) => dataset.id === storedActiveTerm))
        ? storedActiveTerm
        : DEFAULT_TERM_ID;
    setCustomDatasets(parsedDatasets);
    setCustomProgramPlans(parsedProgramPlans);
    setActiveTermId(nextActiveTerm ?? DEFAULT_TERM_ID);
    setSelectedByTerm(parsedSelections);
    setDesignationsByTerm(parsedDesignations);
    setHistoricalRecords(parsedHistoricalRecords);
    setEnglishExemptionStatus(parsedExemption);
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(
      COURSE_DATASETS_STORAGE_KEY,
      JSON.stringify(customDatasets),
    );
    window.localStorage.setItem(ACTIVE_TERM_STORAGE_KEY, activeTermId);
  }, [activeTermId, customDatasets, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(
      SELECTED_BY_TERM_STORAGE_KEY,
      JSON.stringify(selectedByTerm),
    );
  }, [selectedByTerm, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(
      DESIGNATIONS_BY_TERM_STORAGE_KEY,
      JSON.stringify(designationsByTerm),
    );
  }, [designationsByTerm, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(
      PROGRAM_PLANS_STORAGE_KEY,
      JSON.stringify(customProgramPlans),
    );
  }, [customProgramPlans, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(
      HISTORICAL_RECORDS_STORAGE_KEY,
      JSON.stringify(historicalRecords),
    );
    window.localStorage.setItem(
      ENGLISH_EXEMPTION_STORAGE_KEY,
      englishExemptionStatus,
    );
  }, [englishExemptionStatus, historicalRecords, storageReady]);

  const setSelectedIdsForActive = useCallback(
    (next: string[] | ((current: string[]) => string[])) => {
      setSelectedByTerm((current) => {
        const currentIds = current[activeTermId] ?? [];
        const nextIds = typeof next === 'function' ? next(currentIds) : next;
        selectedIdsRef.current = nextIds;
        return { ...current, [activeTermId]: nextIds };
      });
    },
    [activeTermId],
  );

  function courseDesignation(course: Course): CourseDesignation {
    return getCourseDesignation(course, activeDesignations, activePlan);
  }

  function courseRequirementType(course: Course): CourseRequirementType {
    return getCourseRequirementType(
      course,
      courseDesignation(course),
      activePlan,
    );
  }

  function setCourseDesignation(
    course: Course,
    designation: CourseDesignation,
  ) {
    const nextDesignation =
      getCourseRoleEligibility(course, activePlan).status === 'ineligible'
      ? 'non-degree'
      : designation;
    setDesignationsByTerm((current) => ({
      ...current,
      [activeTermId]: {
        ...current[activeTermId],
        [course.code]: nextDesignation,
      },
    }));
  }

  async function handleCourseDataImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setDataError('');
    setDataMessage('');
    try {
      const parsedDataset = parseCourseDataset(await file.text(), file.name);
      const isGenericFile = /^courses?$/i.test(
        file.name.replace(/\.[^/.]+$/, '').trim(),
      );
      const dataset = isGenericFile
        ? {
            ...parsedDataset,
            id: activeTermId,
            label: activeDataset.label,
            shortLabel: activeDataset.shortLabel,
          }
        : parsedDataset;
      const previousDataset = availableDatasets.find(
        (item) => item.id === dataset.id,
      );
      const previousSelectedIds = selectedByTerm[dataset.id] ?? [];
      const previousSelectedCodes = new Set(
        (previousDataset?.courses ?? [])
          .filter((course) => previousSelectedIds.includes(course.id))
          .map((course) => course.code),
      );
      const restoredIds = dataset.courses
        .filter((course) => previousSelectedCodes.has(course.code))
        .map((course) => course.id);
      setCustomDatasets((current) => [
        ...current.filter((item) => item.id !== dataset.id),
        dataset,
      ]);
      setActiveTermId(dataset.id);
      setSelectedByTerm((current) => ({
        ...current,
        [dataset.id]: restoredIds,
      }));
      clearFilters();
      setDetailCourse(null);
      setDataMessage(
        '已加载“' +
          dataset.label +
          '”的 ' +
          dataset.courses.length +
          ` 门课程；按课程编码保留了 ${restoredIds.length} 门已选课程。` +
          (previousSelectedCodes.size > restoredIds.length
            ? ` ${previousSelectedCodes.size - restoredIds.length} 门课程因编码未匹配而未恢复。`
            : ''),
      );
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : '课程数据读取失败，请检查文件格式。',
      );
    }
  }

  async function handleProgramPlanImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setProgramPlanError('');
    setProgramPlanMessage('');
    try {
      const plans = parseProgramPlans(await file.text());
      const importedIds = new Set(plans.map((plan) => plan.id));
      setCustomProgramPlans((current) => [
        ...current.filter((plan) => !importedIds.has(plan.id)),
        ...plans.map((plan) => ({
          ...plan,
          updatedAt: plan.updatedAt || new Date().toISOString(),
        })),
      ]);
      if (!availableProgramPlans.some((plan) => plan.id === programPlanId)) {
        setProgramPlanId(plans[0].id);
      }
      setProgramPlanMessage(
        `已导入 ${plans.length} 个培养方向，已保存在当前浏览器。`,
      );
    } catch (error) {
      setProgramPlanError(
        error instanceof Error
          ? error.message
          : '培养方案读取失败，请检查文件格式。',
      );
    }
  }

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebMcpContext })
      .modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();
    const courseByCode = new Map(
      initialCourses.map((course) => [course.code, course]),
    );

    const registrations = [
      context.registerTool(
        {
          name: 'replace_selected_courses',
          title: '替换已选课程',
          description:
            '按课程编码批量替换当前已选课程，并立即更新页面中的学分统计和模拟课表。',
          inputSchema: {
            type: 'object',
            properties: {
              courseCodes: {
                type: 'array',
                items: { type: 'string' },
                uniqueItems: true,
              },
            },
            required: ['courseCodes'],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            untrustedContentHint: false,
          },
          async execute(input) {
            const codes = (input as { courseCodes?: unknown })?.courseCodes;
            if (
              !Array.isArray(codes) ||
              !codes.every((code) => typeof code === 'string')
            ) {
              throw new Error('courseCodes 必须是课程编码字符串数组。');
            }
            const unknownCodes = codes.filter(
              (code) => !courseByCode.has(code),
            );
            if (unknownCodes.length) {
              throw new Error(`未找到课程编码：${unknownCodes.join('、')}`);
            }
            const ids = codes.map((code) => courseByCode.get(code)!.id);
            selectedIdsRef.current = ids;
            setSelectedIdsForActive(ids);
            await new Promise<void>((resolve) =>
              window.requestAnimationFrame(() => resolve()),
            );
            return { selectedCount: ids.length, courseCodes: codes };
          },
        },
        { signal: lifecycle.signal },
      ),
      context.registerTool(
        {
          name: 'read_selected_courses',
          title: '读取已选课程',
          description: '读取当前页面中已经加入模拟课表的课程编码。',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: false,
          },
          execute() {
            const courses = initialCourses.filter((course) =>
              selectedIdsRef.current.includes(course.id),
            );
            return {
              selectedCount: courses.length,
              courseCodes: courses.map((course) => course.code),
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ];

    Promise.all(registrations.map((item) => Promise.resolve(item))).catch(
      () => undefined,
    );
    return () => lifecycle.abort();
  }, [initialCourses, setSelectedIdsForActive]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, college, subject, category, day, onlySelected, onlyNoConflict]);

  const colleges = useMemo(
    () => [...new Set(initialCourses.map((course) => course.college))].sort(),
    [initialCourses],
  );
  const categories = useMemo(
    () => [...new Set(initialCourses.map((course) => course.category))].sort(),
    [initialCourses],
  );
  const subjects = useMemo(
    () => [...new Set(initialCourses.map((course) => course.subject))].sort(),
    [initialCourses],
  );
  const selectedCourses = useMemo(
    () => initialCourses.filter((course) => selectedIds.includes(course.id)),
    [initialCourses, selectedIds],
  );
  const activePlan =
    availableProgramPlans.find((plan) => plan.id === programPlanId) ??
    availableProgramPlans[0] ??
    PROGRAM_PLANS[0];
  const creditSummary = useMemo(
    () =>
      calculateCreditSummary({
        selectedCourses,
        designations: activeDesignations,
        historicalRecords,
        exemptionStatus: englishExemptionStatus,
        plan: activePlan,
      }),
    [
      activeDesignations,
      englishExemptionStatus,
      historicalRecords,
      selectedCourses,
      activePlan,
    ],
  );
  const englishQualificationCredits = creditSummary.approvedExemptionCredits;
  const englishQualificationDetail =
    englishExemptionStatus === 'approved'
      ? englishQualificationCredits > 0
        ? `已计入公共必修学位课 +${formatCredits(englishQualificationCredits)} 学分，培养要求统计已同步。`
        : '已获得资格；历史英语课程已计入，免修免考学分不重复累计。'
      : '未计入英语免修免考学分，公共必修学位课不增加免修免考的 3 学分。';
  const hiasHistorySummary = useMemo(() => {
    const records = historicalRecords.filter((record) => record.module === 'hias');
    const hours = records.reduce(
      (sum, record) => sum + (record.hours ?? record.credits * 20),
      0,
    );
    const attendanceCount = records.reduce(
      (sum, record) => sum + (record.attendanceCount ?? (record.hours ?? record.credits * 20) / 2),
      0,
    );
    return {
      attendanceCount,
      hours,
      credits: records.reduce((sum, record) => sum + record.credits, 0),
    };
  }, [historicalRecords]);
  const hiasPreview = useMemo(() => {
    const attendanceCount = Number(hiasDraft.attendanceCount);
    if (!Number.isInteger(attendanceCount) || attendanceCount <= 0) {
      return null;
    }
    const hours = attendanceCount * 2;
    return { attendanceCount, hours, credits: hours / 20 };
  }, [hiasDraft.attendanceCount]);
  const countedSelectedCourses = useMemo(() => {
    const historicalCourseCodes = new Set(
      historicalRecords
        .map((record) => record.courseCode.trim())
        .filter(Boolean),
    );
    return selectedCourses.filter(
      (course) =>
        !(englishExemptionStatus === 'approved' && isEnglishCourse(course)) &&
        !historicalCourseCodes.has(course.code.trim()),
    );
  }, [englishExemptionStatus, historicalRecords, selectedCourses]);
  const selectedCredits = creditSummary.plannedCredits;
  const selectedCreditBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    countedSelectedCourses.forEach((course) => {
      totals.set(
        course.category,
        (totals.get(course.category) ?? 0) + course.credits,
      );
    });
    return [...totals.entries()].sort((left, right) => right[1] - left[1]);
  }, [countedSelectedCourses]);
  const selectedRequirementBreakdown = useMemo(() => {
    const totals = new Map<CourseRequirementType, number>();
    countedSelectedCourses.forEach((course) => {
      const requirementType = courseRequirementType(course);
      totals.set(
        requirementType,
        (totals.get(requirementType) ?? 0) + course.credits,
      );
    });
    return [...totals.entries()].sort((left, right) => right[1] - left[1]);
  }, [countedSelectedCourses, activeDesignations, activePlan]);
  const planCoreCourses = useMemo(
    () =>
      initialCourses.filter((course) =>
        activePlan.coreCourses.includes(course.name),
      ),
    [activePlan, initialCourses],
  );
  const planProfessionalCourses = useMemo(
    () =>
      initialCourses.filter((course) =>
        activePlan.professionalCourses.includes(course.name),
      ),
    [activePlan, initialCourses],
  );
  const planCourseCounts = useMemo(
    () =>
      getPlanCourseCounts({
        courses: countedSelectedCourses,
        plan: activePlan,
        designations: activeDesignations,
        historicalRecords,
      }),
    [
      activeDesignations,
      activePlan,
      countedSelectedCourses,
      historicalRecords,
    ],
  );
  const selectedPlanCoreCount = countedSelectedCourses.filter((course) =>
    activePlan.coreCourses.includes(course.name),
  ).length;
  const selectedPlanProfessionalCount = countedSelectedCourses.filter((course) =>
    activePlan.professionalCourses.includes(course.name),
  ).length;
  const examGroups = useMemo(
    () =>
      EXAM_BUCKETS.map((bucket) => ({
        ...bucket,
        courses: selectedCourses.filter(
          (course) => getExamBucket(course.examMode) === bucket.id,
        ),
      })),
    [selectedCourses],
  );
  const closedExamCount =
    examGroups.find((group) => group.id === 'closed')?.courses.length ?? 0;
  const examPressureMessage = !selectedCourses.length
    ? '选择课程后，这里会分析考核方式结构。'
    : closedExamCount >= 3
      ? `已选课程中有 ${closedExamCount} 门闭卷考试，建议预留集中复习时间。`
      : closedExamCount > 0
        ? `已选课程中有 ${closedExamCount} 门闭卷考试，其余考核可分散准备。`
        : '当前已选课程没有标注为闭卷考试，但仍需关注报告、实践和其他考核。';
  const programCourseGroups: Array<{
    title: string;
    courses: Course[];
    kind: 'core' | 'professional';
  }> = [
    { title: '本学期方案核心课', courses: planCoreCourses, kind: 'core' },
    {
      title: '本学期方案专业课',
      courses: planProfessionalCourses,
      kind: 'professional',
    },
  ];

  const conflictingIds = useMemo(() => {
    const result = new Set<string>();
    selectedCourses.forEach((course, index) => {
      selectedCourses.slice(index + 1).forEach((other) => {
        if (coursesConflict(course, other)) {
          result.add(course.id);
          result.add(other.id);
        }
      });
    });
    return result;
  }, [selectedCourses]);

  const conflictPairs = useMemo<ConflictPair[]>(() => {
    const pairs: ConflictPair[] = [];
    selectedCourses.forEach((course, index) => {
      selectedCourses.slice(index + 1).forEach((other) => {
        const slots = getConflictSlots(course, other);
        if (slots.length) pairs.push({ left: course, right: other, slots });
      });
    });
    return pairs;
  }, [selectedCourses]);

  const semesterMinimumTarget = /秋|春/.test(activeDataset.label)
    ? 10
    : null;
  const semesterEligibleCredits = countedSelectedCourses
    .filter(countsTowardSemesterMinimum)
    .reduce((sum, course) => sum + course.credits, 0);
  const semesterCreditGap =
    semesterMinimumTarget === null
      ? 0
      : Math.max(0, semesterMinimumTarget - semesterEligibleCredits);
  const selectedPublicRequiredDegreeCredits =
    creditSummary.publicRequiredDegreeCredits;
  const selectedPublicRequiredNonDegreeCredits =
    creditSummary.publicRequiredNonDegreeCredits;
  const selectedPublicElectiveCredits = creditSummary.publicElectiveCredits;
  const selectedInnovationCredits = creditSummary.innovationCredits;
  const selectedSportsCourses = countedSelectedCourses.filter(
    (course) => course.subject === '体育学',
  );
  const selectedDegreeCoreCount = planCourseCounts.coreCount;
  const selectedDegreeProfessionalCount = planCourseCounts.professionalCount;
  const unsetDesignationCount = countedSelectedCourses.filter(
    (course) => getCourseDesignation(course, activeDesignations, activePlan) === 'unset',
  ).length;
  const invalidDegreeCourses = selectedCourses.filter(
    (course) =>
      activeDesignations[course.code] === 'degree' &&
      getCourseRoleEligibility(course, activePlan).status === 'ineligible',
  );
  const publicElectiveTarget =
    activePlan.publicElectiveCredits + (activePlan.innovationCredits ?? 0);
  const publicRequiredDegreeTarget = activePlan.publicRequiredDegreeCredits ?? null;
  const publicRequiredNonDegreeTarget =
    activePlan.publicRequiredNonDegreeCredits ?? null;
  const checkupItems: CheckupItem[] = [
    {
      id: 'credits',
      title: '学期有效学分',
      value:
        semesterMinimumTarget === null
          ? `${formatCredits(semesterEligibleCredits)} 学分`
          : `${formatCredits(semesterEligibleCredits)} / ${semesterMinimumTarget} 学分`,
      detail:
        semesterMinimumTarget === null
          ? '当前学期未设置自动门槛，请以对应学期通知为准。'
          : 'HIAS 讲堂、科学前沿讲座和人文系列讲座不计入该门槛。',
      status:
        semesterMinimumTarget === null
          ? 'info'
          : semesterEligibleCredits >= semesterMinimumTarget
            ? 'pass'
            : 'attention',
    },
    {
      id: 'conflicts',
      title: '课程时间冲突',
      value: conflictPairs.length ? `${conflictPairs.length} 组冲突` : '无冲突',
      detail: conflictPairs.length
        ? '请返回课程列表查看冲突课程和可替代班次。'
        : '当前已选课程的星期、节次和教学周没有重叠。',
      status: conflictPairs.length ? 'attention' : 'pass',
    },
    {
      id: 'designation',
      title: '学位课属性',
      value: unsetDesignationCount
        ? `${unsetDesignationCount} 门未确定`
        : '全部已设置',
      detail: invalidDegreeCourses.length
        ? `${invalidDegreeCourses.map((course) => course.name).join('、')}只能作为非学位课。`
        : '请在下方逐门确认学位课或非学位课属性。',
      status:
        unsetDesignationCount || invalidDegreeCourses.length
          ? 'attention'
          : 'pass',
    },
    {
      id: 'core',
      title: '核心课作为学位课',
      value: `${selectedDegreeCoreCount} / ${activePlan.coreMinimum} 门`,
      detail: '这是培养阶段要求，不代表必须在当前学期一次完成。',
      status:
        selectedDegreeCoreCount >= activePlan.coreMinimum ? 'pass' : 'info',
    },
    {
      id: 'professional',
      title: '专业课作为学位课',
      value: `${selectedDegreeProfessionalCount} / ${activePlan.professionalMinimum} 门`,
      detail: '仅统计当前培养方向课程库中已标记为学位课的课程。',
      status:
        selectedDegreeProfessionalCount >= activePlan.professionalMinimum
          ? 'pass'
          : 'info',
    },
    {
      id: 'public-required-degree',
      title: '公共必修学位课',
      value:
        publicRequiredDegreeTarget === null
          ? `${formatCredits(selectedPublicRequiredDegreeCredits)} 学分`
          : `${formatCredits(selectedPublicRequiredDegreeCredits)} / ${publicRequiredDegreeTarget} 学分`,
      detail: '公共必修学位课与专业学位课分开统计；英语免修仍按免修状态处理。',
      status:
        publicRequiredDegreeTarget === null
          ? 'info'
          : selectedPublicRequiredDegreeCredits >= publicRequiredDegreeTarget
            ? 'pass'
            : 'info',
    },
    {
      id: 'public-required-non-degree',
      title: '公共必修非学位课',
      value:
        publicRequiredNonDegreeTarget === null
          ? `${formatCredits(selectedPublicRequiredNonDegreeCredits)} 学分`
          : `${formatCredits(selectedPublicRequiredNonDegreeCredits)} / ${publicRequiredNonDegreeTarget} 学分`,
      detail: '工程硕士必须修读《工程伦理》，但该课程不计入任何学位课学分。',
      status:
        publicRequiredNonDegreeTarget === null
          ? 'info'
          : selectedPublicRequiredNonDegreeCredits >= publicRequiredNonDegreeTarget
            ? 'pass'
            : 'info',
    },
    {
      id: 'public-elective',
      title: '公共选修课',
      value: `${formatCredits(selectedPublicElectiveCredits)} / ${formatCredits(publicElectiveTarget)} 学分`,
      detail:
        activePlan.innovationCredits === null
          ? '按当前培养方向的公共选修课要求统计。'
          : `公共选修合计要求包含 ${formatCredits(activePlan.innovationCredits)} 学分创新创业模块，实际学分只累计一次。`,
      status:
        selectedPublicElectiveCredits >= publicElectiveTarget ? 'pass' : 'info',
    },
    ...(activePlan.innovationCredits === null
      ? []
      : [
          {
            id: 'innovation',
            title: '创新创业模块',
            value: `${formatCredits(selectedInnovationCredits)} / ${formatCredits(activePlan.innovationCredits)} 学分`,
            detail: '按照选课须知中的创新创业模块课程名单识别。',
            status:
              selectedInnovationCredits >= activePlan.innovationCredits
                ? ('pass' as const)
                : ('info' as const),
          },
        ]),
    {
      id: 'sports',
      title: '体育类公共选修课',
      value: `${selectedSportsCourses.length} / 1 门`,
      detail:
        selectedSportsCourses.length > 1
          ? `已选择：${selectedSportsCourses.map((course) => course.name).join('、')}。`
          : '选课须知规定体育类公共选修课每学期限选 1 门。',
      status: selectedSportsCourses.length <= 1 ? 'pass' : 'attention',
    },
  ];
  const passedCheckCount = checkupItems.filter(
    (item) => item.status === 'pass',
  ).length;
  const attentionCheckCount = checkupItems.filter(
    (item) => item.status === 'attention',
  ).length;

  const conflictPeers = useMemo(() => {
    const peers = new Map<string, Course[]>();
    conflictPairs.forEach(({ left, right }) => {
      peers.set(left.id, [...(peers.get(left.id) ?? []), right]);
      peers.set(right.id, [...(peers.get(right.id) ?? []), left]);
    });
    return peers;
  }, [conflictPairs]);

  const currentWeekConflicts = useMemo(() => {
    const result = new Set<string>();
    selectedCourses.forEach((course, index) => {
      selectedCourses.slice(index + 1).forEach((other) => {
        if (courseConflictsInWeek(course, other, week)) {
          result.add(course.id);
          result.add(other.id);
        }
      });
    });
    return result;
  }, [selectedCourses, week]);

  const filteredCourses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return initialCourses.filter((course) => {
      const matchesQuery =
        !normalized ||
        [
          course.name,
          course.englishName,
          course.code,
          course.teacher,
          course.college,
          course.subject,
          ...course.schedules.map((schedule) => schedule.room),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalized);
      const matchesCollege =
        college === '全部院系' || course.college === college;
      const matchesSubject =
        subject === '全部学科/专业' || course.subject === subject;
      const matchesCategory =
        category === '全部类别' || course.category === category;
      const matchesDay =
        day === '全部星期' ||
        course.schedules.some((schedule) => schedule.day === day);
      const matchesSelected = !onlySelected || selectedIds.includes(course.id);
      const matchesConflict =
        !onlyNoConflict ||
        selectedCourses.every(
          (selected) =>
            selected.id === course.id || !coursesConflict(course, selected),
        );
      return (
        matchesQuery &&
        matchesCollege &&
        matchesSubject &&
        matchesCategory &&
        matchesDay &&
        matchesSelected &&
        matchesConflict
      );
    });
  }, [
    initialCourses,
    query,
    college,
    subject,
    category,
    day,
    onlySelected,
    onlyNoConflict,
    selectedIds,
    selectedCourses,
  ]);

  const requirementGaps = useMemo(() => {
    return {
      publicRequiredDegree: Math.max(
        0,
        (publicRequiredDegreeTarget ?? 0) -
          creditSummary.publicRequiredDegreeCredits,
      ),
      publicRequiredNonDegree: Math.max(
        0,
        (publicRequiredNonDegreeTarget ?? 0) -
          creditSummary.publicRequiredNonDegreeCredits,
      ),
      degreeCredits: Math.max(
        0,
        activePlan.degreeCourseCredits -
          creditSummary.professionalDegreeCredits,
      ),
      nonDegreeCredits: Math.max(
        0,
        (activePlan.professionalNonDegreeCredits ?? 0) -
          creditSummary.professionalElectiveCredits,
      ),
      publicElective: Math.max(
        0,
        publicElectiveTarget - creditSummary.publicElectiveCredits,
      ),
      innovation: Math.max(
        0,
        (activePlan.innovationCredits ?? 0) - creditSummary.innovationCredits,
      ),
      coreCount: Math.max(0, activePlan.coreMinimum - selectedDegreeCoreCount),
      professionalCount: Math.max(
        0,
        activePlan.professionalMinimum - selectedDegreeProfessionalCount,
      ),
    };
  }, [
    activePlan,
    creditSummary,
    publicRequiredDegreeTarget,
    publicRequiredNonDegreeTarget,
    publicElectiveTarget,
    selectedDegreeCoreCount,
    selectedDegreeProfessionalCount,
  ]);

  const recommendationCandidates = useMemo(() => {
    if (!selectedCourses.length) return [];
    const candidates = initialCourses
      .filter((course) => !selectedIds.includes(course.id))
      .filter((course) =>
        selectedCourses.every((selected) => !coursesConflict(course, selected)),
      )
      .filter((course) =>
        selectedCourses.every(
          (selected) => courseFamilyKey(selected) !== courseFamilyKey(course),
        ),
      )
      .map((course) => {
        const reasons: string[] = [];
        const requirementType = getCourseRequirementType(
          course,
          getCourseDesignation(course, {}, activePlan),
          activePlan,
        );
        const degreeEligibility = getDegreeEligibility(course, activePlan);
        const inCore =
          degreeEligibility.status === 'eligible' &&
          ['subject-core', 'professional-core'].includes(
            getCourseCodeCategory(course.code),
          );
        const inProfessional =
          degreeEligibility.status === 'eligible' &&
          getCourseCodeCategory(course.code) === 'professional';
        if (
          semesterCreditGap > 0 &&
          countsTowardSemesterMinimum(course)
        ) {
          reasons.push(
            `可补本学期有效选课学分缺口 ${formatCredits(semesterCreditGap)} 学分（秋季/春季目标不少于 10 学分）`,
          );
        }
        if (
          requirementGaps.publicRequiredDegree > 0 &&
          requirementType === 'publicRequiredDegree'
        ) {
          reasons.push(
            `可补公共必修学位课 ${formatCredits(requirementGaps.publicRequiredDegree)} 学分缺口`,
          );
        }
        if (
          requirementGaps.publicRequiredNonDegree > 0 &&
          requirementType === 'publicRequiredNonDegree'
        ) {
          reasons.push(
            `可补公共必修非学位课 ${formatCredits(requirementGaps.publicRequiredNonDegree)} 学分缺口`,
          );
        }
        if (requirementGaps.innovation > 0 && isInnovationCourse(course)) {
          reasons.push('可补创新创业模块；该学分同时属于公共选修归属，不重复累计');
        } else if (
          requirementGaps.publicElective > 0 &&
          requirementType === 'publicElective' &&
          !isInnovationCourse(course)
        ) {
          reasons.push(`可补公共选修 ${formatCredits(requirementGaps.publicElective)} 学分缺口`);
        }
        if (
          (requirementGaps.coreCount > 0 || requirementGaps.degreeCredits > 0) &&
          inCore
        ) {
          reasons.push(
            `培养方案核心课候选；核心课门数还差 ${requirementGaps.coreCount} 门，加入后仍需确认学位属性`,
          );
        }
        if (
          (requirementGaps.professionalCount > 0 || requirementGaps.degreeCredits > 0) &&
          inProfessional
        ) {
          reasons.push(
            `培养方案专业课候选；专业课门数还差 ${requirementGaps.professionalCount} 门，加入后仍需确认学位属性`,
          );
        }
        if (
          requirementGaps.nonDegreeCredits > 0 &&
          requirementType === 'professionalElective'
        ) {
          reasons.push('只能作为非学位课，可补专业选修课缺口');
        }
        if (
          requirementGaps.coreCount === 0 &&
          requirementGaps.professionalCount === 0 &&
          requirementGaps.degreeCredits === 0 &&
          requirementGaps.publicRequiredDegree === 0 &&
          requirementGaps.publicRequiredNonDegree === 0 &&
          requirementGaps.publicElective === 0 &&
          requirementGaps.innovation === 0 &&
          course.subject === '体育学' &&
          selectedSportsCourses.length === 0
        ) {
          reasons.push('体育类公共选修每学期限选一门；当前可作为互斥备选');
        }
        return { course, reasons };
      })
      .filter((item) => item.reasons.length > 0)
      .sort((left, right) => right.reasons.length - left.reasons.length);
    const seenCourseFamilies = new Set<string>();
    const uniqueCandidates = candidates.filter(({ course }) => {
      const family = courseFamilyKey(course);
      if (seenCourseFamilies.has(family)) return false;
      seenCourseFamilies.add(family);
      return true;
    });
    return uniqueCandidates.slice(0, 6);
  }, [
    activePlan,
    initialCourses,
    publicElectiveTarget,
    requirementGaps,
    semesterCreditGap,
    selectedCourses,
    selectedIds,
    selectedSportsCourses.length,
  ]);

  const recommendationCombination = useMemo(() => {
    const combination: Course[] = [];
    let combinationCredits = 0;
    for (const item of recommendationCandidates) {
      if (
        combination.some(
          (course) => courseFamilyKey(course) === courseFamilyKey(item.course),
        ) ||
        combination.some((course) => coursesConflict(course, item.course))
      ) {
        continue;
      }
      combination.push(item.course);
      combinationCredits += item.course.credits;
      if (combination.length === 4) break;
      if (semesterCreditGap > 0 && combinationCredits >= semesterCreditGap) {
        break;
      }
    }
    return combination;
  }, [recommendationCandidates, semesterCreditGap]);

  useEffect(() => {
    if (!storageReady || !recommendationPromptRequestRef.current) return;
    recommendationPromptRequestRef.current = false;
    if (selectedCourses.length && recommendationCandidates.length) {
      setRecommendationDialogOpen(true);
    }
  }, [recommendationCandidates.length, selectedCourses.length, storageReady]);

  function toggleCourse(id: string, options?: { prompt?: boolean }) {
    const course = initialCourses.find((item) => item.id === id);
    if (!course) return;
    const selectedSameCourse = selectedCourses.find(
      (selected) =>
      selected.id !== course.id &&
        courseFamilyKey(selected) === courseFamilyKey(course),
    );
    if (!selectedIds.includes(id) && options?.prompt !== false) {
      recommendationPromptRequestRef.current = true;
    }
    if (
      !selectedIds.includes(id) &&
      getCourseRoleEligibility(course, activePlan).status === 'ineligible' &&
      !activeDesignations[course.code]
    ) {
      setCourseDesignation(course, 'non-degree');
    }
    setSelectedIdsForActive((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (selectedSameCourse) {
        setSelectionMessage(
          `已将同一课程的 ${selectedSameCourse.name} 替换为 ${course.name}；同一课程不同班次按备选处理。`,
        );
        return [
          ...current.filter((item) => item !== selectedSameCourse.id),
          id,
        ];
      }
      return [...current, id];
    });
  }

  function replaceCourse(sourceId: string, replacementId: string) {
    const source = initialCourses.find((course) => course.id === sourceId);
    const replacement = initialCourses.find(
      (course) => course.id === replacementId,
    );
    if (source && replacement) {
      const designation = courseDesignation(source);
      setDesignationsByTerm((current) => {
        const next = { ...current[activeTermId] };
        delete next[source.code];
        next[replacement.code] =
          getCourseRoleEligibility(replacement, activePlan).status === 'ineligible'
          ? 'non-degree'
          : designation;
        return { ...current, [activeTermId]: next };
      });
    }
    setSelectedIdsForActive((current) => [
      ...current.filter((id) => id !== sourceId && id !== replacementId),
      replacementId,
    ]);
  }

  function getConflictAlternatives(source: Course) {
    const baseName = courseFamilyKey(source);
    return initialCourses.filter((candidate) => {
      if (
        candidate.id === source.id ||
        courseFamilyKey(candidate) !== baseName
      ) {
        return false;
      }
      return selectedCourses.every(
        (selected) =>
          selected.id === source.id ||
          selected.id === candidate.id ||
          !coursesConflict(candidate, selected),
      );
    });
  }

  function clearFilters() {
    setQuery('');
    setCollege('全部院系');
    setSubject('全部学科/专业');
    setCategory('全部类别');
    setDay('全部星期');
    setOnlySelected(false);
    setOnlyNoConflict(false);
  }

  function switchTerm(termId: string) {
    setActiveTermId(termId);
    clearFilters();
    setDetailCourse(null);
    setDataError('');
    setDataMessage('');
  }

  function clearSelectedCourses() {
    if (!selectedCourses.length) return;
    const confirmed = window.confirm(
      '确定清空“' + activeDataset.label + '”的全部已选课程吗？',
    );
    if (!confirmed) return;
    setSelectedIdsForActive([]);
    setDesignationsByTerm((current) => ({
      ...current,
      [activeTermId]: {},
    }));
  }

  function exportSelected() {
    const header = [
      '课程名称',
      '星期',
      '开始节数',
      '结束节数',
      '老师',
      '地点',
      '周数',
    ];
    const rows = selectedCourses.flatMap((course) =>
      course.schedules.length
        ? course.schedules.map((schedule) => [
            course.name,
            schedule.dayIndex >= 0 ? schedule.dayIndex + 1 : '',
            schedule.start || '',
            schedule.end || '',
            course.teacher,
            schedule.room,
            templateWeekText(schedule),
          ])
        : [[course.name, '', '', '', course.teacher, '', '']],
    );
    const csv = `\ufeff${[header, ...rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\n')}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '我的课程表.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadJson(fileName: string, payload: unknown) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportBackup() {
    const payload: BackupPayload = {
      version: BACKUP_VERSION,
      app: 'HIAS-CSA',
      savedAt: new Date().toISOString(),
      activeTermId,
      customDatasets,
      selectedByTerm,
      designationsByTerm,
      programPlans: customProgramPlans,
      historicalRecords,
      englishExemptionStatus,
    };
    downloadJson('HIAS-CSA-备份-v2.json', payload);
    setDataManagementMessage('备份已导出，包含选课、属性、培养方案、历史记录和免修状态。');
    setDataManagementError('');
  }

  function parseBackupPayload(raw: unknown): BackupPayload {
    if (!raw || typeof raw !== 'object') throw new Error('备份文件不是对象。');
    const value = raw as Partial<BackupPayload>;
    if (value.app !== 'HIAS-CSA' || value.version !== BACKUP_VERSION) {
      throw new Error(`仅支持 HIAS-CSA v${BACKUP_VERSION} 备份文件。`);
    }
    if (
      !Array.isArray(value.customDatasets) ||
      !value.customDatasets.every(
        (dataset) =>
          dataset &&
          typeof dataset.id === 'string' &&
          typeof dataset.label === 'string' &&
          Array.isArray(dataset.courses) &&
          dataset.courses.every(isCourse),
      )
    ) {
      throw new Error('备份中的课程数据格式不完整。');
    }
    if (
      !value.selectedByTerm ||
      typeof value.selectedByTerm !== 'object' ||
      !value.designationsByTerm ||
      typeof value.designationsByTerm !== 'object' ||
      !Array.isArray(value.programPlans) ||
      !value.programPlans.every(isProgramPlan) ||
      !Array.isArray(value.historicalRecords) ||
      !value.historicalRecords.every(
        (record) =>
          record &&
          typeof record.id === 'string' &&
          typeof record.term === 'string' &&
          typeof record.courseName === 'string' &&
          typeof record.courseCode === 'string' &&
          typeof record.credits === 'number' &&
          typeof record.category === 'string',
      ) ||
      !['normal', 'planned', 'approved'].includes(value.englishExemptionStatus || '')
    ) {
      throw new Error('备份中的选课、培养方案或历史记录格式不完整。');
    }
    return value as BackupPayload;
  }

  async function handleBackupImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setDataManagementError('');
    setDataManagementMessage('');
    try {
      const payload = parseBackupPayload(JSON.parse(await file.text()));
      const currentCourseIds = new Set(
        [
          ...availableDatasets,
          ...payload.customDatasets,
        ].flatMap((dataset) => dataset.courses.map((course) => course.id)),
      );
      const importedSelected = Object.values(payload.selectedByTerm).flat();
      const unmatched = importedSelected.filter((id) => !currentCourseIds.has(id));
      const existingDatasetIds = new Set(availableDatasets.map((dataset) => dataset.id));
      const added = payload.customDatasets.filter(
        (dataset) => !existingDatasetIds.has(dataset.id),
      ).length;
      const replaced = payload.customDatasets.length - added;
      setRestorePreview({
        payload,
        summary: [
          `将新增 ${added} 个课程数据集，替换 ${replaced} 个同名数据集。`,
          `将恢复 ${importedSelected.length} 条按学期保存的选课记录。`,
          unmatched.length
            ? `${unmatched.length} 条选课记录在当前内置数据中无法匹配，应用后会保留记录但不加入当前课程表。`
            : '所有备份中的课程记录都能在当前数据中匹配。',
          `将恢复 ${payload.historicalRecords.length} 条历史记录和英语免修状态。`,
        ],
      });
    } catch (error) {
      setDataManagementError(
        error instanceof Error ? error.message : '备份读取失败，请检查文件。',
      );
    }
  }

  function applyRestore() {
    if (!restorePreview) return;
    const { payload } = restorePreview;
    setCustomDatasets(payload.customDatasets);
    setActiveTermId(
      (TERM_TEMPLATE_IDS.has(payload.activeTermId) ||
        payload.customDatasets.some((dataset) => dataset.id === payload.activeTermId))
        ? payload.activeTermId
        : DEFAULT_TERM_ID,
    );
    setSelectedByTerm(payload.selectedByTerm);
    setDesignationsByTerm(payload.designationsByTerm);
    setCustomProgramPlans(payload.programPlans);
    setHistoricalRecords(payload.historicalRecords);
    setEnglishExemptionStatus(payload.englishExemptionStatus);
    setRestorePreview(null);
    setDataManagementMessage('备份已恢复；原有内置课程数据仍保留，无法匹配的记录未被删除。');
  }

  function addHistoricalRecord() {
    const credits = Number(historyDraft.credits);
    if (!Number.isFinite(credits) || credits <= 0) {
      setDataManagementError('请填写大于 0 的历史学分。');
      return;
    }
    const matchedCourse = initialCourses.find(
      (course) => course.code === historyDraft.courseCode.trim(),
    );
    setHistoricalRecords((current) => [
      ...current,
      {
        id: `history-${Date.now()}`,
        term: historyDraft.term.trim() || '学期待补充',
        courseName: historyDraft.courseName.trim(),
        courseCode: historyDraft.courseCode.trim(),
        credits,
        category: historyDraft.category,
        subject: matchedCourse?.subject,
        designation: historyDraft.designation,
        module: historyDraft.module,
        courseCount: historyDraft.courseName.trim() ? 1 : null,
        source: '用户手动录入',
      },
    ]);
    setHistoryDraft((current) => ({
      ...current,
      courseName: '',
      courseCode: '',
      credits: '',
    }));
    setDataManagementError('');
    setDataManagementMessage('历史记录已加入，统计会立即更新。');
  }

  function addHiasRecord() {
    const attendanceCount = Number(hiasDraft.attendanceCount);
    if (!Number.isInteger(attendanceCount) || attendanceCount <= 0) {
      setDataManagementError('请填写大于 0 的整数参加次数。');
      return;
    }
    const hours = attendanceCount * 2;
    const credits = hours / 20;
    setHistoricalRecords((current) => [
      ...current,
      {
        id: `history-hias-${Date.now()}`,
        term: hiasDraft.term.trim() || '学期待补充',
        courseName: 'HIAS讲堂',
        courseCode: 'HIAS-LECTURE',
        credits,
        category: '专业选修课',
        subject: '人文系列讲座',
        designation: 'non-degree',
        module: 'hias',
        hours,
        attendanceCount,
        courseCount: 0,
        source: '用户手动录入·按 2 学时/次、20 学时/学分换算',
      },
    ]);
    setHiasDraft({ term: '', attendanceCount: '' });
    setDataManagementError('');
    setDataManagementMessage(
      `已加入 ${attendanceCount} 次 HIAS 讲堂（${hours} 学时，${formatCredits(credits)} 学分），归入专业非学位课。`,
    );
  }

  function setEnglishStatus(status: ExemptionStatus) {
    setEnglishExemptionStatus(status);
    setSelectionMessage(
      status === 'normal'
        ? '已设置为未获得英语免修免考资格；已选英语课程仍保留。'
        : status === 'planned'
          ? '旧版备份中的拟申请状态按未获得英语免修免考资格处理；已选英语课程仍保留。'
          : '已标记为已获得英语免修免考资格：按培养要求计入，已选英语课程保留但不重复计分，请按学校审核结果核对。',
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f7f2] text-slate-900">
      <div className="mx-auto max-w-[1380px] px-3 py-4 sm:px-5 lg:px-7">
        <section className="hero-panel relative overflow-hidden rounded-[26px] border border-[#dce5de] px-5 py-4 shadow-[0_18px_48px_rgba(61,83,72,.09)] sm:px-7 sm:py-5">
          <div className="hero-doodle hero-doodle-one" />
          <div className="hero-doodle hero-doodle-two" />
          <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch">
            <div>
              <div className="brand-lockup">
                <div aria-hidden="true" className="brand-mark">
                  HIAS-CSA
                </div>
                <span>研究生预选课辅助工具</span>
              </div>
              <p className="mb-3 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#dceee8]">
                {activeTermDisplayLabel} · HIAS
              </p>
              <h1 className="max-w-3xl text-[2rem] font-bold leading-[1.18] tracking-[-0.035em] text-white sm:text-[2.45rem]">
                {activeTermDisplayLabel}预选课助手
              </h1>
              <p className="mt-2 max-w-2xl text-[0.86rem] leading-6 text-[#d8e6e2] sm:text-[0.92rem]">
                {heroDescription}
              </p>
              <div className="hero-meta mt-3">
                <span>
                  <Users /> {audienceLabel}
                </span>
                <span>
                  <FileSpreadsheet /> {activeTermDisplayLabel}课表数据
                </span>
                <span>
                  <BookOpen /> {initialCourses.length} 门课程
                </span>
                <span>
                  <GraduationCap /> {subjects.length} 个学科/专业
                </span>
                <span>
                  <ClipboardList /> {availableProgramPlans.length} 个培养方向
                </span>
                <span>
                  <Sparkles /> 自动冲突检查
                </span>
              </div>
            </div>
            <aside className="plan-summary">
              <div>
                <p>MY PRESELECTION</p>
                <div className="credit-spotlight mt-2">
                  <div className="flex items-end gap-2">
                    <strong>{formatCredits(selectedCredits)}</strong>
                    <span>本学期预选学分</span>
                  </div>
                  <div className="plan-course-count">
                    已选 <b>{selectedCourses.length}</b> 门课程
                  </div>
                  {creditSummary.duplicatePlannedCourseCount > 0 && (
                    <p className="mt-2 text-xs leading-5 text-amber-700">
                      有 {creditSummary.duplicatePlannedCourseCount} 门课程已在历史记录中，预选学分已避免重复累计。
                    </p>
                  )}
                </div>
                {selectedCreditBreakdown.length > 0 ? (
                  <>
                    <div className="mt-3 text-xs font-semibold text-slate-500">
                      已选类别明细
                    </div>
                    <div className="credit-breakdown mt-2">
                      {selectedCreditBreakdown.map(([label, credits]) => (
                        <span key={label}>
                          {label} {formatCredits(credits)}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="credit-empty mt-4">
                    选择课程后，这里会汇总学分
                  </div>
                )}
                {selectedRequirementBreakdown.length > 0 && (
                  <>
                    <div className="mt-3 text-xs font-semibold text-slate-500">
                      培养要求归属
                    </div>
                    <div className="credit-breakdown mt-2">
                      {selectedRequirementBreakdown.map(([type, credits]) => (
                        <span key={type}>
                          {getCourseRequirementTypeLabel(type)}{' '}
                          {formatCredits(credits)}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="mt-6 grid grid-cols-2 gap-2.5">
                <Button
                  className="h-11 rounded-xl bg-[#315f57] text-white hover:bg-[#274f48]"
                  onClick={() => setView('timetable')}
                >
                  <CalendarDays /> 我的课表
                </Button>
                <Button
                  className="h-11 rounded-xl border-[#d6ded9] bg-white text-[#49645e] hover:bg-[#f4f7f5]"
                  onClick={exportSelected}
                  disabled={!selectedCourses.length}
                  variant="outline"
                >
                  <Download /> 导出 CSV
                </Button>
              </div>
              <p className="mt-2 text-[0.72rem] leading-5 text-slate-500">
                导出格式符合 WakeUp 课程表模板；确认课程安排无误后再导入。
              </p>
              <Button
                className="mt-2 h-9 w-full rounded-lg border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                disabled={!selectedCourses.length}
                onClick={clearSelectedCourses}
                variant="outline"
              >
                <Trash2 /> 清空当前学期已选课程
              </Button>
            </aside>
          </div>
        </section>

        <section className="relative z-20 mt-3.5 rounded-[22px] border border-[#e1e5df] bg-white/94 p-3.5 shadow-[0_14px_40px_rgba(61,83,72,.07)] backdrop-blur sm:p-4">
            <div className="mb-3 flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <label
                className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-500"
                htmlFor="term-select"
              >
                选择浏览的学期
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <NativeSelect
                  aria-label="切换课程数据学期"
                  className="w-full min-w-[190px] sm:w-auto [&>select]:h-10"
                  id="term-select"
                  onChange={(event) => switchTerm(event.target.value)}
                  value={activeTermId}
                >
                  {availableDatasets.map((dataset) => (
                    <NativeSelectOption key={dataset.id} value={dataset.id}>
                      {dataset.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <span className="text-xs leading-5 text-slate-500">
                  已选课程按学期独立保存
                </span>
                <span className="text-xs leading-5 text-slate-400">
                  数据版本：
                  {formatUpdatedAt(activeDataset.updatedAt) || '内置参考数据'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <div
                aria-label="英语免修免考状态"
                className="english-status-compact"
              >
                <span className="english-status-compact-title">英语免修免考</span>
                <label className="english-status-toggle">
                  <input
                    aria-label="已获得英语免修免考资格"
                    checked={englishExemptionStatus === 'approved'}
                    onChange={(event) =>
                      setEnglishStatus(event.target.checked ? 'approved' : 'normal')
                    }
                    type="checkbox"
                  />
                  <span>已获得免修免考资格</span>
                </label>
                <Badge
                  className={`english-status-badge english-status-badge-${englishStatusTone(englishExemptionStatus)}`}
                  variant="secondary"
                >
                  {englishStatusLabel(englishExemptionStatus)}
                </Badge>
              </div>
              <Button
                className="h-10 rounded-xl border-blue-200 bg-white px-4 text-blue-700 hover:bg-blue-50"
                onClick={() => setView('data')}
                variant="outline"
              >
                <RefreshCw /> 数据管理
              </Button>
            </div>
          </div>
          {(dataMessage || dataError) && view !== 'data' && (
            <div
              className={`mb-3 rounded-xl border px-3 py-2.5 text-sm leading-6 ${
                dataError
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
              role={dataError ? 'alert' : 'status'}
            >
              {dataError || dataMessage}
            </div>
          )}
          {selectionMessage && (
            <output className="mb-3 block rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-6 text-amber-800">
              {selectionMessage}
            </output>
          )}
          <div
            className={`english-status-banner english-status-banner-${englishStatusTone(englishExemptionStatus)}`}
            role="status"
          >
            <div className="english-status-banner-main">
              {englishExemptionStatus === 'approved' ? <CheckCircle2 /> : <TriangleAlert />}
              <div>
                <strong>英语免修免考资格：{englishStatusLabel(englishExemptionStatus)}</strong>
                <span>{englishQualificationDetail}</span>
              </div>
            </div>
            <span className="english-status-banner-credit">
              {englishExemptionStatus === 'approved'
                ? `培养要求 +${formatCredits(englishQualificationCredits)} 学分`
                : '培养要求暂不计入'}
            </span>
          </div>
          <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(260px,1.35fr)_repeat(4,minmax(138px,.62fr))_auto]">
            <label className="relative block" htmlFor="course-search">
              <span className="sr-only">搜索课程</span>
              <Search className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="course-search"
                className="h-11 rounded-xl border-slate-200 bg-slate-50/80 pl-10 shadow-none focus-visible:border-blue-400"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索课程名 / 编码 / 教师 / 教室…"
                value={query}
              />
            </label>
            <NativeSelect
              aria-label="按开课院系筛选"
              className="w-full [&>select]:h-11"
              onChange={(event) => setCollege(event.target.value)}
              value={college}
            >
              <NativeSelectOption value="全部院系">全部院系</NativeSelectOption>
              {colleges.map((item) => (
                <NativeSelectOption key={item} value={item}>
                  {item}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="按所属学科或专业筛选"
              className="w-full [&>select]:h-11"
              onChange={(event) => setSubject(event.target.value)}
              value={subject}
            >
              <NativeSelectOption value="全部学科/专业">
                全部学科/专业
              </NativeSelectOption>
              {subjects.map((item) => (
                <NativeSelectOption key={item} value={item}>
                  {item}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="按课程类别筛选"
              className="w-full [&>select]:h-11"
              onChange={(event) => setCategory(event.target.value)}
              value={category}
            >
              <NativeSelectOption value="全部类别">
                全部课程类别
              </NativeSelectOption>
              {categories.map((item) => (
                <NativeSelectOption key={item} value={item}>
                  {item}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="按星期筛选"
              className="w-full [&>select]:h-11"
              onChange={(event) => setDay(event.target.value)}
              value={day}
            >
              <NativeSelectOption value="全部星期">全部星期</NativeSelectOption>
              {DAYS.map((item) => (
                <NativeSelectOption key={item} value={item}>
                  {item}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              className="h-11 rounded-xl border-slate-200 px-4 text-slate-600"
              onClick={clearFilters}
              variant="outline"
            >
              <X /> 清空筛选
            </Button>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className={
                  onlySelected
                    ? 'filter-chip filter-chip-active'
                    : 'filter-chip'
                }
                onClick={() => setOnlySelected((value) => !value)}
                variant="outline"
              >
                <Star className={onlySelected ? 'fill-current' : ''} /> 仅看已选
              </Button>
              <Button
                className={
                  onlyNoConflict
                    ? 'filter-chip filter-chip-active'
                    : 'filter-chip'
                }
                onClick={() => setOnlyNoConflict((value) => !value)}
                variant="outline"
              >
                <Zap /> 不与已选冲突
              </Button>
              {conflictingIds.size > 0 && (
                <Badge
                  className="h-8 rounded-lg bg-rose-50 px-3 text-rose-700"
                  variant="secondary"
                >
                  {conflictPairs.length} 组课程冲突
                </Badge>
              )}
            </div>
            <div className="flex w-full flex-wrap items-center gap-2.5 md:w-auto md:justify-end">
              <div className="selection-credit-pill" aria-live="polite">
                <Sparkles />
                <span>本学期预选</span>
                <strong>{formatCredits(selectedCredits)}</strong>
                <b>学分</b>
                <small>{selectedCourses.length} 门课</small>
              </div>
              <Badge
                className={`english-status-top-badge english-status-badge-${englishStatusTone(englishExemptionStatus)}`}
                variant="secondary"
              >
                英语免修免考：{englishExemptionStatus === 'approved' ? '已获得' : '未获得'}
              </Badge>
              {selectedCourses.length > 0 && recommendationCandidates.length > 0 && (
                <Button
                  className="h-10 rounded-xl border-amber-200 bg-amber-50 px-3 text-amber-800 hover:bg-amber-100"
                  onClick={() => setRecommendationDialogOpen(true)}
                  variant="outline"
                >
                  <Sparkles /> 补充建议 {recommendationCandidates.length}
                </Button>
              )}
              <div className="grid w-full grid-cols-2 rounded-xl bg-slate-100 p-1 sm:w-auto sm:flex">
                <button
                  className={`view-tab ${view === 'guide' ? 'view-tab-active' : ''}`}
                  onClick={() => setView('guide')}
                  type="button"
                >
                  <ClipboardList /> 培养要求
                </button>
                <button
                  className={`view-tab ${view === 'courses' ? 'view-tab-active' : ''}`}
                  onClick={() => setView('courses')}
                  type="button"
                >
                  <BookOpen /> 课程列表
                </button>
                <button
                  className={`view-tab ${view === 'checkup' ? 'view-tab-active' : ''}`}
                  onClick={() => setView('checkup')}
                  type="button"
                >
                  <ShieldCheck /> 选课体检
                </button>
                <button
                  className={`view-tab ${view === 'exams' ? 'view-tab-active' : ''}`}
                  onClick={() => setView('exams')}
                  type="button"
                >
                  <BarChart3 /> 考试压力
                </button>
                <button
                  className={`view-tab ${view === 'timetable' ? 'view-tab-active' : ''}`}
                  onClick={() => setView('timetable')}
                  type="button"
                >
                  <CalendarDays /> 模拟课表
                </button>
                <button
                  className={`view-tab ${view === 'notice' ? 'view-tab-active' : ''}`}
                  onClick={() => setView('notice')}
                  type="button"
                >
                  <Info /> 选课须知
                </button>
                <button
                  className={`view-tab ${view === 'data' ? 'view-tab-active' : ''}`}
                  onClick={() => setView('data')}
                  type="button"
                >
                  <ShieldCheck /> 数据管理
                </button>
              </div>
            </div>
          </div>

          {conflictPairs.length > 0 && (
            <div className="conflict-panel mt-4" role="alert">
              <div className="conflict-panel-title">
                <Zap />
                <div>
                  <strong>发现 {conflictPairs.length} 组时间冲突</strong>
                  <span>下面这些课程不能同时按当前安排上课</span>
                </div>
              </div>
              <div className="conflict-list">
                {conflictPairs.map(({ left, right, slots }) => {
                  const alternatives = [left, right]
                    .map((source) => ({
                      source,
                      courses: getConflictAlternatives(source),
                    }))
                    .filter((group) => group.courses.length > 0);
                  return (
                    <div
                      className="conflict-row"
                      key={`${left.id}-${right.id}`}
                    >
                      <div className="conflict-courses">
                        <button
                          onClick={() => setDetailCourse(left)}
                          type="button"
                        >
                          {left.name}
                        </button>
                        <span>与</span>
                        <button
                          onClick={() => setDetailCourse(right)}
                          type="button"
                        >
                          {right.name}
                        </button>
                        <strong>冲突</strong>
                      </div>
                      <div className="conflict-slots">
                        {slots.map((slot, index) => (
                          <span key={`${formatConflictSlot(slot)}-${index}`}>
                            <Clock3 /> {formatConflictSlot(slot)}
                          </span>
                        ))}
                      </div>
                      {alternatives.length > 0 ? (
                        <div className="conflict-alternatives">
                          <div className="conflict-alternatives-title">
                            <Repeat2 /> 无冲突替代班次
                          </div>
                          {alternatives.map(({ source, courses }) => (
                            <div className="alternative-group" key={source.id}>
                              <span>替换 {source.name}</span>
                              <div>
                                {courses.slice(0, 4).map((candidate) => (
                                  <button
                                    key={candidate.id}
                                    onClick={() =>
                                      replaceCourse(source.id, candidate.id)
                                    }
                                    type="button"
                                  >
                                    换成 {candidate.name}
                                    <small>
                                      {candidate.schedules
                                        .map((item) => item.periodText)
                                        .join('、')}
                                    </small>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                  </div>
                ) : (
                        <div className="conflict-no-alternative">
                          暂无可直接替换的同课无冲突班次
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {view === 'courses' ? (
          <section className="py-6">
            <div className="section-heading mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p>COURSE RESULTS</p>
                <h2>找到 {filteredCourses.length} 门课程</h2>
              </div>
              <p className="text-sm text-slate-500">
                已显示 {Math.min(visibleCount, filteredCourses.length)} /{' '}
                {filteredCourses.length}
              </p>
            </div>

            {filteredCourses.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredCourses.slice(0, visibleCount).map((course) => {
                  const selected = selectedIds.includes(course.id);
                  const conflict = selected && conflictingIds.has(course.id);
                  const peers = conflictPeers.get(course.id) ?? [];
                  return (
                    <article
                      className={`course-card ${selected ? 'course-card-selected' : ''} ${conflict ? 'course-card-conflict' : ''}`}
                      key={course.id}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            <Badge
                              className="bg-blue-50 text-blue-700"
                              variant="secondary"
                            >
                              {course.category}
                            </Badge>
                            <Badge
                              className={
                                courseRequirementType(course) === 'pending'
                                  ? 'bg-amber-50 text-amber-700'
                                  : courseRequirementType(course).includes('Degree') ||
                                      courseRequirementType(course) === 'publicRequiredDegree'
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'bg-teal-50 text-teal-700'
                              }
                              variant="secondary"
                            >
                              {getCourseRequirementTypeLabel(courseRequirementType(course))}
                            </Badge>
                            {isInnovationCourse(course) && (
                              <Badge
                                className="bg-fuchsia-50 text-fuchsia-700"
                                variant="secondary"
                              >
                                创新创业课
                              </Badge>
                            )}
                            <Badge
                              className="bg-emerald-50 text-emerald-700"
                              variant="secondary"
                            >
                              {course.level}
                            </Badge>
                            {activePlan.coreCourses.includes(course.name) && (
                              <Badge
                                className="bg-violet-50 text-violet-700"
                                variant="secondary"
                              >
                                方案核心课
                              </Badge>
                            )}
                            {activePlan.professionalCourses.includes(
                              course.name,
                            ) && (
                              <Badge
                                className="bg-amber-50 text-amber-700"
                                variant="secondary"
                              >
                                方案专业课
                              </Badge>
                            )}
                            <Badge
                              className="bg-slate-100 text-slate-600"
                              variant="secondary"
                            >
                              {formatCredits(course.credits)} 学分
                            </Badge>
                            <Badge className="source-badge" variant="secondary">
                              <FileSpreadsheet /> 秋季课表
                            </Badge>
                            {conflict && (
                              <Badge
                                className="bg-rose-50 text-rose-700"
                                variant="secondary"
                              >
                                时间冲突
                              </Badge>
                            )}
                            {selected && (
                              <Badge
                                className={
                                  courseDesignation(course) === 'degree'
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : courseDesignation(course) === 'non-degree'
                                      ? 'bg-teal-50 text-teal-700'
                                      : 'bg-amber-50 text-amber-700'
                                }
                                variant="secondary"
                              >
                                {designationLabel(courseDesignation(course))}
                              </Badge>
                            )}
                          </div>
                          <button
                            className="course-title text-left font-bold tracking-tight text-slate-900 hover:text-blue-700"
                            onClick={() => setDetailCourse(course)}
                            type="button"
                          >
                            {course.name}
                          </button>
                          <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                            {course.englishName || course.code}
                          </p>
                        </div>
                        <button
                          aria-label={
                            selected
                              ? `移除${course.name}`
                              : `选择${course.name}`
                          }
                          className={`star-button ${selected ? 'star-button-selected' : ''}`}
                          onClick={() => toggleCourse(course.id)}
                          type="button"
                        >
                          <Star className={selected ? 'fill-current' : ''} />
                        </button>
                      </div>

                      <div className="my-3.5 h-px bg-slate-100" />
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="info-pair">
                          <Users />
                          <span>
                            <strong>{course.teacher}</strong>
                            <small>任课教师</small>
                          </span>
                        </div>
                        <div className="info-pair">
                          <GraduationCap />
                          <span>
                            <strong>{course.subject}</strong>
                            <small>{course.college}</small>
                          </span>
                        </div>
                      </div>
                      <div className="course-extra mt-4">
                        <span>
                          <ClipboardCheck /> {course.examMode || '考试方式待定'}
                        </span>
                        <span>
                          <Presentation />{' '}
                          {course.teachingMode || '授课方式待定'}
                        </span>
                        <span>
                          <Clock3 /> {course.hours || '学时待定'}
                        </span>
                      </div>
                      {conflict && (
                        <div className="course-conflict-note">
                          <Zap />
                          <span>
                            与 {peers.map((peer) => peer.name).join('、')}{' '}
                            的上课时间冲突
                          </span>
                        </div>
                      )}
                      <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5">
                        <ScheduleLines schedules={course.schedules} />
                      </div>
                      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                        <span className="font-mono">{course.code}</span>
                        <span>{formatEnrollment(course)}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <SlidersHorizontal />
                <h3>{initialCourses.length ? '没有找到匹配课程' : '本学期尚未载入课程数据'}</h3>
                <p>
                  {initialCourses.length
                    ? '试试缩短关键词，或清空部分筛选条件。'
                    : '请在“数据管理”中导入本学期课程 JSON；当前学期的选课记录会独立保存。'}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={clearFilters} variant="outline">
                    清空筛选
                  </Button>
                  {!initialCourses.length && (
                    <Button onClick={() => setView('data')} variant="outline">
                      打开数据管理
                    </Button>
                  )}
                </div>
              </div>
            )}

            {visibleCount < filteredCourses.length && (
              <div className="mt-6 flex justify-center">
                <Button
                  className="h-11 rounded-xl px-6"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  variant="outline"
                >
                  <ChevronDown /> 显示更多课程
                </Button>
              </div>
            )}
          </section>
        ) : view === 'checkup' ? (
          <section className="py-6">
            <div className="section-heading mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p>SELECTION CHECKUP</p>
                <h2>选课方案体检</h2>
                <div className="section-description">
                  结合当前培养方向和选课须知检查已选课程。结果仅用于发现明显遗漏，不能替代导师、学院和教务系统审核。
                </div>
              </div>
              <label
                className="min-w-64 text-sm font-medium text-slate-600"
                htmlFor="checkup-plan"
              >
                当前培养方向
                <NativeSelect
                  aria-label="选择体检培养方向"
                  className="mt-2 w-full [&>select]:h-11"
                  id="checkup-plan"
                  onChange={(event) => setProgramPlanId(event.target.value)}
                  value={programPlanId}
                >
                  {availableProgramPlans.map((plan) => (
                    <NativeSelectOption key={plan.id} value={plan.id}>
                      {plan.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
            </div>

            <div
              className="checkup-summary"
              data-status={
                !selectedCourses.length
                  ? 'empty'
                  : attentionCheckCount
                    ? 'attention'
                    : 'pass'
              }
            >
              <div className="checkup-summary-icon">
                {!selectedCourses.length || !attentionCheckCount ? (
                  <ShieldCheck />
                ) : (
                  <TriangleAlert />
                )}
                <div className="hero-summary-grid mt-4">
                  <span><b>{conflictPairs.length}</b> 冲突</span>
                  <span><b>{unsetDesignationCount}</b> 待确认</span>
                  <span><b>{formatCredits(creditSummary.historicalCredits)}</b> 已修</span>
                  <span><b>{formatCredits(creditSummary.estimatedCredits)}</b> 预计累计</span>
                </div>
              </div>
              <div>
                <span>{activePlan.label}</span>
                <strong>
                  {!selectedCourses.length
                    ? '选择课程后开始体检'
                    : attentionCheckCount
                      ? `有 ${attentionCheckCount} 项需要处理`
                      : '当前方案未发现明显问题'}
                </strong>
                <p>
                  {!selectedCourses.length
                    ? '体检结果会随已选课程和学位课属性实时更新。'
                    : `已满足 ${passedCheckCount} / ${checkupItems.length} 项；标记为“需核对”的培养阶段要求不计为硬性错误。`}
                </p>
              </div>
              <div className="checkup-summary-credit">
                <b>{formatCredits(semesterEligibleCredits)}</b>
                <span>有效学分</span>
              </div>
            </div>

            <div className="checkup-grid mt-5">
              {checkupItems.map((item) => (
                <article
                  className="checkup-card"
                  data-status={item.status}
                  key={item.id}
                >
                  <div className="checkup-card-icon">
                    {item.status === 'pass' ? (
                      <CheckCircle2 />
                    ) : item.status === 'attention' ? (
                      <TriangleAlert />
                    ) : (
                      <Info />
                    )}
                  </div>
                  <div>
                    <span>
                      {item.status === 'pass'
                        ? '已满足'
                        : item.status === 'attention'
                          ? '需要处理'
                          : '需核对'}
                    </span>
                    <h3>{item.title}</h3>
                    <strong>{item.value}</strong>
                    <p>{item.detail}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="designation-panel mt-5">
              <div className="designation-panel-head">
                <div>
                  <p>COURSE DESIGNATION</p>
                  <h3>设置学位课属性</h3>
                  <span>
                    该设置仅保存在当前浏览器，正式选课时仍需在选课系统中再次确认。
                  </span>
                </div>
                <Badge variant="secondary">
                  {selectedCourses.length - unsetDesignationCount} /{' '}
                  {selectedCourses.length} 门已设置
                </Badge>
              </div>

              {selectedCourses.length ? (
                <div className="designation-list">
                  {selectedCourses.map((course) => {
                    const designation = courseDesignation(course);
                    const degreeEligibility = getCourseRoleEligibility(course, activePlan);
                    const degreeSelectable = degreeEligibility.status !== 'ineligible';
                    return (
                      <div className="designation-row" key={course.id}>
                        <button
                          onClick={() => setDetailCourse(course)}
                          type="button"
                        >
                          <strong>{course.name}</strong>
                          <span>
                            {course.category} · {formatCredits(course.credits)}{' '}
                            学分 · {getCourseRequirementTypeLabel(courseRequirementType(course))}
                            {isInnovationCourse(course) ? ' · 创新创业课' : ''}
                          </span>
                        </button>
                        <div className="designation-control">
                          <NativeSelect
                            aria-label={`设置${course.name}的学位课属性`}
                            className="w-full min-w-36 [&>select]:h-10"
                            onChange={(event) =>
                              setCourseDesignation(
                                course,
                                event.target.value as CourseDesignation,
                              )
                            }
                            value={designation}
                          >
                            <NativeSelectOption
                              disabled={!degreeSelectable}
                              value="unset"
                            >
                              未确定
                            </NativeSelectOption>
                            <NativeSelectOption
                              disabled={!degreeSelectable}
                              value="degree"
                            >
                              学位课
                            </NativeSelectOption>
                            <NativeSelectOption value="non-degree">
                              非学位课
                            </NativeSelectOption>
                          </NativeSelect>
                          {degreeEligibility.status !== 'eligible' && (
                            <small>{degreeEligibility.reason}</small>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="designation-empty">
                  <ClipboardList />
                  <div>
                    <strong>还没有已选课程</strong>
                    <span>先从课程列表选择课程，再回来设置属性。</span>
                  </div>
                  <Button onClick={() => setView('courses')} variant="outline">
                    去选择课程
                  </Button>
                </div>
              )}
            </div>
          </section>
        ) : view === 'data' ? (
          <section className="py-6">
            <div className="section-heading mb-5">
              <p>DATA MANAGEMENT</p>
              <h2>数据管理</h2>
              <div className="section-description">
                更新课程数据、导出/恢复个人备份都在这里完成。所有数据仍只保存在当前浏览器；导入失败不会覆盖原数据。
              </div>
            </div>
            {(dataManagementMessage || dataManagementError || dataMessage || dataError) && (
              <div
                className={`mb-4 rounded-xl border px-3 py-2.5 text-sm leading-6 ${
                  dataManagementError || dataError
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
                role={dataManagementError || dataError ? 'alert' : 'status'}
              >
                {dataManagementError || dataError || dataManagementMessage || dataMessage}
              </div>
            )}
            <div className="data-management-grid">
              <article className="data-management-card">
                <div className="data-management-card-head">
                  <RefreshCw />
                  <div>
                    <h3>更新课程数据</h3>
                    <p>支持课程 JSON；按课程编码尝试保留对应学期的已选记录。</p>
                  </div>
                </div>
                <input
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={handleCourseDataImport}
                  ref={dataFileRef}
                  type="file"
                />
                <Button
                  className="mt-4 h-10 rounded-xl"
                  onClick={() => dataFileRef.current?.click()}
                >
                  选择课程数据 JSON
                </Button>
                <p className="data-management-note">
                  当前应用键名使用 hias-* 命名空间；仅为兼容旧版本读取 ucas-hangzhou-selected，不会覆盖同域名下其他项目的 hias 数据。
                </p>
              </article>
              <article className="data-management-card">
                <div className="data-management-card-head">
                  <Download />
                  <div>
                    <h3>备份与恢复</h3>
                    <p>备份版本 v{BACKUP_VERSION} 包含学期课程、选课、属性、培养方案、历史记录和免修状态。</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button className="h-10 rounded-xl" onClick={exportBackup}>
                    <Download /> 导出完整备份
                  </Button>
                  <input
                    accept=".json,application/json"
                    className="sr-only"
                    onChange={handleBackupImport}
                    ref={backupFileRef}
                    type="file"
                  />
                  <Button
                    className="h-10 rounded-xl"
                    onClick={() => backupFileRef.current?.click()}
                    variant="outline"
                  >
                    <RefreshCw /> 选择备份恢复
                  </Button>
                </div>
                {restorePreview && (
                  <section className="restore-preview" aria-label="确认恢复备份">
                    <strong>恢复前预览</strong>
                    <ul>
                      {restorePreview.summary.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                      <Button className="h-9 rounded-lg" onClick={applyRestore}>确认应用恢复</Button>
                      <Button className="h-9 rounded-lg" onClick={() => setRestorePreview(null)} variant="outline">取消</Button>
                    </div>
                  </section>
                )}
              </article>
            </div>
            <div className="source-compare-note mt-5">
              <ShieldCheck />
              <span>恢复会替换备份中包含的自定义数据和个人记录；内置课程与培养方案不会被删除。无法匹配的课程记录会在备份中保留，需重新导入对应课程数据后再使用。</span>
            </div>
          </section>
        ) : view === 'notice' ? (
          <section className="py-6">
            <div className="section-heading mb-5">
              <p>COURSE SELECTION GUIDE</p>
              <h2>选课须知</h2>
              <div className="section-description">
                根据《国科大杭州高等研究院课程学习与选课须知（2026-2027
                学年）》整理，供模拟选课时快速查阅；正式安排仍以学校通知和选课系统为准。
              </div>
            </div>

            <div className="notice-grid">
              {NOTICE_SECTIONS.map((section) => (
                <article className="notice-card" key={section.title}>
                  <div className="notice-card-title">
                    <Info />
                    <h3>{section.title}</h3>
                  </div>
                  <div className="notice-list">
                    {section.items.map((item) => (
                      <div className="notice-item" key={item.label}>
                        <strong>{item.label}</strong>
                        <p>{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="source-compare-note mt-5">
              <FileSpreadsheet />
              <span>
                本页内容来源于课程须知
                PDF，重点用于提醒时间节点和通用规则，不会替代个人培养方案。若学院要求更高学分或有特殊规定，应以学院要求为准。
              </span>
            </div>
          </section>
        ) : view === 'guide' ? (
          <section className="guide-page py-6">
            <div className="section-heading guide-heading mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p>PROGRAM REQUIREMENTS</p>
                <h2>培养要求</h2>
                <div className="section-description">
                  按培养方向核对已修、预选、分类缺口和待确认事项；最终认定以学校培养方案和正式审核为准。
                  {formatUpdatedAt(activePlan.updatedAt) &&
                    ` 方案更新时间：${formatUpdatedAt(activePlan.updatedAt)}。`}
                </div>
              </div>
              <div className="flex min-w-64 flex-col gap-2">
                <label className="text-sm font-medium text-slate-600">
                  培养方向
                  <NativeSelect
                    aria-label="选择培养方向"
                    className="mt-2 w-full [&>select]:h-11"
                    onChange={(event) => setProgramPlanId(event.target.value)}
                    value={programPlanId}
                  >
                    {availableProgramPlans.map((plan) => (
                      <NativeSelectOption key={plan.id} value={plan.id}>
                        {plan.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
                <input
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={handleProgramPlanImport}
                  ref={programPlanFileRef}
                  type="file"
                />
                <Button
                  className="h-10 rounded-xl border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  onClick={() => programPlanFileRef.current?.click()}
                  variant="outline"
                >
                  <RefreshCw /> 导入培养方案 JSON
                </Button>
              </div>
            </div>

            {(programPlanMessage || programPlanError) && (
              <div
                className={`guide-feedback mb-4 rounded-xl border px-3 py-2.5 text-sm leading-6 ${
                  programPlanError
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
                role={programPlanError ? 'alert' : 'status'}
              >
                {programPlanError || programPlanMessage}
              </div>
            )}

            <div className="guide-overview requirements-status-grid">
              <div className="requirement-status-card">
                <span>历史已修且取得</span>
                <strong>{formatCredits(creditSummary.historicalCredits)} 学分</strong>
                <small>只来自历史记录，不与本学期预选重复累计</small>
              </div>
              <div className="requirement-status-card">
                <span>本学期预选</span>
                <strong>{formatCredits(creditSummary.plannedCredits)} 学分</strong>
                <small>这是计划量，不称为毕业完成度</small>
              </div>
              <div className="requirement-status-card">
                <span>加入计划后的预计累计</span>
                <strong>{formatCredits(creditSummary.estimatedCredits)} 学分</strong>
                <small>各类别和门数仍需分别核对</small>
              </div>
              <div className="requirement-status-card">
                <span>待确认学位属性</span>
                <strong>{formatCredits(creditSummary.pendingDesignationCredits)} 学分</strong>
                <small>{unsetDesignationCount ? '待确认后计算学位课缺口' : '当前没有待确认课程'}</small>
              </div>
            </div>

            <div className="guide-pending designation-panel mt-5">
              <div className="designation-panel-head">
                <div>
                  <p>FIRST CONFIRM COURSES</p>
                  <h3>先确认已选课程属性</h3>
                  <span>这是个人规划口径，不代表学校审核认定；待确认课程不会被当成完全缺课。</span>
                </div>
                <Badge variant="secondary">{unsetDesignationCount} 门待确认</Badge>
              </div>
              {unsetDesignationCount ? (
                <div className="designation-list">
                  {countedSelectedCourses.filter((course) => getCourseDesignation(course, activeDesignations, activePlan) === 'unset').map((course) => (
                    <div className="designation-row" key={`pending-${course.id}`}>
                      <button onClick={() => setDetailCourse(course)} type="button">
                        <strong>{course.name}</strong>
                        <span>{course.category} · {formatCredits(course.credits)} 学分 · {course.code}</span>
                      </button>
                      <div className="designation-radio-group" role="radiogroup" aria-label={`设置${course.name}的学位课属性`}>
                        <label><input checked={false} disabled={getCourseRoleEligibility(course, activePlan).status === 'ineligible'} name={`pending-${course.id}`} onChange={() => setCourseDesignation(course, 'degree')} type="radio" /> 学位课</label>
                        <label><input checked={false} name={`pending-${course.id}`} onChange={() => setCourseDesignation(course, 'non-degree')} type="radio" /> 非学位课</label>
                        {getCourseRoleEligibility(course, activePlan).status !== 'eligible' && (
                          <small>{getCourseRoleEligibility(course, activePlan).reason}</small>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="designation-empty-note">没有需要先确认的已选课程。已确认属性的课程仍可在“选课体检”中调整。</p>
              )}
            </div>

            <div className="guide-records history-exemption-grid mt-5">
              <article className="history-card">
                <div className="designation-panel-head">
                  <div>
                    <p>ENGLISH EXEMPTION</p>
                    <h3>英语免修免考资格</h3>
                  </div>
                  <Badge
                    className={`english-status-badge english-status-badge-${englishStatusTone(englishExemptionStatus)}`}
                    variant="secondary"
                  >
                    {englishStatusLabel(englishExemptionStatus)}
                  </Badge>
                </div>
                <div className="english-guide-summary">
                  <span>只需确认是否已获得免修免考资格；开关已移到页面顶部</span>
                  <span>当前：{englishStatusLabel(englishExemptionStatus)}</span>
                </div>
                <p className="history-card-note">
                  英语免修免考资格获得后按 3 学分计入公共必修学位课；未获得时不计入。切换状态不会静默删除已选英语课程，若历史中已有同一英语课程也不会重复计分；最终以学校审核为准。
                </p>
                {selectedCourses.some(isEnglishCourse) && (
                  <p className="history-card-warning">当前预选中保留了英语课程：切换免修状态不会静默删除它。</p>
                )}
              </article>
              <article className="history-card">
                <div className="designation-panel-head">
                  <div>
                    <p>HISTORICAL RECORDS</p>
                    <h3>历史已修记录</h3>
                  </div>
                  <Badge variant="secondary">{formatCredits(creditSummary.historicalCredits)} 学分</Badge>
                </div>
                <p className="history-card-note">可只录入分类学分；若没有课程名称，门数显示为“待补充”，不会推算为门数已满足。</p>
                <div className="history-form-grid">
                  <Input aria-label="历史学期" onChange={(event) => setHistoryDraft((current) => ({ ...current, term: event.target.value }))} placeholder="学期，如 2026 春季" value={historyDraft.term} />
                  <Input aria-label="历史课程名称，可留空" onChange={(event) => setHistoryDraft((current) => ({ ...current, courseName: event.target.value }))} placeholder="课程名称（可留空）" value={historyDraft.courseName} />
                  <Input aria-label="历史课程编码，可留空" onChange={(event) => setHistoryDraft((current) => ({ ...current, courseCode: event.target.value }))} placeholder="课程编码（可留空）" value={historyDraft.courseCode} />
                  <Input aria-label="历史学分" onChange={(event) => setHistoryDraft((current) => ({ ...current, credits: event.target.value }))} placeholder="学分" type="number" value={historyDraft.credits} />
                  <NativeSelect aria-label="历史课程类别" onChange={(event) => setHistoryDraft((current) => ({ ...current, category: event.target.value }))} value={historyDraft.category}>
                    {['公共必修课', '公共选修课', '专业核心课', '学科核心课', '专业课', '研讨课', '实验课'].map((value) => <NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}
                  </NativeSelect>
                  <NativeSelect aria-label="历史课程学位属性" onChange={(event) => setHistoryDraft((current) => ({ ...current, designation: event.target.value as HistoricalRecord['designation'] }))} value={historyDraft.designation}>
                    <NativeSelectOption value="unknown">学位属性待核验</NativeSelectOption>
                    <NativeSelectOption value="degree">学位课</NativeSelectOption>
                    <NativeSelectOption value="non-degree">非学位课</NativeSelectOption>
                  </NativeSelect>
                </div>
                <Button className="mt-3 h-10 rounded-xl" onClick={addHistoricalRecord}><ClipboardList /> 添加历史记录</Button>
                {historicalRecords.length ? <div className="history-record-list mt-3">{historicalRecords.map((record) => <div key={record.id}><span>{record.courseName || '分类学分（课程待补充）'} · {record.term} · {getCourseRequirementTypeLabel(getCourseRequirementType({ code: record.courseCode, category: record.category, name: record.courseName, subject: record.subject ?? '', module: record.module === 'hias' ? 'hias' : record.module === 'innovation' ? 'innovation' : 'regular' }, record.designation, activePlan))}{record.module === 'hias' ? ` · ${record.attendanceCount ?? (record.hours ?? record.credits * 20) / 2} 次 · ${record.hours ?? record.credits * 20} 学时` : ''}</span><b>{formatCredits(record.credits)} 学分</b><button aria-label={`删除${record.courseName || record.category}历史记录`} onClick={() => setHistoricalRecords((current) => current.filter((item) => item.id !== record.id))} type="button"><X /></button></div>)}</div> : <p className="history-card-note mt-3">尚未录入历史学分。</p>}
              </article>
              <article className="history-card">
                <div className="designation-panel-head">
                  <div>
                    <p>HIAS LECTURES</p>
                    <h3>HIAS讲堂学分</h3>
                  </div>
                  <Badge variant="secondary">专业非学位课</Badge>
                </div>
                <p className="history-card-note">
                  可按参加次数累计：每次 2 学时，20 学时折算 1 学分。这里的学分计入专业非学位课，不计入学位课门数。
                </p>
                <div className="history-form-grid">
                  <Input
                    aria-label="HIAS讲堂学期"
                    onChange={(event) =>
                      setHiasDraft((current) => ({ ...current, term: event.target.value }))
                    }
                    placeholder="学期，如 2026 春季"
                    value={hiasDraft.term}
                  />
                  <Input
                    aria-label="HIAS讲堂参加次数"
                    min="1"
                    onChange={(event) =>
                      setHiasDraft((current) => ({
                        ...current,
                        attendanceCount: event.target.value,
                      }))
                    }
                    placeholder="参加次数"
                    type="number"
                    value={hiasDraft.attendanceCount}
                  />
                </div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                  本次换算：{hiasPreview ? `${hiasPreview.hours} 学时 = ${formatCredits(hiasPreview.credits)} 学分` : '填写参加次数后自动换算'}
                </div>
                <Button className="mt-3 h-10 rounded-xl" onClick={addHiasRecord}>
                  <ClipboardList /> 添加 HIAS 讲堂记录
                </Button>
                <p className="history-card-note mt-3">
                  已累计：{hiasHistorySummary.attendanceCount} 次 · {hiasHistorySummary.hours} 学时 · {formatCredits(hiasHistorySummary.credits)} 学分
                </p>
              </article>
            </div>

            <div className="guide-plan-summary program-hero">
              <div>
                <span>{activePlan.degree}</span>
                <h3>{activePlan.program}</h3>
                <p>{activePlan.code}</p>
              </div>
              <div className="program-credit-total">
                <strong>≥{activePlan.totalCredits}</strong>
                <span>毕业总学分</span>
              </div>
              <div className="program-selected-total">
                <strong>{formatCredits(creditSummary.estimatedCredits)}</strong>
                <span>加入计划后的预计累计</span>
              </div>
            </div>

            <div className="guide-progress mt-5">
              <div className="section-description">
                各项显示“当前已计入学分 / 培养方案要求”；“必修”与“学位课”分别判断，待核验项目不会自动判定为已满足。
              </div>
              <div
                className={`english-requirement-callout english-status-banner-${englishStatusTone(englishExemptionStatus)}`}
                role="status"
              >
                <div>
                  <span>英语免修免考对培养要求的影响</span>
                  <strong>
                    {englishExemptionStatus === 'approved'
                      ? `已获得 · +${formatCredits(englishQualificationCredits)} 学分`
                      : '未获得 · 0 学分'}
                  </strong>
                </div>
                <small>{englishQualificationDetail}</small>
              </div>
              <div className="requirement-grid mt-3">
                {[
                  [
                    '公共必修学位课',
                    formatRequirementProgress(
                      creditSummary.publicRequiredDegreeCredits,
                      publicRequiredDegreeTarget,
                    ),
                  ],
                  [
                    '专业学位课',
                    formatRequirementProgress(
                      creditSummary.professionalDegreeCredits,
                      activePlan.degreeCourseCredits,
                    ),
                  ],
                  [
                    '专业选修课',
                    formatRequirementProgress(
                      creditSummary.professionalElectiveCredits,
                      activePlan.professionalNonDegreeCredits,
                    ),
                  ],
                  [
                    '公共选修课',
                    formatRequirementProgress(
                      creditSummary.publicElectiveCredits,
                      publicElectiveTarget,
                    ),
                  ],
                  [
                    '公共必修非学位课',
                    formatRequirementProgress(
                      creditSummary.publicRequiredNonDegreeCredits,
                      publicRequiredNonDegreeTarget,
                    ),
                  ],
                  [
                    '其中：创新创业课',
                    formatRequirementProgress(
                      creditSummary.innovationCredits,
                      activePlan.innovationCredits,
                    ),
                  ],
                ].map(([label, value]) => (
                  <div className="requirement-item" key={`progress-${label}`}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="guide-coverage selection-rules mt-4">
              <div className="rule-card">
                <Target />
                <div>
                  <span>本学期核心课覆盖</span>
                  <strong>
                    已选 {selectedPlanCoreCount} / 可选 {planCoreCourses.length}{' '}
                    门
                  </strong>
                  <p>
                    培养方案要求：至少 {activePlan.coreMinimum} 门作为学位课
                  </p>
                </div>
                <b>
                  {selectedPlanCoreCount}/{planCoreCourses.length}
                </b>
              </div>
              <div className="rule-card">
                <Target />
                <div>
                  <span>本学期专业课覆盖</span>
                  <strong>
                    已选 {selectedPlanProfessionalCount} / 可选{' '}
                    {planProfessionalCourses.length} 门
                  </strong>
                  <p>
                    培养方案要求：至少 {activePlan.professionalMinimum}{' '}
                    门作为学位课
                  </p>
                </div>
                <b>
                  {selectedPlanProfessionalCount}/
                  {planProfessionalCourses.length}
                </b>
              </div>
            </div>

            <div className="guide-note coverage-note mt-4">
              <Info />
              <span>
                这里统计的是本学期已选课程对培养方案课程库的覆盖情况，不代表课程已经被认定为学位课，也不等同于毕业完成度。
              </span>
            </div>

            {activePlan.note && (
              <div className="guide-note program-note mt-4">
                <Info /> {activePlan.note}
              </div>
            )}

            <div className="guide-course-library mt-7 grid gap-5 xl:grid-cols-2">
              {programCourseGroups.map(({ title, courses, kind }) => (
                <div className="program-course-group" key={title}>
                  <div className="program-course-group-title">
                    <div>
                      <h3>{title}</h3>
                      <p>已按培养方案课程库与本学期正式课表交叉匹配</p>
                    </div>
                    <Badge variant="secondary">{courses.length} 门</Badge>
                  </div>
                  <div className="program-course-list">
                    {courses.map((course) => {
                      const selected = selectedIds.includes(course.id);
                      return (
                        <div className="program-course-row" key={course.id}>
                          <button
                            onClick={() => setDetailCourse(course)}
                            type="button"
                          >
                            <strong>{course.name}</strong>
                            <span>
                              {course.teacher} · {formatCredits(course.credits)}{' '}
                              学分 · {course.schedules[0]?.periodText}
                            </span>
                          </button>
                          <Button
                            aria-label={
                              selected
                                ? `移除${course.name}`
                                : `选择${course.name}`
                            }
                            className={
                              selected
                                ? 'program-select program-select-active'
                                : 'program-select'
                            }
                            onClick={() => toggleCourse(course.id)}
                            size="sm"
                            variant="outline"
                          >
                            <Star className={selected ? 'fill-current' : ''} />
                            {selected ? '已选' : '选择'}
                          </Button>
                        </div>
                      );
                    })}
                    {!courses.length && (
                      <div className="program-course-empty">
                        本学期课表中没有匹配到该类课程。
                      </div>
                    )}
                  </div>
                  <p className="program-course-footnote">
                    培养方案共列{' '}
                    {
                      (kind === 'core'
                        ? activePlan.coreCourses
                        : activePlan.professionalCourses
                      ).length
                    }{' '}
                    门，未出现的课程可能安排在春季。
                  </p>
                </div>
              ))}
            </div>

            <div className="guide-source source-compare-note mt-5">
              <Info />
              <span>
                培养要求与课程库依据{' '}
                 {activePlan.source || '已整理的培养方案材料'}；
                 本学期课程的学分、教师、时间和教室仍以当前课程数据为准。
                 课程属性规则按课程编号第14位解释：1/2为核心课、3为专业课、4-7为强制非学位课、B/X为公共课程；无法解析的编码显示为待核验。
                 {` ${getGraduateProgramScopeLabel(activePlan)}`}
                 课程类别、培养要求分类和学位属性分开保存；《工程伦理》按公共必修非学位课统计，不计入学位课程。
                 创新创业课程编码依据“2026创新创业课秋季课表.xlsx”标记为“创新创业课”模块，仍按公共选修课归属，学分只累计一次。
                 HIAS讲堂可由用户按参加次数登记，每次2学时、20学时折算1学分，计入专业非学位课。
                 {activePlan.program === '物理电子学' &&
                  ' 两份文件中“主被动光谱探测技术”的学分分别为2与2.5，本页采用秋季课表的2.5学分并保留此提示。'}
              </span>
            </div>
          </section>
        ) : view === 'exams' ? (
          <section className="py-6">
            <div className="section-heading mb-5">
              <p>ASSESSMENT LOAD</p>
              <h2>考试压力视图</h2>
              <div className="section-description">
                按课程文件中的考核方式整理已选课程，帮助你识别闭卷、报告、实践等任务的结构分布。
              </div>
            </div>

            <div className="exam-summary">
              <div className="exam-summary-icon">
                <BarChart3 />
              </div>
              <div>
                <span>当前考核结构提示</span>
                <strong>{examPressureMessage}</strong>
              </div>
              <div className="exam-summary-total">
                <b>{selectedCourses.length}</b>
                <span>门已选课程</span>
              </div>
            </div>

            {selectedCourses.length ? (
              <div className="exam-grid mt-5">
                {examGroups.map((group) => {
                  const credits = group.courses.reduce(
                    (sum, course) => sum + course.credits,
                    0,
                  );
                  return (
                    <article
                      className="exam-card"
                      data-tone={group.tone}
                      key={group.id}
                    >
                      <div className="exam-card-head">
                        <div>
                          <span>{group.label}</span>
                          <strong>{group.courses.length} 门</strong>
                        </div>
                        <b>{formatCredits(credits)} 学分</b>
                      </div>
                      <p>{group.description}</p>
                      <div className="exam-course-list">
                        {group.courses.map((course) => (
                          <button
                            key={course.id}
                            onClick={() => setDetailCourse(course)}
                            type="button"
                          >
                            <span>{course.name}</span>
                            <small>{course.examMode || '考试方式待定'}</small>
                          </button>
                        ))}
                        {!group.courses.length && (
                          <span className="exam-course-empty">
                            暂无已选课程
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state mt-5">
                <BarChart3 />
                <h3>还没有可分析的课程</h3>
                <p>先选择课程，再回来查看闭卷、开卷、报告和实践考核的分布。</p>
                <Button onClick={() => setView('courses')}>去选择课程</Button>
              </div>
            )}

            <div className="source-compare-note mt-5">
              <FileSpreadsheet />
              <span>
                考试方式来自 {activeDataset.label}{' '}
                课程数据；这里仅分析考核类型，不包含考试日期、实际难度或课程作业量，不能替代正式考试安排。
              </span>
            </div>
          </section>
        ) : (
          <section className="py-6">
            <div className="section-heading mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p>WEEKLY TIMETABLE</p>
                <h2>我的模拟课程表</h2>
                <div className="section-description">
                  共 {selectedCourses.length} 门课程 ·{' '}
                  {formatCredits(selectedCredits)} 学分
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                查看周次
                <NativeSelect
                  aria-label="查看周次"
                  className="min-w-28 [&>select]:h-10"
                  onChange={(event) => setWeek(Number(event.target.value))}
                  value={week}
                >
                  {Array.from({ length: 20 }, (_, index) => index + 1).map(
                    (value) => (
                      <NativeSelectOption key={value} value={value}>
                        第 {value} 周
                      </NativeSelectOption>
                    ),
                  )}
                </NativeSelect>
              </label>
            </div>

            {selectedCourses.length ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                {currentWeekConflicts.size > 0 && (
                  <div className="mb-3 flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <Zap className="size-4" /> 本周有{' '}
                    {currentWeekConflicts.size} 门课程时间重叠，已用红色标出。
                  </div>
                )}
                <div className="overflow-x-auto pb-2">
                  <div className="timetable-grid">
                    <div className="timetable-corner">节次</div>
                    {DAYS.map((label, index) => (
                      <div
                        className="timetable-day"
                        key={label}
                        style={{ gridColumn: index + 2, gridRow: 1 }}
                      >
                        {label}
                      </div>
                    ))}
                    {Array.from({ length: 13 }, (_, index) => index + 1).map(
                      (period) => (
                        <div
                          className="timetable-period"
                          key={period}
                          style={{ gridColumn: 1, gridRow: period + 1 }}
                        >
                          <strong>{period}</strong>
                          <span>第 {period} 节</span>
                        </div>
                      ),
                    )}
                    {DAYS.flatMap((_, dayIndex) =>
                      Array.from({ length: 13 }, (_, index) => index + 1).map(
                        (period) => (
                          <div
                            className="timetable-cell"
                            key={`${dayIndex}-${period}`}
                            style={{
                              gridColumn: dayIndex + 2,
                              gridRow: period + 1,
                            }}
                          />
                        ),
                      ),
                    )}
                    {selectedCourses.flatMap((course) =>
                      course.schedules
                        .filter((schedule) => schedule.weeks.includes(week))
                        .map((schedule, scheduleIndex) => {
                          const color = courseColor(course.id);
                          const conflict = currentWeekConflicts.has(course.id);
                          return (
                            <button
                              className={`timetable-course ${conflict ? 'timetable-course-conflict' : ''}`}
                              key={`${course.id}-${scheduleIndex}`}
                              onClick={() => setDetailCourse(course)}
                              style={{
                                gridColumn: schedule.dayIndex + 2,
                                gridRow: `${schedule.start + 1} / ${schedule.end + 2}`,
                                backgroundColor: conflict
                                  ? '#ffe4e6'
                                  : color[0],
                                borderColor: conflict ? '#e11d48' : color[1],
                                color: conflict ? '#9f1239' : color[1],
                              }}
                              type="button"
                            >
                              <strong>{course.name}</strong>
                              <span>{schedule.room}</span>
                            </button>
                          );
                        }),
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <CalendarDays />
                <h3>课表还是空的</h3>
                <p>回到课程列表，点击课程卡片右上角的星标即可加入。</p>
                <Button onClick={() => setView('courses')}>去选择课程</Button>
              </div>
            )}
          </section>
        )}

        <section aria-labelledby="disclaimer-title" className="disclaimer-card">
          <div className="disclaimer-icon" aria-hidden="true">
            <ShieldCheck />
          </div>
          <div>
            <h2 id="disclaimer-title">免责声明</h2>
            <p>
              本工具仅面向国科大杭州高等研究院 2026
              级研一新生使用，是非官方选课辅助项目，不代表国科大杭州高等研究院或学校教务部门。其他年级、其他入学年份或培养阶段的同学不应直接据此安排课程。
            </p>
            <p>
              课程、学分、培养要求、考试方式、选课人数及时间地点等信息可能存在更新延迟、遗漏或整理误差，最终请以学校教务系统、培养方案原文件和正式通知为准。
            </p>
            <p>
              使用者应在正式选课前自行核验关键信息。本工具不会将个人已选课程上传到服务器，相关选择记录仅保存在当前设备的浏览器中。
            </p>
          </div>
        </section>

        <footer className="mb-4 mt-2 flex flex-col gap-2 border-t border-slate-200 py-5 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>HIAS-CSA · {activeDataset.label}预选课辅助工具</span>
          <span>HIAS-CSA · Course Selection Assistant</span>
        </footer>
      </div>

      <Dialog
        onOpenChange={setRecommendationDialogOpen}
        open={recommendationDialogOpen}
      >
        <DialogContent className="recommendation-dialog max-w-2xl">
          <DialogHeader>
            <DialogTitle>选课补充建议</DialogTitle>
            <DialogDescription>
              {semesterCreditGap > 0
                ? `当前有效选课学分为 ${formatCredits(semesterEligibleCredits)}，秋季/春季建议达到 10 学分，还差 ${formatCredits(semesterCreditGap)} 学分。`
                : '本学期有效选课学分已达到 10 学分，以下建议仅用于补充培养方案缺口。'}
            </DialogDescription>
          </DialogHeader>

          {recommendationCandidates.length ? (
            <div className="recommendation-dialog-list">
              {recommendationCandidates.map(({ course, reasons }) => (
                <div className="recommendation-row" key={course.id}>
                  <button
                    onClick={() => {
                      setRecommendationDialogOpen(false);
                      setDetailCourse(course);
                    }}
                    type="button"
                  >
                    <strong>{course.name}</strong>
                    <span>
                      {course.category} · {formatCredits(course.credits)} 学分 ·{' '}
                      {course.schedules[0]?.periodText || '时间待定'}
                    </span>
                    <small>{reasons.slice(0, 2).join('；')}</small>
                  </button>
                  <Button
                    className="h-9 shrink-0 rounded-lg"
                    onClick={() => {
                      setRecommendationDialogOpen(false);
                      toggleCourse(course.id, { prompt: false });
                    }}
                    size="sm"
                  >
                    加入
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="recommendation-empty">
              当前没有找到符合培养要求且不与现有课表冲突的补充课程。
            </div>
          )}

          {recommendationCombination.length > 1 && (
            <div className="recommendation-dialog-combination">
              <div>
                <strong>可一起加入的组合</strong>
                <span>
                  已按教学周、星期、节次和同课不同班规则检查；加入后会再次实时检查课表。
                </span>
              </div>
              <div className="combination-course-list">
                {recommendationCombination.map((course) => (
                  <span key={course.id}>{course.name}</span>
                ))}
              </div>
              <Button
                className="mt-3 h-10 rounded-xl"
                onClick={() => {
                  setRecommendationDialogOpen(false);
                  recommendationCombination.forEach((course) =>
                    toggleCourse(course.id, { prompt: false }),
                  );
                }}
              >
                加入这组课程
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => setRecommendationDialogOpen(false)}
              variant="outline"
            >
              稍后查看
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        onOpenChange={(open) => {
          if (!open) setDetailCourse(null);
        }}
        open={Boolean(detailCourse)}
      >
        <SheetContent className="w-full max-w-xl overflow-y-auto border-l-slate-200 bg-white p-0 sm:max-w-xl">
          {detailCourse && (
            <>
              <SheetHeader className="border-b border-slate-100 p-6 pr-14">
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge
                    className="bg-blue-50 text-blue-700"
                    variant="secondary"
                  >
                    {detailCourse.category}
                  </Badge>
                  <Badge className="bg-teal-50 text-teal-700" variant="secondary">
                    {getCourseRequirementTypeLabel(
                      getCourseRequirementType(
                        detailCourse,
                        selectedIds.includes(detailCourse.id)
                          ? courseDesignation(detailCourse)
                          : getCourseDesignation(detailCourse, {}, activePlan),
                        activePlan,
                      ),
                    )}
                  </Badge>
                  {isInnovationCourse(detailCourse) && (
                    <Badge className="bg-fuchsia-50 text-fuchsia-700" variant="secondary">
                      创新创业课
                    </Badge>
                  )}
                  <Badge variant="outline">{detailCourse.level}</Badge>
                  <Badge className="source-badge" variant="secondary">
                    <FileSpreadsheet /> 秋季课表数据
                  </Badge>
                </div>
                <SheetTitle className="text-2xl font-bold leading-tight">
                  {detailCourse.name}
                </SheetTitle>
                <SheetDescription>
                  {detailCourse.englishName || detailCourse.code}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6 p-6">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['课程编码', detailCourse.code],
                    [
                      '编号第14位规则',
                      `${getCourseCodeMarker(detailCourse.code) || '待核验'} · ${getCourseCodeCategoryLabel(detailCourse.code)}`,
                    ],
                    [
                      '培养要求分类',
                      getCourseRequirementTypeLabel(
                        getCourseRequirementType(
                          detailCourse,
                          selectedIds.includes(detailCourse.id)
                            ? courseDesignation(detailCourse)
                            : getCourseDesignation(detailCourse, {}, activePlan),
                          activePlan,
                        ),
                      ),
                    ],
                    [
                      '课程模块',
                      isInnovationCourse(detailCourse) ? '创新创业课' : '常规课程',
                    ],
                    [
                      '学分 / 学时',
                      `${formatCredits(detailCourse.credits)} / ${detailCourse.hours}`,
                    ],
                    ['任课教师', detailCourse.teacher],
                    ['所属学科', detailCourse.subject],
                    ['开课院系', detailCourse.college],
                    ['考试方式', detailCourse.examMode],
                    ['授课方式', detailCourse.teachingMode],
                    [
                      '选课人数 / 限选人数',
                      formatEnrollmentDetail(detailCourse),
                    ],
                  ].map(([label, value]) => (
                    <div className="detail-field" key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="mb-3 flex items-center gap-2 font-bold">
                    <Clock3 className="size-4 text-blue-600" /> 上课安排
                  </h3>
                  <div className="space-y-2">
                    {detailCourse.schedules.map((schedule, index) => (
                      <div
                        className="schedule-detail"
                        key={`${schedule.periodText}-${index}`}
                      >
                        <div>
                          <strong>{schedule.periodText}</strong>
                          <span>{schedule.weeksText}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-slate-500">
                          <MapPin className="size-4" /> {schedule.room}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {selectedIds.includes(detailCourse.id) && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <label
                      className="text-sm font-semibold text-slate-700"
                      htmlFor="detail-course-designation"
                    >
                      学位课属性
                      <NativeSelect
                        aria-label={`设置${detailCourse.name}的学位课属性`}
                        className="mt-2 w-full [&>select]:h-10"
                        id="detail-course-designation"
                        onChange={(event) =>
                          setCourseDesignation(
                            detailCourse,
                            event.target.value as CourseDesignation,
                          )
                        }
                        value={courseDesignation(detailCourse)}
                      >
                        <NativeSelectOption
                          disabled={getCourseRoleEligibility(detailCourse, activePlan).status === 'ineligible'}
                          value="unset"
                        >
                          未确定
                        </NativeSelectOption>
                        <NativeSelectOption
                          disabled={getCourseRoleEligibility(detailCourse, activePlan).status === 'ineligible'}
                          value="degree"
                        >
                          学位课
                        </NativeSelectOption>
                        <NativeSelectOption value="non-degree">
                          非学位课
                        </NativeSelectOption>
                      </NativeSelect>
                    </label>
                    {getCourseRoleEligibility(detailCourse, activePlan).status !== 'eligible' && (
                      <p className="mt-2 text-xs leading-5 text-amber-700">
                        {getCourseRoleEligibility(detailCourse, activePlan).reason}
                      </p>
                    )}
                  </div>
                )}
                <Button
                  className="h-11 w-full rounded-xl"
                  onClick={() => toggleCourse(detailCourse.id)}
                  variant={
                    selectedIds.includes(detailCourse.id)
                      ? 'outline'
                      : 'default'
                  }
                >
                  <Star
                    className={
                      selectedIds.includes(detailCourse.id)
                        ? 'fill-current'
                        : ''
                    }
                  />
                  {selectedIds.includes(detailCourse.id)
                    ? '从已选中移除'
                    : '加入我的课表'}
                </Button>
                <div className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  开课校区：国科大杭州高等研究院。
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
