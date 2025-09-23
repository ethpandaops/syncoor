import { useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const isDumpExplorer = location.pathname.startsWith('/dump/');

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        {isDumpExplorer ? (
          children
        ) : (
          <div className="container mx-auto p-6">
            {children}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}