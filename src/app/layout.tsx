import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DentaClinic",
    template: "%s | DentaClinic",
  },
  description: "Gestion de cabinet dentaire",
  icons: {
    icon: "/dentaclinic-icon.svg",
    shortcut: "/dentaclinic-icon.svg",
    apple: "/dentaclinic-icon.svg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body><I18nProvider>{children}</I18nProvider></body>
    </html>
  );
}
