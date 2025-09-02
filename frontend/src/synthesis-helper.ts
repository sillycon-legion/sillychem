import type { ReagentWithAmount } from "./data.ts";

export interface SynthesisGraphNode {
  reagent_id: string;
  amount: number;
  catalyst_amount: number;
  base: boolean;
  needed_by: string[]; // outgoing
  needs: string[]; // incoming
}

export function synthesisGraphSort(
  nodes: SynthesisGraphNode[],
): ReagentWithAmount[] {
  const nodeMap: Map<string, SynthesisGraphNode> = new Map();
  for (const node of nodes) {
    nodeMap.set(node.reagent_id, node);
  }

  function getBadness(
    node: SynthesisGraphNode,
    L: SynthesisGraphNode[],
  ): number {
    L.push(node);
    const unsatisfied = L.filter(
      (e) =>
        !e.base && !e.needed_by.every((f) => L.some((g) => g.reagent_id == f)),
    ).length;
    L.pop();
    return unsatisfied;
  }

  const badnessCache: Map<string, [number, number, SynthesisGraphNode[]]> = new Map();

  function search(
    node: SynthesisGraphNode,
    L: SynthesisGraphNode[],
    S: SynthesisGraphNode[],
  ): [number, number, SynthesisGraphNode[]] {
    const badness = getBadness(node, L);
    L.push(node);
    const badnessCacheKey = L.map(e => e.reagent_id).sort().join("|");
    if (badnessCache.has(badnessCacheKey)) {
      const cached = badnessCache.get(badnessCacheKey)!;
      L.pop();
      return [cached[0], cached[1], [node, ...cached[2]]];
    }
    const newS = S.filter((e) => e != node);
    for (const reagent_id of node.needed_by) {
      const m = nodes.find((e) => e.reagent_id == reagent_id)!;
      if (
        m.needs.every(
          (e) => nodeMap.get(e)!.base || L.some((f) => f.reagent_id == e),
        )
      ) {
        newS.push(m);
      }
    }
    if (newS.length == 0) {
      L.pop();
      return [badness, badness, [node]];
    }
    let minMaxBadness = Number.POSITIVE_INFINITY;
    let minSumBadness = Number.POSITIVE_INFINITY;
    let minMaxBadnessResult: SynthesisGraphNode[] = [];
    for (const n of newS) {
      const result = search(n, L, newS);
      if (result[0] <= minMaxBadness && result[1] < minSumBadness) {
        minMaxBadness = result[0];
        minSumBadness = result[1];
        minMaxBadnessResult = result[2];
      }
    }
    L.pop();
    badnessCache.set(badnessCacheKey, [Math.max(badness, minMaxBadness), badness + minSumBadness, minMaxBadnessResult]);
    return [Math.max(badness, minMaxBadness), badness + minSumBadness, [node, ...minMaxBadnessResult]];
  }

  const L: SynthesisGraphNode[] = nodes.filter((e) => e.base);
  const S = nodes.filter(
    (e) =>
      e.needs.length > 0 &&
      e.needs.every((e) => L.some((f) => f.reagent_id == e)),
  );

  let minMaxBadness = Number.POSITIVE_INFINITY;
  let minSumBadness = Number.POSITIVE_INFINITY;
  let minMaxBadnessResult: SynthesisGraphNode[] = [];
  for (const n of S) {
    const result = search(n, L, S);
    if (result[0] <= minMaxBadness && result[1] < minSumBadness) {
      minMaxBadness = result[0];
      minSumBadness = result[1];
      minMaxBadnessResult = result[2];
    }
  }

  return minMaxBadnessResult.map((e) => {
    return {
      reagent_id: e.reagent_id,
      amount: Math.max(e.catalyst_amount, e.amount),
    };
  });
}
