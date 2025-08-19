import { useState, useEffect } from 'react';
import { checkDumpFileExists, getDumpFileInfo } from '../lib/api';
import { ZipFileInfo } from '../types/report';

interface UseDumpFileOptions {
  sourceUrl?: string;
  runId?: string;
  network?: string;
  elClient?: string;
  clClient?: string;
  enabled?: boolean;
}

export function useDumpFile({ sourceUrl, runId, network, elClient, clClient, enabled = true }: UseDumpFileOptions) {
  const [exists, setExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !sourceUrl || !runId || !network || !elClient || !clClient) {
      return;
    }

    const checkFile = async () => {
      try {
        setLoading(true);
        setError(null);
        const fileExists = await checkDumpFileExists(sourceUrl, runId, network, elClient, clClient);
        setExists(fileExists);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check dump file');
        setExists(false);
      } finally {
        setLoading(false);
      }
    };

    checkFile();
  }, [sourceUrl, runId, network, elClient, clClient, enabled]);

  return {
    exists,
    loading,
    error
  };
}

export function useDumpFileInfo({ sourceUrl, runId, network, elClient, clClient, enabled = true }: UseDumpFileOptions) {
  const [zipInfo, setZipInfo] = useState<ZipFileInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !sourceUrl || !runId || !network || !elClient || !clClient) {
      return;
    }

    const fetchInfo = async () => {
      try {
        setLoading(true);
        setError(null);
        const info = await getDumpFileInfo(sourceUrl, runId, network, elClient, clClient);
        setZipInfo(info);
        
        if (info.error) {
          setError(info.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get dump file info');
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, [sourceUrl, runId, network, elClient, clClient, enabled]);

  return {
    zipInfo,
    loading,
    error
  };
}