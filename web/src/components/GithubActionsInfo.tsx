import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';

interface GithubActionsInfoProps {
  labels: Record<string, string>;
}

interface GitHubInfo {
  runId?: string;
  runNumber?: string;
  job?: string;
  repository?: string;
  workflow?: string;
  sha?: string;
  actor?: string;
  eventName?: string;
  ref?: string;
}

export function GithubActionsInfo({ labels }: GithubActionsInfoProps) {
  // Extract GitHub-related labels
  const githubInfo: GitHubInfo = {
    runId: labels['github.run_id'],
    runNumber: labels['github.run_number'],
    job: labels['github.job'],
    repository: labels['github.repository'],
    workflow: labels['github.workflow'],
    sha: labels['github.sha'],
    actor: labels['github.actor'],
    eventName: labels['github.event_name'],
    ref: labels['github.ref']
  };

  // Check if any GitHub labels exist
  const hasGitHubLabels = Object.values(githubInfo).some(value => value !== undefined);

  if (!hasGitHubLabels) {
    return null;
  }

  // Helper function to get GitHub run URL
  const getGitHubRunUrl = () => {
    if (githubInfo.repository && githubInfo.runId) {
      return `https://github.com/${githubInfo.repository}/actions/runs/${githubInfo.runId}`;
    }
    return null;
  };

  // Helper function to get GitHub job URL
  const getGitHubJobUrl = () => {
    if (githubInfo.repository && githubInfo.runId && githubInfo.job) {
      return `https://github.com/${githubInfo.repository}/actions/runs/${githubInfo.runId}/job/${githubInfo.job}`;
    }
    return null;
  };

  // Helper function to get commit URL
  const getCommitUrl = () => {
    if (githubInfo.repository && githubInfo.sha) {
      return `https://github.com/${githubInfo.repository}/commit/${githubInfo.sha}`;
    }
    return null;
  };

  // Helper function to format ref display
  const formatRef = (ref?: string) => {
    if (!ref) return '';
    if (ref.startsWith('refs/heads/')) {
      return ref.replace('refs/heads/', '');
    }
    if (ref.startsWith('refs/pull/')) {
      const match = ref.match(/refs\/pull\/(\d+)\/merge/);
      return match ? `PR #${match[1]}` : ref;
    }
    return ref;
  };

  const githubRunUrl = getGitHubRunUrl();
  const githubJobUrl = getGitHubJobUrl();
  const commitUrl = getCommitUrl();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          GitHub Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Primary info with links */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {githubInfo.workflow && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Workflow</span>
                <div className="text-sm font-medium mt-1">
                  {githubRunUrl ? (
                    <a 
                      href={githubRunUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {githubInfo.workflow}
                    </a>
                  ) : (
                    githubInfo.workflow
                  )}
                </div>
              </div>
            )}
            
            {githubInfo.job && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Job</span>
                <div className="text-sm font-medium mt-1">
                  {githubJobUrl ? (
                    <a 
                      href={githubJobUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 hover:underline font-mono"
                    >
                      {githubInfo.job}
                    </a>
                  ) : (
                    <span className="font-mono">{githubInfo.job}</span>
                  )}
                </div>
              </div>
            )}
            
            {(githubInfo.runId || githubInfo.runNumber) && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Run</span>
                <div className="text-sm font-medium mt-1">
                  {githubInfo.runNumber && `#${githubInfo.runNumber}`}
                  {githubInfo.runNumber && githubInfo.runId && ' '}
                  {githubInfo.runId && (
                    <span className="text-muted-foreground font-mono text-xs">
                      ({githubInfo.runId})
                    </span>
                  )}
                </div>
              </div>
            )}
            
            {githubInfo.actor && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Triggered by</span>
                <div className="text-sm font-medium mt-1">
                  <a 
                    href={`https://github.com/${githubInfo.actor}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    @{githubInfo.actor}
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Secondary info with badges */}
          <div className="flex flex-wrap gap-2">
            {githubInfo.eventName && (
              <Badge variant="outline" className="text-xs">
                {githubInfo.eventName}
              </Badge>
            )}
            
            {githubInfo.ref && (
              <Badge variant="outline" className="text-xs">
                {formatRef(githubInfo.ref)}
              </Badge>
            )}
            
            {githubInfo.sha && (
              <Badge variant="outline" className="text-xs font-mono">
                {commitUrl ? (
                  <a 
                    href={commitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {githubInfo.sha.substring(0, 7)}
                  </a>
                ) : (
                  githubInfo.sha.substring(0, 7)
                )}
              </Badge>
            )}
          </div>

          {/* Repository link if available */}
          {githubInfo.repository && (
            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                Repository: {' '}
                <a 
                  href={`https://github.com/${githubInfo.repository}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 hover:underline font-mono"
                >
                  {githubInfo.repository}
                </a>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}