// Historical filename retained. Read-only audit: never regenerate the dataset or
// downgrade newly imported formal sections to planned-course placeholders.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const courses = JSON.parse(await readFile(new URL('../app/courses-spring.json', import.meta.url), 'utf8'));
assert.equal(new Set(courses.map((course) => course.id)).size, courses.length, '课程内部ID必须唯一');
for (const course of courses) {
  const official = course.dataStatus === 'official_schedule' || course.scheduleStatus === 'confirmed';
  if (official) continue;
  assert.ok(course.scheduleStatus === 'planned' || course.dataStatus === 'planned_course', `${course.name}缺少来源状态`);
  assert.equal(course.schedules?.length ?? 0, 0, `${course.name}计划课程不应伪造排课`);
  assert.equal(course.capacity, null, `${course.name}计划名额应保持未知`);
  assert.equal(course.enrolled, null, `${course.name}计划人数应保持未知`);
  assert.ok(!/^SP\d/i.test(course.officialCode || ''), '内部ID不能充当正式编码');
}
console.log(`只读审计通过：${courses.length} 条春季数据，未写入或重新生成任何课程。`);
