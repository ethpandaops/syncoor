# Syncoor

Syncoor is a sync test orchestation, monitoring and visualization tool that tracks and analyzes Ethereum client synchronization performance by displaying progress charts, peer connections, disk usage, and detailed test results for different execution and consensus client combinations.

<div align="center">
  <img src="web/public/img/logo.png" alt="Syncoor Logo" width="250">
</div>

## Overview

To be written...

## Dependencies

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- [Kurtosis](https://docs.kurtosis.com/install/)

## Quick start

Using docker compose:

```bash
export KURTOSIS_API_AUTH_TOKEN="$(cat "${XDG_CONFIG_HOME:-$HOME/.config}/kurtosis/api-auth-token")"
docker compose up -d
```

Kurtosis 1.23.0 and newer require an auth token on the engine. The `syncoor-run` container cannot read the token file the Kurtosis CLI keeps on the host, so it is passed through `KURTOSIS_API_AUTH_TOKEN`. On macOS the file is at `~/Library/Application Support/kurtosis/api-auth-token`.


Open [http://localhost:10002](http://localhost:10002) in your browser to view the web UI.


## Kurtosis API auth token

Kurtosis 1.23.0 and newer require an auth token on every engine and enclave API call. The Kurtosis CLI generates the token the first time it starts the engine and stores it in the Kurtosis config directory. Syncoor reads it from the `KURTOSIS_API_AUTH_TOKEN` environment variable, falling back to that file.

On Linux the token file is `${XDG_CONFIG_HOME:-$HOME/.config}/kurtosis/api-auth-token`:

```bash
kurtosis engine start
cat "${XDG_CONFIG_HOME:-$HOME/.config}/kurtosis/api-auth-token"
```

Running the `syncoor` binary as the same user that started the engine needs no extra setup. The token has to be passed explicitly when syncoor runs somewhere that does not see that file:

- As another user (for example under `sudo` or a systemd unit), export the token of the user that owns the engine:

  ```bash
  export KURTOSIS_API_AUTH_TOKEN="$(cat /home/<engine-user>/.config/kurtosis/api-auth-token)"
  syncoor sync --network hoodi --el-client geth --cl-client teku
  ```

- In a container, pass the variable through:

  ```bash
  export KURTOSIS_API_AUTH_TOKEN="$(cat "${XDG_CONFIG_HOME:-$HOME/.config}/kurtosis/api-auth-token")"
  docker run --network=host --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -e KURTOSIS_API_AUTH_TOKEN \
    ghcr.io/ethpandaops/syncoor:master sync --network hoodi --el-client geth --cl-client teku
  ```

  With docker compose, export the variable the same way before `docker compose up`; the `syncoor-run` service forwards it. The GitHub action does this automatically: it starts the engine on the runner and forwards the runner's token (or a `KURTOSIS_API_AUTH_TOKEN` already set in the job environment) into the `syncoor-run` container, so workflows using `ethpandaops/syncoor@master` need no changes.

A missing or wrong token fails with `missing or invalid Kurtosis API auth token`. The Kurtosis CLI and the SDK built into syncoor must share the same major.minor version as the engine.

## License

This project is licensed under the [GNU GPL-3.0](LICENSE).
