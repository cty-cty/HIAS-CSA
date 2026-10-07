export type PlanScope = 'all' | 'core' | 'professional';
export type CatalogBrowse = {
  query: string;
  college: string;
  subject: string;
  category: string;
  day: string;
  onlyNoConflict: boolean;
  onlySelected: boolean;
  scope: PlanScope;
  scrollY: number;
  visibleCount: number;
};
export type CatalogNavigation = {
  termId: string;
  current: CatalogBrowse;
  terms: Record<string, CatalogBrowse>;
  returnBrowse?: CatalogBrowse;
  returnTerms: Record<string, CatalogBrowse | undefined>;
  restoreY: number;
  revision: number;
};
export type CatalogAction =
  | { type: 'patch'; patch: Partial<CatalogBrowse> }
  | { type: 'selected'; scrollY: number }
  | { type: 'browse' }
  | { type: 'term'; termId: string; scrollY: number }
  | { type: 'reset' }
  | { type: 'focus'; scope: PlanScope; scrollY: number }
  | { type: 'return' };
const defaults = (): CatalogBrowse => ({
  query: '',
  college: '全部院系',
  subject: '全部学科/专业',
  category: '全部类别',
  day: '全部星期',
  onlyNoConflict: false,
  onlySelected: false,
  scope: 'all',
  scrollY: 0,
  visibleCount: 24,
});
export function createCatalogNavigation(termId: string): CatalogNavigation {
  return {
    termId,
    current: defaults(),
    terms: {},
    returnTerms: {},
    restoreY: 0,
    revision: 0,
  };
}
export function catalogNavigationReducer(
  state: CatalogNavigation,
  action: CatalogAction,
): CatalogNavigation {
  if (action.type === 'patch') {
    const filtersChanged = [
      'query',
      'college',
      'subject',
      'category',
      'day',
      'onlyNoConflict',
      'scope',
    ].some((key) => key in action.patch);
    return {
      ...state,
      current: {
        ...state.current,
        ...(filtersChanged ? { visibleCount: 24 } : {}),
        ...action.patch,
      },
    };
  }
  if (action.type === 'focus')
    return {
      ...state,
      returnBrowse: state.returnBrowse ?? {
        ...state.current,
        scrollY: state.current.onlySelected
          ? state.current.scrollY
          : action.scrollY,
      },
      current: { ...defaults(), scope: action.scope },
      restoreY: 0,
      revision: state.revision + 1,
    };
  if (action.type === 'return')
    return state.returnBrowse
      ? {
          ...state,
          current: state.returnBrowse,
          returnBrowse: undefined,
          restoreY: state.returnBrowse.scrollY,
          revision: state.revision + 1,
        }
      : state;
  if (action.type === 'reset')
    return {
      ...state,
      current: defaults(),
      returnBrowse: undefined,
      restoreY: 0,
      revision: state.revision + 1,
    };
  if (action.type === 'selected')
    return {
      ...state,
      current: {
        ...state.current,
        onlySelected: true,
        scrollY: state.current.onlySelected
          ? state.current.scrollY
          : action.scrollY,
      },
      restoreY: 0,
      revision: state.revision + 1,
    };
  if (action.type === 'browse')
    return {
      ...state,
      current: { ...state.current, onlySelected: false },
      restoreY: state.current.scrollY,
      revision: state.revision + 1,
    };
  const previous = {
    ...state.current,
    scrollY: state.current.onlySelected
      ? state.current.scrollY
      : action.scrollY,
  };
  const current = state.terms[action.termId] ?? defaults();
  return {
    ...state,
    termId: action.termId,
    returnBrowse: state.returnTerms[action.termId],
    returnTerms: { ...state.returnTerms, [state.termId]: state.returnBrowse },
    current,
    terms: { ...state.terms, [state.termId]: previous },
    restoreY: current.onlySelected ? 0 : current.scrollY,
    revision: state.revision + 1,
  };
}
export function matchesPlanScope(
  course: { name: string },
  plan: { coreCourses: string[]; professionalCourses: string[] },
  scope: PlanScope,
) {
  return (
    scope === 'all' ||
    (scope === 'core' ? plan.coreCourses : plan.professionalCourses).includes(
      course.name,
    )
  );
}
