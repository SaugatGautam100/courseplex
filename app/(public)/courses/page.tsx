import { Suspense } from "react";
import CoursesPageClient from "./CoursesPageClient";

// Avoid SSG bailout issues for this route during build
export const dynamic = "force-dynamic";
// Alternatively, either also works:
// export const revalidate = 0;

function CoursesPageInner({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const initialQuery = typeof searchParams.search === "string" ? searchParams.search : "";

  return <CoursesPageClient initialQuery={initialQuery} />;
}

export default function CoursesPage(props: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return (
    <Suspense fallback={<div className="p-6">Loading courses…</div>}>
      <CoursesPageInner {...props} />
    </Suspense>
  );
}