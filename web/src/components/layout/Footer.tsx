declare const __GIT_HASH__: string;

export function Footer() {
  // This will be replaced at build time with the actual git hash
  const gitHash = typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'dev';
  
  return (
    <footer className="mt-auto bg-background">
      <div className="container mx-auto px-6 py-4">
        <div className="text-center text-sm text-muted-foreground">
          Powered by 🐼{' '}
          <a 
            href="https://github.com/ethpandaops/syncoor" 
            target="_blank" 
            rel="noopener noreferrer"
            className="font-bold hover:text-foreground transition-colors"
          >
            ethpandaops/syncoor
          </a>
          {' - '}
          <span className="font-mono">{gitHash}</span>
        </div>
      </div>
    </footer>
  );
}