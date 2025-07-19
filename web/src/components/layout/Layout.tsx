import { Header } from './Header';
import { Footer } from './Footer';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto p-6">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}