import type { Metadata } from 'next';
import './globals.css';
import OfflineRegistration from './offline-registration';

export const metadata: Metadata = {
  metadataBase: new URL(
    'https://ucas-fall-course-assistant.qwepoi147258369.chatgpt.site',
  ),
  title: '国科大杭州高等研究院 · 2026 秋季预选课助手',
  applicationName: '杭高院预选课助手',
  description:
    '面向国科大杭州高等研究院研究生的秋季预选课辅助工具，支持课程筛选、培养方案核对、课表模拟、考试压力分析与冲突检测。',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.svg',
  },
  appleWebApp: {
    capable: true,
    title: '杭高院选课',
    statusBarStyle: 'default',
  },
  openGraph: {
    title: '国科大杭州高等研究院预选课助手',
    description: '2026 秋季课程筛选、培养方案核对、按周排课与冲突检测。',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: '国科大杭州高等研究院 2026 秋季预选课助手',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '国科大杭州高等研究院预选课助手',
    description: '2026 秋季课程筛选、培养方案核对、按周排课与冲突检测。',
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
      <body>
        {children}
        <OfflineRegistration />
      </body>
    </html>
  );
}
