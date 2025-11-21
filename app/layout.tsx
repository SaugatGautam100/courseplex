// app/layout.tsx
import "./globals.css";
import { Roboto } from "next/font/google";
import type { Metadata } from "next";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";

const roboto = Roboto({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  display: "swap",
});

// ─────────────────────────────
// SEO METADATA
// ─────────────────────────────
export const metadata: Metadata = {
  applicationName: "Plex Courses",
  title: {
    template: "%s | Plex Courses",
    default: "Plex Courses - #1 Digital Marketing & Affiliate Courses in Nepal",
  },
  description:
    "Plex Courses offers Nepal's top-rated digital marketing, SEO, and affiliate marketing courses. Learn practical skills, grow your career, and start earning online with step-by-step tracks and certificates.",

  // Google does not use meta-keywords for ranking, but it is safe to keep a
  // focused list here. If you want thousands, you can move them to a separate
  // file and spread them into this array.
  keywords: [
    // Brand & generic
    "Plex Courses",
    "plexcourses",
    "Plex Courses Nepal",
    "online courses nepal",
    "e-learning nepal",
    "learn online nepal",

    // Main offerings
    "digital marketing course in nepal",
    "seo course nepal",
    "affiliate marketing nepal",
    "social media marketing course nepal",
    "facebook ads course nepal",
    "google ads training nepal",
    "instagram marketing nepal",
    "content marketing course nepal",
    "email marketing training nepal",
    "youtube marketing course nepal",

    // Money / career
    "online earning in nepal",
    "make money online nepal",
    "freelancing course nepal",
    "work from home nepal",
    "online jobs in nepal for students",
    "part time jobs nepal students",

    // Location-based
    "digital marketing training kathmandu",
    "seo training kathmandu",
    "it training nepal",
    "best it training in nepal",
    "computer institute kathmandu",

    // Courses & skills
    "graphic design course nepal",
    "video editing course nepal",
    "ecommerce course nepal",
    "wordpress course nepal",
    "web development basics nepal",
    "business course nepal",
    "career development nepal",

    // Affiliate / referral angle
    "become affiliate nepal",
    "affiliate program nepal",
    "high paying affiliate program nepal",
    "student affiliate program nepal",

    // Long-tail questions & intent
    "how to start digital marketing in nepal",
    "how to earn money online in nepal",
    "best digital marketing course in nepal",
    "digital marketing course fees in nepal",
    "best way to learn seo in nepal",
    "affiliate marketing for beginners nepal",
  ],

  metadataBase: new URL("https://plexcourses.com"),
  alternates: {
    canonical: "/",
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },

  // Update this once you create a Google Search Console property for plexcourses.com
  verification: {
    google: "N4qYDAkaYzmuSlEGwJInBNKL8UjgNkruWGO9-pwZZOg",
  },

  authors: [{ name: "Plex Courses", url: "https://plexcourses.com" }],
  creator: "App Plex",
  publisher: "Plex Courses",

  openGraph: {
    title: "Plex Courses - #1 Digital Marketing & Affiliate Courses",
    description:
      "Master digital marketing, SEO, and affiliate marketing with Plex Courses. Structured tracks, mentor support, and completion certificates.",
    url: "https://plexcourses.com",
    siteName: "Plex Courses",
    images: [
      {
        // put this file in /public on plexcourses.com
        url: "/images/plexcourseslogo.png",
        width: 1200,
        height: 630,
        alt: "Plex Courses - Learn and Earn Online",
      },
    ],
    locale: "en_US",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "Plex Courses - #1 Digital Marketing & Affiliate Courses",
    description:
      "Learn SEO, social media, and affiliate marketing with Plex Courses and start earning online from Nepal.",
    images: ["/plexcourses-og-image.png"],
    creator: "@plexcourses", // change if you have a real handle
  },

  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
};

// ─────────────────────────────
// STRUCTURED DATA (JSON‑LD)
// ─────────────────────────────

// 1) Organization
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Plex Courses",
  url: "https://plexcourses.com",
  logo: "https://plexcourses.com/images/courseplexlogo.png",
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+977-9866294492",
    contactType: "Customer Service",
    areaServed: "NP",
    availableLanguage: ["en", "ne"],
  },
  sameAs: [
    // Add real profiles when you have them:
    // "https://www.facebook.com/yourpage",
    // "https://www.instagram.com/yourprofile",
    // "https://www.youtube.com/@yourchannel"
  ],
};

// 2) WebSite with SearchAction – use your existing /courses search param
const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Plex Courses",
  url: "https://plexcourses.com",
  potentialAction: {
    "@type": "SearchAction",
    target:
      "https://plexcourses.com/courses?search={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

// 3) SiteNavigationElement – matches your header + important CTAs
const siteNavigationJsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  itemListElement: [
    {
      "@type": "SiteNavigationElement",
      position: 1,
      name: "Home",
      url: "https://plexcourses.com/",
    },
    {
      "@type": "SiteNavigationElement",
      position: 2,
      name: "Courses",
      url: "https://plexcourses.com/courses",
      description: "Browse all Plex Courses bundles and sub-courses.",
    },
    {
      "@type": "SiteNavigationElement",
      position: 3,
      name: "Services",
      url: "https://plexcourses.com/services",
      description: "Digital marketing and related services by Plex Courses team.",
    },
    {
      "@type": "SiteNavigationElement",
      position: 4,
      name: "About Us",
      url: "https://plexcourses.com/about",
      description: "Learn more about Plex Courses and our mission.",
    },
    {
      "@type": "SiteNavigationElement",
      position: 5,
      name: "Become an Affiliate",
      url: "https://plexcourses.com/signup",
      description:
        "Sign up to Plex Courses and join our affiliate program to earn commissions.",
    },
    {
      "@type": "SiteNavigationElement",
      position: 6,
      name: "Contact",
      url: "https://plexcourses.com/contact",
      description: "Contact Plex Courses for support and inquiries.",
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="overflow-x-hidden scroll-smooth">
      <head>
        {/* All structured data together for Google */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              organizationJsonLd,
              websiteJsonLd,
              siteNavigationJsonLd,
            ]),
          }}
        />
        {/* Google Material Icons */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body
        className={`${roboto.className} bg-slate-50 text-slate-800 antialiased`}
      >
       
        {children}
      
      </body>
    </html>
  );
}