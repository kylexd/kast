import_code("../vendor/ayecue/json/json.src")

// Define module: Kast.json
if not globals.hasIndex("Kast") then globals.Kast = {}
Kast.json = {}

// Parses a JSON string into a value.
// @param text {string} JSON input string.
// @return {any|null} Parsed value, or null on parse failure.
Kast.json.parse = @JSON.parse

// Serializes a value into a JSON string.
// @param value {any} Value to serialize.
// @return {string|null} JSON string, or null on serialization failure.
Kast.json.stringify = @JSON.stringify