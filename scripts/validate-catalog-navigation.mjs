import assert from 'node:assert/strict';
import {
  createCatalogNavigation,
  catalogNavigationReducer,
  matchesPlanScope,
} from '../app/catalog-navigation.ts';
let state = createCatalogNavigation('autumn');
state = catalogNavigationReducer(state, {
  type: 'patch',
  patch: {
    query: '光学',
    scope: 'core',
    onlyNoConflict: true,
    visibleCount: 48,
  },
});
state = catalogNavigationReducer(state, {
  type: 'patch',
  patch: { scrollY: 620 },
});
assert.equal(state.current.visibleCount, 48);
state = catalogNavigationReducer(state, { type: 'selected', scrollY: 630 });
assert.equal(state.current.onlySelected, true);
assert.equal(state.current.query, '光学');
state = catalogNavigationReducer(state, { type: 'browse' });
assert.equal(state.current.onlySelected, false);
assert.equal(state.restoreY, 630);
assert.equal(state.current.visibleCount, 48);
state = catalogNavigationReducer(state, {
  type: 'term',
  termId: 'spring',
  scrollY: 700,
});
assert.equal(state.current.query, '');
state = catalogNavigationReducer(state, {
  type: 'patch',
  patch: { query: '数学' },
});
state = catalogNavigationReducer(state, {
  type: 'term',
  termId: 'autumn',
  scrollY: 100,
});
assert.equal(state.current.query, '光学');
assert.equal(state.current.scope, 'core');
assert.equal(state.restoreY, 700);
state = catalogNavigationReducer(state, { type: 'reset' });
assert.equal(state.current.query, '');
assert.equal(state.current.scope, 'all');
assert.equal(state.terms.spring.query, '数学');
const plan = { coreCourses: ['核心'], professionalCourses: ['专业', '核心'] };
assert.equal(matchesPlanScope({ name: '核心' }, plan, 'core'), true);
assert.equal(matchesPlanScope({ name: '其他' }, plan, 'core'), false);
assert.equal(matchesPlanScope({ name: '专业' }, plan, 'professional'), true);
assert.equal(matchesPlanScope({ name: '其他' }, plan, 'all'), true);
console.log('目录导航回归通过：筛选保留、已选返回、学期隔离、分页与方案范围。');

state = catalogNavigationReducer(state, {
  type: 'patch',
  patch: { query: '原目录', visibleCount: 48 },
});
state = catalogNavigationReducer(state, {
  type: 'focus',
  scope: 'core',
  scrollY: 555,
});
assert.equal(state.current.query, '');
assert.equal(state.current.scope, 'core');
assert.equal(state.returnBrowse.query, '原目录');
state = catalogNavigationReducer(state, { type: 'return' });
assert.equal(state.current.query, '原目录');
assert.equal(state.current.visibleCount, 48);
assert.equal(state.restoreY, 555);
console.log('培养快捷入口返回原目录测试通过。');

state = catalogNavigationReducer(state, {
  type: 'focus',
  scope: 'professional',
  scrollY: 123,
});
state = catalogNavigationReducer(state, {
  type: 'term',
  termId: 'spring',
  scrollY: 0,
});
state = catalogNavigationReducer(state, {
  type: 'term',
  termId: 'autumn',
  scrollY: 0,
});
assert.equal(state.returnBrowse.query, '原目录');
state = catalogNavigationReducer(state, { type: 'return' });
assert.equal(state.current.query, '原目录');
console.log('学期间快捷入口返回状态保持通过。');
