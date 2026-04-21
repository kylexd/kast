# kast

A multitool written in GreyScript for the video game [GreyHack](https://store.steampowered.com/app/605230/Grey_Hack/).

## Commands

### `wifi:connect`
Connects to a WiFi network, using cached credentials when available and cracking the password otherwise.

```
kast wifi:connect [-c] [-i INTERFACE] [ID]
```

| Flag | Long | Description |
|------|------|-------------|
| `-i` | `--interface` | Network interface to use (default: `wlan0`) |
| `-c` | `--cached-only` | Only connect when a cached password is already known |

Positional args:
- `ID` (optional): BSSID or ESSID to connect to.

### `wifi:list`
Lists available WiFi networks in aligned columns.
By default, only networks with a cached password are shown, with `ESSID`, `BSSID`, `PWR`, and `PASSWORD` columns.

```
kast wifi:list [-a] [INTERFACE] [ID]
```

| Flag | Long | Description |
|------|------|-------------|
| `-a` | `--all` | Include networks even when no cached password is known |

Positional args:
- `INTERFACE` (optional): Network interface to scan (default: `wlan0`).
- `ID` (optional): BSSID or ESSID to filter listed networks.

### `wifi:clear`
Clears the cached WiFi network credentials stored in the local database.

```
kast wifi:clear
```

## Vendor

### ayecue/json

- **Source:** https://github.com/ayecue/json
- **Commit:** `ae67da633119701e235f1c01c0ac6f8b5d99dd6a`
- **Author:** [ayecue](https://github.com/ayecue)
- **License:** N/A

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
