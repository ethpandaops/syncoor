#!/bin/bash

# Script to iterate over enodes and add them as peers using ansible
#
# Usage: ./add_peers.sh [PORT]
#   PORT: Optional port number for RPC endpoint (default: 8545)
#
# Examples:
#   ./add_peers.sh          # Uses default port 8545
#   ./add_peers.sh 8546     # Uses port 8546

# Configuration
PORT=${1:-8545}  # Use first argument as port, default to 8545 if not provided

# Extract enodes from README_ansible_jank.md
ENODES=(
   # "enode://f98515c03f94be41d8ae0baac87381a5f8c644f699c998144d9959db8e759006dfd032a143655e38d01a1a887dd5c772a7b2b7abed80e0d49367add79f08f83e@65.109.56.170:40000"
   # "enode://933798770b60cecdbdcf9b3bf3029eb684e9f95fc139ddc98a1b5b0a486c649b98ad8ac1cad77b687a411902ca82814a67269449e3e975b2638776c25fc4f4b9@157.180.52.250:40000"
   # "enode://bd57271bd665c5982862ac854342c3095b6defd654fc4026823d6a573578609a3fbae91089711438b55b0555e88c65e5ffb0776783baa61e96ed1f1f1219894c@65.109.33.238:40000"
   # "enode://d2ba05de4f34b9dd789853f7a9d74fae49748562968376df5691a67788c2525789e455a17f9877302135bbd23e39b0a59c5a051522207a5f7d849f2b25a54025@65.109.29.126:40000"
   # "enode://81b22fbad670a81dd079fa2081f4e0c33514b839b69732606e869206afde7813d52cfe4dc17461251a4b9c8f5bc4e6dccf73c0b10f1e688761b824b71d8fe744@65.109.52.210:40000"
    "enode://5fcc197cb79c25bb738345c9045794476e17252745517e98cc0c3719b4021799e4b05dd5c91f7175a2a850a8fd97cfe11407a7a090559f765f89d0753e12102f@157.180.52.250:40000"
    "enode://8d2e6236100a064fb85df313021eec3086956197df0ec5af5b83441aa7438d58cf0fb5a521fbed62db17c5e28f9be9a94ec2aea35295079998711066c01f4325@65.109.29.126:40000"
    "enode://a31e0efaf7b7a622b859a9e7c9a62f8c9df7161b1bb721e5e1ec0ba4c0a5c9599b2c1899371ba60e041ea2ce452f621753f58571da12efaa35c3b46e3f3d4036@65.109.33.238:40000"
    "enode://13381a1ed2baf24e9caf0d6c08b2e0f8d88c7a85f920e1b8cb42515c688c7e032ac8355e00e9496189c2d4e3d93fe9bcd10d970d573b488a982e6bdb1039a902@65.109.52.210:40000"
    "enode://6b5877d988a34294ce2fea2422f0db5daf87832ec7ee0471850a5cbd03403c86b495ad1a206e39652824cb7110be5392c4bb18b73d155b36b2be35c8ca609fdb@65.109.56.170:40000"
    "enode://22c1dd13d7738ae461740bbe1340733bdabe88c0682b5788bb308bb80f0d6281085196600416f187dc0f1d5d9613b1c2590e6e5b4003329a464910f613bd096a@157.180.14.229:30303"
    "enode://d38286e50eea1bb75da0f89a65fa8236255d0e52b2980998c7d903be4c69e3477f9f0e54f6039c2308d8e3c41123f3d1aeee2ad4f2811ebd48557a3dc406a273@157.180.14.228:30303"
    "enode://d54f2c88dad80719c6f2be2c9925c6c2609f845ed84c9e2f961c2a7e67bfe218a657118a70a45d1b245e96e2678b0276ca2ca869d7aa5688fcb1a52381d6a1e3@157.180.14.230:30303"
    "enode://62b16e448d6aa6a8ff7a2a25701b43935d956398d7f7bf57fccce281dd989d19cee4d6e2142e11d4be42ffacc394a138b686099885a11d50b4e13db5b8080180@157.180.14.225:30303"
    "enode://3ba5f46aa1a9d863de4ce5ff67ec46704c43b2a1d5100e272dbfec5e56b350113018d3e67c400f09db60d4ec55df025bd209802c67826717a33a48acbe13b305@157.180.14.226:30303"
    "enode://41383da176e6bcb21003b7dd2de4a15255111320f819bf83db0c23b6c19bd83ca89edaa3f68d0f652ff9924e9d8c0bda84e5e8e3bfec33e0a8c387a23e044b5c@157.180.14.227:30303"
)

echo "Adding ${#ENODES[@]} peers using ansible on port ${PORT}..."
echo

# Iterate over each enode and run the ansible command
for i in "${!ENODES[@]}"; do
    enode="${ENODES[$i]}"
    echo "[$((i+1))/${#ENODES[@]}] Adding peer: ${enode}"

    # Run the ansible command to add the peer
    ansible all -b -m shell -a "curl -s --data '{\"method\":\"admin_addPeer\",\"params\":[\"${enode}\"],\"id\":1,\"jsonrpc\":\"2.0\"}' -H 'Content-Type: application/json' http://localhost:${PORT} | jq '.'"
    ansible all -b -m shell -a "curl -s --data '{\"method\":\"admin_addTrustedPeer\",\"params\":[\"${enode}\"],\"id\":1,\"jsonrpc\":\"2.0\"}' -H 'Content-Type: application/json' http://localhost:${PORT} | jq '.'"

    # Add a small delay between requests to avoid overwhelming the nodes
    sleep 1
    echo
done

echo "Finished adding all peers."
