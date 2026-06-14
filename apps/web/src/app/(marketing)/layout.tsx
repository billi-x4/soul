import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";

interface MarketingLayoutProps {
  children: React.ReactNode;
}

export default async function MarketingLayout({ children }: MarketingLayoutProps) {
  return (
    <div className={cn("relative flex min-h-screen flex-col")}>
      <Header />
      <main className="flex-1" id="main">
        {children}
      </main>
      <Footer />
    </div>
  );
}
