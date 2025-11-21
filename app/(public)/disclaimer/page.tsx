// app/(public)/disclaimer/page.tsx
import Image from "next/image";
import type { SVGProps } from "react";

export const metadata = {
  title: "Disclaimer - Plex Courses",
  description: "Disclaimer regarding earnings, content, and use of the Plex Courses platform.",
};

export default function DisclaimerPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 antialiased">
      {/* Header with Large No Refund Image */}
      <section className="relative mx-auto max-w-4xl px-4 py-12 text-center scroll-mt-20 md:py-16">
        <h1 className="text-4xl font-black tracking-tight md:text-6xl">
          Disclaimer
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
          Important information regarding earnings, content, and platform usage.
        </p>
      </section>

        <div className="mx-auto mb-8 max-w-2xl">
          <Image
            src="/images/shn-norefund.jpg" // REPLACE with your actual large "No Refund" image path
            alt="No Refund Policy - Important Notice"
            width={600}
            height={400}
            className="mx-auto rounded-lg shadow-lg ring-1 ring-slate-200 max-w-full"
            priority // Load eagerly for above-the-fold
          />
        </div>
      {/* Content Sections */}
      <section className="mx-auto max-w-6xl px-4 pb-10 md:pb-20">
        <div className="prose prose-slate max-w-none">
          <p className="lead">Last updated: October 14, 2023</p>

          <h2>Earnings Disclaimer</h2>
          <p>
            Plex Courses provides educational content and an affiliate program. Any earnings or income statements, or earnings or income examples, are only estimates of what we think you could earn. There is no assurance you will do as well. Where specific income figures are used and attributed to an individual or business, those persons or businesses have earned that amount. There is no assurance you will do as well.
          </p>
          <p>
            Your level of success in attaining the results claimed in our materials depends on the time you devote to the program, ideas and techniques mentioned, your finances, knowledge, and various skills. Since these factors differ according to individuals, we cannot guarantee your success or income level. We are not responsible for any of your actions.
          </p>

          <h2>Content and External Links</h2>
          <p>
            The information contained on the Plex Courses website is for general information purposes only. While we endeavor to keep the information up to date and correct, we make no representations or warranties of any kind, express or implied, about the completeness, accuracy, reliability, suitability, or availability with respect to the website or the information, products, services, or related graphics contained on the website for any purpose.
          </p>
          <p>
            Our service may contain links to external websites that are not provided or maintained by or in any way affiliated with Plex Courses. Please note that Plex Courses does not guarantee the accuracy, relevance, timeliness, or completeness of any information on these external websites.
          </p>

          <h2>No Professional Advice</h2>
          <p>
            The information provided by Plex Courses is for educational purposes only and is not a substitute for professional financial or legal advice. Always seek the advice of a qualified professional with any questions you may have regarding a financial or legal matter.
          </p>
        </div>
      </section>
    </main>
  );
}