import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { DumpFileViewer } from '../components/DumpFileViewer';

export default function DumpExplorer() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const sourceUrl = searchParams.get('sourceUrl');
  const network = searchParams.get('network');
  const elClient = searchParams.get('elClient');
  const clClient = searchParams.get('clClient');
  
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">Kurtosis Enclave Dump</h1>
            <Badge variant="outline">{id}</Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Explore the contents of the Kurtosis enclave dump file
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/test/${id}`}>
            <Button variant="outline">Back to Test</Button>
          </Link>
          <Link to="/tests">
            <Button variant="outline">All Tests</Button>
          </Link>
        </div>
      </div>

      {/* Dump File Viewer */}
      <DumpFileViewer 
        sourceUrl={decodeURIComponent(sourceUrl)} 
        runId={id}
        network={network}
        elClient={elClient}
        clClient={clClient}
        showExpandLink={false}
      />

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle>About Kurtosis Dumps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Kurtosis enclave dumps contain valuable debugging information from test runs, including:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Container logs from all services</li>
              <li>Configuration files and parameters</li>
              <li>Network topology information</li>
              <li>Service metadata and status</li>
              <li>Environment variables and settings</li>
            </ul>
            <p>
              <strong>Note:</strong> Files are extracted directly from the ZIP archive using HTTP range requests.
              Click on any file in the listing above to view its contents.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}