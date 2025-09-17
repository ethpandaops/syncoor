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
  
  // Memory usage - gradually increasing with progress
  const baseMemEL = 2 * 1024 * 1024 * 1024; // 2GB base
  const maxMemEL = 8 * 1024 * 1024 * 1024;   // 8GB max
  const memEL = Math.floor(baseMemEL + (progress * (maxMemEL - baseMemEL)) + randomFloat(-512*1024*1024, 512*1024*1024));
  
  const baseMemCL = 4 * 1024 * 1024 * 1024; // 4GB base
  const maxMemCL = 12 * 1024 * 1024 * 1024; // 12GB max
  const memCL = Math.floor(baseMemCL + (progress * (maxMemCL - baseMemCL)) + randomFloat(-1024*1024*1024, 1024*1024*1024));
  
  // Block IO - increasing with progress
  const baseIOReadEL = 5 * 1024 * 1024 * 1024;  // 5GB base read
  const maxIOReadEL = 50 * 1024 * 1024 * 1024;   // 50GB max read
  const ioReadEL = Math.floor(baseIOReadEL + (progress * (maxIOReadEL - baseIOReadEL)));
  
  const baseIOWriteEL = 20 * 1024 * 1024 * 1024;  // 20GB base write
  const maxIOWriteEL = 200 * 1024 * 1024 * 1024;  // 200GB max write
  const ioWriteEL = Math.floor(baseIOWriteEL + (progress * (maxIOWriteEL - baseIOWriteEL)));
  
  const baseIOReadCL = 1 * 1024 * 1024 * 1024;   // 1GB base read
  const maxIOReadCL = 5 * 1024 * 1024 * 1024;    // 5GB max read
  const ioReadCL = Math.floor(baseIOReadCL + (progress * (maxIOReadCL - baseIOReadCL)));
  
  const baseIOWriteCL = 2 * 1024 * 1024 * 1024;  // 2GB base write
  const maxIOWriteCL = 10 * 1024 * 1024 * 1024;  // 10GB max write
  const ioWriteCL = Math.floor(baseIOWriteCL + (progress * (maxIOWriteCL - baseIOWriteCL)));
  
  // CPU usage - varies during sync
  const baseCPUEL = 30.0;
  const maxCPUEL = 95.0;
  const cpuEL = baseCPUEL + (progress * (maxCPUEL - baseCPUEL)) + randomFloat(-10, 10);
  
  const baseCPUCL = 10.0;
  const maxCPUCL = 45.0;
  const cpuCL = baseCPUCL + (progress * (maxCPUCL - baseCPUCL)) + randomFloat(-5, 5);
  
  return {
    t: timestamp + timeOffset,
    b: Math.max(0, currentBlock),
    s: Math.max(0, currentSlot),
    de: Math.max(baseDiskEL, diskEL),
    dc: Math.max(clFactors.base, diskCL),
    pe: peersEL,
    pc: peersCL,
    // New Docker metrics
    me: Math.max(baseMemEL, memEL),      // Execution memory
    mc: Math.max(baseMemCL, memCL),      // Consensus memory
    bre: Math.max(0, ioReadEL),          // Execution block IO read
    brc: Math.max(0, ioReadCL),          // Consensus block IO read
    bwe: Math.max(0, ioWriteEL),         // Execution block IO write
    bwc: Math.max(0, ioWriteCL),         // Consensus block IO write
    ce: Math.max(0, Math.min(100, cpuEL)), // Execution CPU % (capped at 100)
    cc: Math.max(0, Math.min(100, cpuCL))  // Consensus CPU % (capped at 100)
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

function generateExecutionEnvVars(client, network) {
  // Generate realistic environment variables for execution clients
  const baseEnvVars = {
    'NETWORK': network,
    'DATA_DIR': `/data/${client}`,
    'JWT_PATH': '/jwt/jwtsecret',
    'METRICS_ENABLED': 'true',
    'LOG_FORMAT': 'json',
    'NODE_NAME': `el-1-${client}`,
  };

  const clientSpecificEnvVars = {
    geth: {
      'GETH_CACHE': '4096',
      'GETH_MAXPEERS': '50',
      'GETH_SYNCMODE': 'snap',
      'GETH_LOG_LEVEL': 'info',
      'GETH_METRICS': 'true',
      'GETH_METRICS_EXPENSIVE': 'true',
    },
    nethermind: {
      'NETHERMIND_CONFIG': network,
      'NETHERMIND_JSONRPCCONFIG_ENABLED': 'true',
      'NETHERMIND_METRICSCONFIG_ENABLED': 'true',
      'NETHERMIND_SYNCCONFIG_FASTSYNC': 'true',
      'NETHERMIND_LOG_LEVEL': 'INFO',
      'DOTNET_BUNDLE_EXTRACT_BASE_DIR': '/tmp/.net',
    },
    besu: {
      'BESU_NETWORK': network,
      'BESU_DATA_PATH': '/data/besu',
      'BESU_RPC_HTTP_ENABLED': 'true',
      'BESU_RPC_WS_ENABLED': 'true',
      'BESU_METRICS_ENABLED': 'true',
      'JAVA_OPTS': '-Xmx8g -Xms2g',
      'LOG4J_CONFIGURATION_FILE': '/config/log4j2.xml',
    },
    erigon: {
      'ERIGON_CHAIN': network,
      'ERIGON_DATADIR': '/data/erigon',
      'ERIGON_METRICS': 'true',
      'ERIGON_PRIVATE_API_ADDR': '0.0.0.0:9090',
      'RUST_LOG': 'info',
      'ERIGON_LOG_LEVEL': 'info',
    },
    reth: {
      'RUST_LOG': 'info,reth=debug',
      'RUST_BACKTRACE': '1',
      'RETH_NETWORK': network,
      'RETH_DATADIR': '/data/reth',
      'RETH_METRICS': '0.0.0.0:9001',
      'RETH_LOG_FORMAT': 'json',
    }
  };

  return {
    ...baseEnvVars,
    ...(clientSpecificEnvVars[client] || {})
  };
}

function generateConsensusEnvVars(client, network) {
  // Generate realistic environment variables for consensus clients
  const baseEnvVars = {
    'NETWORK': network,
    'DATA_DIR': `/data/${client}`,
    'JWT_PATH': '/jwt/jwtsecret',
    'METRICS_ENABLED': 'true',
    'LOG_FORMAT': 'json',
    'NODE_NAME': `cl-1-${client}`,
    'CHECKPOINT_SYNC_URL': `https://checkpoint-sync.${network}.ethpandaops.io/`,
  };

  const clientSpecificEnvVars = {
    teku: {
      'JAVA_OPTS': '-Xmx4g -Xms2g',
      'TEKU_LOG_LEVEL': 'INFO',
      'TEKU_LOG_DESTINATION': 'CONSOLE',
      'TEKU_METRICS_ENABLED': 'true',
      'TEKU_REST_API_ENABLED': 'true',
      'TEKU_DATA_PATH': '/data/teku',
      'LOG4J_CONFIGURATION_FILE': '/config/log4j2.xml',
    },
    prysm: {
      'PRYSM_ACCEPT_TERMS_OF_USE': 'true',
      'PRYSM_LOG_LEVEL': 'info',
      'PRYSM_MONITORING_HOST': '0.0.0.0',
      'PRYSM_DATADIR': '/data/prysm',
      'PRYSM_BEACON_RPC_PROVIDER': 'localhost:4000',
      'GO_MAX_PROCS': '8',
    },
    lighthouse: {
      'RUST_LOG': 'info,lighthouse=debug',
      'LIGHTHOUSE_NETWORK': network,
      'LIGHTHOUSE_DATADIR': '/data/lighthouse',
      'LIGHTHOUSE_METRICS': 'true',
      'LIGHTHOUSE_SPEC': network,
      'DEBUG_LEVEL': 'info',
    },
    nimbus: {
      'NIMBUS_LOG_LEVEL': 'INFO',
      'NIMBUS_NETWORK': network,
      'NIMBUS_DATA_DIR': '/data/nimbus',
      'NIMBUS_WEB3_URL': 'http://172.16.0.5:8551',
      'NIMBUS_NON_INTERACTIVE': 'true',
      'LOG_FORMAT': 'json',
    }
  };

  return {
    ...baseEnvVars,
    ...(clientSpecificEnvVars[client] || {})
  };
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

function generateSystemInfo() {
  // Generate mock system information
  const hostnames = [
    'sync-node-01', 'sync-node-02', 'sync-node-03', 'test-machine-01',
    'validator-node-01', 'eth-sync-test', 'benchmark-server', 'sync-test-runner'
  ];
  
  const cpuModels = [
    'Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz',
    'Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz',
    'AMD Ryzen 9 5900X 12-Core Processor',
    'Apple M1 Max',
    'Intel(R) Core(TM) i9-10900K CPU @ 3.70GHz',
    'AMD EPYC 7542 32-Core Processor',
    'Intel(R) Xeon(R) Gold 6248 CPU @ 2.50GHz',
    'ARM Cortex-A72'
  ];
  
  const platforms = ['linux', 'darwin', 'windows'];
  const architectures = ['amd64', 'arm64', 'x86_64'];
  
  const selectedPlatform = platforms[randomInt(0, platforms.length - 1)];
  const selectedArch = architectures[randomInt(0, architectures.length - 1)];
  
  // Platform-specific details
  let kernelVersion = '';
  let platformFamily = selectedPlatform;
  let platformVersion = '';
  
  if (selectedPlatform === 'linux') {
    kernelVersion = `5.${randomInt(10, 19)}.${randomInt(0, 20)}-generic`;
    platformVersion = ['22.04', '20.04', '18.04', '23.10'][randomInt(0, 3)];
  } else if (selectedPlatform === 'darwin') {
    kernelVersion = `${randomInt(21, 24)}.${randomInt(0, 6)}.0`;
    platformVersion = `${randomInt(12, 15)}.${randomInt(0, 6)}`;
  } else if (selectedPlatform === 'windows') {
    kernelVersion = '10.0.19045';
    platformVersion = '10.0.19045';
    platformFamily = 'windows';
  }
  
  const cpuModel = cpuModels[randomInt(0, cpuModels.length - 1)];
  const cpuCores = randomInt(4, 32);
  const cpuThreads = cpuCores * (Math.random() > 0.5 ? 2 : 1); // Some CPUs have hyperthreading
  
  return {
    hostname: hostnames[randomInt(0, hostnames.length - 1)],
    os: selectedPlatform,
    architecture: selectedArch,
    go_version: `go1.${randomInt(19, 23)}.${randomInt(0, 10)}`,
    syncoor_version: `v${randomInt(1, 2)}.${randomInt(0, 9)}.${randomInt(0, 20)}`,
    
    // Enhanced OS information
    os_name: selectedPlatform === 'linux' ? 'Ubuntu' : selectedPlatform === 'darwin' ? 'macOS' : 'Windows',
    os_vendor: selectedPlatform === 'linux' ? 'Canonical' : selectedPlatform === 'darwin' ? 'Apple' : 'Microsoft',
    os_version: platformVersion,
    kernel_version: kernelVersion,
    
    // CPU information
    cpu_count: cpuCores,
    cpu_model: cpuModel,
    cpu_vendor: cpuModel.includes('Intel') ? 'Intel' : cpuModel.includes('AMD') ? 'AMD' : cpuModel.includes('Apple') ? 'Apple' : 'Unknown',
    cpu_speed: randomInt(2000, 4000), // MHz
    cpu_cache: randomInt(8192, 32768), // KB
    cpu_cores: cpuCores,
    cpu_threads: cpuThreads,
    
    // Memory information
    total_memory: randomInt(8, 128) * 1024 * 1024 * 1024, // 8GB to 128GB in bytes
    memory_type: ['DDR4', 'DDR5', 'LPDDR4', 'LPDDR5'][randomInt(0, 3)],
    memory_speed: randomInt(2400, 6400), // MT/s
    
    // Hardware information  
    machine_id: `${randomInt(10000000, 99999999)}-${randomInt(1000, 9999)}-${randomInt(1000, 9999)}-${randomInt(1000, 9999)}-${randomInt(100000000000, 999999999999)}`,
    hypervisor: Math.random() > 0.7 ? ['KVM', 'VMware', 'Xen', 'VirtualBox'][randomInt(0, 3)] : '',
    timezone: ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'][randomInt(0, 3)],
    
    // Legacy fields for backward compatibility
    platform: selectedPlatform,
    platform_family: platformFamily,
    platform_version: platformVersion
  };
}

function generateGitHubLabels() {
  // Generate mock GitHub Actions context labels for traceability
  const workflows = ['Sync Test', 'CI/CD', 'Nightly Tests', 'Performance Test', 'Integration Test'];
  const actors = ['alice-dev', 'bob-tester', 'charlie-ops', 'diana-ci', 'evan-qa'];
  const eventNames = ['push', 'pull_request', 'schedule', 'workflow_dispatch'];
  const refs = ['refs/heads/main', 'refs/heads/develop', 'refs/heads/feature/sync-improvements', 'refs/pull/123/merge'];
  const jobNames = ['sync', 'build', 'test', 'deploy', 'lint', 'integration-test'];
  
  const runId = randomInt(1000000000, 9999999999).toString();
  const runNumber = randomInt(1, 5000).toString();
  const jobName = jobNames[randomInt(0, jobNames.length - 1)];
  const jobId = randomInt(10000000000, 99999999999).toString(); // 11-digit job ID
  const sha = Math.random().toString(36).substring(2, 42); // 40 char SHA
  
  return {
    'github.run_id': runId,
    'github.run_number': runNumber,
    'github.job': jobName,
    'github.job_id': jobId,
    'github.repository': 'ethpandaops/syncoor',
    'github.workflow': workflows[randomInt(0, workflows.length - 1)],
    'github.sha': sha,
    'github.actor': actors[randomInt(0, actors.length - 1)],
    'github.event_name': eventNames[randomInt(0, eventNames.length - 1)],
    'github.ref': refs[randomInt(0, refs.length - 1)]
  };
}

function generateMainReport(runId, timestamp, network, elClient, clClient, isTimeout = false, isCrash = false) {
  const duration = generateRealisticDuration(elClient, network);
  const startTime = timestamp;
  let endTime = startTime + duration;
  let status = "success";
  let statusMessage = `Sync completed successfully at block ${randomInt(800000, 900000)}, slot ${randomInt(950000, 1000000)}`;
  
  // For timeout tests, cut the duration short and set appropriate status
  if (isTimeout) {
    const timeoutDurations = ['30m0s', '45m0s', '1h0m0s', '1h30m0s', '2h0m0s'];
    const timeoutDuration = timeoutDurations[randomInt(0, timeoutDurations.length - 1)];
    
    // Convert timeout string to seconds
    const timeoutSeconds = timeoutDuration.includes('h') 
      ? parseInt(timeoutDuration) * 3600 + (parseInt(timeoutDuration.split('h')[1]) || 0) * 60
      : parseInt(timeoutDuration) * 60;
    
    // End time is when timeout occurred
    endTime = startTime + timeoutSeconds;
    status = "timeout";
    statusMessage = `Sync operation timed out after ${timeoutDuration}`;
  }
  
  // For container crash tests, simulate crashes at various points
  if (isCrash) {
    // Crash at different points in the sync process (10% to 80% completion)
    const crashPoint = randomFloat(0.1, 0.8);
    const crashTime = startTime + Math.floor(duration * crashPoint);
    endTime = crashTime;
    status = "error";
    
    // Generate different types of container crashes
    const crashTypes = [
      { client: 'execution', reason: 'out of memory (OOM)', exitCode: 137 },
      { client: 'execution', reason: 'segmentation fault', exitCode: 139 },
      { client: 'execution', reason: 'disk space full', exitCode: 1 },
      { client: 'consensus', reason: 'out of memory (OOM)', exitCode: 137 },
      { client: 'consensus', reason: 'connection refused to execution client', exitCode: 1 },
      { client: 'execution', reason: 'database corruption', exitCode: 1 },
      { client: 'consensus', reason: 'failed to start beacon chain', exitCode: 1 }
    ];
    
    const crashType = crashTypes[randomInt(0, crashTypes.length - 1)];
    const clientName = crashType.client === 'execution' ? elClient : clClient;
    statusMessage = `${crashType.client} client container crashed: Container ${clientName} (${crashType.client}) crashed with exit code ${crashType.exitCode} at ${new Date(crashTime * 1000).toISOString()}`;
  }
  
  // Generate realistic block/slot ranges
  let finalBlock, finalSlot, numEntries;
  
  if (isTimeout) {
    finalBlock = randomInt(400000, 700000);
    finalSlot = randomInt(500000, 800000);
    numEntries = randomInt(10, 50);
  } else if (isCrash) {
    // Crash scenarios: lower progress ranges
    finalBlock = randomInt(200000, 600000);
    finalSlot = randomInt(300000, 700000);
    numEntries = randomInt(5, 30);
  } else {
    finalBlock = randomInt(800000, 900000);
    finalSlot = randomInt(950000, 1000000);
    numEntries = randomInt(15, 80);
  }
  
  // Generate progress entries up to timeout, crash, or completion
  const actualDuration = endTime - startTime;
  const progressEntries = [];
  
  for (let i = 0; i < numEntries; i++) {
    const entry = generateProgressEntry(startTime, 0, finalSlot - 100, i, numEntries, actualDuration, network, elClient);
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
        status: status,
        status_message: statusMessage,
        block: finalBlock,
        slot: finalSlot,
        sync_progress_file: `${runId}-${network}_${elClient}_${clClient}.progress.json`,
        last_entry: lastEntry,
        entries_count: numEntries
      },
      execution_client_info: {
        name: `el-1-${elClient}-${clClient}`,
        type: elClient,
        image: CLIENT_IMAGES[elClient],
        entrypoint: ['sh', '-c'],
        cmd: [generateClientCmd(elClient, network)],
        version: CLIENT_VERSIONS[elClient],
        env_vars: generateExecutionEnvVars(elClient, network)
      },
      consensus_client_info: {
        name: `cl-1-${clClient}-${elClient}`,
        type: clClient,
        image: CLIENT_IMAGES[clClient],
        entrypoint: clClient === 'lighthouse' ? ['lighthouse'] : [`/opt/${clClient}/bin/${clClient}`],
        cmd: generateConsensusCmd(clClient, network),
        version: CLIENT_VERSIONS[clClient],
        env_vars: generateConsensusEnvVars(clClient, network)
      },
      system_info: generateSystemInfo(),
      labels: generateGitHubLabels()
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
          
          // Generate different test scenarios
          const rand = Math.random();
          const isTimeout = rand < 0.1;          // 10% chance of timeout
          const isCrash = !isTimeout && rand < 0.15; // 5% chance of container crash (total 15% failures)
          
          const report = generateMainReport(runId, timestamp, network, elClient, clClient, isTimeout, isCrash);
          
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
            system_info: report.main.system_info,
            sync_info: {
              start: report.main.sync_status.start,
              end: report.main.sync_status.end,
              duration: report.main.sync_status.end - report.main.sync_status.start,
              status: report.main.sync_status.status,
              status_message: report.main.sync_status.status_message,
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