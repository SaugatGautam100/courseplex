import Header from "@/app/components/Header"; // Adjust path if needed
import Footer from "@/app/components/Footer"; // Adjust path if needed
import WhatsAppButton from "@/app/components/WhatsAppButton"; // Adjust path if needed


export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      
      {children}
      <Footer />
      <WhatsAppButton />
    </>
  );
}