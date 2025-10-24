// app/(public)/terms-and-conditions/page.tsx
import type { SVGProps } from "react";

export const metadata = {
  title: "Terms and Conditions - Skill Hub Nepal",
  description: "Read the terms and conditions for using the Skill Hub Nepal platform and services.",
};

export default function TermsAndConditionsPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 antialiased">
      {/* Header */}
      <section className="mx-auto max-w-4xl px-4 py-12 text-center scroll-mt-20 md:py-16">
        <h1 className="text-4xl font-black tracking-tight md:text-6xl">
          Terms and Conditions
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
          By using our platform, you agree to these terms. Please read carefully.
        </p>
      </section>

      {/* Content Sections */}
      <section className="mx-auto max-w-6xl px-4 pb-10 md:pb-12">
        <div className="prose prose-slate max-w-none">
          <p className="lead">Last updated: October 14, 2023</p>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing and using the Skill Hub Nepal website and its services (the &quot;Service&quot;), you accept and agree to be bound by the terms and provision of this agreement.
          </p>

          <h2>2. Account Registration and Responsibility</h2>
          <p>
            To access our courses, you must register for an account. You agree to provide accurate, current, and complete information during the registration process. You are responsible for safeguarding your password and for all activities that occur under your account.
          </p>

          <h2>3. Payment and No Refund Policy</h2>
          <p>
            All payments for course packages are final. **Skill Hub Nepal has a strict no-refund policy.** Once a payment is made and access to a course is granted, you are not eligible for a refund under any circumstances.
          </p>
          <p>
            It is your responsibility to ensure that the transaction code provided during payment is accurate. Incorrect transaction codes will lead to the rejection of your enrollment or upgrade request without a refund.
          </p>

          <h2>4. Prohibited Conduct and Content Usage</h2>
          <p>
            The video content provided in our courses, including but not limited to YouTube video links, is for your personal, non-commercial use only. You are strictly prohibited from:
          </p>
          <ul>
            <li>Sharing, distributing, selling, or re-uploading our video content or links on any platform.</li>
            <li>Sharing your account credentials with others.</li>
          </ul>
          <p>Violation of these terms will result in immediate and permanent termination of your account without a refund.</p>

          <h2>5. Affiliate Program</h2>
          <p>
            Our affiliate program is subject to fair use. We reserve the right to investigate and deny commissions for any fraudulent or manipulative activity. Payouts are subject to KYC verification and meeting the minimum withdrawal threshold.
          </p>

          <h2>6. Limitation of Liability</h2>
          <p>
            Skill Hub Nepal will not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or other intangibles, resulting from your access to or use of, or inability to access or use, the service.
          </p>
          
          <h2>7. Changes to Terms</h2>
          <p>
            We reserve the right to modify these terms at any time. We will notify you of any changes by posting the new Terms and Conditions on this page.
          </p>

          <h2>Contact Us</h2>
          <p>If you have any questions about these Terms, please contact us.</p>
        </div>
      </section>
    </main>
  );
}