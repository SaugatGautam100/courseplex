import type { SVGProps } from "react";

export const metadata = {
  title: "Get in Touch — CourseCraft",
  description:
    "We’re here to help you on your course creation journey. Reach out with any questions or feedback.",
};

export default function Page() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 antialiased">
      <section className="mx-auto max-w-7xl px-4 py-12 md:py-16">
        <header className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-black tracking-tight md:text-5xl">Get in Touch</h1>
          <p className="mt-3 text-slate-600">
            We’re here to help you on your course creation journey. Reach out to us with any questions or
            feedback.
          </p>
        </header>

        <div className="mx-auto mt-10 grid max-w-6xl gap-6 lg:grid-cols-2">
          {/* Left: Form */}
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-extrabold">Send us a Message</h2>
            <p className="mt-1 text-sm text-slate-600">
              Fill out the form below and we’ll get back to you as soon as possible.
            </p>

            <form action="#" method="POST" className="mt-6 space-y-4">
              <div>
                <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
                  Full Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                  placeholder="Jane Doe"
                />
              </div>

              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                  placeholder="you@domain.com"
                />
              </div>

              <div>
                <label htmlFor="message" className="mb-1 block text-sm font-medium text-slate-700">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={5}
                  required
                  className="block w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                  placeholder="How can we help?"
                />
              </div>

              <div>
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-sky-700/20 transition hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500"
                >
                  Send Message
                </button>
              </div>
            </form>
          </div>

          {/* Right: Contact options */}
          <div className="space-y-4">
            <ContactCard
              icon={
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-sky-100 text-sky-700 ring-1 ring-sky-200">
                  <MailIcon className="h-5 w-5" />
                </span>
              }
              title="Email Us"
              desc="Get in touch by email for any inquiries."
            >
              <a href="mailto:support@coursecraft.com" className="font-semibold text-sky-700 hover:underline">
                support@coursecraft.com
              </a>
            </ContactCard>

            <ContactCard
              icon={
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-sky-100 text-sky-700 ring-1 ring-sky-200">
                  <PhoneIcon className="h-5 w-5" />
                </span>
              }
              title="Call Us"
              desc="Our team is available from 9am to 5pm, Mon–Fri."
            >
              <a href="tel:+15551234567" className="font-semibold text-sky-700 hover:underline">
                +1 (555) 123-4567
              </a>
            </ContactCard>

            <ContactCard
              icon={
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-sky-100 text-sky-700 ring-1 ring-sky-200">
                  <PinIcon className="h-5 w-5" />
                </span>
              }
              title="Our Office"
              desc="123 Learning Lane, Education City, 54321"
            />
          </div>
        </div>
      </section>
    </main>
  );
}

/* ---------- Small components ---------- */
function ContactCard({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start gap-3">
        {icon}
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{desc}</p>
          {children && <div className="mt-2 text-sm">{children}</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Icons (inline SVG) ---------- */
function MailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" opacity=".25" />
      <path d="M4 7l8 5 8-5" />
    </svg>
  );
}

function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M6 2h4l2 6-3 2a14 14 0 0 0 6 6l2-3 6 2v4a2 2 0 0 1-2 2C10 21 3 14 3 4a2 2 0 0 1 2-2z" />
    </svg>
  );
}

function PinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
    </svg>
  );
}