import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Time Assets",
  description: "Turn your time into rewards with simple task previews.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-time-background antialiased">
        {children}
      </body>
    </html>
  );
}
