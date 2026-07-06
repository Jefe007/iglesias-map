import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import RegisterSW from "@/components/RegisterSW";
import Toaster from "@/components/Toaster";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "La Guaira Churches — Distribution Centers",
  description: "Map of churches and distribution centers in La Guaira, Venezuela",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "La Guaira Network",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1b2a4a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full`}>
        <RegisterSW />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
