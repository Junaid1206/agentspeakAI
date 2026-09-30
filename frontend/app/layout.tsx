import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentSpeak | Calling Operations",
  description: "Admin console for AI-powered two-way calling campaigns.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
