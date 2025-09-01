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
  let minMaxBadness = Number.POSITIVE_INFINITY;
  let minSumBadness = Number.POSITIVE_INFINITY;
  let minMaxBadnessResult: SynthesisGraphNode[] = [];

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

  function search(
    node: SynthesisGraphNode,
    curMaxBadness: number,
    curSumBadness: number,
    L: SynthesisGraphNode[],
    S: SynthesisGraphNode[],
  ) {
    const badness = getBadness(node, L);
    const maxBadness = Math.max(curMaxBadness, badness);
    const sumBadness = curSumBadness + badness;
    if (maxBadness > minMaxBadness || sumBadness >= minSumBadness) {
      return;
    }
    L.push(node);
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
    if (
      maxBadness > minMaxBadness ||
      sumBadness + newS.filter((e) => e.needed_by.length > 0).length >=
        minSumBadness
    ) {
      L.pop();
      return;
    }
    if (newS.length == 0) {
      minMaxBadness = maxBadness;
      minSumBadness = sumBadness;
      minMaxBadnessResult = [...L];
      L.pop();
      return;
    }
    newS.sort((a, b) => {
      const diff = getBadness(a, L) - getBadness(b, L);
      if (diff != 0) {
        return diff;
      } else {
        return a.reagent_id.localeCompare(b.reagent_id);
      }
    });
    for (const n of newS) {
      search(n, maxBadness, sumBadness, L, newS);
    }
    L.pop();
  }

  const L: SynthesisGraphNode[] = nodes.filter((e) => e.base);
  const S = nodes.filter(
    (e) =>
      e.needs.length > 0 &&
      e.needs.every((e) => L.some((f) => f.reagent_id == e)),
  );

  for (const n of S) {
    search(n, 0, 0, [], S);
  }

  return minMaxBadnessResult.map((e) => {
    return {
      reagent_id: e.reagent_id,
      amount: Math.max(e.catalyst_amount, e.amount),
    };
  });
}
