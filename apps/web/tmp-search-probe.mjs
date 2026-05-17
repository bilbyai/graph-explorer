import neo4j from "neo4j-driver"

const payload = JSON.parse(
  Buffer.from(process.env.CONNECTIONS_JSON_BASE64 || "", "base64").toString(
    "utf8"
  )
)
const connection = payload.connections[0]
const driver = neo4j.driver(
  connection.connection_url,
  neo4j.auth.basic(connection.username, connection.password)
)
const session = driver.session({ defaultAccessMode: neo4j.session.READ })
const search = "xi jin ping"
const terms = search.split(/\s+/)
const collapsed = search.replace(/\s+/g, "")

async function run(name, query, params = {}) {
  try {
    const result = await session.run(query, params, { timeout: 15_000 })
    console.log(
      name,
      result.records.map((record) => record.get(0).toString()).join(",")
    )
  } catch (error) {
    console.log(
      name,
      "ERR",
      error.code || error.name,
      error.message.split("\n")[0]
    )
  }
}

try {
  await run(
    "property value types",
    "MATCH (n) UNWIND keys(n) AS key WITH valueType(n[key]) AS type, count(*) AS count RETURN collect(type + ':' + toString(count))"
  )
  await run(
    "property phrase",
    "MATCH (n) WHERE any(k IN keys(n) WHERE toLower(toString(n[k])) CONTAINS $search) RETURN count(DISTINCT n)",
    { search }
  )
  await run(
    "robust property phrase",
    `CALL {
      MATCH (n) UNWIND keys(n) AS key WITH n, n[key] AS value
      WHERE valueType(value) = 'STRING NOT NULL' AND toLower(value) CONTAINS $search
      RETURN n
      UNION
      MATCH (n) UNWIND keys(n) AS key WITH n, n[key] AS value
      WHERE valueType(value) = 'LIST<STRING NOT NULL> NOT NULL' AND any(item IN value WHERE toLower(item) CONTAINS $search)
      RETURN n
    }
    RETURN count(DISTINCT n)`,
    { search }
  )
  await run(
    "property all terms same value",
    "MATCH (n) WHERE any(k IN keys(n) WHERE all(term IN $terms WHERE toLower(toString(n[k])) CONTAINS term)) RETURN count(DISTINCT n)",
    { terms }
  )
  await run(
    "robust property all terms same value",
    `CALL {
      MATCH (n) UNWIND keys(n) AS key WITH n, n[key] AS value
      WHERE valueType(value) = 'STRING NOT NULL' AND all(term IN $terms WHERE toLower(value) CONTAINS term)
      RETURN n
      UNION
      MATCH (n) UNWIND keys(n) AS key WITH n, n[key] AS value
      WHERE valueType(value) = 'LIST<STRING NOT NULL> NOT NULL' AND any(item IN value WHERE all(term IN $terms WHERE toLower(item) CONTAINS term))
      RETURN n
    }
    RETURN count(DISTINCT n)`,
    { terms }
  )
  await run(
    "caption fields all terms",
    `MATCH (n)
    WITH n, [key IN ['nameEn', 'name', 'title', 'label', '_aid', 'id'] WHERE n[key] IS NOT NULL AND valueType(n[key]) = 'STRING NOT NULL' | toLower(n[key])] AS values
    WHERE any(value IN values WHERE all(term IN $terms WHERE value CONTAINS term))
    RETURN count(DISTINCT n)`,
    { terms }
  )
  await run(
    "caption fields xi jin",
    `MATCH (n)
    WITH n, [key IN ['nameEn', 'name', 'title', 'label', '_aid', 'id'] WHERE n[key] IS NOT NULL AND valueType(n[key]) = 'STRING NOT NULL' | toLower(n[key])] AS values
    WHERE any(value IN values WHERE value CONTAINS 'xi' AND value CONTAINS 'jin')
    RETURN count(DISTINCT n)`
  )
  await run(
    "property collapsed",
    "MATCH (n) WHERE any(k IN keys(n) WHERE replace(toLower(toString(n[k])), ' ', '') CONTAINS $collapsed) RETURN count(DISTINCT n)",
    { collapsed }
  )
  await run(
    "robust property collapsed",
    `CALL {
      MATCH (n) UNWIND keys(n) AS key WITH n, n[key] AS value
      WHERE valueType(value) = 'STRING NOT NULL' AND replace(toLower(value), ' ', '') CONTAINS $collapsed
      RETURN n
      UNION
      MATCH (n) UNWIND keys(n) AS key WITH n, n[key] AS value
      WHERE valueType(value) = 'LIST<STRING NOT NULL> NOT NULL' AND any(item IN value WHERE replace(toLower(item), ' ', '') CONTAINS $collapsed)
      RETURN n
    }
    RETURN count(DISTINCT n)`,
    { collapsed }
  )
  await run(
    "property any term",
    "MATCH (n) WHERE any(k IN keys(n) WHERE any(term IN $terms WHERE toLower(toString(n[k])) CONTAINS term)) RETURN count(DISTINCT n)",
    { terms }
  )

  const indexesResult = await session.run(
    "SHOW FULLTEXT INDEXES YIELD name, type, entityType, state WHERE type = 'FULLTEXT' AND entityType = 'NODE' AND state = 'ONLINE' RETURN collect(name)"
  )
  const indexNames = indexesResult.records[0]?.get(0) ?? []
  console.log("fulltext indexes", indexNames.length)
  for (const indexName of indexNames) {
    for (const query of ["xi jin ping", "xi* AND jin*", "xi* OR jin* OR ping*"]) {
      await run(
        `fulltext index ${indexName} ${query}`,
        "CALL db.index.fulltext.queryNodes($indexName, $query) YIELD node WITH DISTINCT node RETURN count(node)",
        { indexName, query }
      )
    }
  }

  for (const query of [
    "xi jin ping",
    "xi* AND jin* AND ping*",
    "xi* OR jin* OR ping*",
    '"xi jin ping"',
    '"xi jin"',
    '"jin ping"',
    "xi AND jin AND ping",
    "xi OR jin OR ping",
    "xi AND jin",
    "xi AND ping",
    "jin AND ping",
    "xi* AND jin*",
    "xi* AND jinping*",
    "xi* AND (jinping* OR (jin* AND ping*))",
    "xi* AND ping*",
    "jin* AND ping*",
    "xi* AND (jin* OR ping*)",
    "(xi* AND jin*) OR ping*",
    "xi AND (jin OR ping)",
    "xi~ AND jin~ AND ping~",
    "xi~ OR jin~ OR ping~",
    "xijinping~",
  ]) {
    await run(
      `fulltext ${query}`,
      "UNWIND $indexNames AS indexName CALL db.index.fulltext.queryNodes(indexName, $query) YIELD node WITH DISTINCT node RETURN count(node)",
      { indexNames, query }
    )
  }
  await run(
    "raw fulltext score buckets",
    `UNWIND $indexNames AS indexName
    CALL db.index.fulltext.queryNodes(indexName, 'xi jin ping') YIELD node, score
    WITH node, max(score) AS score
    WITH round(score * 1000) / 1000 AS bucket, count(*) AS count
    RETURN collect(toString(bucket) + ':' + toString(count))`,
    { indexNames }
  )
  await run(
    "raw fulltext top scores",
    `UNWIND $indexNames AS indexName
    CALL db.index.fulltext.queryNodes(indexName, 'xi jin ping') YIELD node, score
    WITH node, max(score) AS score
    RETURN collect(toString(round(score * 1000) / 1000))[0..40]`,
    { indexNames }
  )
} finally {
  await session.close()
  await driver.close()
}
