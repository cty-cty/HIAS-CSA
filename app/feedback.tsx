'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

// Owner-provided shared workbook. Visibility/editing are controlled in WPS.
const FEEDBACK_FORM_URL = 'https://www.kdocs.cn/l/cfrtywmK8W9d';

export type FeedbackContext = { term: string; courseName?: string; courseCode?: string };

export function FeedbackDialog({ context, onClose }: { context: FeedbackContext | null; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [source, setSource] = useState('');
  const [notice, setNotice] = useState('');
  const content = [
    context?.courseName ? '类型：课程纠错' : '类型：功能建议',
    `学期：${context?.term ?? ''}`,
    ...(context?.courseName ? [`课程：${context.courseName}`, `课程编码：${context.courseCode || '未公布'}`] : []),
    `问题或建议：${message.trim()}`,
    `通知或材料来源：${source.trim() || '未提供'}`,
  ].join('\n');

  return <Dialog open={context !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{context?.courseName ? '反馈课程信息' : '意见反馈'}</DialogTitle>
        <DialogDescription>填写并复制反馈内容，再打开金山文档在线表格，粘贴到新的反馈记录中。请保留其他人的记录。</DialogDescription>
      </DialogHeader>
      <p className="rounded-lg bg-slate-50 p-3 text-sm">{context?.term}{context?.courseName && <> · {context.courseName}<br />课程编码：{context.courseCode || '未公布'}</>}</p>
      <label className="grid gap-2 text-sm">问题描述或功能建议
        <textarea className="min-h-28 rounded-lg border p-3" maxLength={2000} value={message} onChange={(event) => { setMessage(event.target.value); setNotice(''); }} placeholder="例如：课程教室已调整，希望更正。请说明当前信息和正确内容。" />
      </label>
      <label className="grid gap-2 text-sm">通知或材料来源（选填）
        <input className="rounded-lg border p-3" maxLength={500} value={source} onChange={(event) => { setSource(event.target.value); setNotice(''); }} placeholder="学校通知链接、通知日期或材料名称" />
      </label>
      <details className="text-sm"><summary className="cursor-pointer">预览反馈内容</summary><pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans">{content}</pre></details>
      <p className="text-sm text-amber-700">这是共享表格，内容可能被其他访问者看到。请勿填写密码、学号、联系方式或个人课表。</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!message.trim()} onClick={async () => {
          try { await navigator.clipboard.writeText(content); setNotice('已复制，尚未写入表格。请打开在线反馈表格，粘贴后确认金山文档已保存。'); }
          catch { setNotice('无法访问剪贴板，请展开“预览反馈内容”手动复制。'); }
        }}>复制反馈内容</Button>
        <a className="inline-flex items-center rounded-lg border px-4 py-2 text-sm" href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer">打开在线反馈表格（新窗口）</a>
      </div>
      {notice && <output className="text-sm text-slate-600">{notice}</output>}
      <p className="text-xs leading-5 text-slate-500">关闭窗口将清除本次草稿，请先复制保存。本站不会自动将内容写入表格；请以金山文档保存状态为准。如需登录或申请编辑权限，请按金山文档页面提示操作。</p>
    </DialogContent>
  </Dialog>;
}
