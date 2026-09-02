'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Download,
  GraduationCap,
  Info,
  MapPin,
  Presentation,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
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
      execute: (input: unknown) => unknown | Promise<unknown>;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const PAGE_SIZE = 24;
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
    slot.start === slot.end ? `第${slot.start}节` : `第${slot.start}-${slot.end}节`;
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1" key={`${schedule.periodText}-${index}`}>
          <span className="font-medium text-slate-800">{schedule.periodText}</span>
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
  const [view, setView] = useState<'courses' | 'timetable'>('courses');
  const [week, setWeek] = useState(2);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [detailCourse, setDetailCourse] = useState<Course | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

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
            const unknownCodes = codes.filter((code) => !courseByCode.has(code));
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
      totals.set(course.category, (totals.get(course.category) ?? 0) + course.credits);
    });
    return [...totals.entries()].sort((left, right) => right[1] - left[1]);
  }, [selectedCourses]);

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
          (selected) => selected.id === course.id || !coursesConflict(course, selected),
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
      <div className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">
        <section className="hero-panel relative overflow-hidden rounded-[30px] border border-[#dce5de] px-6 py-7 shadow-[0_22px_65px_rgba(61,83,72,.10)] sm:px-9 sm:py-9">
          <div className="hero-doodle hero-doodle-one" />
          <div className="hero-doodle hero-doodle-two" />
          <div className="relative z-10 grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-stretch">
            <div>
              <p className="mb-4 inline-flex rounded-full border border-[#b9d9cf] bg-white/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#39766c]">
                2026 FALL · UCAS
              </p>
              <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-[-0.03em] text-[#1f3732] sm:text-[2.65rem]">
                把 {initialCourses.length} 门课，排成属于你的这一周
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#60736e] sm:text-base">
                从学科专业、考试方式到每周时段，把选课信息摊开来看。收藏备选课程，系统会帮你检查时间冲突。
              </p>
              <div className="hero-meta mt-7">
                <span><BookOpen /> {initialCourses.length} 门课程</span>
                <span><GraduationCap /> {subjects.length} 个学科/专业</span>
                <span><Sparkles /> 自动冲突检查</span>
              </div>
            </div>
            <aside className="plan-summary">
              <div>
                <p>MY COURSE PLAN</p>
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
                    {selectedCreditBreakdown.slice(0, 3).map(([label, credits]) => (
                      <span key={label}>{label} {formatCredits(credits)}</span>
                    ))}
                  </div>
                ) : (
                  <div className="credit-empty mt-4">选择课程后，这里会汇总学分</div>
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

        <section className="relative z-20 mt-4 rounded-[24px] border border-[#e1e5df] bg-white/94 p-4 shadow-[0_14px_40px_rgba(61,83,72,.07)] backdrop-blur sm:p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1.35fr)_repeat(4,minmax(150px,.62fr))_auto]">
            <label className="relative block">
              <span className="sr-only">搜索课程</span>
              <Search className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-slate-400" />
              <Input
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
                <NativeSelectOption value="全部学科/专业">全部学科/专业</NativeSelectOption>
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
                <NativeSelectOption value="全部类别">全部课程类别</NativeSelectOption>
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
                className={onlySelected ? 'filter-chip filter-chip-active' : 'filter-chip'}
                onClick={() => setOnlySelected((value) => !value)}
                variant="outline"
              >
                <Star className={onlySelected ? 'fill-current' : ''} /> 仅看已选
              </Button>
              <Button
                className={onlyNoConflict ? 'filter-chip filter-chip-active' : 'filter-chip'}
                onClick={() => setOnlyNoConflict((value) => !value)}
                variant="outline"
              >
                <Zap /> 不与已选冲突
              </Button>
              {conflictingIds.size > 0 && (
                <Badge className="h-8 rounded-lg bg-rose-50 px-3 text-rose-700" variant="secondary">
                  {conflictPairs.length} 组课程冲突
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="selection-credit-pill" aria-live="polite">
                <Sparkles />
                <span>已选总计</span>
                <strong>{formatCredits(selectedCredits)}</strong>
                <b>学分</b>
                <small>{selectedCourses.length} 门课</small>
              </div>
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button
                  className={`view-tab ${view === 'courses' ? 'view-tab-active' : ''}`}
                  onClick={() => setView('courses')}
                  type="button"
                >
                  <BookOpen /> 课程列表
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
                {conflictPairs.map(({ left, right, slots }) => (
                  <div className="conflict-row" key={`${left.id}-${right.id}`}>
                    <div className="conflict-courses">
                      <button onClick={() => setDetailCourse(left)} type="button">{left.name}</button>
                      <span>与</span>
                      <button onClick={() => setDetailCourse(right)} type="button">{right.name}</button>
                      <strong>冲突</strong>
                    </div>
                    <div className="conflict-slots">
                      {slots.map((slot, index) => (
                        <span key={`${formatConflictSlot(slot)}-${index}`}>
                          <Clock3 /> {formatConflictSlot(slot)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {view === 'courses' ? (
          <section className="py-7">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">COURSE RESULTS</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">
                  找到 {filteredCourses.length} 门课程
                </h2>
              </div>
              <p className="text-sm text-slate-500">
                已显示 {Math.min(visibleCount, filteredCourses.length)} / {filteredCourses.length}
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
                            <Badge className="bg-blue-50 text-blue-700" variant="secondary">
                              {course.category}
                            </Badge>
                            <Badge className="bg-emerald-50 text-emerald-700" variant="secondary">
                              {course.level}
                            </Badge>
                            <Badge className="bg-slate-100 text-slate-600" variant="secondary">
                              {formatCredits(course.credits)} 学分
                            </Badge>
                            {conflict && (
                              <Badge className="bg-rose-50 text-rose-700" variant="secondary">
                                时间冲突
                              </Badge>
                            )}
                          </div>
                          <button
                            className="text-left text-lg font-bold leading-snug tracking-tight text-slate-900 hover:text-blue-700"
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
                          aria-label={selected ? `移除${course.name}` : `选择${course.name}`}
                          className={`star-button ${selected ? 'star-button-selected' : ''}`}
                          onClick={() => toggleCourse(course.id)}
                          type="button"
                        >
                          <Star className={selected ? 'fill-current' : ''} />
                        </button>
                      </div>

                      <div className="my-4 h-px bg-slate-100" />
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
                        <span><ClipboardCheck /> {course.examMode || '考试方式待定'}</span>
                        <span><Presentation /> {course.teachingMode || '授课方式待定'}</span>
                        <span><Clock3 /> {course.hours || '学时待定'}</span>
                      </div>
                      {conflict && (
                        <div className="course-conflict-note">
                          <Zap />
                          <span>
                            与 {peers.map((peer) => peer.name).join('、')} 的上课时间冲突
                          </span>
                        </div>
                      )}
                      <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5">
                        <ScheduleLines schedules={course.schedules} />
                      </div>
                      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                        <span className="font-mono">{course.code}</span>
                        <span>
                          余量 {Math.max(0, course.capacity - course.enrolled)} / {course.capacity || '—'}
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
                <Button onClick={clearFilters} variant="outline">清空筛选</Button>
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
        ) : (
          <section className="py-7">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm text-slate-500">WEEKLY TIMETABLE</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">我的模拟课程表</h2>
                <p className="mt-1 text-sm text-slate-500">
                  共 {selectedCourses.length} 门课程 · {formatCredits(selectedCredits)} 学分
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                查看周次
                <NativeSelect
                  aria-label="查看周次"
                  className="min-w-28 [&>select]:h-10"
                  onChange={(event) => setWeek(Number(event.target.value))}
                  value={week}
                >
                    {Array.from({ length: 20 }, (_, index) => index + 1).map((value) => (
                      <NativeSelectOption key={value} value={value}>
                        第 {value} 周
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </label>
            </div>

            {selectedCourses.length ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                {currentWeekConflicts.size > 0 && (
                  <div className="mb-3 flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <Zap className="size-4" /> 本周有 {currentWeekConflicts.size} 门课程时间重叠，已用红色标出。
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
                    {Array.from({ length: 13 }, (_, index) => index + 1).map((period) => (
                      <div
                        className="timetable-period"
                        key={period}
                        style={{ gridColumn: 1, gridRow: period + 1 }}
                      >
                        <strong>{period}</strong>
                        <span>第 {period} 节</span>
                      </div>
                    ))}
                    {DAYS.flatMap((_, dayIndex) =>
                      Array.from({ length: 13 }, (_, index) => index + 1).map((period) => (
                        <div
                          className="timetable-cell"
                          key={`${dayIndex}-${period}`}
                          style={{ gridColumn: dayIndex + 2, gridRow: period + 1 }}
                        />
                      )),
                    )}
                    {selectedCourses.flatMap((course) =>
                      course.schedules
                        .filter((schedule) => schedule.weeks.includes(week))
                        .map((schedule, scheduleIndex) => {
                          const color = COURSE_COLORS[Number(course.id) % COURSE_COLORS.length];
                          const conflict = currentWeekConflicts.has(course.id);
                          return (
                            <button
                              className={`timetable-course ${conflict ? 'timetable-course-conflict' : ''}`}
                              key={`${course.id}-${scheduleIndex}`}
                              onClick={() => setDetailCourse(course)}
                              style={{
                                gridColumn: schedule.dayIndex + 2,
                                gridRow: `${schedule.start + 1} / ${schedule.end + 2}`,
                                backgroundColor: conflict ? '#ffe4e6' : color[0],
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
          <span>数据来源：文件夹内《2026年秋季学期课表 (3).xlsx》</span>
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
                  <Badge className="bg-blue-50 text-blue-700" variant="secondary">
                    {detailCourse.category}
                  </Badge>
                  <Badge variant="outline">{detailCourse.level}</Badge>
                </div>
                <SheetTitle className="text-2xl font-bold leading-tight">
                  {detailCourse.name}
                </SheetTitle>
                <SheetDescription>{detailCourse.englishName || detailCourse.code}</SheetDescription>
              </SheetHeader>
              <div className="space-y-6 p-6">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['课程编码', detailCourse.code],
                    ['学分 / 学时', `${formatCredits(detailCourse.credits)} / ${detailCourse.hours}`],
                    ['任课教师', detailCourse.teacher],
                    ['所属学科', detailCourse.subject],
                    ['开课院系', detailCourse.college],
                    ['考试方式', detailCourse.examMode],
                    ['授课方式', detailCourse.teachingMode],
                    ['选课人数', `${detailCourse.enrolled} / ${detailCourse.capacity || '—'}`],
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
                      <div className="schedule-detail" key={`${schedule.periodText}-${index}`}>
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
                  variant={selectedIds.includes(detailCourse.id) ? 'outline' : 'default'}
                >
                  <Star className={selectedIds.includes(detailCourse.id) ? 'fill-current' : ''} />
                  {selectedIds.includes(detailCourse.id) ? '从已选中移除' : '加入我的课表'}
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
