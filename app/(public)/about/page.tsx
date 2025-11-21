import type { SVGProps } from "react";

export const metadata = {
  title: "About Us — Plex Courses",
  description:
    "Learn about our mission to empower students with practical digital marketing skills for a successful career. Meet the team dedicated to your future.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 antialiased">
      {/* About Header */}
      <section id="about" className="mx-auto max-w-4xl px-4 py-12 text-center scroll-mt-20 md:py-16">
        <h1 className="text-4xl font-black tracking-tight md:text-6xl">
          Empowering the Next Generation of Digital Leaders
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
          We are a dedicated team of digital marketing experts and educators passionate about bridging the gap between ambition and opportunity for students across Nepal.
        </p>
      </section>

      {/* Our Story */}
      <section className="mx-auto max-w-6xl px-4 pb-10 md:pb-12">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <div className="order-2 md:order-1">
            <h2 className="text-2xl font-extrabold md:text-3xl">Our Story</h2>
            <p className="mt-3 max-w-prose text-base leading-7 text-slate-700">
              Plex Courses was founded with a simple yet powerful belief: every student deserves access to high-quality, practical education that leads to a real career. We saw a growing demand for digital marketing professionals but a lack of accessible training that taught the necessary real-world skills. Our mission is to fill that void.
            </p>
          </div>
          <div className="order-1 rounded-2xl bg-sky-50 p-8 ring-1 ring-sky-100 md:order-2">
            <div className="flex h-40 items-center justify-center rounded-lg bg-white/60 ring-1 ring-white">
              <CapIcon className="h-16 w-16 text-sky-600" />
            </div>
          </div>
        </div>
      </section>

      {/* Our Core Values */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
          <header className="mx-auto max-w-3xl text-center">
            <h3 className="text-2xl font-extrabold md:text-3xl">Our Core Values</h3>
            <p className="mx-auto mt-2 max-w-2xl text-base text-slate-600">
              These principles guide everything we do, from curriculum design to student support, ensuring we deliver an education that truly matters.
            </p>
          </header>

          <div className="mx-auto mt-10 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <ValueCard icon={<CareerIcon className="h-6 w-6" />} title="Career-Focused" />
            <ValueCard icon={<SkillsIcon className="h-6 w-6" />} title="Practical Skills" />
            <ValueCard icon={<SuccessIcon className="h-6 w-6" />} title="Student Success" />
          </div>
        </div>
      </section>

     
    </main>
  );
}

/* ================== Components ================== */
function ValueCard({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="rounded-xl border bg-white p-6 text-center shadow-sm ring-1 ring-slate-100 transition hover:shadow-lg">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-700 ring-1 ring-sky-200">
        {icon}
      </div>
      <h4 className="mt-4 font-semibold text-slate-900">{title}</h4>
    </div>
  );
}

function TeamCard({ avatar, name, role, accent = "sky" }: { avatar: React.ReactNode; name: string; role: string; accent?: "sky" | "pink" | "amber" }) {
  const bg = accent === "pink" ? "bg-pink-50 ring-pink-100" : accent === "amber" ? "bg-amber-50 ring-amber-100" : "bg-sky-50 ring-sky-100";
  const text = accent === "pink" ? "text-pink-600" : accent === "amber" ? "text-amber-600" : "text-sky-600";
  return (
    <div className="text-center">
      <div className={`mx-auto inline-flex items-center justify-center rounded-full ${bg} p-2 ring-1`}>
        {avatar}
      </div>
      <h4 className="mt-4 text-base font-semibold text-slate-900">{name}</h4>
      <p className={`mt-1 text-sm font-medium ${text}`}>{role}</p>
    </div>
  );
}

/* ================== Icons ================== */
function CapIcon(props: SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" aria-hidden fill="currentColor" {...props}><path d="M12 3L2 7l10 4 10-4-10-4z" /><path d="M4 10v3c0 2.2 3.6 4 8 4s8-1.8 8-4v-3l-8 3-8-3z" opacity=".5" /><path d="M19 12v5l2 1v-6h-2z" opacity=".5" /></svg>); }
function CareerIcon(props: SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" aria-hidden fill="currentColor" {...props}><path d="M10 12l-6 4.5V9l6 3z" /><path d="M20 13.5V9l-6 3 6 1.5z" opacity=".5" /><path d="M10 21v-5l-6-4v5l6 4z" /><path d="M20 18v-5l-6 4v5l6-4z" opacity=".5" /><path d="M12 3L2 7.5l10 4.5 10-4.5L12 3z" /></svg>); }
function SkillsIcon(props: SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" aria-hidden fill="currentColor" {...props}><path d="M9 12a3 3 0 100-6 3 3 0 000 6z" /><path d="M13 3h4a2 2 0 012 2v4a2 2 0 01-2 2h-4a2 2 0 01-2-2V5a2 2 0 012-2z" opacity=".5" /><path d="M5 13h4a2 2 0 012 2v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4a2 2 0 012-2z" opacity=".5" /><path d="M15 13a2 2 0 012-2h2a2 2 0 012 2v6a2 2 0 01-2 2h-2a2 2 0 01-2-2v-6z" /></svg>); }
function SuccessIcon(props: SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 24 24" aria-hidden fill="currentColor" {...props}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>); }
function AvatarA(props: SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 80 80" aria-hidden {...props}><circle cx="40" cy="40" r="40" fill="#FCE7F3" /><circle cx="40" cy="34" r="12" fill="#FED7AA" /><rect x="22" y="48" width="36" height="18" rx="9" fill="#FDBA74" /><path d="M28 30c2-6 10-10 18-6 4 2 6 6 6 10-8-4-18-5-24-4z" fill="#DB2777" /></svg>); }
function AvatarB(props: SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 80 80" aria-hidden {...props}><circle cx="40" cy="40" r="40" fill="#E0F2FE" /><circle cx="40" cy="34" r="12" fill="#FCD34D" /><rect x="22" y="48" width="36" height="18" rx="9" fill="#FBBF24" /><path d="M28 28c4-6 16-6 20 0 1 2 2 4 2 7-8-3-14-3-22 0 0-3 0-5 0-7z" fill="#0EA5E9" /></svg>); }
function AvatarC(props: SVGProps<SVGSVGElement>) { return (<svg viewBox="0 0 80 80" aria-hidden {...props}><circle cx="40" cy="40" r="40" fill="#FEF3C7" /><circle cx="40" cy="34" r="12" fill="#FCA5A5" /><rect x="22" y="48" width="36" height="18" rx="9" fill="#F87171" /><path d="M26 32c3-7 16-9 22-3 2 2 3 4 3 7-8-4-17-4-25-4z" fill="#F59E0B" /></svg>); }