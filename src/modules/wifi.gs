import_code("../modules/strings.gs")
import_code("../modules/database.gs")

// Define module: Kast.wifi
if not globals.hasIndex("Kast") then globals.Kast = {}
Kast.wifi = {}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

// Returns the local handshake capture file reference.
// @return {any|null} Capture file object or null.
Kast.wifi._getCaptureFile = function
  computer = get_shell.host_computer
  captureFile = computer.File(home_dir + "/file.cap")
  return captureFile
end function

// Removes any existing handshake capture file.
// @return {null}
Kast.wifi._cleanupCaptureFile = function
  captureFile = Kast.wifi._getCaptureFile
  if captureFile then
    captureFile.delete
  end if
end function

// Parses a raw wifi network line into bssid/pwr/essid.
// @param rawNetwork {any} Raw network text from host api.
// @return {map|null} Parsed network map or null if invalid.
Kast.wifi._parseNetwork = function(rawNetwork)
  parts = []
  for part in split(str(rawNetwork), " ")
    if part != "" then parts.push(part)
  end for

  if parts.len < 2 then return null

  powerText = parts[1].replace("%", "")
  if powerText == "" then return null

  essid = ""
  if parts.len >= 3 then essid = join(parts[2 : ], " ")

  return {
    "bssid": parts[0],
    "pwr": powerText.to_int,
    "essid": essid,
  }
end function

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

// Clears cached wifi networks from local storage.
// @return {null}
Kast.wifi.clearCache = function
  Kast.db.truncate("wifi_networks")
  print("WiFi network cache cleared.")
end function

// Lists available wifi networks, optionally filtered by BSSID/ESSID.
// @param interface {string} Network interface (default "wlan0").
// @param id {string|null} Optional BSSID or ESSID filter.
// @return {array} Matching networks with bssid, pwr, and essid.
Kast.wifi.list = function(interface = "wlan0", id = null)
  computer = get_shell.host_computer
  networks = computer.wifi_networks(interface)

  parsedNetworks = []

  // Exit with error if no networks found
  if networks == null or networks.len == 0 then
    return []
  end if

  // Parse and filter networks, optionally by id (either BSSID or ESSID) if provided
  for i in range(0, networks.len - 1)
    network = Kast.wifi._parseNetwork(networks[i])
    hasMatchingId = 0
    if network != null and id != null then
      idText = str(id)
      hasMatchingId = network.bssid == idText or network.essid.lower == idText.lower
    end if
    if network != null and (id == null or hasMatchingId) then
      parsedNetworks.push(network)
    end if
  end for

  // Sort networks by signal strength (pwr) descending
  parsedNetworks.sort("pwr").reverse

  return parsedNetworks
end function

// Connects to a wifi network, cracking password when not cached.
// @param interface {string} Network interface (default "wlan0").
// @param id {string|null} Optional BSSID or ESSID filter.
// @param cachedOnly {boolean} When true, only use cached passwords and never crack.
// @return {null}
Kast.wifi.connect = function(interface = "wlan0", id = null, cachedOnly = false)
  computer = get_shell.host_computer
  networks = Kast.wifi.list(interface, id)
  cachedRows = Kast.db.select("wifi_networks", null)
  if cachedRows == null then cachedRows = []

  cachedNetworks = []
  for network in networks
    cachedRow = null
    for row in cachedRows
      if row == null or not row.hasIndex("pwd") or row.pwd == null then
        continue
      end if

      matchesBssid = row.hasIndex("bssid") and row.bssid == network.bssid
      matchesEssid = network.essid != "" and row.hasIndex("essid") and row.essid != null and row.essid == network.essid
      if matchesBssid or matchesEssid then
        cachedRow = row
        break
      end if
    end for

    if cachedRow != null then
      network.pwd = cachedRow.pwd
      cachedNetworks.push(network)
    end if
  end for

  if cachedOnly then networks = cachedNetworks

  // If id was provided but not found, exit with error
  if id != null and networks.len == 0 then
    if cachedOnly then
      exit("Error: No cached WiFi network found with ESSID or BSSID of: " + id)
    end if
    exit("Error: No network found with ESSID or BSSID of: " + id)
  end if

  // If a single matching network was found, select it. Otherwise display list of networks for user to choose from
  selected = null
  if networks.len == 0 then
    if cachedOnly then
      exit("Error: No usable cached WiFi networks were found.")
    end if
    exit("Error: No usable WiFi networks were found.")
  else if networks.len == 1 then
    selected = networks[0]
    selectedDisplayName = selected.essid
    if selectedDisplayName == "" then selectedDisplayName = "<hidden> (" + selected.bssid + ")"
    print("Selected network: " + selectedDisplayName + " (" + selected.bssid + ") with signal strength: " + selected.pwr + "%")
  else
    // Display available networks
    print("Available WiFi Networks:")
    for i in range(0, networks.len - 1)
      network = networks[i]
      displayName = network.essid
      if displayName == "" then displayName = "<hidden> (" + network.bssid + ")"
      print(Kast.strings.padRight(i + 1, 3) + "  " + displayName + " (" + network.pwr + "%)")
    end for

    // Prompt user to select a network
    print("\nEnter the number of the network to connect to:")
    choice = user_input("> ")
    choiceText = str(choice)
    if choiceText == "" then
      exit("Error: Invalid selection.")
    end if

    indexValue = choiceText.to_int
    if typeof(indexValue) != "number" then
      exit("Error: Invalid selection.")
    end if

    index = indexValue - 1
    if typeof(index) != "number" or index < 0 or index >= networks.len then
      exit("Error: Invalid selection.")
    end if

    selected = networks[index]
    selectedDisplayName = selected.essid
    if selectedDisplayName == "" then selectedDisplayName = "<hidden> (" + selected.bssid + ")"
    print("Selected network: " + selectedDisplayName + " (" + selected.bssid + ") with signal strength: " + selected.pwr + "%")
  end if

  if selected.hasIndex("pwd") and selected.pwd != null then
    Kast.db.replace("wifi_networks", "bssid", selected)

    print("Network already exists in database. Connecting with stored credentials.")

    connectionResult = computer.connect_wifi(
      interface,
      selected.bssid,
      selected.essid,
      selected.pwd)

    if typeof(connectionResult) == "string" then
      exit("Error: Failed to connect to WiFi network. " + connectionResult)
    else
      selectedDisplayName = selected.essid
      if selectedDisplayName == "" then selectedDisplayName = "<hidden> (" + selected.bssid + ")"
      exit("Successfully connected to WiFi network: " + selectedDisplayName)
    end if
  end if

  if cachedOnly then
    selectedDisplayName = selected.essid
    if selectedDisplayName == "" then selectedDisplayName = "<hidden> (" + selected.bssid + ")"
    exit("Error: No cached password found for WiFi network: " + selectedDisplayName)
  end if

  // Load crypto library for password cracking
  crypto = include_lib("/lib/crypto.so")
  if not crypto then
    exit("Error: crypto.so not found in /lib")
  end if

  // Cleanup any existing capture files
  Kast.wifi._cleanupCaptureFile
  monitoringEnabled = false

  // Enable WiFi monitoring to capture handshake
  print("Enabling WiFi monitoring mode to capture handshake...")
  airmonResult = crypto.airmon("start", interface)
  if typeof(airmonResult) == "string" then
    exit("Error: Failed to enable WiFi monitoring mode. " + airmonResult)
  end if
  monitoringEnabled = true

  // Wait for handshake to be captured
  print("Waiting for handshake to be captured...")
  handshakeResult = crypto.aireplay(selected.bssid, selected.essid, 300000 / (selected.pwr + 15))
  if typeof(handshakeResult) == "string" then
    if monitoringEnabled then
      stopResult = crypto.airmon("stop", interface)
      monitoringEnabled = false
      if typeof(stopResult) == "string" then
        Kast.wifi._cleanupCaptureFile
        exit("Error: Failed to disable WiFi monitoring mode after capture failure. " + stopResult)
      end if
    end if
    exit("Error: Failed to capture handshake. " + handshakeResult)
  end if

  // Check if handshake was captured successfully
  captureFile = Kast.wifi._getCaptureFile
  if not captureFile then
    if monitoringEnabled then
      stopResult = crypto.airmon("stop", interface)
      monitoringEnabled = false
      if typeof(stopResult) == "string" then
        Kast.wifi._cleanupCaptureFile
        exit("Error: Failed to disable WiFi monitoring mode after handshake capture failure. " + stopResult)
      end if
    end if
    exit("Error: Handshake capture failed. No handshake.cap file found.")
  end if

  // Stop WiFi monitoring mode before cracking.
  stopResult = crypto.airmon("stop", interface)
  monitoringEnabled = false
  if typeof(stopResult) == "string" then
    Kast.wifi._cleanupCaptureFile
    exit("Error: Failed to disable WiFi monitoring mode. " + stopResult)
  end if

  // Crack password using captured handshake
  print("Cracking password using captured handshake...")
  password = crypto.aircrack(captureFile.path)
  Kast.wifi._cleanupCaptureFile
  if password == null then
    exit("Error: Failed to crack WiFi password.")
  end if

  // Save network and password to database
  selected.pwd = password
  Kast.db.replace("wifi_networks", "bssid", selected)

  // Connect to WiFi network using cracked password
  connectionResult = computer.connect_wifi(
    interface,
    selected.bssid,
    selected.essid,
    selected.pwd)

  if typeof(connectionResult) == "string" then
    exit("Error: Failed to connect to WiFi network. " + connectionResult)
  else
    selectedDisplayName = selected.essid
    if selectedDisplayName == "" then selectedDisplayName = "<hidden> (" + selected.bssid + ")"
    exit("Successfully connected to WiFi network: " + selectedDisplayName)
  end if
end function
