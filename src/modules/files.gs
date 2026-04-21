// Define module: Kast.files
if not globals.hasIndex("Kast") then globals.Kast = {}
Kast.files = {}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

// Ensures a directory path exists by creating missing folders in order.
// @param pc {any} Host computer object.
// @param dirPath {string} Directory path to ensure.
// @return {number} 1 after processing.
Kast.files.ensureDirectoryPath = function(pc, dirPath)
  parts = dirPath.split("/")
  currentPath = ""

  for i in range(0, parts.len - 1)
    part = parts[i]
    if part == "" then continue

    parentPath = currentPath
    currentPath = currentPath + "/" + part

    if pc.File(currentPath) == null then
      if parentPath == "" then parentPath = "/"
      pc.create_folder(parentPath, part)
    end if
  end for

  return 1
end function

// Ensures the parent directory for a full file path exists.
// @param pc {any} Host computer object.
// @param fullPath {string} Full file path.
// @return {number} 1 after ensuring parent path.
Kast.files.ensurePath = function(pc, fullPath)
  parts = fullPath.split("/")
  if parts.len < 2 then return 1

  return Kast.files.ensureDirectoryPath(pc, parts[ : -1].join("/"))
end function
