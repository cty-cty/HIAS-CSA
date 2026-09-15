// User-reported correction, 2026-09-11. Only the known old value is eligible;
// never overwrite a different room in a newer imported timetable.
export function correctKnownRooms<T extends { code: string; officialCode?: string | null; schedules: { room: string }[] }>(termId: string, courses: T[]) {
  const changes: { code: string; from: string; to: string; count: number }[] = [];
  const updated = courses.map((course) => {
    if (termId !== '2026-fall' || (course.officialCode || course.code) !== '280216085408P2005') return course;
    const count = course.schedules.filter((schedule) => schedule.room === '13-110').length;
    if (!count) return course;
    changes.push({ code: course.code, from: '13-110', to: '13-312', count });
    return { ...course, schedules: course.schedules.map((schedule) => schedule.room === '13-110' ? { ...schedule, room: '13-312' } : schedule) };
  });
  return { courses: updated, changes };
}
