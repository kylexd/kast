import_code("./strings.gs")

// Define module: Kast.cli
if not globals.hasIndex("Kast") then globals.Kast = {}
Kast.cli = {}
Kast.cli._commands = {}

// Registers a command in the CLI command registry.
// @param name {string} Command name.
// @param handler {function} Command handler function.
// @param info {map} Command metadata.
// @return {null}
Kast.cli.command = function(name, handler, info)
  if info == null then info = {}
  if not info.hasIndex("handler") then
    exit("Error: Missing required 'handler' field for command '" + name + "'.")
  end if
  Kast.cli._commands[name] = info
  return null
end function

// Returns 1 when token is a help flag.
// @param token {string} Token text.
// @return {number} 1 for -h/--help, else 0.
Kast.cli._isHelpArg = function(token)
  return token == "-h" or token == "--help"
end function

// Parses boolean text into a boolean value.
// @param rawValue {any} Value to parse.
// @param optionName {string} Option name for error messaging.
// @return {boolean} true or false.
Kast.cli._parseBoolValue = function(rawValue, optionName)
  value = str(rawValue).lower
  if value == "1" or value == "true" or value == "yes" or value == "on" then return true
  if value == "0" or value == "false" or value == "no" or value == "off" then return false
  exit("Error: Invalid boolean value for " + optionName + ": " + str(rawValue))
end function

// Gets an option spec by long alias.
// @param options {array} Option specs.
// @param longName {string} Long option name without '--'.
// @return {map|null} Matching option spec or null.
Kast.cli._findOptionByLong = function(options, longName)
  for option in options
    if option.hasIndex("long") and option.long == longName then return option
  end for
  return null
end function

// Gets an option spec by short alias.
// @param options {array} Option specs.
// @param shortName {string} Short option name without '-'.
// @return {map|null} Matching option spec or null.
Kast.cli._findOptionByShort = function(options, shortName)
  for option in options
    if option.hasIndex("short") and option.short == shortName then return option
  end for
  return null
end function

// Parses raw command args into named values and positional args.
// Supports:
// --name value
// --name=value
// -n value
// -abc (boolean short flags)
// -ivalue (short + attached value)
// @param commandInfo {map} Command metadata with optional options list.
// @param rawArgs {array} Raw CLI args after command name.
// @return {map} Parsed args map with values and args.
Kast.cli.parseCommandArgs = function(commandInfo, rawArgs)
  parsed = {
    "values": {},
    "args": [],
  }

  if not commandInfo.hasIndex("options") then
    parsed.args = rawArgs
    return parsed
  end if

  options = commandInfo.options

  for option in options
    defaultValue = null
    if option.hasIndex("default") then defaultValue = option.default
    parsed.values[option.name] = defaultValue
  end for

  i = 0
  while i < rawArgs.len
    token = str(rawArgs[i])

    if token == "--" then
      if i + 1 <= rawArgs.len - 1 then
        for j in range(i + 1, rawArgs.len - 1)
          parsed.args.push(rawArgs[j])
        end for
      end if
      break
    end if

    if token.len > 2 and token[0 : 2] == "--" then
      eqIndex = token.indexOf("=")
      longName = ""
      inlineValue = null
      hasInlineValue = 0

      if eqIndex > 0 then
        longName = token[2 : eqIndex]
        inlineValue = token[eqIndex + 1 : ]
        hasInlineValue = 1
      else
        longName = token[2 : ]
      end if

      option = Kast.cli._findOptionByLong(options, longName)
      if option == null then exit("Error: Unknown option '--" + longName + "'.")

      if option.type == "boolean" then
        if hasInlineValue then
          parsed.values[option.name] = Kast.cli._parseBoolValue(inlineValue, "--" + longName)
        else
          parsed.values[option.name] = true
        end if
      else
        value = null
        if hasInlineValue then
          value = inlineValue
        else
          if i + 1 >= rawArgs.len then exit("Error: Missing value for option '--" + longName + "'.")
          i += 1
          value = rawArgs[i]
        end if
        parsed.values[option.name] = value
      end if

      i += 1
      continue
    end if

    if token.len > 1 and token[0 : 1] == "-" then
      shortGroup = token[1 : ]
      k = 0
      while k < shortGroup.len
        shortName = shortGroup[k : k + 1]
        option = Kast.cli._findOptionByShort(options, shortName)
        if option == null then exit("Error: Unknown option '-" + shortName + "'.")

        if option.type == "boolean" then
          parsed.values[option.name] = true
          k += 1
          continue
        end if

        value = null
        if k < shortGroup.len - 1 then
          value = shortGroup[k + 1 : ]
        else
          if i + 1 >= rawArgs.len then exit("Error: Missing value for option '-" + shortName + "'.")
          i += 1
          value = rawArgs[i]
        end if

        parsed.values[option.name] = value
        k = shortGroup.len
      end while

      i += 1
      continue
    end if

    parsed.args.push(rawArgs[i])
    i += 1
  end while

  return parsed
end function

// Returns 1 when args contain -h or --help.
// @param args {array} Raw command args.
// @return {number} 1 when help arg exists, else 0.
Kast.cli.containsHelpArg = function(args)
  for arg in args
    if Kast.cli._isHelpArg(str(arg)) then return 1
  end for
  return 0
end function

// Prints general CLI help screen.
// @param commands {map} Command registry.
// @return {null}
Kast.cli.showGeneralHelp = function(commands)
  print("<b>Kast v0.0.1</b>")
  print("\n<b>COMMANDS</b>")

  maxCommandLength = 0
  for item in commands
    if item.key.len > maxCommandLength then maxCommandLength = item.key.len
  end for

  for item in commands
    print("  " + Kast.strings.padRight(item.key, maxCommandLength) + " - " + item.value.description)
  end for

  print("\nRun 'kast COMMAND --help' for command synopsis and options.")
end function

// Prints usage information for a specific command.
// @param commands {map} Command registry.
// @param command {string} Command name.
// @return {null}
Kast.cli.showCommandUsage = function(commands, command)
  if not commands.hasIndex(command) then
    print("No help available for: " + command)
    return 
  end if

  info = commands[command]
  print("<b>NAME</b>")
  print("  " + command + " - " + info.description)

  print("\n<b>SYNOPSIS</b>")
  print("  " + info.usage)

  if info.hasIndex("args") and info.args.len > 0 then
    print("\n<b>ARGS</b>")
    for arg in info.args
      print("  " + Kast.strings.padRight(arg.name.upper, 16) + arg.description)
    end for
  end if

  if info.hasIndex("options") and info.options.len > 0 then
    maxOptionLength = 0
    for option in info.options
      aliasParts = []
      if option.hasIndex("short") then
        if option.type == "boolean" then
          aliasParts.push("-" + option.short)
        else
          aliasParts.push("-" + option.short + " " + option.name.upper)
        end if
      end if
      if option.hasIndex("long") then
        if option.type == "boolean" then
          aliasParts.push("--" + option.long)
        else
          aliasParts.push("--" + option.long + "=" + option.name.upper)
        end if
      end if

      aliasText = join(aliasParts, ", ")
      if aliasText.len > maxOptionLength then maxOptionLength = aliasText.len
    end for

    print("\n<b>OPTIONS</b>")
    for option in info.options
      aliasParts = []
      if option.hasIndex("short") then
        if option.type == "boolean" then
          aliasParts.push("-" + option.short)
        else
          aliasParts.push("-" + option.short + " " + option.name.upper)
        end if
      end if
      if option.hasIndex("long") then
        if option.type == "boolean" then
          aliasParts.push("--" + option.long)
        else
          aliasParts.push("--" + option.long + "=" + option.name.upper)
        end if
      end if

      aliasText = join(aliasParts, ", ")

      if option.hasIndex("default") and option.default != null then
        print("  " + Kast.strings.padRight(aliasText, maxOptionLength + 1) + option.description + " (default: " + str(option.default) + ")")
      else
        print("  " + Kast.strings.padRight(aliasText, maxOptionLength + 1) + option.description)
      end if
    end for
  end if
end function

// Bootstraps CLI handling from the internal command registry and invokes
// the matching handler.
// @return {null}
Kast.cli.bootstrap = function
  commands = Kast.cli._commands

  if params.len == 0 or (params[0] == "--help" or params[0] == "-h") then
    Kast.cli.showGeneralHelp(commands)
    return null
  end if

  commandName = params[0]

  if not commands.hasIndex(commandName) then
    print("Error: Unknown command '" + commandName + "'")
    Kast.cli.showGeneralHelp(commands)
    return null
  end if

  command = commands[commandName]

  if Kast.cli.containsHelpArg(params[1 : ]) then
    Kast.cli.showCommandUsage(commands, commandName)
    return null
  end if

  parsed = Kast.cli.parseCommandArgs(command, params[1 : ])
  handlerName = command.handler
  if not globals.hasIndex(handlerName) then
    exit("Error: Handler '" + handlerName + "' is not defined.")
  end if
  globals[handlerName](parsed.values, parsed.args)
end function
