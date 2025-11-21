// app/(public)/privacy-policy/page.tsx
import Image from "next/image";
import type { SVGProps } from "react";

export const metadata = {
  title: "Privacy Policy - Plex Courses",
  description: "Learn how Plex Courses collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 antialiased">
      {/* Header */}
      <section className="mx-auto max-w-4xl px-4 py-12 text-center scroll-mt-20 md:py-16">
        <h1 className="text-4xl font-black tracking-tight md:text-6xl">
          Privacy Policy
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
          We are committed to protecting your privacy. This policy explains how we collect, use, and safeguard your information.
        </p>
      </section>

      {/* Content Sections */}
      <section className="mx-auto max-w-6xl px-4 pb-10 md:pb-12">
        <div className="prose prose-slate max-w-none">
          <p className="lead">Last updated: October 14, 2023</p>

          <h2>Information We Collect</h2>
          <p>We may collect personal information that you provide directly to us, such as:</p>
          <ul>
            <li><strong>Personal Identification Information:</strong> Name, email address, phone number.</li>
            <li><strong>Account Information:</strong> Username, password, and profile picture.</li>
            <li><strong>Payment Information:</strong> Transaction codes from third-party payment gateways (e.g., eSewa, Khalti). We do not store your full payment details.</li>
            <li><strong>KYC Information:</strong> For verification purposes, we may collect details such as your full name, address, citizenship number, and parent&apos;s names.</li>
          </ul>

          <h2>How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Create and manage your account.</li>
            <li>Provide, operate, and maintain our services.</li>
            <li>Process your transactions and manage your orders.</li>
            <li>Verify your identity (KYC).</li>
            <li>Calculate and process affiliate earnings and withdrawals.</li>
            <li>Communicate with you, including sending important notices and promotional materials.</li>
          </ul>

          <h2>Information Sharing and Disclosure</h2>
          <p>
            We do not sell, trade, or otherwise transfer your personally identifiable information to outside parties. Your information is kept confidential and is used solely for the purpose of providing our services to you.
          </p>

          <h2>Data Security</h2>
          <p>
            We implement a variety of security measures to maintain the safety of your personal information. However, no method of transmission over the Internet or method of electronic storage is 100% secure.
          </p>

          <h2>Changes to This Privacy Policy</h2>
          <p>
            We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.
          </p>

          <h2>Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at{" "}
            <a href="mailto:support@sajilointerior.com.np">support@sajilointerior.com.np</a>.
          </p>
        </div>
      </section>

      {/* Business Certificate Section (NEW) */}
      <section className="bg-white py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h3 className="text-2xl font-extrabold text-center mb-8">Business Certificate</h3>
          <div className="flex justify-center">
            <Image
              src="/images/shn-buisnesscertificate.jpg" // REPLACE with your actual image path
              alt="Plex Courses Business Certificate"
              width={800}
              height={600}
              className="rounded-lg shadow-lg ring-1 ring-slate-200 max-w-full"
              priority // Load eagerly for above-the-fold
            />
          </div>
          <p className="text-center mt-4 text-sm text-slate-600">
            Official registration certificate for Plex Courses.
          </p>
        </div>
      </section>
    </main>
  );
}