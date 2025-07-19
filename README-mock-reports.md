# Mock Reports Generator

This tool generates realistic mock sync test reports for UI testing and development purposes.

## Usage

```bash
# Generate mock reports (from project root)
node scripts/generate-mock-reports.js
```

This will create:
- A `reports/mock/` directory with 800 mock reports
- Reports for 4 networks (mainnet, holesky, sepolia, hoodi)
- 5 execution clients (geth, nethermind, besu, erigon, reth) 
- 4 consensus clients (teku, prysm, lighthouse, nimbus)
- 10 reports per client combination
- Matching `.main.json` and `.progress.json` files
- An `index.json` file for the web UI

## Using Mock Data with the Web UI

To use the mock reports in your web UI:

1. **Update your config.json:**
```json
{
  "directories": [
    {
      "name": "Local Dev", 
      "url": "http://localhost:3000/reports/",
      "enabled": true
    },
    {
      "name": "Mock Data",
      "url": "http://localhost:3000/reports/mock/", 
      "enabled": true
    }
  ]
}
```

2. **Serve the mock-reports directory** (if using a development server)

## Generated Data Characteristics

### Network-Specific Realistic Sync Durations

Sync durations are based on real-world network characteristics and client performance:

**Mainnet** (Full production network):
- **Base duration**: 6-12 hours
- **Geth**: ~5.4-10.8 hours (10% faster)
- **Reth**: ~5.7-11.4 hours (5% faster)
- **Erigon**: ~6-12 hours (average)
- **Nethermind**: ~6.3-12.6 hours (5% slower)
- **Besu**: ~7.2-14.4 hours (20% slower)

**Sepolia** (Test network with significant history):
- **Base duration**: 3-4 hours
- **Geth**: ~2.7-3.6 hours (10% faster)
- **Reth**: ~2.85-3.8 hours (5% faster)
- **Erigon**: ~3-4 hours (average)
- **Nethermind**: ~3.15-4.2 hours (5% slower)
- **Besu**: ~3.6-4.8 hours (20% slower)

**Holesky** (Medium-sized test network):
- **Base duration**: ~1 hour
- **Geth**: ~54 minutes (10% faster)
- **Reth**: ~57 minutes (5% faster)
- **Erigon**: ~60 minutes (average)
- **Nethermind**: ~63 minutes (5% slower)
- **Besu**: ~72 minutes (20% slower)

**Hoodi** (Small test network):
- **Base duration**: 10-30 minutes
- **Geth**: ~9-27 minutes (10% faster)
- **Reth**: ~9.5-28.5 minutes (5% faster)
- **Erigon**: ~10-30 minutes (average)
- **Nethermind**: ~10.5-31.5 minutes (5% slower)
- **Besu**: ~12-36 minutes (20% slower)

### Progress Data
- 15-80 progress entries per test
- Block progression from 0 to 800k-900k range
- Slot progression ahead of blocks (950k-1M range)
- **Network-specific EL disk usage**: Progresses to actual expected sizes
- **Network-specific CL disk usage**: Scales appropriately per network
- Realistic peer counts (EL: 8-25, CL: 3-50)

### Time Distribution
- Tests distributed over the last 30 days
- Realistic timestamps and durations

### Networks & Clients
- **Networks**: mainnet, holesky, sepolia, hoodi
- **EL Clients**: geth, nethermind, besu, erigon, reth
- **CL Clients**: teku, prysm, lighthouse, nimbus
- Realistic version strings and Docker images
- Proper client command configurations

## File Structure

```
reports/mock/
├── index.json                           # Main index file
├── sync-test-{id}-{network}_{el}_{cl}.main.json      # Main report files
└── sync-test-{id}-{network}_{el}_{cl}.progress.json  # Progress files
```

## Customization

Edit the configuration constants in `scripts/generate-mock-reports.js`:

- `NUM_REPORTS_PER_CLIENT`: Number of reports per client combination
- `NETWORKS`: Array of network names
- `EL_CLIENTS`: Array of execution client types
- `CL_CLIENTS`: Array of consensus client types
- Duration ranges, disk usage patterns, etc.

## Notes

- Generated data is deterministic based on client types (e.g., Besu typically takes longer)
- All timestamps, block/slot numbers, and disk usage values are realistic
- Progress entries show realistic sync progression patterns
- Client configurations match real-world setups