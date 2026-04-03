import type { ConceptGraph, LayoutNode } from './types';

const ROOT_RING = 8;
const DEPTH_STEP = 6;

export function layoutGraph(graph: ConceptGraph): LayoutNode[] {
  const nodesByParent = new Map<string | null, LayoutNode[]>();
  const layoutNodes = graph.nodes.map((node) => ({
    ...node,
    position: [0, 1.2 + node.depth * 0.2, 0] as [number, number, number],
  }));

  for (const node of layoutNodes) {
    const bucket = nodesByParent.get(node.parentId) ?? [];
    bucket.push(node);
    nodesByParent.set(node.parentId, bucket);
  }

  const rootNodes = nodesByParent.get(null) ?? [];
  for (const root of rootNodes) {
    root.position = [0, 1.5, 0];
    placeChildren(root.id, 0, ROOT_RING);
  }

  function placeChildren(parentId: string, parentAngle: number, radius: number) {
    const children = nodesByParent.get(parentId) ?? [];
    const parentNode = layoutNodes.find((node) => node.id === parentId);
    if (!children.length || !parentNode) {
      return;
    }

    const spread = Math.min(Math.PI * 1.5, Math.PI / 2 + children.length * 0.22);
    children.forEach((child, index) => {
      const localAngle =
        children.length === 1
          ? parentAngle
          : parentAngle - spread / 2 + (spread * index) / (children.length - 1);
      const childRadius = radius + child.depth * 0.8;
      const x = parentNode.position[0] + Math.cos(localAngle) * childRadius;
      const z = parentNode.position[2] + Math.sin(localAngle) * childRadius;
      const y = 1.2 + child.depth * 0.55;
      child.position = [x, y, z];
      placeChildren(child.id, localAngle, DEPTH_STEP);
    });
  }

  return layoutNodes;
}
