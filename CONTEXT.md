# Graph Explorer

Graph Explorer is a hosted demo product for safely exploring shared Neo4j graph databases, with secondary support for private self-hosted use.

## Language

**Hosted Demo**:
A company-run Graph Explorer deployment for signed-in users to explore shared demo graph databases.
_Avoid_: public hosted service, production customer workspace

**Self-Hosted Instance**:
A privately operated Graph Explorer deployment used by the operator for internal or local exploration.
_Avoid_: public self-serve service, managed tenant

**Demo User**:
A signed-in person who uses a **Hosted Demo** to explore company-provided demo graph databases.
_Avoid_: admin, operator, customer tenant owner

**Demo Operator**:
The external developer or database manager who prepares **Demo Graphs** and **Shared Connections** outside Graph Explorer.
_Avoid_: demo user, in-app admin

**Demo Graph**:
A company-provided Neo4j graph database made available for exploration in a **Hosted Demo**.
_Avoid_: connection, target, database connection

**Shared Connection**:
Server-side access configuration that lets Graph Explorer connect to a **Demo Graph**.
_Avoid_: demo graph, user connection, target

**Local Graph**:
A user-supplied graph database accessed from a private or self-hosted Graph Explorer context.
_Avoid_: demo graph, shared connection

**Read-Only Exploration**:
The ability to search, inspect, expand, and query graph data without changing the graph.
_Avoid_: safe mode, view-only mode

**Explore**:
The primary visual workflow for discovering and expanding graph neighborhoods in a **Demo Graph**.
_Avoid_: browser, canvas tab

**Explore Scene**:
The current set of graph nodes and relationships present in the **Explore** visualization.
_Avoid_: fetched graph cache, complete query result

**Query**:
A secondary read-only workflow for inspecting richer graph data through user-written Cypher.
_Avoid_: full Neo4j Browser replacement, write console

**Single Read Query**:
A one-statement Cypher query that starts from graph matching and returns data without changing or administering the graph.
_Avoid_: script, command batch, arbitrary Cypher

**Result Cap**:
The maximum number of records Graph Explorer returns for a single read operation.
_Avoid_: page size, database limit

**Visualization Limit**:
The hard maximum of 10,000 nodes Graph Explorer will attempt to show in an **Explore Scene**.
_Avoid_: relationship limit, API result limit, database query limit

**Explore Performance Warning**:
A non-blocking warning shown before an **Explore** graph view reaches the **Visualization Limit**.
_Avoid_: query limit, record cap

**Path Search**:
A future **Read-Only Exploration** workflow for finding relationship paths between selected graph nodes.
_Avoid_: graph expansion, full query workflow

**Guided Explore Start**:
An empty starting state that helps a **Demo User** begin exploring with search and available graph categories.
_Avoid_: placeholder graph, default sample graph

**Bloom Search Parity**:
The v1 goal that **Explore** search can find nodes, node properties, relationships, relationship properties, and full-text matches like Neo4j Bloom.
_Avoid_: full Bloom parity, basic node lookup

**Relationship Match**:
A search result where the matched item is a relationship rather than a node.
_Avoid_: edge-only result, dangling edge

**Node Match**:
A search result where the matched item is a node.
_Avoid_: full-text result, property result

**Full-Text Index Suggestion**:
A logged recommendation that a **Demo Operator** create a full-text index to improve **Bloom Search Parity**.
_Avoid_: automatic index creation, managed index

## Relationships

- A **Hosted Demo** exposes one or more **Demo Graphs** to every signed-in **Demo User**.
- A **Demo User** can explore graph data in a **Hosted Demo** but does not manage shared graph database access.
- A **Demo Operator** manages **Demo Graphs** and **Shared Connections** outside the v1 product UI.
- A **Shared Connection** provides access to exactly one **Demo Graph**.
- A **Demo User** sees **Demo Graphs**, not raw **Shared Connections**.
- A **Demo User** uses **Read-Only Exploration** on **Demo Graphs**.
- **Explore** is the primary **Read-Only Exploration** workflow.
- **Explore** has one **Explore Scene**.
- An **Explore Scene** has a **Visualization Limit** of 10,000 nodes.
- An **Explore Scene** contains only nodes and relationships present in the visualization.
- A **Visualization Limit** caps nodes only, not relationships.
- **Path Search** is distinct from graph expansion.
- **Query** supports **Read-Only Exploration** by revealing details that are hard to inspect visually.
- **Query** accepts a **Single Read Query** in v1.
- A **Single Read Query** has a **Result Cap** of 100 records in v1.
- **Explore** does not have a hard graph-size cap in v1.
- **Explore** uses an **Explore Performance Warning** instead of blocking large graph views.
- **Explore** begins with a **Guided Explore Start** in v1.
- **Explore** targets **Bloom Search Parity** in v1.
- Full-text search is part of **Explore**, not **Query**, in v1.
- **Bloom Search Parity** presents search results as **Node Matches** and **Relationship Matches**.
- A **Relationship Match** appears in **Explore** with its source and target nodes.
- Graph Explorer may provide a **Full-Text Index Suggestion** but does not create full-text indexes.
- A **Local Graph** is not part of the v1 **Hosted Demo** experience.
- A **Self-Hosted Instance** may use relaxed local settings that are inappropriate for a **Hosted Demo**.

## Example Dialogue

> **Dev:** "Can we disable sign-in to make demos easier?"
> **Domain expert:** "Only for a **Self-Hosted Instance**. A **Hosted Demo** must keep secure defaults."

> **Dev:** "Can a **Demo User** edit the shared database connection?"
> **Domain expert:** "No. A **Demo User** explores the demo data but does not administer shared access."

> **Dev:** "Is the **Demo Operator** an in-app role?"
> **Domain expert:** "No. The **Demo Operator** manages the database and deployment outside Graph Explorer."

> **Dev:** "Should the selector say **Shared Connection**?"
> **Domain expert:** "No. The user is choosing a **Demo Graph**; the **Shared Connection** is behind the scenes."

> **Dev:** "Does a **Demo User** need to add their own graph?"
> **Domain expert:** "No. A v1 **Hosted Demo** is about exploring provided **Demo Graphs**."

> **Dev:** "Can **Read-Only Exploration** rely on hiding write buttons?"
> **Domain expert:** "No. It means graph data cannot be changed through Graph Explorer."

> **Dev:** "Is **Query** a replacement for Neo4j Browser?"
> **Domain expert:** "No. **Query** exists to inspect demo data more deeply while staying read-only."

> **Dev:** "Can a **Demo User** run a batch of Cypher commands?"
> **Domain expert:** "No. v1 **Query** accepts one **Single Read Query** at a time."

> **Dev:** "What happens if a **Single Read Query** matches thousands of records?"
> **Domain expert:** "Graph Explorer applies the v1 **Result Cap** and shows at most 100 records."

> **Dev:** "Can **Explore** show a very large graph view?"
> **Domain expert:** "Yes, but Graph Explorer should use an **Explore Performance Warning** when it may become slow."

> **Dev:** "Should **Explore** preload a random sample graph?"
> **Domain expert:** "No. **Explore** should use a **Guided Explore Start** with search and available categories."

> **Dev:** "Does v1 need complete Neo4j Bloom product parity?"
> **Domain expert:** "No. Full parity is the direction, but v1 specifically needs **Bloom Search Parity**."

> **Dev:** "If search finds a relationship, can we show only the line?"
> **Domain expert:** "No. A **Relationship Match** needs its source and target nodes to appear too."

> **Dev:** "Should full-text hits be a third result type?"
> **Domain expert:** "No. Full-text is how the match was found; the result is still a **Node Match** or **Relationship Match**."

> **Dev:** "Can Graph Explorer create full-text indexes when search is weak?"
> **Domain expert:** "No. It can show a **Full-Text Index Suggestion**, but the graph operator creates indexes."

## Flagged Ambiguities

- "self-hosted" means private/internal use for v1, not a public self-serve deployment model.
