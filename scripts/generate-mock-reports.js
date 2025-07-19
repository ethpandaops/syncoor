#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const MOCK_REPORTS_DIR = 'reports/mock';
const NUM_REPORTS_PER_CLIENT = 10;
const NETWORKS = ['mainnet', 'holesky', 'sepolia', 'hoodi'];
const EL_CLIENTS = ['geth', 'nethermind', 'besu', 'erigon', 'reth'];
const CL_CLIENTS = ['teku', 'prysm', 'lighthouse', 'nimbus'];

// Network-specific disk usage targets (in GB)
const NETWORK_DISK_SIZES = {
  mainnet: {
    besu: 480,
    erigon: 420,
    geth: 493,
    nethermind: 467,
    reth: 482
  },
  hoodi: {
    besu: 9,
    erigon: 21,
    geth: 11,
    nethermind: 8,
    reth: 8
  },
  sepolia: {
    besu: 479,
    erigon: 424,
    geth: 493,
    nethermind: 467,
    reth: 482
  },
  holesky: {
    besu: 164,
    erigon: 195,
    geth: 176,
    nethermind: 145,
    reth: 140
  }
};

// Client version mappings
const CLIENT_VERSIONS = {
  geth: 'Geth/v1.16.2-unstable-ffb4e6fd-20250707/linux-arm64/go1.24.4',
  nethermind: 'Nethermind/v1.33.0-unstable/linux-arm64/dotnet9.0.7',
  besu: 'besu/v25.7.0/linux-aarch_64/openjdk-java-21',
  erigon: 'erigon/v2.60.10/linux-arm64/go1.23.0',
  reth: 'reth/v1.2.0/linux-arm64/rustc1.78.0',
  teku: 'teku/v25.6.0/linux-aarch_64/-eclipseadoptium-openjdk64bitservervm-java-21',
  prysm: 'Prysm/v6.0.4 (linux arm64)',
  lighthouse: 'Lighthouse/v5.3.0-aa022f4/x86_64-linux',
  nimbus: 'Nimbus/v24.11.0/linux-amd64'
};

const CLIENT_IMAGES = {
  geth: 'ethereum/client-go:latest',
  nethermind: 'ethpandaops/nethermind:master',
  besu: 'hyperledger/besu:latest',
  erigon: 'ethpandaops/erigon:latest',
  reth: 'ghcr.io/paradigmxyz/reth:latest',
  teku: 'consensys/teku:latest',
  prysm: 'gcr.io/offchainlabs/prysm/beacon-chain:stable',
  lighthouse: 'sigp/lighthouse:latest',
  nimbus: 'statusim/nimbus-eth2:latest'
};

// Helper functions
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function generateRunId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000000000000);
  return `sync-test-${timestamp}${random}`;
}

function generateRealisticDuration(elClient, network) {
  // Network-specific duration ranges in seconds
  const networkDurations = {
    mainnet: {
      min: 6 * 60 * 60,   // 6 hours
      max: 12 * 60 * 60   // 12 hours
    },
    hoodi: {
      min: 10 * 60,       // 10 minutes
      max: 30 * 60        // 30 minutes
    },
    sepolia: {
      min: 3 * 60 * 60,   // 3 hours
      max: 4 * 60 * 60    // 4 hours
    },
    holesky: {
      min: 60 * 60,       // 1 hour
      max: 60 * 60        // 1 hour (tight range around 1h)
    }
  };
  
  const durations = networkDurations[network] || networkDurations.mainnet;
  
  // Client performance multipliers (relative to average)
  const clientMultipliers = {
    geth: 0.9,      // 10% faster than average
    reth: 0.95,     // 5% faster than average
    erigon: 1.0,    // Average performance
    nethermind: 1.05, // 5% slower than average
    besu: 1.2       // 20% slower than average
  };
  
  const multiplier = clientMultipliers[elClient] || 1.0;
  
  // Calculate base duration with client multiplier
  const baseDuration = randomInt(durations.min, durations.max) * multiplier;
  
  // Add small variance (±10%) for realism
  const variance = 0.1;
  const minDuration = Math.floor(baseDuration * (1 - variance));
  const maxDuration = Math.floor(baseDuration * (1 + variance));
  
  return randomInt(minDuration, maxDuration);
}

function generateProgressEntry(timestamp, blockStart, slotStart, index, totalEntries, duration, network, elClient) {
  // Simulate realistic progression
  const progress = index / (totalEntries - 1);
  const timeOffset = Math.floor(progress * duration);
  
  // Block progression (not always linear due to sync mechanics)
  const blockRange = randomInt(800000, 900000);
  const currentBlock = Math.floor(blockStart + (progress * blockRange));
  
  // Slot progression (usually ahead of blocks)
  const slotRange = randomInt(950000, 1000000);
  const currentSlot = Math.floor(slotStart + (progress * slotRange));
  
  // Network-specific disk usage progression
  const targetDiskGB = NETWORK_DISK_SIZES[network]?.[elClient] || 100;
  const targetDiskBytes = targetDiskGB * 1024 * 1024 * 1024; // Convert GB to bytes
  
  // Start from ~10% of target, grow to ~90-110% of target
  const baseDiskEL = Math.floor(targetDiskBytes * 0.1);
  const maxDiskEL = Math.floor(targetDiskBytes * randomFloat(0.9, 1.1));
  const diskEL = Math.floor(baseDiskEL + (progress * (maxDiskEL - baseDiskEL)) + randomFloat(-targetDiskBytes * 0.05, targetDiskBytes * 0.05));
  
  // CL disk usage (much smaller, network-dependent)
  const clDiskFactors = {
    mainnet: { base: 300000000, max: 800000000 },  // 300MB-800MB
    sepolia: { base: 250000000, max: 700000000 },  // 250MB-700MB  
    holesky: { base: 200000000, max: 600000000 },  // 200MB-600MB
    hoodi: { base: 100000000, max: 400000000 }     // 100MB-400MB
  };
  
  const clFactors = clDiskFactors[network] || clDiskFactors.mainnet;
  const diskCL = Math.floor(clFactors.base + (progress * (clFactors.max - clFactors.base)) + randomFloat(-50000000, 50000000));
  
  // Peer counts (realistic ranges)
  const peersEL = randomInt(8, 25);
  const peersCL = randomInt(3, 50);
  
  return {
    t: timestamp + timeOffset,
    b: Math.max(0, currentBlock),
    s: Math.max(0, currentSlot),
    de: Math.max(baseDiskEL, diskEL),
    dc: Math.max(clFactors.base, diskCL),
    pe: peersEL,
    pc: peersCL
  };
}

function generateClientCmd(client, network) {
  const cmds = {
    geth: `geth --${network} --verbosity=3 --datadir=/data/geth/execution-data --http --http.addr=0.0.0.0 --http.port=8545 --http.vhosts=* --http.corsdomain=* --http.api=admin,engine,net,eth,web3,debug,txpool --ws --ws.addr=0.0.0.0 --ws.port=8546 --ws.api=admin,engine,net,eth,web3,debug,txpool --ws.origins=* --allow-insecure-unlock --nat=extip:172.16.0.5 --authrpc.port=8551 --authrpc.addr=0.0.0.0 --authrpc.vhosts=* --authrpc.jwtsecret=/jwt/jwtsecret --syncmode=snap --rpc.allow-unprotected-txs --metrics --metrics.addr=0.0.0.0 --metrics.port=9001 --discovery.port=30303 --port=30303`,
    
    nethermind: `nethermind --config=${network} --datadir=/data/nethermind --JsonRpc.Enabled=true --JsonRpc.Host=0.0.0.0 --JsonRpc.Port=8545 --JsonRpc.EnabledModules=Admin,Eth,Subscribe,Trace,TxPool,Web3,Personal,Proof,Net,Parity,Health,Rpc --Network.ExternalIp=172.16.0.5 --Network.LocalIp=172.16.0.5 --JsonRpc.JwtSecretFile=/jwt/jwtsecret --Sync.FastSync=true --Metrics.Enabled=true --Metrics.ExposeHost=0.0.0.0 --Metrics.ExposePort=9001`,
    
    besu: `besu --network=${network} --data-path=/data/besu --rpc-http-enabled --rpc-http-host=0.0.0.0 --rpc-http-port=8545 --rpc-http-cors-origins=* --rpc-http-api=ADMIN,CLIQUE,DEBUG,EEA,ETH,IBFT,MINER,NET,PERM,PLUGINS,PRIV,QBFT,TRACE,TXPOOL,WEB3 --rpc-ws-enabled --rpc-ws-host=0.0.0.0 --rpc-ws-port=8546 --engine-rpc-port=8551 --engine-jwt-secret=/jwt/jwtsecret --metrics-enabled --metrics-host=0.0.0.0 --metrics-port=9001`,
    
    erigon: `erigon --chain=${network} --datadir=/data/erigon --http.addr=0.0.0.0 --http.port=8545 --http.corsdomain=* --http.vhosts=* --http.api=admin,debug,net,trace,web3,erigon,engine,eth,txpool --ws --authrpc.addr=0.0.0.0 --authrpc.port=8551 --authrpc.vhosts=* --authrpc.jwtsecret=/jwt/jwtsecret --metrics --metrics.addr=0.0.0.0 --metrics.port=9001`,
    
    reth: `reth node --chain=${network} --datadir=/data/reth --http --http.addr=0.0.0.0 --http.port=8545 --http.corsdomain=* --http.api=admin,debug,eth,net,trace,txpool,web3,rpc --ws --ws.addr=0.0.0.0 --ws.port=8546 --authrpc.addr=0.0.0.0 --authrpc.port=8551 --authrpc.jwtsecret=/jwt/jwtsecret --metrics=0.0.0.0:9001`
  };
  
  return cmds[client] || cmds.geth;
}

function generateConsensusCmd(client, network) {
  const cmds = {
    teku: [
      '--logging=INFO',
      '--log-destination=CONSOLE',
      `--network=${network}`,
      '--data-path=/data/teku/teku-beacon-data',
      '--data-storage-mode=ARCHIVE',
      '--p2p-enabled=true',
      '--p2p-peer-lower-bound=1',
      '--p2p-advertised-ip=172.16.0.6',
      '--p2p-discovery-site-local-addresses-enabled=true',
      '--p2p-port=9000',
      '--rest-api-enabled=true',
      '--rest-api-docs-enabled=true',
      '--rest-api-interface=0.0.0.0',
      '--rest-api-port=4000',
      '--rest-api-host-allowlist=*',
      '--data-storage-non-canonical-blocks-enabled=true',
      '--ee-jwt-secret-file=/jwt/jwtsecret',
      '--ee-endpoint=http://172.16.0.5:8551',
      '--metrics-enabled',
      '--metrics-interface=0.0.0.0',
      '--metrics-host-allowlist=*',
      '--metrics-categories=BEACON,PROCESS,LIBP2P,JVM,NETWORK,PROCESS',
      '--metrics-port=8008',
      `--checkpoint-sync-url=https://checkpoint-sync.${network}.ethpandaops.io/`
    ],
    
    prysm: [
      `--${network}`,
      '--datadir=/data/prysm',
      '--rpc-host=0.0.0.0',
      '--rpc-port=4000',
      '--grpc-gateway-host=0.0.0.0',
      '--grpc-gateway-port=3500',
      '--execution-endpoint=http://172.16.0.5:8551',
      '--jwt-secret=/jwt/jwtsecret',
      '--accept-terms-of-use',
      '--monitoring-host=0.0.0.0',
      '--monitoring-port=8008',
      `--checkpoint-sync-url=https://checkpoint-sync.${network}.ethpandaops.io/`,
      '--genesis-beacon-api-url=https://checkpoint-sync.${network}.ethpandaops.io/'
    ],
    
    lighthouse: [
      'beacon_node',
      `--network=${network}`,
      '--datadir=/data/lighthouse',
      '--http',
      '--http-address=0.0.0.0',
      '--http-port=4000',
      '--execution-endpoint=http://172.16.0.5:8551',
      '--execution-jwt=/jwt/jwtsecret',
      '--metrics',
      '--metrics-address=0.0.0.0',
      '--metrics-port=8008',
      `--checkpoint-sync-url=https://checkpoint-sync.${network}.ethpandaops.io/`
    ],
    
    nimbus: [
      '--non-interactive',
      `--network=${network}`,
      '--data-dir=/data/nimbus',
      '--web3-url=http://172.16.0.5:8551',
      '--jwt-secret=/jwt/jwtsecret',
      '--rest',
      '--rest-address=0.0.0.0',
      '--rest-port=4000',
      '--metrics',
      '--metrics-address=0.0.0.0',
      '--metrics-port=8008',
      `--trusted-node-url=https://checkpoint-sync.${network}.ethpandaops.io/`
    ]
  };
  
  return cmds[client] || cmds.teku;
}

function generateMainReport(runId, timestamp, network, elClient, clClient) {
  const duration = generateRealisticDuration(elClient, network);
  const startTime = timestamp;
  const endTime = startTime + duration;
  
  // Generate realistic block/slot ranges
  const finalBlock = randomInt(800000, 900000);
  const finalSlot = randomInt(950000, 1000000);
  
  // Generate progress entries
  const numEntries = randomInt(15, 80);
  const progressEntries = [];
  
  for (let i = 0; i < numEntries; i++) {
    const entry = generateProgressEntry(startTime, 0, finalSlot - 100, i, numEntries, duration, network, elClient);
    progressEntries.push(entry);
  }
  
  const lastEntry = progressEntries[progressEntries.length - 1];
  lastEntry.b = finalBlock;
  lastEntry.s = finalSlot;
  lastEntry.t = endTime;
  
  return {
    main: {
      run_id: runId,
      timestamp: timestamp,
      network: network,
      sync_status: {
        start: startTime,
        end: endTime,
        block: finalBlock,
        slot: finalSlot,
        sync_progress_file: `${runId}-${network}_${elClient}_${clClient}.progress.json`,
        last_entry: lastEntry
      },
      execution_client_info: {
        name: `el-1-${elClient}-${clClient}`,
        type: elClient,
        image: CLIENT_IMAGES[elClient],
        entrypoint: ['sh', '-c'],
        cmd: [generateClientCmd(elClient, network)],
        version: CLIENT_VERSIONS[elClient]
      },
      consensus_client_info: {
        name: `cl-1-${clClient}-${elClient}`,
        type: clClient,
        image: CLIENT_IMAGES[clClient],
        entrypoint: clClient === 'lighthouse' ? ['lighthouse'] : [`/opt/${clClient}/bin/${clClient}`],
        cmd: generateConsensusCmd(clClient, network),
        version: CLIENT_VERSIONS[clClient]
      }
    },
    progress: progressEntries
  };
}

function generateMockReports() {
  console.log('🚀 Generating mock reports...');
  
  // Create mock-reports directory
  if (!fs.existsSync(MOCK_REPORTS_DIR)) {
    fs.mkdirSync(MOCK_REPORTS_DIR, { recursive: true });
  }
  
  const indexEntries = [];
  let totalReports = 0;
  
  // Generate reports for each combination
  for (const network of NETWORKS) {
    for (const elClient of EL_CLIENTS) {
      for (const clClient of CL_CLIENTS) {
        console.log(`📊 Generating ${NUM_REPORTS_PER_CLIENT} reports for ${network}/${elClient}/${clClient}...`);
        
        for (let i = 0; i < NUM_REPORTS_PER_CLIENT; i++) {
          const runId = generateRunId();
          // Generate timestamps over the last 30 days
          const daysAgo = randomInt(0, 30);
          const timestamp = Math.floor((Date.now() - (daysAgo * 24 * 60 * 60 * 1000)) / 1000);
          
          const report = generateMainReport(runId, timestamp, network, elClient, clClient);
          
          // Write main.json file
          const mainFilename = `${runId}-${network}_${elClient}_${clClient}.main.json`;
          const mainPath = path.join(MOCK_REPORTS_DIR, mainFilename);
          fs.writeFileSync(mainPath, JSON.stringify(report.main, null, 2));
          
          // Write progress.json file
          const progressFilename = `${runId}-${network}_${elClient}_${clClient}.progress.json`;
          const progressPath = path.join(MOCK_REPORTS_DIR, progressFilename);
          fs.writeFileSync(progressPath, JSON.stringify(report.progress, null, 2));
          
          // Add to index
          indexEntries.push({
            run_id: runId,
            timestamp: timestamp,
            network: network,
            execution_client_info: {
              name: report.main.execution_client_info.name,
              type: elClient,
              image: CLIENT_IMAGES[elClient],
              version: CLIENT_VERSIONS[elClient]
            },
            consensus_client_info: {
              name: report.main.consensus_client_info.name,
              type: clClient,
              image: CLIENT_IMAGES[clClient],
              version: CLIENT_VERSIONS[clClient]
            },
            sync_info: {
              start: report.main.sync_status.start,
              end: report.main.sync_status.end,
              duration: report.main.sync_status.end - report.main.sync_status.start,
              block: report.main.sync_status.block,
              slot: report.main.sync_status.slot,
              entries_count: report.progress.length,
              last_entry: report.main.sync_status.last_entry
            },
            main_file: mainFilename,
            progress_file: progressFilename
          });
          
          totalReports++;
        }
      }
    }
  }
  
  // Sort by timestamp (newest first)
  indexEntries.sort((a, b) => b.timestamp - a.timestamp);
  
  // Write index.json
  const index = {
    generated: Math.floor(Date.now() / 1000),
    entries: indexEntries
  };
  
  const indexPath = path.join(MOCK_REPORTS_DIR, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  
  console.log(`✅ Generated ${totalReports} mock reports in ${MOCK_REPORTS_DIR}/`);
  console.log(`📁 Created index.json with ${indexEntries.length} entries`);
  console.log(`🔧 Add "reports/mock/" to your config.json directories to use these reports`);
}

// Run the generator
if (require.main === module) {
  generateMockReports();
}

module.exports = { generateMockReports };