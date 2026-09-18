import type { HistoricalRecord } from './credit-model';

export function validHistoryExtensions(record: { level?: unknown; lectureStatus?: unknown }) {
  return (record.level === undefined || typeof record.level === 'string') &&
    (record.lectureStatus === undefined || record.lectureStatus === 'attendance' || record.lectureStatus === 'recognized');
}

export function lectureKind(record: HistoricalRecord): 'hias' | 'frontier' | undefined {
  if (record.module === 'hias' || /HIAS讲堂|人文系列讲座/.test(record.courseName)) return 'hias';
  if (/科学前沿讲座/.test(record.courseName + record.category)) return 'frontier';
}

export function lectureAcademicYear(term: string): string | undefined {
  const range = term.match(/(20\d{2})\s*[-—–至]\s*(20\d{2})/);
  if (range && Number(range[2]) === Number(range[1]) + 1) return `${range[1]}-${range[2]}`;
  const year = term.match(/20\d{2}/)?.[0];
  if (!year || !/秋|春|夏|fall|spring|summer/i.test(term)) return;
  const start = Number(year) - (/春|夏|spring|summer/i.test(term) ? 1 : 0);
  return `${start}-${start + 1}`;
}

export function isAttendanceRecord(record: HistoricalRecord) {
  return !!lectureKind(record) && (record.lectureStatus === 'attendance' || record.hours !== undefined || record.attendanceCount !== undefined);
}

export function lectureGroups(records: HistoricalRecord[]) {
  const groups = new Map<string, { key: string; year?: string; kind: 'hias' | 'frontier'; ids: string[]; hours: number; recognizedHours: number; legacy: boolean }>();
  for (const record of records.filter(isAttendanceRecord)) {
    const kind = lectureKind(record)!;
    const year = lectureAcademicYear(record.term);
    // Unknown years cannot safely be pooled with one another.
    const key = `${kind}:${year ?? record.id}`;
    const group = groups.get(key) ?? { key, year, kind, ids: [], hours: 0, recognizedHours: 0, legacy: false };
    const hours = Math.max(0, record.hours ?? (record.attendanceCount ?? 0) * 2);
    group.ids.push(record.id);
    group.hours += hours;
    if (record.lectureStatus === 'recognized' && year) group.recognizedHours += hours;
    group.legacy ||= record.lectureStatus === undefined;
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({
    ...group,
    estimatedCredits: group.year ? Math.floor(group.hours / 20) : 0,
    recognizedCredits: Math.floor(group.recognizedHours / 20),
  }));
}

/** Derived view only: raw legacy hours and credits are never overwritten. */
export function recognizedLectureHistory(records: HistoricalRecord[]): HistoricalRecord[] {
  const nonAttendance = records.filter(record => !isAttendanceRecord(record));
  const counted = lectureGroups(records).flatMap(group => {
    if (!group.recognizedCredits) return [];
    const first = records.find(record => group.ids.includes(record.id))!;
    return [{ ...first, id: `lecture:${group.key}`, credits: group.recognizedCredits,
      category: group.kind === 'hias' ? '公共选修课' : '科学前沿讲座',
      courseCode: '', courseName: group.kind === 'hias' ? 'HIAS讲堂' : '科学前沿讲座',
      module: group.kind === 'hias' ? 'hias' as const : 'regular' as const,
      designation: 'non-degree' as const }];
  });
  return [...nonAttendance, ...counted];
}
