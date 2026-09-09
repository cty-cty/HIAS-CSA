import type { CourseCodeCategory, CourseLike } from './credit-model';

export type SourceStatus = 'consistent' | 'conflict';

export type SourceConflict = {
  field: string;
  sourceA: string;
  valueA: string;
  sourceB: string;
  valueB: string;
  resolvedSource: 'officialCode' | 'category' | 'conflict';
  resolvedValue: string;
};

export type CourseSourceReconciliation = {
  codeClassification: CourseCodeCategory;
  categoryClassification: CourseCodeCategory;
  sourceStatus: SourceStatus;
  resolvedSource: 'officialCode' | 'category' | 'none' | 'conflict';
  resolvedValue: CourseCodeCategory;
  sourceConflict?: SourceConflict;
};

const CATEGORY_CLASSIFICATION: Record<string, CourseCodeCategory> = {
  学科核心课: 'subject-core',
  专业核心课: 'professional-core',
  核心课: 'subject-core',
  专业课: 'professional',
  研讨课: 'seminar',
  实验课: 'lab',
  实践课: 'practice',
  科学前沿讲座: 'frontier-lecture',
  公共必修课: 'public-required',
  公共选修课: 'public-elective',
};

function codeClassification(code: string | null | undefined): CourseCodeCategory {
  const normalized = (code ?? '').trim().toUpperCase().replace(/-\d+$/, '');
  if (!normalized || /^SP(?:2027-)?\d+$/.test(normalized)) return 'unknown';
  const marker = normalized[13] ?? '';
  return ({
    '1': 'subject-core',
    '2': 'professional-core',
    '3': 'professional',
    '4': 'seminar',
    '5': 'lab',
    '6': 'practice',
    '7': 'frontier-lecture',
    B: 'public-required',
    X: 'public-elective',
  } as Record<string, CourseCodeCategory>)[marker] ?? 'unknown';
}

export function getCategoryClassification(category: string | undefined) {
  return CATEGORY_CLASSIFICATION[category?.trim() ?? ''] ?? 'unknown';
}

/**
 * Reconciles the two official-classification signals without deciding whether
 * the course belongs to a student's programme. Business rules consume this
 * result and turn a conflict into verification rather than silently choosing.
 */
export function reconcileCourseSources(
  course: Pick<CourseLike, 'code' | 'officialCode' | 'category'>,
): CourseSourceReconciliation {
  const code = codeClassification(course.officialCode || course.code);
  const category = getCategoryClassification(course.category);
  if (code !== 'unknown' && category !== 'unknown' && code !== category) {
    const sourceConflict: SourceConflict = {
      field: 'course classification',
      sourceA: 'officialCode / 课程编号第14位',
      valueA: code,
      sourceB: 'category / 课程类别字段',
      valueB: category,
      resolvedSource: 'conflict',
      resolvedValue: 'unknown',
    };
    return {
      codeClassification: code,
      categoryClassification: category,
      sourceStatus: 'conflict',
      resolvedSource: 'conflict',
      resolvedValue: 'unknown',
      sourceConflict,
    };
  }
  if (code !== 'unknown') {
    return {
      codeClassification: code,
      categoryClassification: category,
      sourceStatus: 'consistent',
      resolvedSource: 'officialCode',
      resolvedValue: code,
    };
  }
  if (category !== 'unknown') {
    return {
      codeClassification: code,
      categoryClassification: category,
      sourceStatus: 'consistent',
      resolvedSource: 'category',
      resolvedValue: category,
    };
  }
  return {
    codeClassification: code,
    categoryClassification: category,
    sourceStatus: 'consistent',
    resolvedSource: 'none',
    resolvedValue: 'unknown',
  };
}
