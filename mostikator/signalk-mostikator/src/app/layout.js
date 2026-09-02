import "./globals.css";
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration";

export const metadata = {
  title: "Mostikator – Le moustique a tort",
  description: "Détection de moustiques ESP32-P4 et tourelle – L'Empire contre-attaque",
  icons: {
    icon: [
      { url: "./favicon.ico", sizes: "48x48" },
      { url: "./icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "./icons/icon-180x180.png",
  },
  manifest: "./manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mostikator",
  },
};

export const viewport = {
  themeColor: "#0b0f14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="antialiased">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
