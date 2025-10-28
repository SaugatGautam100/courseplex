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

// --- SEO METADATA OBJECT ---
export const metadata: Metadata = {
  // --- Core Metadata ---
  title: {
    template: "%s | Course Plex", // Appends site name to sub-page titles
    default: "Course Plex - #1 Digital Marketing & Affiliate Courses in Nepal", // Default title for homepage
  },
  description: "Join Course Plex for Nepal's top-rated digital marketing, affiliate marketing, and SEO courses. Learn practical skills, get career guidance, and start earning online. Enroll now!",
  
  // --- Keywords (Extensive List) ---
  keywords: [
    // Primary Keywords
    "digital marketing course in nepal", "online courses nepal", "Course Plex", "affiliate marketing nepal", "seo training nepal",
    "learn digital marketing nepal", "social media marketing course nepal", "online earning in nepal",
    
    // Course-Specific Keywords
    "seo course", "content marketing course", "ppc advertising course", "google ads training", "facebook ads course",
    "instagram marketing", "email marketing training", "online business nepal", "freelancing course nepal",
    
    // Location-Based Keywords
    "digital marketing training kathmandu", "seo training in kathmandu", "online jobs in nepal for students",
    "best it training in nepal", "computer training institute in kathmandu", "digital marketing agency nepal",

    // Long-Tail & Question-Based Keywords
    "how to start digital marketing in nepal", "how to earn money online in nepal", "best way to learn seo",
    "digital marketing course fees in nepal", "affiliate marketing for beginners nepal", "make money online nepal",
    "part-time jobs for students in kathmandu", "work from home nepal",
    
    // Broader Skill-Related Keywords
    "graphic design course nepal", "video editing course", "web development basics", "e-commerce nepal",
    "online marketing strategy", "digital skills training", "career development nepal",
    
    // Competitor & Alternative Keywords
    "it training nepal", "broadway infosys nepal", "tech axis nepal", "e-digital nepal", "udemy nepal", "coursera nepal",
    
    // Extensive List (as requested)
    "advanced seo techniques", "local seo nepal", "technical seo audit", "keyword research tools", "link building strategies",
    "social media management tools", "facebook marketing strategy", "instagram growth hacks", "youtube marketing course",
    "linkedin marketing", "twitter for business", "content creation strategy", "blogging for money nepal",
    "copywriting course", "google analytics training", "google tag manager course", "data analysis for marketers",
    "conversion rate optimization", "cro techniques", "a/b testing", "email automation", "mailchimp tutorial",
    "affiliate marketing with amazon", "clickbank nepal", "how to start a blog in nepal", "online tutoring nepal",
    "virtual assistant jobs nepal", "online transcription jobs", "digital nomad nepal", "passive income nepal",
    "stock market nepal for beginners", "nepal share market", "online payment gateways in nepal", "esewa", "khalti",
    "ime pay", "digital nepal framework", "it jobs in kathmandu", "remote jobs nepal", "best affiliate programs for nepalis",
    // ... continue adding up to 1000 keywords if you wish, but the above are high-value.
    // The key is quality over quantity.
  ],
  
  // --- Author & Branding ---
  authors: [{ name: "Course Plex", url: "https://sajilointerior.com.np" }],
  creator: "App Plex",
  publisher: "Course Plex",

  // --- Technical SEO ---
  metadataBase: new URL("https://sajilointerior.com.np"),
  alternates: {
    canonical: '/',
  },

  // --- Social Media & Sharing (Open Graph for Facebook, LinkedIn, etc.) ---
  openGraph: {
    title: "Course Plex - #1 Digital Marketing & Affiliate Courses",
    description: "Learn practical skills in SEO, social media, and affiliate marketing to build your career and start earning online.",
    url: "https://sajilointerior.com.np",
    siteName: "Course Plex",
    images: [
      {
        url: "/sajilointerior-og-image.png", // Place this image in your `public` folder
        width: 1200,
        height: 630,
        alt: "Course Plex - Learn and Earn",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  
  // --- Twitter-Specific Card ---
  twitter: {
    card: "summary_large_image",
    title: "Course Plex - #1 Digital Marketing & Affiliate Courses",
    description: "Learn practical skills in SEO, social media, and affiliate marketing to build your career and start earning online.",
    images: ["/sajilointerior-og-image.png"], // Must be an absolute URL in production
  },
  
  // --- Icons ---
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
};

// --- STRUCTURED DATA (JSON-LD) FOR RICH RESULTS ---
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Course Plex",
  "url": "https://sajilointerior.com.np",
  "logo": "https://sajilointerior.com.np/images/courseplexlogo.png", // MUST be an absolute URL
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+977-970-572-6179",
    "contactType": "Customer Service"
  },
  "sameAs": [
    // Add links to your social media profiles here if you have them
    // "https://www.facebook.com/YourPage",
    // "https://www.instagram.com/YourProfile",
    // "https://www.youtube.com/YourChannel"
  ]
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="overflow-x-hidden scroll-smooth">
      <head>
      <meta name="google-site-verification" content="N4qYDAkaYzmuSlEGwJInBNKL8UjgNkruWGO9-pwZZOg" />
        {/* Structured Data for Google */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Google Icons */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
      </head>
      <body className={`${roboto.className} bg-slate-50 text-slate-800 antialiased`}>
      
        {children}
     
      </body>
    </html>
  );
}