// Define module: Kast.strings
if not globals.hasIndex("Kast") then globals.Kast = {}
Kast.strings = {}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

// Right-pads text with spaces to the target width.
// @param text {any} Value to pad.
// @param length {number} Target total length.
// @return {string} Space-padded text.
Kast.strings.padRight = function(text, length)
  text = str(text)
  while text.len < length
    text += " "
  end while
  return text
end function
