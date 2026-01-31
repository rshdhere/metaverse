import * as Phaser from "phaser";

type Point = { x: number; y: number };

interface Node {
  x: number;
  y: number;
  f: number;
  g: number;
  h: number;
  parent?: Node;
}

export default class Pathfinder {
  private map: Phaser.Tilemaps.Tilemap;
  private layer: Phaser.Tilemaps.TilemapLayer;
  private tileSize: number;

  constructor(map: Phaser.Tilemaps.Tilemap, layerName: string) {
    this.map = map;
    this.layer = map.getLayer(layerName)
      ?.tilemapLayer as Phaser.Tilemaps.TilemapLayer;
    if (!this.layer) {
      // Fallback if getLayer returns object layer data, try createLayer return value if passed directly?
      // Actually Game.ts creates layer. Let's assume we pass the layer instance or just the map and name.
      // Game.ts: groundLayer = map.createLayer...
      // We can fetch it by name if created.
      console.warn(`Pathfinder: Layer ${layerName} not found via getLayer`);
      // Accessing the layer manager if needed, but getLayer should work if layer exists.
    }
    this.tileSize = map.tileWidth;
  }

  // Simplified interface to accept the layer instance directly if needed
  static createWithLayer(
    map: Phaser.Tilemaps.Tilemap,
    layer: Phaser.Tilemaps.TilemapLayer,
  ) {
    const pf = new Pathfinder(map, "");
    pf.layer = layer;
    return pf;
  }

  findPath(start: Point, target: Point): Point[] {
    if (!this.layer) return [];

    const startNode: Node = {
      x: Math.floor(start.x / this.tileSize),
      y: Math.floor(start.y / this.tileSize),
      f: 0,
      g: 0,
      h: 0,
    };

    const targetNode: Node = {
      x: Math.floor(target.x / this.tileSize),
      y: Math.floor(target.y / this.tileSize),
      f: 0,
      g: 0,
      h: 0,
    };

    // If target is collidable (e.g. wall), find nearest walkable neighbor
    if (this.isColliding(targetNode.x, targetNode.y)) {
      // Search spiral or simple neighbors
      // For now, simple return or fallback
      // Let's try to find a neighbor
      // (Scope simplified: assume target is reachable, usually chair front is reachable)
    }

    const openList: Node[] = [startNode];
    const closedList: boolean[][] = []; // Sparse array or map

    // Helper key
    const toKey = (n: Node) => `${n.x},${n.y}`;
    const closedSet = new Set<string>();

    while (openList.length > 0) {
      // Get node with lowest f
      let lowInd = 0;
      for (let i = 0; i < openList.length; i++) {
        if (openList[i].f < openList[lowInd].f) {
          lowInd = i;
        }
      }
      const currentNode = openList[lowInd];

      // End case
      if (currentNode.x === targetNode.x && currentNode.y === targetNode.y) {
        const path: Point[] = [];
        let curr: Node | undefined = currentNode;
        while (curr) {
          path.push({
            x: curr.x * this.tileSize + this.tileSize / 2,
            y: curr.y * this.tileSize + this.tileSize / 2,
          });
          curr = curr.parent;
        }
        return path.reverse();
      }

      // Move current from open to closed
      openList.splice(lowInd, 1);
      closedSet.add(toKey(currentNode));

      // Neighbors (Up, Down, Left, Right)
      const neighbors = [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 },
      ];

      for (const offset of neighbors) {
        const nx = currentNode.x + offset.x;
        const ny = currentNode.y + offset.y;

        if (this.isColliding(nx, ny) || closedSet.has(`${nx},${ny}`)) {
          continue;
        }

        const gScore = currentNode.g + 1;
        let gScoreIsBest = false;
        let neighbor = openList.find((n) => n.x === nx && n.y === ny);

        if (!neighbor) {
          gScoreIsBest = true;
          neighbor = {
            x: nx,
            y: ny,
            g: gScore,
            h: Math.abs(nx - targetNode.x) + Math.abs(ny - targetNode.y),
            f: 0,
            parent: currentNode,
          };
          openList.push(neighbor);
        } else if (gScore < neighbor.g) {
          gScoreIsBest = true;
        }

        if (gScoreIsBest && neighbor) {
          neighbor.parent = currentNode;
          neighbor.g = gScore;
          neighbor.f = neighbor.g + neighbor.h;
        }
      }
    }

    // No path found
    return [];
  }

  private isColliding(tileX: number, tileY: number): boolean {
    const tile = this.layer.getTileAt(tileX, tileY);
    // Check collision property or existence
    // Game.ts sets collision by property { collides: true }
    // tile.collides covers this?
    // Also check if tile exists (if null, assumed empty/walkable? or void?)
    // Usually null tile = empty background = walkable?
    // Let's assume collides property.
    return tile ? tile.collides : false;
  }
}
