import "./style.css";
import reagentData, {
  type ReactionRecipe,
  type Reagent,
  type ReagentWithAmount,
} from "./data.ts";
import Fuse from "fuse.js";
import * as Comlink from "comlink";
import {
  synthesisGraphSort,
  type SynthesisGraphNode,
} from "./synthesis-helper.ts";
import SynthesisWorker from "./synthesis-worker.ts?worker";

const synthesisGraphSortAsync: Comlink.Remote<
  (nodes: SynthesisGraphNode[]) => ReagentWithAmount[]
> = Comlink.wrap(new SynthesisWorker());

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

const recipeCache: Record<string, ReactionRecipe | null> = {};

function getCanonicalRecipe(chemical: string): ReactionRecipe | null {
  if (Object.prototype.hasOwnProperty.call(recipeCache, chemical)) {
    return recipeCache[chemical];
  }
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
    recipeCache[chemical] = synthesis[0] as ReactionRecipe;
  } else {
    recipeCache[chemical] = null;
  }
  return recipeCache[chemical];
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

function makeSynthesisGraph(
  reagents: ReagentWithAmount[],
): SynthesisGraphNode[] {
  const nodes: SynthesisGraphNode[] = [];
  const searchQueue: string[] = reagents.map((e) => e.reagent_id);
  while (searchQueue.length > 0) {
    const elem = searchQueue.shift()!;
    if (nodes.some((e) => e.reagent_id == elem)) continue;
    const recipe = getCanonicalRecipe(elem);
    if (recipe == null) {
      nodes.push({
        reagent_id: elem,
        amount: -1,
        catalyst_amount: -1,
        base: true,
        needs: [],
        needed_by: [],
      });
    } else {
      const needs = [
        ...recipe.reactants.map((e) => e.reagent_id),
        ...(recipe.catalysts ?? []).map((e) => e.reagent_id),
      ];
      nodes.push({
        reagent_id: elem,
        amount: -1,
        catalyst_amount: -1,
        base: false,
        needs: needs,
        needed_by: [],
      });
      searchQueue.push(...needs);
    }
  }
  for (const node of nodes) {
    for (const need of node.needs) {
      nodes.find((e) => e.reagent_id == need)!.needed_by.push(node.reagent_id);
    }
  }
  while (nodes.some((e) => e.amount == -1 || e.catalyst_amount == -1)) {
    for (const node of nodes) {
      if (node.amount != -1 && node.catalyst_amount != -1) {
        continue;
      }
      const parent_resolved = node.needed_by.every((needed_by) => {
        const node = nodes.find((e) => e.reagent_id == needed_by)!;
        return node.amount != -1 && node.catalyst_amount != -1;
      });
      if (parent_resolved) {
        let amount =
          reagents.find((e) => e.reagent_id == node.reagent_id)?.amount ?? 0;
        let catalyst_amount = 0;
        for (const needed_by of node.needed_by) {
          const parent_node = nodes.find((e) => e.reagent_id == needed_by)!;
          const to_make = Math.max(
            parent_node.amount,
            parent_node.catalyst_amount,
          );
          const recipe = getCanonicalRecipe(needed_by)!;
          const batch_size = recipe.results![0].amount;
          const num_batches = Math.ceil(to_make / batch_size);
          amount +=
            (recipe.reactants.find((e) => e.reagent_id == node.reagent_id)
              ?.amount ?? 0) * num_batches;
          catalyst_amount = Math.max(
            catalyst_amount,
            recipe.catalysts?.find((e) => e.reagent_id == node.reagent_id)
              ?.amount ?? 0,
          );
        }
        node.amount = amount;
        node.catalyst_amount = catalyst_amount;
      }
    }
  }
  return nodes;
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
  const synthesisGraph = makeSynthesisGraph(list);
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

  const elem = document.createElement("li");
  elem.classList.add("recipe");
  elem.textContent = "Calculating recipe, please wait.";
  document.getElementById("steps")?.replaceChildren(elem);
  const curHash = document.location.hash;
  synthesisGraphSortAsync(synthesisGraph).then((requiredIntermediates) => {
    if (document.location.hash != curHash) {
      return;
    }
    document.getElementById("steps")?.replaceChildren();
    for (const intermediate of requiredIntermediates) {
      const recipe = getCanonicalRecipe(intermediate.reagent_id)!;
      const batchsize = recipe.results![0].amount;
      const num_batches = Math.ceil(intermediate.amount / batchsize);
      document
        .getElementById("steps")
        ?.appendChild(createRecipeElement(recipe, num_batches));
    }
  });
}

function updateChemDetails(chemical: Reagent) {
  document.getElementById("single-chem-amount")!.classList.remove("hidden");
  document.getElementById("results-section")!.classList.add("hidden");
  cachedChemical = chemical;
  document.getElementById("amount-chem")!.textContent = chemical.name;
  document.getElementById("chem")!.style.borderColor = chemical.color;
  const synthesisGraph = makeSynthesisGraph([
    {
      reagent_id: chemical.id,
      amount: isNaN(Number.parseInt(amount.value))
        ? 180
        : Number.parseInt(amount.value),
    },
  ]);
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
