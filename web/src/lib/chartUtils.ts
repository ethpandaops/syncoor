/**
 * Utility functions for chart data transformations
 */

import { ProgressPoint } from '../types/syncoor';
import { ProgressEntry } from '../types/report';

/**
 * Transform ProgressPoint[] (live API format) to ProgressEntry[] (chart format)
 */
export function transformProgressPoints(progressHistory: ProgressPoint[]): ProgressEntry[] {
  return progressHistory.map((point) => ({
    t: Math.floor(new Date(point.timestamp).getTime() / 1000), // Convert to Unix timestamp
    b: point.metrics.block,
    s: point.metrics.slot,
    de: point.metrics.exec_disk_usage,
    dc: point.metrics.cons_disk_usage,
    pe: point.metrics.exec_peers,
    pc: point.metrics.cons_peers,
    me: point.metrics.exec_memory_usage || 0,
    mc: point.metrics.cons_memory_usage || 0,
    bre: point.metrics.exec_block_io_read || 0,
    brc: point.metrics.cons_block_io_read || 0,
    bwe: point.metrics.exec_block_io_write || 0,
    bwc: point.metrics.cons_block_io_write || 0,
    ce: point.metrics.exec_cpu_usage_percent || 0,
    cc: point.metrics.cons_cpu_usage_percent || 0,
  }));
}

/**
 * Transform ProgressEntry[] (report format) to ProgressPoint[] (live API format)
 * This is used when we need to normalize data for consistent handling
 */
export function transformProgressEntries(progressEntries: ProgressEntry[]): ProgressPoint[] {
  return progressEntries.map((entry) => ({
    timestamp: new Date(entry.t * 1000).toISOString(), // Convert Unix timestamp to ISO string
    metrics: {
      block: entry.b,
      slot: entry.s,
      exec_disk_usage: entry.de,
      cons_disk_usage: entry.dc,
      exec_peers: entry.pe,
      cons_peers: entry.pc,
      exec_sync_percent: 0, // Not available in ProgressEntry format
      cons_sync_percent: 0, // Not available in ProgressEntry format
      exec_memory_usage: entry.me,
      cons_memory_usage: entry.mc,
      exec_block_io_read: entry.bre,
      cons_block_io_read: entry.brc,
      exec_block_io_write: entry.bwe,
      cons_block_io_write: entry.bwc,
      exec_cpu_usage_percent: entry.ce,
      cons_cpu_usage_percent: entry.cc,
    },
  }));
}