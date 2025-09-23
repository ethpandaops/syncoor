import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { DumpFileViewer } from '../components/DumpFileViewer';

export default function DumpExplorer() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceUrl = searchParams.get('sourceUrl');
  const network = searchParams.get('network');
  const elClient = searchParams.get('elClient');
  const clClient = searchParams.get('clClient');
  const selectedFile = searchParams.get('file');
  const fullWindow = searchParams.get('fullWindow') === 'true';
  const sourceDirectory = searchParams.get('directory');  // Get directory from search params
  
  const handleFileSelect = (filePath: string | null) => {
    const newParams = new URLSearchParams(searchParams);
    if (filePath) {
      newParams.set('file', filePath);
      // Reset lines parameter when changing files
      newParams.delete('lines');
    } else {
      newParams.delete('file');
      newParams.delete('fullWindow'); // Clear full window when closing file
      newParams.delete('lines'); // Clear lines when closing file
    }
    setSearchParams(newParams);
  };

  const handleFullWindowToggle = (isFullWindow: boolean) => {
    const newParams = new URLSearchParams(searchParams);
    if (isFullWindow) {
      newParams.set('fullWindow', 'true');
    } else {
      newParams.delete('fullWindow');
    }
    setSearchParams(newParams);
  };
  
  if (!id || !sourceUrl || !network || !elClient || !clClient) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dump Explorer</h1>
          <Link to="/tests">
            <Button variant="outline">Back to Tests</Button>
          </Link>
        </div>
        <Card className="p-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Invalid Parameters</h3>
            <p className="text-muted-foreground">Missing required parameters.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">Kurtosis Enclave Dump</h1>
            <Badge variant="outline">{id}</Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Explore the contents of the Kurtosis enclave dump file
          </p>
        </div>
        <Link to={sourceDirectory ? `/test/${sourceDirectory}/${id}` : `/test/${id}`}>
          <Button variant="outline">Back to Test</Button>
        </Link>
      </div>

      {/* Dump File Viewer - Full Width */}
      <div className="flex-1 p-4">
        <DumpFileViewer
          sourceUrl={decodeURIComponent(sourceUrl)}
          runId={id}
          network={network}
          elClient={elClient}
          clClient={clClient}
          showExpandLink={false}
          initialSelectedFile={selectedFile || undefined}
          onFileSelect={handleFileSelect}
          initialFullWindow={fullWindow}
          onFullWindowToggle={handleFullWindowToggle}
        />
      </div>
    </div>
  );
}