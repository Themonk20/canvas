import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Canvas App",
  description: "Professional canvas application with text tools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
