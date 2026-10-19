import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "PartScout — Every part. Every source.",
  description:
    "From idea to evidence-backed bill of materials. An open-source sourcing agent for things worth building.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
