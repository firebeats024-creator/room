import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "PG Hostel Manager - Smart Billing & Guest Management",
  description: "Streamlined PG hostel management with full-month billing, security deposits, electricity tracking, and manager overrides.",
  keywords: ["PG Hostel", "Hostel Management", "Billing", "Guest Management", "Security Deposit", "Rent Collection"],
  authors: [{ name: "PG Hostel Manager" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "PG Hostel Manager",
    description: "Smart billing & guest management for PG hostels",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PG Hostel Manager",
    description: "Smart billing & guest management for PG hostels",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
