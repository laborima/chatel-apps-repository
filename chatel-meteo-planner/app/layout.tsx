import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Châtel Météo Planner",
  description: "Planificateur météo pour sports nautiques à Châtelaillon-Plage",
  keywords: ["météo", "windsurf", "wingfoil", "voile", "Châtelaillon-Plage", "sports nautiques"],
  authors: [{ name: "Châtel Météo Planner Team" }],
  manifest: "/chatel-apps-repository/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Châtel Météo Planner",
  },
  icons: {
    icon: [
      { url: "/chatel-apps-repository/icons/android/android-launchericon-192-192.png", sizes: "192x192", type: "image/png" },
      { url: "/chatel-apps-repository/icons/android/android-launchericon-48-48.png", sizes: "48x48", type: "image/png" },
      { url: "/chatel-apps-repository/icons/android/android-launchericon-72-72.png", sizes: "72x72", type: "image/png" },
      { url: "/chatel-apps-repository/icons/android/android-launchericon-96-96.png", sizes: "96x96", type: "image/png" },
      { url: "/chatel-apps-repository/icons/android/android-launchericon-144-144.png", sizes: "144x144", type: "image/png" },
      { url: "/chatel-apps-repository/icons/android/android-launchericon-512-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [
      { url: "/chatel-apps-repository/icons/ios/180.png", sizes: "180x180", type: "image/png" }
    ]
  }
};

export const viewport: Viewport = {
  themeColor: "#0066cc",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="manifest" href="/chatel-apps-repository/manifest.json" />
        <meta name="theme-color" content="#0066cc" />
        <link rel="apple-touch-icon" href="/chatel-apps-repository/icons/ios/180.png" />
        <link rel="icon" type="image/png" href="/chatel-apps-repository/icons/android/android-launchericon-192-192.png" />
        <link rel="shortcut icon" href="/chatel-apps-repository/icons/android/android-launchericon-192-192.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <script src="/chatel-apps-repository/register-sw.js" />
      </body>
    </html>
  );
}
