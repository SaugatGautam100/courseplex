import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen p-8 text-center text-slate-500">Loading...</div>}>
      <LoginClient />
    </Suspense>
  );
}