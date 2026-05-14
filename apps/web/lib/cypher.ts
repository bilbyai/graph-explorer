const forbiddenWritePatterns = [
  /\bCALL\b/i,
  /\bCREATE\b/i,
  /\bMERGE\b/i,
  /\bSET\b/i,
  /\bDELETE\b/i,
  /\bDETACH\s+DELETE\b/i,
  /\bREMOVE\b/i,
  /\bDROP\b/i,
  /\bLOAD\s+CSV\b/i,
  /\bALTER\b/i,
  /\bGRANT\b/i,
  /\bDENY\b/i,
  /\bREVOKE\b/i,
  /\bSTART\s+DATABASE\b/i,
  /\bSTOP\s+DATABASE\b/i,
  /\bCREATE\s+INDEX\b/i,
  /\bCREATE\s+CONSTRAINT\b/i,
]

function stripComments(query: string) {
  return query.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ")
}

export function validateReadOnlyMatchQuery(query: string) {
  const normalized = stripComments(query).trim()

  if (!normalized) {
    return {
      ok: false as const,
      error: "Enter a Cypher query.",
    }
  }

  if (normalized.includes(";")) {
    return {
      ok: false as const,
      error: "Only a single MATCH/RETURN query is allowed.",
    }
  }

  if (!/^\s*MATCH\b/i.test(normalized)) {
    return {
      ok: false as const,
      error: "Only MATCH queries are supported in v1.",
    }
  }

  if (!/\bRETURN\b/i.test(normalized)) {
    return {
      ok: false as const,
      error: "The query must return data with RETURN.",
    }
  }

  const forbidden = forbiddenWritePatterns.find((pattern) =>
    pattern.test(normalized)
  )

  if (forbidden) {
    return {
      ok: false as const,
      error: "Write, admin, LOAD CSV, and CALL queries are blocked.",
    }
  }

  return {
    ok: true as const,
    query: normalized,
  }
}
