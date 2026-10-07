# HIAS-CSA 工作台实施计划

> For agentic workers: 使用 executing-plans 在当前会话实施，完成后独立审查。

Goal：落实已批准的三项目标并提供本地预览。
Architecture：React 工作台使用原规则结果；浏览导航独立 reducer，课表和方案内容复用，不重做数据层。
Tech Stack：React 19 / TypeScript / Base UI / Lucide / CSS。
Spec：docs/design/2026-10-07-HIAS-CSA-网页与使用流程设计方案.md

## Global Constraints
不改课程数据、规则引擎、存储键、备份和 CSV；不发布；沿用离线构建。

## Review Focus
跨学期状态串扰；已选被筛选隐藏；排课未知误标安全；培养累计冒充学期完成；抽屉和长名称在手机溢出。

### Task 1 浏览导航
Files：app/catalog-navigation.ts，scripts/validate-catalog-navigation.mjs，app/course-explorer.tsx。
Interfaces：导航 reducer 接收 patch/selected/browse/term/reset；每学期独立恢复搜索、范围、滚动与展开页数。
- [x] 写已选绕开/返回、学期隔离与重置测试并看失败。
- [x] 实现 reducer 并接入目录及快捷培养范围，测试通过。

### Task 2 结构和视觉
Files：app/course-explorer.tsx，app/workspace-polish.css，app/workspace-redesign.css，app/timetable-view.tsx。
- [x] 左导航、列表/卡片切换、排课展开、右侧方案缺口和有效学分。
- [x] 复用课表组件，课程/课表切换；手机底栏与方案 Sheet。
- [x] 统一视觉、响应式、状态与减少动效。

### Task 3 推荐与数据解释
Files：app/course-explorer.tsx，app/workspace-redesign.css。
- [x] 推荐比较表，理由渐进展开，保留确认/撤销。
- [x] 原数据工具分区保留，未知安排与存储错误提示不丢失。

### Task 4 验证交付
- [x] 类型/lint、三组规则与导航回归、离线与生产构建。
- [ ] 浏览器批量桌面/手机检查，受权限阻挡则准确说明。
- [x] 独立代码审查，修正重要问题。
- [x] 更新主文档与本地预览，不推送。


实施裁定：课表和方案在 CourseExplorer 内用同一 JSX 变量复用，未新建 timetable-view.tsx，避免迁移现有 Course 私有类型与整套事件处理；计算来源保持单一。本轮在当前工作区执行，不创建另一份预览状态。用户明确授权复核修订后直接实施，未增加额外确认。

视觉与交互验收未完成：CUA 明确报告 saved permission 阻止 localhost。没有使用其他浏览器或协议绕过，暂未勾选浏览器验收项。
