import { Header } from './Header';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}