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
  title: "AppForge — LLM Application Compiler",
  description: "Production-grade AI compiler that transforms natural language product descriptions into validated, executable application schemas through a 6-stage pipeline.",
  keywords: ["AppForge", "LLM Compiler", "AI", "Schema Generation", "Next.js", "TypeScript"],
  authors: [{ name: "AppForge" }],
  openGraph: {
    title: "AppForge — LLM Application Compiler",
    description: "Production-grade AI compiler: natural language → validated application schemas",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AppForge — LLM Application Compiler",
    description: "Production-grade AI compiler: natural language → validated application schemas",
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
