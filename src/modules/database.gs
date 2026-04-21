import_code("./files.gs")
import_code("./json.gs")

// Define module: Kast.db
if not globals.hasIndex("Kast") then globals.Kast = {}
Kast.db = {}

// Base directory where .kdb table files are stored.
Kast.db.path = "/home/" + active_user + "/.kast/db/"

// -----------------------------------------------------------------------------
// Internal: path/file helpers
// -----------------------------------------------------------------------------

// Validates a table name to block path traversal and invalid separators.
// @param table {any} Table name candidate.
// @return {number} 1 when valid, else 0.
Kast.db._isValidTableName = function(table)
  name = str(table)
  if name == "" then return 0
  if name.indexOf("/") >= 0 then return 0
  if name.indexOf("\\") >= 0 then return 0
  if name.indexOf("..") >= 0 then return 0
  return 1
end function

// Ensures the db directory exists.
// @return {any} Directory object when created/found, else null.
Kast.db._ensureDbPath = function
  return Kast.files.ensureDirectoryPath(get_shell.host_computer, Kast.db.path)
end function

// Gets the parent directory from a full path.
// @param fullPath {string} Full file path.
// @return {string} Parent directory path, or "/".
Kast.db._getParentPath = function(fullPath)
  parts = fullPath.split("/")
  if parts.len < 2 then return "/"

  parentPath = parts[ : -1].join("/")
  if parentPath == "" then return "/"

  return parentPath
end function

// Gets the filename from a full path.
// @param fullPath {string} Full file path.
// @return {string} File name segment or empty string.
Kast.db._getFileName = function(fullPath)
  parts = fullPath.split("/")
  if parts.len == 0 then return ""
  return parts[parts.len - 1]
end function

// Creates an empty file at a path.
// @param fullPath {string} Full file path to create.
// @return {number} 1 on success, else 0.
Kast.db._createEmptyFile = function(fullPath)
  fileName = Kast.db._getFileName(fullPath)
  if fileName == "" then return 0

  return get_shell.host_computer.touch(Kast.db._getParentPath(fullPath), fileName)
end function

// Gets table file, creating parent path and file if needed.
// @param table {string} Table name.
// @return {any|null} File object on success, else null.
Kast.db._getOrCreateTableFile = function(table)
  if not Kast.db._ensureDbPath then return null

  tablePath = Kast.db.getTablePath(table)
  if tablePath == null then return null

  Kast.files.ensurePath(get_shell.host_computer, tablePath)
  if get_shell.host_computer.File(tablePath) == null then
    if not Kast.db._createEmptyFile(tablePath) then return null
  end if

  tableFile = get_shell.host_computer.File(tablePath)
  if tableFile then return tableFile

  return null
end function

// -----------------------------------------------------------------------------
// Internal: record/query evaluation helpers
// -----------------------------------------------------------------------------

// Reads key value from a record when key exists.
// @param record {map|null} Record map.
// @param keyField {string} Key field name.
// @return {any|null} Key value when present, else null.
Kast.db._getRecordKeyValue = function(record, keyField)
  if record == null then return null
  if str(keyField) == "" then return null
  if not record.hasIndex(keyField) then return null

  return record[keyField]
end function

// Checks whether row[keyField] matches keyValue.
// @param row {map} Row candidate.
// @param table {string} Table name for errors.
// @param keyField {string} Field name to compare.
// @param keyValue {any} Value to match.
// @return {number} 1 when values match, else 0.
Kast.db._rowMatchesKeyValue = function(row, table, keyField, keyValue)
  if typeof(row) != "map" then
    exit("Error: Invalid row in table '" + str(table) + "' (expected map): " + str(row))
  end if

  if not row.hasIndex(keyField) then return 0

  return str(row[keyField]) == str(keyValue)
end function

// Returns whether a string is a supported query operator.
// @param op {string} Operator string.
// @return {number} 1 when supported, else 0.
Kast.db._isOperator = function(op)
  ops = [
    "=",
    ">",
    "<",
    ">=",
    "<=",
    "<>",
    "!=",
    "like",
    "not like",
  ]
  for item in ops
    if op == item then return 1
  end for
  return 0
end function

// Case-insensitive wildcard match where % means any sequence.
// @param value {string} Candidate value.
// @param pattern {string} Pattern with optional % tokens.
// @return {number} 1 when matched, else 0.
Kast.db._wildcardMatch = function(value, pattern)
  v = value.lower
  p = pattern.lower
  parts = p.split("%")

  if parts.len == 1 then return v == p

  cursor = 0
  if parts[0].len > 0 then
    if v.indexOf(parts[0]) != 0 then return 0
    cursor = parts[0].len
  end if

  lastPart = parts[parts.len - 1]
  searchEnd = v.len
  if lastPart.len > 0 then
    if v.len < lastPart.len then return 0
    if v[v.len - lastPart.len : ] != lastPart then return 0
    searchEnd = v.len - lastPart.len
  end if

  i = 1
  while i <= parts.len - 2
    part = parts[i]
    if part.len > 0 then
      idx = v[cursor : searchEnd].indexOf(part)
      if idx < 0 then return 0
      cursor = cursor + idx + part.len
    end if
    i += 1
  end while

  if cursor > searchEnd then return 0
  return 1
end function

// Compares actual and expected using the given operator.
// @param actual {any} Actual field value.
// @param expected {any} Expected comparison value.
// @param op {string} Comparison operator.
// @return {number} 1 when comparison is true, else 0.
Kast.db._compareValues = function(actual, expected, op)
  if typeof(actual) == "number" then
    numExpected = val(str(expected))
    if op == "=" then return actual == numExpected
    if op == ">" then return actual > numExpected
    if op == "<" then return actual < numExpected
    if op == ">=" then return actual >= numExpected
    if op == "<=" then return actual <= numExpected
    if op == "<>" or op == "!=" then return actual != numExpected
  end if

  a = str(actual)
  e = str(expected)

  if op == "=" then return a == e
  if op == ">" then return a > e
  if op == "<" then return a < e
  if op == ">=" then return a >= e
  if op == "<=" then return a <= e
  if op == "<>" or op == "!=" then return a != e
  if op == "like" then return Kast.db._wildcardMatch(a, e)
  if op == "not like" then return not Kast.db._wildcardMatch(a, e)

  return 0
end function

// Evaluates one query condition against a row.
// @param row {map} Row data.
// @param cond {map} Condition descriptor.
// @return {number} 1 when condition matches, else 0.
Kast.db._evaluateCondition = function(row, cond)
  condType = cond["type"]

  if condType == "group" then
    subConditions = cond["conditions"]
    if subConditions.len == 0 then return 1
    result = Kast.db._evaluateCondition(row, subConditions[0])
    i = 1
    while i < subConditions.len
      sub = subConditions[i]
      match = Kast.db._evaluateCondition(row, sub)
      if sub["logic"] == "or" then
        result = result or match
      else
        result = result and match
      end if
      i += 1
    end while
    return result
  end if

  field = cond["field"]

  if condType == "null" then
    if not row.hasIndex(field) then return 1
    return row[field] == null
  end if

  if condType == "not_null" then
    if not row.hasIndex(field) then return 0
    return row[field] != null
  end if

  if condType == "in" then
    if not row.hasIndex(field) then return 0
    actual = str(row[field])
    for v in cond["values"]
      if actual == str(v) then return 1
    end for
    return 0
  end if

  if condType == "not_in" then
    if not row.hasIndex(field) then return 1
    actual = str(row[field])
    for v in cond["values"]
      if actual == str(v) then return 0
    end for
    return 1
  end if

  if condType == "between" then
    if not row.hasIndex(field) then return 0
    actual = row[field]
    minVal = cond["min"]
    maxVal = cond["max"]
    if typeof(actual) == "number" then
      return actual >= val(str(minVal)) and actual <= val(str(maxVal))
    end if
    return str(actual) >= str(minVal) and str(actual) <= str(maxVal)
  end if

  if not row.hasIndex(field) then return 0
  return Kast.db._compareValues(row[field], cond["value"], cond["op"])
end function

// Evaluates a where clause format against a row.
// @param row {map} Row data.
// @param where {any} null, string, map, or query map with conditions.
// @return {number} 1 when where clause matches, else 0.
Kast.db._evaluateWhere = function(row, where)
  if where == null then return 1

  if typeof(where) == "map" and where.hasIndex("conditions") then
    conditions = where["conditions"]
    if conditions.len == 0 then return 1

    result = Kast.db._evaluateCondition(row, conditions[0])
    i = 1
    while i < conditions.len
      cond = conditions[i]
      match = Kast.db._evaluateCondition(row, cond)
      if cond["logic"] == "or" then
        result = result or match
      else
        result = result and match
      end if
      i += 1
    end while
    return result
  end if

  if typeof(where) == "map" then
    for key in where.indexes
      if not row.hasIndex(key) then return 0
      if str(row[key]) != str(where[key]) then return 0
    end for
    return 1
  end if

  if typeof(where) == "string" then
    if where == "" then return 1
    return str(row).indexOf(where) >= 0
  end if

  return 0
end function

// Builds a chainable query object with where/orWhere style methods.
// @return {map} Query builder object with conditions list and chain methods.
Kast.db._buildQuery = function
  q = {}
  q.conditions = []

  q.where = function(field, op, value)
    if typeof(field) == "function" then
      subQ = Kast.db._buildQuery
      field(subQ)
      self.conditions.push({
        "type": "group",
        "logic": "and",
        "conditions": subQ.conditions,
      })
      return self
    end if
    if value == null and op != null and not Kast.db._isOperator(str(op)) then
      value = op
      op = "="
    end if
    self.conditions.push({
      "type": "where",
      "logic": "and",
      "field": field,
      "op": op,
      "value": value,
    })
    return self
  end function

  q.orWhere = function(field, op, value)
    if typeof(field) == "function" then
      subQ = Kast.db._buildQuery
      field(subQ)
      self.conditions.push({
        "type": "group",
        "logic": "or",
        "conditions": subQ.conditions,
      })
      return self
    end if
    if value == null and op != null and not Kast.db._isOperator(str(op)) then
      value = op
      op = "="
    end if
    self.conditions.push({
      "type": "where",
      "logic": "or",
      "field": field,
      "op": op,
      "value": value,
    })
    return self
  end function

  q.whereIn = function(field, values)
    self.conditions.push({
      "type": "in",
      "logic": "and",
      "field": field,
      "values": values,
    })
    return self
  end function

  q.orWhereIn = function(field, values)
    self.conditions.push({
      "type": "in",
      "logic": "or",
      "field": field,
      "values": values,
    })
    return self
  end function

  q.whereNotIn = function(field, values)
    self.conditions.push({
      "type": "not_in",
      "logic": "and",
      "field": field,
      "values": values,
    })
    return self
  end function

  q.orWhereNotIn = function(field, values)
    self.conditions.push({
      "type": "not_in",
      "logic": "or",
      "field": field,
      "values": values,
    })
    return self
  end function

  q.whereBetween = function(field, minVal, maxVal)
    self.conditions.push({
      "type": "between",
      "logic": "and",
      "field": field,
      "min": minVal,
      "max": maxVal,
    })
    return self
  end function

  q.orWhereBetween = function(field, minVal, maxVal)
    self.conditions.push({
      "type": "between",
      "logic": "or",
      "field": field,
      "min": minVal,
      "max": maxVal,
    })
    return self
  end function

  q.whereNull = function(field)
    self.conditions.push({
      "type": "null",
      "logic": "and",
      "field": field,
    })
    return self
  end function

  q.orWhereNull = function(field)
    self.conditions.push({
      "type": "null",
      "logic": "or",
      "field": field,
    })
    return self
  end function

  q.whereNotNull = function(field)
    self.conditions.push({
      "type": "not_null",
      "logic": "and",
      "field": field,
    })
    return self
  end function

  q.orWhereNotNull = function(field)
    self.conditions.push({
      "type": "not_null",
      "logic": "or",
      "field": field,
    })
    return self
  end function

  return q
end function

// -----------------------------------------------------------------------------
// Public API: table and row operations
// -----------------------------------------------------------------------------

// Builds table file path under Kast.db.path.
// @param table {string} Table name.
// @return {string|null} Full .kdb path, or null for invalid name.
Kast.db.getTablePath = function(table)
  if not Kast.db._isValidTableName(table) then return null
  return Kast.db.path + str(table) + ".kdb"
end function

// Loads all rows from a table file.
// @param table {string} Table name.
// @return {array} Parsed rows; empty array for missing/empty table.
Kast.db.loadFromFile = function(table)
  tableFile = Kast.db._getOrCreateTableFile(table)
  if tableFile == null then return []

  raw = tableFile.get_content
  if raw == null or raw == "" then return []

  parsed = Kast.json.parse(raw)
  if parsed == null then
    exit("Error: Invalid JSON payload in table '" + str(table) + "'.")
  end if

  if typeof(parsed) != "list" then
    exit("Error: Invalid JSON payload in table '" + str(table) + "' (expected list).")
  end if

  rows = []
  for row in parsed
    if typeof(row) != "map" then
      exit("Error: Invalid row in table '" + str(table) + "' (expected map): " + str(row))
    end if
    rows.push(row)
  end for

  return rows
end function

// Saves full row list to a table file.
// @param table {string} Table name.
// @param rows {array} Rows to persist.
// @return {number} 1 on success, else 0.
Kast.db.saveToFile = function(table, rows)
  tableFile = Kast.db._getOrCreateTableFile(table)
  if tableFile == null then return 0

  content = Kast.json.stringify(rows)
  if content == null then
    exit("Error: Failed to serialize rows for table '" + str(table) + "'.")
  end if

  return tableFile.set_content(content)
end function

// Deletes all rows from a table.
// @param table {string} Table name.
// @return {number} 1 on success, else 0.
Kast.db.truncate = function(table)
  return Kast.db.saveToFile(table, [])
end function

// Appends one record to a table.
// @param table {string} Table name.
// @param record {map} Record to insert.
// @return {number} 1 on success, else 0.
Kast.db.insert = function(table, record)
  rows = Kast.db.loadFromFile(table)
  rows.push(record)
  return Kast.db.saveToFile(table, rows)
end function

// Replaces an existing record by key, or inserts when not found.
// @param table {string} Table name.
// @param keyField {string|map} Key field, or record map when using shorthand.
// @param record {map|null} Record to upsert.
// @return {number} 1 on success, else 0.
Kast.db.replace = function(table, keyField, record)
  if record == null and keyField != null and typeof(keyField) == "map" then
    record = keyField
    keyField = ""
  end if

  if str(keyField) == "" and record != null then
    if record.hasIndex("id") then
      keyField = "id"
    end if
  end if

  if record == null then return 0
  if str(keyField) == "" then return Kast.db.insert(table, record)

  keyValue = Kast.db._getRecordKeyValue(record, keyField)
  if keyValue == null then return Kast.db.insert(table, record)

  rows = Kast.db.loadFromFile(table)
  newRows = []
  replaced = 0

  for row in rows
    if not replaced and Kast.db._rowMatchesKeyValue(
      row,
      table,
      keyField,
      keyValue) then
      newRows.push(record)
      replaced = 1
    else
      newRows.push(row)
    end if
  end for

  if not replaced then newRows.push(record)

  return Kast.db.saveToFile(table, newRows)
end function

// Returns all rows from a table.
// @param table {string} Table name.
// @return {array} All rows in table.
Kast.db.selectAll = function(table)
  return Kast.db.loadFromFile(table)
end function

// -----------------------------------------------------------------------------
// Public API: query builder entry points
// -----------------------------------------------------------------------------

// Starts a query with an AND where condition.
// @param field {string|function} Field name, or a nested group builder callback.
// @param op {string|any} Operator, or value when using shorthand.
// @param value {any} Comparison value for explicit operator mode.
// @return {map} Chainable query object.
Kast.db.where = function(field, op, value)
  q = Kast.db._buildQuery
  return q.where(field, op, value)
end function

// Starts a query with an AND IN condition.
// @param field {string} Field name.
// @param values {array} Allowed values.
// @return {map} Chainable query object.
Kast.db.whereIn = function(field, values)
  q = Kast.db._buildQuery
  return q.whereIn(field, values)
end function

// Starts a query with an AND NOT IN condition.
// @param field {string} Field name.
// @param values {array} Disallowed values.
// @return {map} Chainable query object.
Kast.db.whereNotIn = function(field, values)
  q = Kast.db._buildQuery
  return q.whereNotIn(field, values)
end function

// Starts a query with an AND BETWEEN condition.
// @param field {string} Field name.
// @param minVal {any} Lower bound.
// @param maxVal {any} Upper bound.
// @return {map} Chainable query object.
Kast.db.whereBetween = function(field, minVal, maxVal)
  q = Kast.db._buildQuery
  return q.whereBetween(field, minVal, maxVal)
end function

// Starts a query with an AND IS NULL condition.
// @param field {string} Field name.
// @return {map} Chainable query object.
Kast.db.whereNull = function(field)
  q = Kast.db._buildQuery
  return q.whereNull(field)
end function

// Starts a query with an AND IS NOT NULL condition.
// @param field {string} Field name.
// @return {map} Chainable query object.
Kast.db.whereNotNull = function(field)
  q = Kast.db._buildQuery
  return q.whereNotNull(field)
end function

// Selects rows that match the provided where clause.
// @param table {string} Table name.
// @param where {map|string|null} Query builder map, equality map, substring, or null.
// @return {array} Matching rows.
Kast.db.select = function(table, where)
  rows = Kast.db.loadFromFile(table)
  if where == null then return rows

  results = []
  for row in rows
    if Kast.db._evaluateWhere(row, where) then results.push(row)
  end for

  return results
end function