import { coursesShareIdentity, designationLookupKey, getCourseDesignation, normalizeCourseCode, type CourseDesignation, type CourseLike } from './credit-model';

function sectionCode(course: CourseLike) {
  const code = (course.officialCode || course.code).trim().toUpperCase();
  return normalizeCourseCode(code) ? code : '';
}

export function isPlannedCourse(course: Pick<CourseLike, 'scheduleStatus' | 'dataStatus'>) {
  // Explicit official status also upgrades old-format placeholders.
  if (course.dataStatus === 'official_schedule' || course.scheduleStatus === 'confirmed') return false;
  return course.dataStatus === 'planned_course' || course.scheduleStatus === 'planned';
}

/** Keep formal sections distinct; only replace a planned learning-course placeholder. */
export function mergeCourseRows<T extends CourseLike>(courses: T[]): T[] {
  const normalized = courses.map((course) => ({ ...course,
    scheduleStatus: isPlannedCourse(course) ? 'planned' as const : 'confirmed' as const,
    dataStatus: isPlannedCourse(course) ? 'planned_course' as const : 'official_schedule' as const,
  }));
  const result: T[] = [];
  for (const course of normalized) {
    if (isPlannedCourse(course) && normalized.some((other) => !isPlannedCourse(other) && coursesShareIdentity(other, course))) continue;
    const duplicate = result.findIndex((other) => isPlannedCourse(course)
      ? isPlannedCourse(other) && coursesShareIdentity(course, other)
      : !isPlannedCourse(other) && (other.id === course.id || (!!sectionCode(course) && sectionCode(other) === sectionCode(course))));
    if (duplicate < 0) result.push(course);
    else result[duplicate] = course;
  }
  return result;
}

/** Partial updates retain unmentioned data and user selections; never silently choose all sections. */
export function reconcileCourseUpdate<T extends CourseLike>(previous: T[], incoming: T[], selectedIds: string[], designations: Record<string, CourseDesignation>) {
  const courses = mergeCourseRows([...previous, ...incoming]);
  const nextDesignations = { ...designations };
  const retainedUnmatched: string[] = [];
  const sectionChoices: string[] = [];
  const nextSelected = selectedIds.map((id) => {
    const old = previous.find((course) => course.id === id);
    if (!old) { retainedUnmatched.push(id); return id; }
    // Only surviving rows may receive a selection: lower-priority planned imports
    // must never redirect a selected formal section to a discarded placeholder.
    const survivingIncoming = incoming.map((row) => courses.find((course) => course.id === row.id)).filter((row): row is T => !!row);
    const exact = survivingIncoming.find((course) => course.id === id || (!!old.code && old.code === course.code));
    const matches = survivingIncoming.filter((course) => coursesShareIdentity(course, old));
    const replacement = exact ?? matches[0];
    if (!exact && matches.length > 1) sectionChoices.push(old.name + ' → ' + (replacement.code || replacement.id));
    if (!replacement) {
      if (!courses.some((course) => course.id === id)) courses.push(old);
      retainedUnmatched.push(old.name);
      return id;
    }
    nextDesignations[designationLookupKey(replacement)] = getCourseDesignation(old, designations);
    return replacement.id;
  });
  return { courses, selectedIds: [...new Set(nextSelected)], designations: nextDesignations, retainedUnmatched, sectionChoices };
}
