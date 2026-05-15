# Layouts

16 built-in layout algorithms for positioning graph nodes in 2D and 3D space. Set via the `layoutType` prop on `GraphCanvas`.

## Layout Types

### Force-Directed

| Type | Description |
|------|-------------|
| `'forceDirected2d'` | D3 force simulation in 2D (default) |
| `'forceDirected3d'` | D3 force simulation in 3D |
| `'nooverlap'` | Force-directed with no-overlap constraint |
| `'forceatlas2'` | ForceAtlas2 algorithm (good for large graphs) |

### Tree

| Type | Description |
|------|-------------|
| `'treeTd2d'` | Tree top-down, 2D |
| `'treeTd3d'` | Tree top-down, 3D |
| `'treeLr2d'` | Tree left-right, 2D |
| `'treeLr3d'` | Tree left-right, 3D |

### Radial

| Type | Description |
|------|-------------|
| `'radialOut2d'` | Radial outward, 2D |
| `'radialOut3d'` | Radial outward, 3D |

### Circular / Concentric

| Type | Description |
|------|-------------|
| `'circular2d'` | Nodes arranged in a circle |
| `'concentric2d'` | Concentric rings, 2D |
| `'concentric3d'` | Concentric rings, 3D |

### Hierarchical

| Type | Description |
|------|-------------|
| `'hierarchicalTd'` | Hierarchical top-down |
| `'hierarchicalLr'` | Hierarchical left-right |

### Custom

| Type | Description |
|------|-------------|
| `'custom'` | Provide your own layout via `layoutOverrides` |

## Basic Usage

```tsx
<GraphCanvas
  nodes={nodes}
  edges={edges}
  layoutType="forceDirected2d"
/>
```

## 3D Layout

```tsx
<GraphCanvas
  nodes={nodes}
  edges={edges}
  layoutType="forceDirected3d"
  cameraMode="orbit"
/>
```

## Tree Layout

```tsx
<GraphCanvas
  nodes={nodes}
  edges={edges}
  layoutType="treeTd2d"
/>
```

## Layout Overrides

Fine-tune layout parameters with `layoutOverrides`:

```tsx
// Force-directed tuning
<GraphCanvas
  layoutType="forceDirected2d"
  layoutOverrides={{
    nodeStrength: -500,
    linkDistance: 100,
    nodeLevelRatio: 5,
  }}
/>

// Circular radius
<GraphCanvas
  layoutType="circular2d"
  layoutOverrides={{ radius: 500 }}
/>

// No-overlap
<GraphCanvas
  layoutType="nooverlap"
  layoutOverrides={{
    margin: 20,
    maxIterations: 100,
    ratio: 10,
    gridSize: 20,
  }}
/>

// ForceAtlas2
<GraphCanvas
  layoutType="forceatlas2"
  layoutOverrides={{
    scalingRatio: 100,
    gravity: 10,
    iterations: 50,
  }}
/>
```

## Fixed Node Positions

Pin specific nodes to fixed coordinates:

```tsx
const nodes = [
  { id: '1', label: 'Fixed', fx: 0, fy: 0, fz: 0 },
  { id: '2', label: 'Free' },
];
```

## Default Layout Parameters

### Force-Directed (2D/3D)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `nodeLevelRatio` | `2` | Node separation factor |
| `nodeStrength` | `-250` | Repulsion strength (negative = repel) |

### Tree Layouts

| Parameter | Default | Description |
|-----------|---------|-------------|
| `nodeLevelRatio` | `5` | Level separation |
| `nodeStrength` | `-250` (2D) / `-500` (3D) | Repulsion |
| `linkDistance` | `50` | Edge length |

### Radial Layouts

| Parameter | Default | Description |
|-----------|---------|-------------|
| `nodeLevelRatio` | `5` (2D) / `2` (3D) | Ring separation |
| `nodeStrength` | `-500` | Repulsion |
| `linkDistance` | `100` | Edge length |

### Circular

| Parameter | Default | Description |
|-----------|---------|-------------|
| `radius` | `300` | Circle radius |

### No-Overlap

| Parameter | Default | Description |
|-----------|---------|-------------|
| `margin` | `10` | Min node margin |
| `maxIterations` | `50` | Max layout iterations |
| `ratio` | `10` | Overlap ratio |
| `gridSize` | `20` | Grid cell size |

### ForceAtlas2

| Parameter | Default | Description |
|-----------|---------|-------------|
| `scalingRatio` | `100` | Force scaling |
| `gravity` | `10` | Gravity toward center |
| `iterations` | `50` | Simulation steps |

## Notes

- 3D layouts (`*3d` suffix) require `cameraMode="orbit"` for proper navigation
- Force-directed layouts run asynchronously; `animated={true}` shows the simulation settling
- Tree/hierarchical layouts work best with DAG (directed acyclic graph) data
- `'custom'` layout type expects you to provide a `getNodePosition` callback via `layoutOverrides` (see below). Per-node `fx`/`fy`/`fz` works with any layout, not only `custom`.
- Cluster-aware layouts group nodes by `clusterAttribute` when set

## Custom Layout

Set `layoutType="custom"` and pass a `getNodePosition` callback inside `layoutOverrides`.

### Signature

```ts
type NodePositionArgs = {
  graph: any        // graphology Graph instance
  drags?: Record<string, { x: number; y: number; z: number }>
  nodes: InternalGraphNode[]
  edges: InternalGraphEdge[]
}

type CustomLayoutInputs = {
  getNodePosition: (
    id: string,
    args: NodePositionArgs
  ) => { x: number; y: number; z: number }
}
```

Return `{ x, y, z: 0 }` for 2D layouts. `drags` lets you preserve user-dragged positions — read from it inside the callback if non-empty.

### Example

```tsx
<GraphCanvas
  layoutType="custom"
  layoutOverrides={{
    getNodePosition: (id, { nodes }) => {
      const idx = nodes.findIndex((n) => n.id === id)
      return {
        x: 25 * idx,
        y: idx % 2 === 0 ? 0 : 50,
        z: 0,
      }
    },
  } as CustomLayoutInputs}
  nodes={nodes}
  edges={edges}
/>
```

### Notes

- Use `args.graph` (graphology) for neighbour/degree lookups when positioning by topology.
- Reach for `layoutOverrides` (tuning the built-ins) before custom — only build a custom layout when no built-in fits.
- `getNodePosition` runs synchronously per node during layout; keep it cheap.
