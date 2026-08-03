import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "material-symbols/outlined.css";
import "./globals.css";
import { ThemeProvider } from "@/shared/components/ThemeProvider";
import "@/lib/network/initOutboundProxy"; // Auto-initialize outbound proxy env
import "@/shared/services/bootstrap"; // Auto-run initializeApp (watchdog, auto-resume tunnel)
import { initConsoleLogCapture } from "@/lib/consoleLogBuffer";
import { RuntimeI18nProvider } from "@/i18n/RuntimeI18nProvider";

// Hook console immediately at module load time (server-side only, runs once)
initConsoleLogCapture();

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata = {
  title: "9Router - AI Infrastructure Management",
  description: "One endpoint for all your AI providers. Manage keys, monitor usage, and scale effortlessly.",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){document.documentElement.classList.add('fonts-loaded')})}else{document.documentElement.classList.add('fonts-loaded')};window.addEventListener('error',function(e){var m=(e&&e.message)||'';if(m.indexOf('ChunkLoadError')!==-1||m.indexOf('Loading chunk')!==-1){var l=sessionStorage.getItem('9r_chunk_reload')||0;if(Date.now()-l>15000){sessionStorage.setItem('9r_chunk_reload',Date.now());window.location.reload()}}},true);window.addEventListener('unhandledrejection',function(e){var r=(e&&e.reason)||{};var m=r.message||String(r||'');if(m.indexOf('ChunkLoadError')!==-1||m.indexOf('Loading chunk')!==-1){var l=sessionStorage.getItem('9r_chunk_reload')||0;if(Date.now()-l>15000){sessionStorage.setItem('9r_chunk_reload',Date.now());window.location.reload()}}});`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <RuntimeI18nProvider>
            {children}
          </RuntimeI18nProvider>
        </ThemeProvider>
        <GoogleAnalytics gaId={"G-LC959F603F"} />
      </body>
    </html>
  );
}
