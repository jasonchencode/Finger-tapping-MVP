import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analysis | QMIND",
};

export default function AnalysisLayout({
  children,
}: LayoutProps<"/analysis">) {
  return children;
}
