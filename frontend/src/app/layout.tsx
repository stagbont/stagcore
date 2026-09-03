import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const notionInter = Inter({
  variable: "--font-notioninter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const lyonText = Source_Serif_4({
  variable: "--font-lyon-text",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Stagcore",
  description: "Inventory and POS for gadget shops",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${notionInter.variable} ${lyonText.variable} h-full antialiased`}
    >
      <script
        dangerouslySetInnerHTML={{
          __html:
            "(function(){try{var t=localStorage.getItem('stagcore-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();",
        }}
      />
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
