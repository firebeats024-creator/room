import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Room Rent - Smart Billing & Guest Management",
  description: "Streamlined room rent management with full-month billing, security deposits, electricity tracking, and manager overrides.",
  keywords: ["Room Rent", "Rent Management", "Billing", "Guest Management", "Security Deposit", "Rent Collection"],
  authors: [{ name: "Room Rent" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Room Rent",
    description: "Smart billing & guest management for room rent",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Room Rent",
    description: "Smart billing & guest management for room rent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
