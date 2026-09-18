import type { CreditEntry } from './credit-model';

export function CreditDetails({ label, entries, termFor }: { label: string; entries: CreditEntry[]; termFor: (entry: CreditEntry) => string }) {
  const type = ({ '公共必修学位课': 'publicRequiredDegree', '专业学位课': 'professionalDegree', '专业选修课': 'professionalElective', '普通公共选修课': 'publicElective', '公共必修非学位课': 'publicRequiredNonDegree' } as Record<string,string>)[label];
  const rows = entries.filter(e => label === '创新创业课' ? e.innovation
    : label === '专业学位课' ? e.requirementType === type || e.supplemental
    : e.requirementType === type && (label !== '普通公共选修课' || !e.innovation));
  const counted = rows.filter(entry => !entry.supplemental);
  const sum = (origin: CreditEntry['origin']) => counted.filter(entry => entry.origin === origin).reduce((total, entry) => total + entry.course.credits, 0);
  return <details className="mt-2 text-sm">
    <summary className="cursor-pointer text-blue-800">核对{label}明细（{rows.length}项）</summary>
    <p className="mt-2 text-xs leading-5 text-slate-600">已修 {sum('history')} + 预选/计划 {sum('planned')} + 免修 {sum('exemption')} = 预计 {counted.reduce((total, entry) => total + entry.course.credits, 0)} 学分。预选不等于已修。</p>
    <ul className="mt-3 space-y-3">
      {rows.map((entry, index) => <li key={`${entry.origin}-${entry.course.id}-${index}`} className="border-t pt-2 break-words">
        <strong className="text-sm">{entry.course.name || '历史分类学分记录'}</strong>
        <p>{entry.course.credits} 学分 · {entry.origin === 'history' ? '历史已修（用户登记）' : entry.origin === 'exemption' ? '免修资格' : '已选 / 计划（未完成）'}</p>
        <p className="text-xs text-slate-500">{termFor(entry)}</p>
        <p className="text-xs leading-5 text-slate-500">{entry.reason}</p>
        {entry.supplemental && <p className="text-xs text-amber-700">非本专业补充：不计入上方已确认专业学位学分，不替代本专业核心与专业门数要求。</p>}
      </li>)}
      {!rows.length && <li className="text-slate-500">暂无计入该分类的课程。</li>}
    </ul>
  </details>;
}
