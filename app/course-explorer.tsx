'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  BarChart3,
  CalendarDays,
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
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Users,
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
import { PROGRAM_PLANS } from '@/app/program-plans';

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
};

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
const COURSE_COLORS = [
  ['#dff2ee', '#147d6f'],
  ['#e9e5fb', '#6251a4'],
  ['#ffe8dd', '#a85834'],
  ['#dceafb', '#326da8'],
  ['#f8edca', '#91701e'],
  ['#f3dfe9', '#9c4b72'],
];

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

function courseBaseName(name: string) {
  return name.replace(/[-—－]?\d+班$/, '');
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

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
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
  initialCourses,
}: {
  initialCourses: Course[];
}) {
  const [query, setQuery] = useState('');
  const [college, setCollege] = useState('全部院系');
  const [subject, setSubject] = useState('全部学科/专业');
  const [category, setCategory] = useState('全部类别');
  const [day, setDay] = useState('全部星期');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [onlySelected, setOnlySelected] = useState(false);
  const [onlyNoConflict, setOnlyNoConflict] = useState(false);
  const [view, setView] = useState<'courses' | 'guide' | 'exams' | 'timetable'>(
    'courses',
  );
  const [programPlanId, setProgramPlanId] = useState('optical-master');
  const [week, setWeek] = useState(2);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [detailCourse, setDetailCourse] = useState<Course | null>(null);
  const selectedIdsRef = useRef(selectedIds);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    const stored = window.localStorage.getItem('ucas-hangzhou-selected');
    if (stored) {
      try {
        setSelectedIds(JSON.parse(stored));
      } catch {
        window.localStorage.removeItem('ucas-hangzhou-selected');
      }
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (storageReady) {
      window.localStorage.setItem(
        'ucas-hangzhou-selected',
        JSON.stringify(selectedIds),
      );
    }
  }, [selectedIds, storageReady]);

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
            setSelectedIds(ids);
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
  }, [initialCourses]);

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
  const selectedCredits = selectedCourses.reduce(
    (sum, course) => sum + course.credits,
    0,
  );
  const selectedCreditBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    selectedCourses.forEach((course) => {
      totals.set(
        course.category,
        (totals.get(course.category) ?? 0) + course.credits,
      );
    });
    return [...totals.entries()].sort((left, right) => right[1] - left[1]);
  }, [selectedCourses]);
  const activePlan =
    PROGRAM_PLANS.find((plan) => plan.id === programPlanId) ?? PROGRAM_PLANS[0];
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
  const selectedPlanCoreCount = selectedCourses.filter((course) =>
    activePlan.coreCourses.includes(course.name),
  ).length;
  const selectedPlanProfessionalCount = selectedCourses.filter((course) =>
    activePlan.professionalCourses.includes(course.name),
  ).length;
  const selectedPlanCredits = selectedCourses
    .filter(
      (course) =>
        activePlan.coreCourses.includes(course.name) ||
        activePlan.professionalCourses.includes(course.name),
    )
    .reduce((sum, course) => sum + course.credits, 0);
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

  function toggleCourse(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function replaceCourse(sourceId: string, replacementId: string) {
    setSelectedIds((current) => [
      ...current.filter((id) => id !== sourceId && id !== replacementId),
      replacementId,
    ]);
  }

  function getConflictAlternatives(source: Course) {
    const baseName = courseBaseName(source.name);
    return initialCourses.filter((candidate) => {
      if (
        candidate.id === source.id ||
        courseBaseName(candidate.name) !== baseName
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

  function exportSelected() {
    const header = [
      '课程编码',
      '课程名称',
      '学分',
      '教师',
      '开课院系',
      '课程类别',
      '上课安排',
      '考试方式',
    ];
    const rows = selectedCourses.map((course) => [
      course.code,
      course.name,
      formatCredits(course.credits),
      course.teacher,
      course.college,
      course.category,
      course.schedules
        .map(
          (schedule) =>
            `${schedule.periodText} ${schedule.weeksText} ${schedule.room}`,
        )
        .join('；'),
      course.examMode,
    ]);
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

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f7f2] text-slate-900">
      <div className="mx-auto max-w-[1380px] px-3 py-4 sm:px-5 lg:px-7">
        <section className="hero-panel relative overflow-hidden rounded-[26px] border border-[#dce5de] px-5 py-6 shadow-[0_22px_65px_rgba(61,83,72,.10)] sm:px-8 sm:py-7">
          <div className="hero-doodle hero-doodle-one" />
          <div className="hero-doodle hero-doodle-two" />
          <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch">
            <div>
              <div className="brand-lockup">
                <img
                  alt="国科大杭州高等研究院 Hangzhou Institute for Advanced Study, UCAS"
                  height="62"
                  src="/hias-logo-white.png"
                  width="450"
                />
                <span>研究生预选课辅助工具</span>
              </div>
              <p className="mb-3 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#dceee8]">
                2026 FALL · HANGZHOU
              </p>
              <h1 className="max-w-3xl text-[2rem] font-bold leading-[1.18] tracking-[-0.035em] text-white sm:text-[2.45rem]">
                杭高院 2026 秋季预选课助手
              </h1>
              <p className="mt-3 max-w-2xl text-[0.9rem] leading-7 text-[#d8e6e2] sm:text-[0.96rem]">
                面向国科大杭州高等研究院研究生，集中查看课程、培养要求与考试方式，把{' '}
                {initialCourses.length} 门课排成真正适合你的这一周。
              </p>
              <div className="hero-meta mt-5">
                <span>
                  <FileSpreadsheet /> 秋季课表数据
                </span>
                <span>
                  <BookOpen /> {initialCourses.length} 门课程
                </span>
                <span>
                  <GraduationCap /> {subjects.length} 个学科/专业
                </span>
                <span>
                  <ClipboardList /> {PROGRAM_PLANS.length} 个培养方向
                </span>
                <span>
                  <Sparkles /> 自动冲突检查
                </span>
              </div>
            </div>
            <aside className="plan-summary">
              <div>
                <p>MY PRESELECTION</p>
                <div className="credit-spotlight mt-3">
                  <div className="flex items-end gap-2">
                    <strong>{formatCredits(selectedCredits)}</strong>
                    <span>学分</span>
                  </div>
                  <div className="plan-course-count">
                    已选 <b>{selectedCourses.length}</b> 门课程
                  </div>
                </div>
                {selectedCreditBreakdown.length > 0 ? (
                  <div className="credit-breakdown mt-4">
                    {selectedCreditBreakdown
                      .slice(0, 3)
                      .map(([label, credits]) => (
                        <span key={label}>
                          {label} {formatCredits(credits)}
                        </span>
                      ))}
                  </div>
                ) : (
                  <div className="credit-empty mt-4">
                    选择课程后，这里会汇总学分
                  </div>
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
            </aside>
          </div>
        </section>

        <section className="relative z-20 mt-3.5 rounded-[22px] border border-[#e1e5df] bg-white/94 p-3.5 shadow-[0_14px_40px_rgba(61,83,72,.07)] backdrop-blur sm:p-4">
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
                <span>已选总计</span>
                <strong>{formatCredits(selectedCredits)}</strong>
                <b>学分</b>
                <small>{selectedCourses.length} 门课</small>
              </div>
              <div className="grid w-full grid-cols-2 rounded-xl bg-slate-100 p-1 sm:w-auto sm:flex">
                <button
                  className={`view-tab ${view === 'courses' ? 'view-tab-active' : ''}`}
                  onClick={() => setView('courses')}
                  type="button"
                >
                  <BookOpen /> 课程列表
                </button>
                <button
                  className={`view-tab ${view === 'guide' ? 'view-tab-active' : ''}`}
                  onClick={() => setView('guide')}
                  type="button"
                >
                  <ClipboardList /> 培养要求
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
                        <span>
                          余量 {Math.max(0, course.capacity - course.enrolled)}{' '}
                          / {course.capacity || '—'}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <SlidersHorizontal />
                <h3>没有找到匹配课程</h3>
                <p>试试缩短关键词，或清空部分筛选条件。</p>
                <Button onClick={clearFilters} variant="outline">
                  清空筛选
                </Button>
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
        ) : view === 'guide' ? (
          <section className="py-6">
            <div className="section-heading mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p>PROGRAM REQUIREMENTS</p>
                <h2>物光学院培养方案参考</h2>
                <div className="section-description">
                  根据《物光学院2026—2027年课程设置》整理，仅显示当前秋季课表中可对应的课程。
                </div>
              </div>
              <label className="min-w-64 text-sm font-medium text-slate-600">
                培养方向
                <NativeSelect
                  aria-label="选择培养方向"
                  className="mt-2 w-full [&>select]:h-11"
                  onChange={(event) => setProgramPlanId(event.target.value)}
                  value={programPlanId}
                >
                  {PROGRAM_PLANS.map((plan) => (
                    <NativeSelectOption key={plan.id} value={plan.id}>
                      {plan.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
            </div>

            <div className="program-hero">
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
                <strong>{formatCredits(selectedPlanCredits)}</strong>
                <span>本学期已选方案课学分</span>
              </div>
            </div>

            <div className="requirement-grid mt-4">
              {[
                ['公共必修课', `${activePlan.publicRequiredCredits} 学分`],
                ['专业学位课', `≥${activePlan.degreeCourseCredits} 学分`],
                [
                  '专业非学位课',
                  activePlan.professionalNonDegreeCredits === null
                    ? '不限'
                    : `${activePlan.professionalNonDegreeCredits} 学分`,
                ],
                ['公共选修课', `${activePlan.publicElectiveCredits} 学分`],
                [
                  '创新创业课',
                  activePlan.innovationCredits === null
                    ? '未单列'
                    : `${activePlan.innovationCredits} 学分`,
                ],
              ].map(([label, value]) => (
                <div className="requirement-item" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <div className="selection-rules mt-4">
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

            <div className="coverage-note mt-4">
              <Info />
              <span>
                这里统计的是本学期已选课程对培养方案课程库的覆盖情况，不代表课程已经被认定为学位课，也不等同于毕业完成度。
              </span>
            </div>

            {activePlan.note && (
              <div className="program-note mt-4">
                <Info /> {activePlan.note}
              </div>
            )}

            <div className="mt-7 grid gap-5 xl:grid-cols-2">
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

            <div className="source-compare-note mt-5">
              <Info />
              <span>
                培养要求与课程库依据
                PPT；本学期课程的学分、教师、时间和教室仍以秋季课表为准。
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
                按秋季课表中的考试方式整理已选课程，帮助你平衡闭卷、报告与实践任务。
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
                考试方式来自 2026
                年秋季学期课表；这里仅分析考核类型，不包含考试日期、实际难度或课程作业量。
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
                          const color =
                            COURSE_COLORS[
                              Number(course.id) % COURSE_COLORS.length
                            ];
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

        <footer className="mb-4 mt-2 flex flex-col gap-2 border-t border-slate-200 py-5 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>国科大杭州高等研究院 · 2026 秋季预选课辅助工具</span>
          <span>本工具仅用于选课规划，最终安排以学校通知为准。</span>
        </footer>
      </div>

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
                      '学分 / 学时',
                      `${formatCredits(detailCourse.credits)} / ${detailCourse.hours}`,
                    ],
                    ['任课教师', detailCourse.teacher],
                    ['所属学科', detailCourse.subject],
                    ['开课院系', detailCourse.college],
                    ['考试方式', detailCourse.examMode],
                    ['授课方式', detailCourse.teachingMode],
                    [
                      '选课人数',
                      `${detailCourse.enrolled} / ${detailCourse.capacity || '—'}`,
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
                <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  课程文件中的“开课校区”列为空，因此本页面不额外推断校区。
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
