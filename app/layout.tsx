import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '2026 秋季学期选课助手',
  description: '基于课程 Excel 数据制作的课程筛选、收藏、课表模拟与冲突检测工具。',
  openGraph: {
    title: '2026 秋季学期选课助手',
    description: '筛选课程、收藏方案、按周查看课表，并自动识别时间冲突。',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: '2026 秋季学期选课助手',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '2026 秋季学期选课助手',
    description: '筛选课程、收藏方案、按周查看课表，并自动识别时间冲突。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
