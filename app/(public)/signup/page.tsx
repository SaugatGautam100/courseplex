import { Suspense } from "react";
import SignupClient from "./SignUpClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen p-8 text-center text-slate-500">Loading...</div>}>
      <SignupClient />
    </Suspense>
  );
}