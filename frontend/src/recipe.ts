import "./style.css";
import reagentData, {
  type ReactionRecipe,
  type Reagent,
  type ReagentWithAmount,
} from "./data.ts";
import Fuse from "fuse.js";

const groups = [...new Set(reagentData.reagents.map((e) => e.group))].sort();
groups.push("Lists");

let customLists: [string, ReagentWithAmount[]][] = [];
customListsLoad();

function customListsLoad() {
  customLists = JSON.parse(localStorage.getItem("customLists") ?? "[]");
}

function customListsSave() {
  localStorage.setItem("customLists", JSON.stringify(customLists));
}

function makeGroupElement(name: string): HTMLLIElement {
  const elem = document.createElement("li");
  const inner = document.createElement("a");
  inner.href = `#${name}`;
  inner.classList.add("group");
  inner.textContent = name;
  elem.appendChild(inner);
  return elem;
}

function makeChemicalElement(chemical: Reagent): HTMLLIElement {
  const elem = document.createElement("li");
  const inner = document.createElement("a");
  inner.href = `#${chemical.id}`;
  inner.classList.add("group");
  inner.textContent = chemical.name;
  elem.appendChild(inner);
  return elem;
}

function makeListElement(list: [string, ReagentWithAmount[]]): HTMLLIElement {
  const elem = document.createElement("li");
  const inner = document.createElement("a");
  inner.href = `#Lists-${list[0]}`;
  inner.classList.add("group");
  inner.textContent = list[0].replaceAll("-", " ");
  elem.appendChild(inner);
  return elem;
}

document
  .getElementById("groups")
  ?.replaceChildren(...groups.map(makeGroupElement));
let selectedGroup = -1;
let selectedChemical = -1;
function updateSelectedGroup() {
  if (selectedGroup != -1) {
    document
      .getElementById("groups")
      ?.children[selectedGroup]?.children[0].classList.remove("group-active");
  }
  let hash = document.location.hash;
  if (hash.startsWith("#")) {
    hash = hash.substring(1);
  }
  const foundChem = reagentData.reagents.find((v) => v.id == hash);
  if (hash.startsWith("Lists-")) {
    hash = hash.substring(6);
    selectedGroup = groups.length - 1;
    selectedChemical = customLists.findIndex((e) => e[0] == hash);
    updateListDetails(customLists[selectedChemical][1]);
  } else if (foundChem != null) {
    selectedGroup = groups.indexOf(foundChem.group);
    selectedChemical = reagentData.reagents
      .filter((e) => e.group == foundChem.group)
      .sort((a, b) => a.name.localeCompare(b.name))
      .indexOf(foundChem);
    updateChemDetails(foundChem);
  } else {
    selectedGroup = groups.indexOf(hash);
    selectedChemical = -1;
  }
  if (selectedGroup != -1) {
    document
      .getElementById("groups")
      ?.children[selectedGroup]?.children[0].classList.add("group-active");
    if (selectedGroup == groups.length - 1) {
      document
        .getElementById("chemicals")
        ?.replaceChildren(...customLists.map(makeListElement));
    } else {
      document.getElementById("chemicals")?.replaceChildren(
        ...reagentData.reagents
          .filter((e) => e.group == groups[selectedGroup])
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(makeChemicalElement),
      );
    }
  } else {
    document.getElementById("chemicals")?.replaceChildren();
  }
  if (selectedChemical != -1) {
    document
      .getElementById("chemicals")
      ?.children[selectedChemical]?.children[0].classList.add("group-active");
    document.getElementById("placeholder")?.classList.replace("flex", "hidden");
    document.getElementById("chem")?.classList.replace("hidden", "flex");
  } else {
    document.getElementById("placeholder")?.classList.replace("hidden", "flex");
    document.getElementById("chem")?.classList.replace("flex", "hidden");
  }
}

function createRecipeIoElement(result: ReagentWithAmount): HTMLLIElement {
  const reagent = reagentData.reagents.find((e) => e.id == result.reagent_id)!;
  const resultElem = document.createElement("li");
  resultElem.textContent = `${result.amount}u `;
  const reagentNameElem = document.createElement("a");
  reagentNameElem.href = `/#${reagent.id}`;
  reagentNameElem.textContent = reagent.name;
  reagentNameElem.classList.add("reagent-link");
  resultElem.appendChild(reagentNameElem);
  return resultElem;
}

function createChemElement(result: ReagentWithAmount): HTMLLIElement {
  const reagent = reagentData.reagents.find((e) => e.id == result.reagent_id)!;
  const resultElem = document.createElement("li");
  resultElem.textContent = `${result.amount}u `;
  const reagentNameElem = document.createElement("a");
  reagentNameElem.href = `#${reagent.id}`;
  reagentNameElem.textContent = reagent.name;
  reagentNameElem.classList.add("reagent-link");
  resultElem.appendChild(reagentNameElem);
  return resultElem;
}

function getCanonicalRecipe(chemical: string): ReactionRecipe | null {
  const synthesis = reagentData.recipes.filter(
    (recipe) =>
      recipe.type == "Reaction" &&
      recipe.effects == undefined &&
      recipe.reactants.length + (recipe.catalysts ?? []).length != 1 &&
      recipe.results != undefined &&
      recipe.results.length == 1 &&
      recipe.results[0].reagent_id == chemical,
  );
  if (synthesis.length == 1) {
    return synthesis[0] as ReactionRecipe;
  } else {
    return null;
  }
}

type SynthesisResult = SynthesisStep | SynthesisBase;

interface SynthesisBase {
  type: "base";
  reagent_id: string;
  amount: number;
}

interface SynthesisStep {
  type: "step";
  id: string;
  machine?: string;
  min_temp?: number;
  max_temp?: number;
  reactants: SynthesisResult[];
  catalysts?: SynthesisResult[];
  result: ReagentWithAmount;
  leftover: number;
}

function getSynthesis(chemical: ReagentWithAmount): SynthesisResult {
  const recipe = getCanonicalRecipe(chemical.reagent_id);
  if (recipe == null) {
    return {
      type: "base",
      reagent_id: chemical.reagent_id,
      amount: chemical.amount,
    };
  } else {
    const batchsize = recipe.results![0]!.amount;
    const num_batches = Math.ceil(chemical.amount / batchsize);
    return {
      type: "step",
      id: recipe.id,
      machine: recipe.machine,
      min_temp: recipe.min_temp,
      max_temp: recipe.max_temp,
      reactants: recipe.reactants.map((reactant) =>
        getSynthesis({
          reagent_id: reactant.reagent_id,
          amount: reactant.amount * num_batches,
        }),
      ),
      catalysts: recipe.catalysts?.map(getSynthesis),
      result: chemical,
      leftover: batchsize * num_batches - chemical.amount,
    };
  }
}

let cachedChemical: Reagent | null = null;

const amount = document.getElementById("amount") as HTMLInputElement;
amount.addEventListener("input", () => {
  if (cachedChemical != null) updateChemDetails(cachedChemical);
});

document.getElementById("add-to-list")?.addEventListener("click", () => {
  const reagent_id = cachedChemical!.id;
  const reagent_amount = isNaN(Number.parseInt(amount.value))
    ? 180
    : Number.parseInt(amount.value);
  const list_name =
    prompt("List name? (only alphabet and spaces allowed)") ?? "";
  if (!/^[a-zA-Z ]+$/.test(list_name)) {
    alert("Invalid list name!");
    return;
  }
  const list_id = list_name.replace(" ", "-");
  const list_idx = customLists.findIndex((e) => e[0] == list_id);
  if (list_idx == -1) {
    customLists.push([
      list_id,
      [
        {
          reagent_id: reagent_id,
          amount: reagent_amount,
        },
      ],
    ]);
  } else {
    const reagent_idx = customLists[list_idx][1].findIndex(
      (e) => e.reagent_id == reagent_id,
    );
    if (reagent_idx == -1) {
      customLists[list_idx][1].push({
        reagent_id: reagent_id,
        amount: reagent_amount,
      });
    } else {
      if (reagent_amount > 0) {
        customLists[list_idx][1][reagent_idx] = {
          reagent_id: reagent_id,
          amount: reagent_amount,
        };
      } else {
        customLists[list_idx][1].splice(reagent_idx, 1);
        if (customLists[list_idx][1].length == 0) {
          customLists.splice(list_idx, 1);
        }
      }
    }
  }
  customListsSave();
});

interface SynthesisGraphNode {
  reagent_id: string;
  amount: number;
  catalyst_amount: number;
  base: boolean;
  needed_by: string[]; // outgoing
  needs: string[]; // incoming
}

function makeSynthesisGraph(
  syntheses: SynthesisResult[],
): SynthesisGraphNode[] {
  const nodes: SynthesisGraphNode[] = [];
  for (const node of syntheses.flatMap((e) => makeSynthesisGraphInner(e))) {
    const node_idx = nodes.findIndex((e) => e.reagent_id == node.reagent_id);
    if (node_idx == -1) {
      nodes.push(node);
    } else {
      nodes[node_idx].amount += node.amount;
    }
  }
  for (const node of nodes) {
    for (const need of node.needs) {
      nodes.find((e) => e.reagent_id == need)!.needed_by.push(node.reagent_id);
    }
  }
  return nodes;
}

function makeSynthesisGraphInner(
  synthesis: SynthesisResult,
  catalyst?: boolean,
): SynthesisGraphNode[] {
  if (synthesis.type == "base") {
    return [
      {
        reagent_id: synthesis.reagent_id,
        amount: catalyst == true ? 0 : synthesis.amount,
        catalyst_amount: catalyst == true ? synthesis.amount : 0,
        base: true,
        needed_by: [],
        needs: [],
      },
    ];
  } else {
    const needs = [];
    needs.push(...synthesis.reactants.map(synthesisReagentId));
    needs.push(...(synthesis.catalysts ?? []).map(synthesisReagentId));
    const result: SynthesisGraphNode[] = [
      {
        reagent_id: synthesis.result.reagent_id,
        amount: catalyst == true ? 0 : synthesis.result.amount,
        catalyst_amount: catalyst == true ? synthesis.result.amount : 0,
        base: false,
        needed_by: [],
        needs: needs,
      },
    ];
    for (const node of synthesis.reactants.flatMap((e) =>
      makeSynthesisGraphInner(e),
    )) {
      const node_idx = result.findIndex((e) => e.reagent_id == node.reagent_id);
      if (node_idx == -1) {
        result.push(node);
      } else {
        result[node_idx].amount += node.amount;
        result[node_idx].catalyst_amount += node.catalyst_amount;
      }
    }
    for (const node of (synthesis.catalysts ?? []).flatMap((e) =>
      makeSynthesisGraphInner(e, true),
    )) {
      const node_idx = result.findIndex((e) => e.reagent_id == node.reagent_id);
      if (node_idx == -1) {
        result.push(node);
      } else {
        result[node_idx].amount += node.amount;
        result[node_idx].catalyst_amount += node.catalyst_amount;
      }
    }
    return result;
  }
}

function synthesisReagentId(synthesis: SynthesisResult): string {
  if (synthesis.type == "base") {
    return synthesis.reagent_id;
  } else {
    return synthesis.result.reagent_id;
  }
}

function synthesisGraphSort(nodes: SynthesisGraphNode[]): ReagentWithAmount[] {
  const L: ReagentWithAmount[] = [];
  const S = nodes.filter((e) => e.needs.length == 0);
  while (S.length > 0) {
    const n = S.pop()!;
    if (!n.base) {
      L.push({
        reagent_id: n.reagent_id,
        amount: Math.max(n.catalyst_amount, n.amount),
      });
    }
    for (const reagent_id of n.needed_by) {
      const m = nodes.find((e) => e.reagent_id == reagent_id)!;
      m.needs = m.needs.filter((e) => e != n.reagent_id);
      if (m.needs.length == 0) {
        S.push(m);
      }
    }
    n.needed_by = [];
  }
  return L;
}

function updateListDetails(list: ReagentWithAmount[]) {
  document.getElementById("single-chem-amount")!.classList.add("hidden");
  document.getElementById("results-section")!.classList.remove("hidden");
  document.getElementById("chem")!.style.borderColor = "#4f39f6";
  document.getElementById("results")?.replaceChildren();
  for (const ingredient of list) {
    document
      .getElementById("results")
      ?.appendChild(createChemElement(ingredient));
  }
  const syntheses = list.map(getSynthesis);
  const synthesisGraph = makeSynthesisGraph(syntheses);
  document.getElementById("ingredients")?.replaceChildren();
  document.getElementById("leftovers")?.replaceChildren();
  for (const node of synthesisGraph) {
    if (node.base) {
      document.getElementById("ingredients")?.appendChild(
        createRecipeIoElement({
          reagent_id: node.reagent_id,
          amount: Math.max(node.catalyst_amount, node.amount),
        }),
      );
      if (node.catalyst_amount > 0) {
        document.getElementById("leftovers")?.appendChild(
          createRecipeIoElement({
            reagent_id: node.reagent_id,
            amount: node.catalyst_amount,
          }),
        );
      }
    } else {
      const recipe = getCanonicalRecipe(node.reagent_id)!;
      const batchsize = recipe.results![0].amount;
      const num_batches = Math.ceil(node.amount / batchsize);
      const leftover = num_batches * batchsize - node.amount;
      if (leftover > 0) {
        document.getElementById("leftovers")?.appendChild(
          createRecipeIoElement({
            reagent_id: node.reagent_id,
            amount: leftover,
          }),
        );
      }
    }
  }
  if (document.getElementById("leftovers")!.children.length == 0) {
    document.getElementById("leftovers-section")?.classList.add("hidden");
  } else {
    document.getElementById("leftovers-section")?.classList.remove("hidden");
  }
  const requiredIntermediates = synthesisGraphSort(synthesisGraph);
  document.getElementById("steps")?.replaceChildren();
  for (const intermediate of requiredIntermediates) {
    const recipe = getCanonicalRecipe(intermediate.reagent_id)!;
    const batchsize = recipe.results![0].amount;
    const num_batches = Math.ceil(intermediate.amount / batchsize);
    document
      .getElementById("steps")
      ?.appendChild(createRecipeElement(recipe, num_batches));
  }
}

function updateChemDetails(chemical: Reagent) {
  document.getElementById("single-chem-amount")!.classList.remove("hidden");
  document.getElementById("results-section")!.classList.add("hidden");
  cachedChemical = chemical;
  document.getElementById("amount-chem")!.textContent = chemical.name;
  document.getElementById("chem")!.style.borderColor = chemical.color;
  const synthesis = getSynthesis({
    reagent_id: chemical.id,
    amount: isNaN(Number.parseInt(amount.value))
      ? 180
      : Number.parseInt(amount.value),
  });
  const synthesisGraph = makeSynthesisGraph([synthesis]);
  document.getElementById("ingredients")?.replaceChildren();
  document.getElementById("leftovers")?.replaceChildren();
  for (const node of synthesisGraph) {
    if (node.base) {
      document.getElementById("ingredients")?.appendChild(
        createRecipeIoElement({
          reagent_id: node.reagent_id,
          amount: Math.max(node.catalyst_amount, node.amount),
        }),
      );
      if (node.catalyst_amount > 0) {
        document.getElementById("leftovers")?.appendChild(
          createRecipeIoElement({
            reagent_id: node.reagent_id,
            amount: node.catalyst_amount,
          }),
        );
      }
    } else {
      const recipe = getCanonicalRecipe(node.reagent_id)!;
      const batchsize = recipe.results![0].amount;
      const num_batches = Math.ceil(node.amount / batchsize);
      const leftover = num_batches * batchsize - node.amount;
      if (leftover > 0) {
        document.getElementById("leftovers")?.appendChild(
          createRecipeIoElement({
            reagent_id: node.reagent_id,
            amount: leftover,
          }),
        );
      }
    }
  }
  if (document.getElementById("leftovers")!.children.length == 0) {
    document.getElementById("leftovers-section")?.classList.add("hidden");
  } else {
    document.getElementById("leftovers-section")?.classList.remove("hidden");
  }
  const requiredIntermediates = synthesisGraphSort(synthesisGraph);
  document.getElementById("steps")?.replaceChildren();
  for (const intermediate of requiredIntermediates) {
    const recipe = getCanonicalRecipe(intermediate.reagent_id)!;
    const batchsize = recipe.results![0].amount;
    const num_batches = Math.ceil(intermediate.amount / batchsize);
    document
      .getElementById("steps")
      ?.appendChild(createRecipeElement(recipe, num_batches));
  }
}

updateSelectedGroup();
addEventListener("popstate", updateSelectedGroup);

const fuse = new Fuse(reagentData.reagents, {
  keys: ["name"],
});

const searchbar = document.getElementById("search") as HTMLInputElement;
const searchresults = document.getElementById(
  "search-results",
) as HTMLUListElement;

function updateSearchResults() {
  const results = fuse.search(searchbar.value);
  searchresults.replaceChildren();
  for (const result of results) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.classList.add("search-result");
    a.href = `#${result.item.id}`;
    a.textContent = result.item.name;
    li.appendChild(a);
    searchresults.appendChild(li);
  }
  if (searchresults.children.length == 0) {
    const li = document.createElement("li");
    li.classList.add("search-no-results");
    li.textContent = "No results";
    searchresults.appendChild(li);
  }
  searchresults.classList.remove("hidden");
}

searchbar.addEventListener("input", updateSearchResults);
searchbar.addEventListener("focus", updateSearchResults);
addEventListener("click", (ev) => {
  if (ev.target != searchbar) searchresults.classList.add("hidden");
});
addEventListener("popstate", () => {
  searchbar.value = "";
  searchresults.classList.add("hidden");
});

function createRecipeElement(
  recipe: ReactionRecipe,
  mult: number,
): HTMLLIElement {
  const elem = document.createElement("li");
  elem.classList.add("recipe");
  let intro = "Mix";
  if (recipe.machine != undefined) {
    if (recipe.machine == "Holy") {
      intro = `Process with The Bible`;
    } else {
      intro = `Process in ${recipe.machine}`;
    }
  }
  if (recipe.min_temp != undefined) {
    intro += ` above ${recipe.min_temp}K`;
  }
  if (recipe.max_temp != undefined) {
    intro += ` below ${recipe.max_temp}K`;
  }
  intro += `:`;
  elem.textContent = intro;
  const inputList = document.createElement("ul");
  inputList.classList.add("recipe-io");
  for (const result of recipe.reactants!) {
    inputList.appendChild(
      createRecipeIoElement({
        reagent_id: result.reagent_id,
        amount: result.amount * mult,
      }),
    );
  }
  elem.appendChild(inputList);
  if (recipe.catalysts != undefined && recipe.catalysts.length != 0) {
    elem.append("Catalysts:");
    const catalystList = document.createElement("ul");
    catalystList.classList.add("recipe-io");
    for (const result of recipe.catalysts) {
      catalystList.appendChild(createRecipeIoElement(result));
    }
    elem.appendChild(catalystList);
  }
  if (recipe.results != undefined) {
    elem.append("For:");
    const outputList = document.createElement("ul");
    outputList.classList.add("recipe-io");
    for (const result of recipe.results) {
      outputList.appendChild(
        createRecipeIoElement({
          reagent_id: result.reagent_id,
          amount: result.amount * mult,
        }),
      );
    }
    elem.appendChild(outputList);
  }
  return elem;
}
