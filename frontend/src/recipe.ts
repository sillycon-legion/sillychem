import "./style.css";
import reagentData, {
  type ReactionRecipe,
  type Reagent,
  type ReagentWithAmount,
} from "./data.ts";
import Fuse from "fuse.js";

const groups = [...new Set(reagentData.reagents.map((e) => e.group))].sort();
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
  if (foundChem != null) {
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
    document.getElementById("chemicals")?.replaceChildren(
      ...reagentData.reagents
        .filter((e) => e.group == groups[selectedGroup])
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(makeChemicalElement),
    );
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

function getCanonicalRecipe(chemical: string): ReactionRecipe | null {
  const synthesis = reagentData.recipes.filter(
    (recipe) =>
      recipe.type == "Reaction" &&
      recipe.effects == undefined &&
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

function getIngredients(synthesis: SynthesisResult): ReagentWithAmount[] {
  if (synthesis.type == "base") {
    return [{ reagent_id: synthesis.reagent_id, amount: synthesis.amount }];
  }
  const result = [];
  for (const ingredient of synthesis.reactants.flatMap(getIngredients)) {
    const reagent_idx = result.findIndex(
      (e) => e.reagent_id == ingredient.reagent_id,
    );
    if (reagent_idx == -1) {
      result.push(ingredient);
    } else {
      result[reagent_idx].amount += ingredient.amount;
    }
  }
  for (const ingredient of (synthesis.catalysts ?? []).flatMap(
    getIngredients,
  )) {
    const reagent_idx = result.findIndex(
      (e) => e.reagent_id == ingredient.reagent_id,
    );
    if (reagent_idx == -1) {
      result.push(ingredient);
    } else {
      result[reagent_idx].amount += ingredient.amount;
    }
  }
  return result;
}

function getLeftovers(synthesis: SynthesisResult): ReagentWithAmount[] {
  if (synthesis.type == "base") {
    return [];
  }
  const result = [];
  if (synthesis.leftover != 0) {
    result.push({
      reagent_id: synthesis.result.reagent_id,
      amount: synthesis.leftover,
    });
  }
  for (const ingredient of synthesis.reactants.flatMap(getLeftovers)) {
    const reagent_idx = result.findIndex(
      (e) => e.reagent_id == ingredient.reagent_id,
    );
    if (reagent_idx == -1) {
      result.push(ingredient);
    } else {
      result[reagent_idx].amount += ingredient.amount;
    }
  }
  for (const catalyst of synthesis.catalysts ?? []) {
    const ingredient = catalyst.type == "base" ? catalyst : catalyst.result;
    const reagent_idx = result.findIndex(
      (e) => e.reagent_id == ingredient.reagent_id,
    );
    if (reagent_idx == -1) {
      result.push(ingredient);
    } else {
      result[reagent_idx].amount += ingredient.amount;
    }
  }
  for (const ingredient of (synthesis.catalysts ?? []).flatMap(getLeftovers)) {
    const reagent_idx = result.findIndex(
      (e) => e.reagent_id == ingredient.reagent_id,
    );
    if (reagent_idx == -1) {
      result.push(ingredient);
    } else {
      result[reagent_idx].amount += ingredient.amount;
    }
  }
  return result;
}

let cachedChemical: Reagent | null = null;

const amount = document.getElementById("amount") as HTMLInputElement;
amount.addEventListener("input", () => {
  if (cachedChemical != null) updateChemDetails(cachedChemical);
});

function updateChemDetails(chemical: Reagent) {
  cachedChemical = chemical;
  document.getElementById("amount-chem")!.textContent = chemical.name;
  document.getElementById("chem")!.style.borderColor = chemical.color;
  const synthesis = getSynthesis({
    reagent_id: chemical.id,
    amount: isNaN(Number.parseInt(amount.value)) ? 200 : Number.parseInt(amount.value),
  });
  document.getElementById("ingredients")?.replaceChildren();
  for (const ingredient of getIngredients(synthesis)) {
    document
      .getElementById("ingredients")
      ?.appendChild(createRecipeIoElement(ingredient));
  }
  document.getElementById("leftovers")?.replaceChildren();
  for (const ingredient of getLeftovers(synthesis)) {
    document
      .getElementById("leftovers")
      ?.appendChild(createRecipeIoElement(ingredient));
  }
  if (document.getElementById("leftovers")!.children.length == 0) {
    document.getElementById("leftovers-section")?.classList.add("hidden");
  } else {
    document.getElementById("leftovers-section")?.classList.remove("hidden");
  }
  const requiredIntermediates = [];
  const searchQueue = [synthesis];
  while (searchQueue.length > 0) {
    const toSearch = searchQueue.shift()!;
    if (toSearch.type == "base") {
      continue;
    }
    const reagent_idx = requiredIntermediates.findIndex(
      (e) => e.reagent_id == toSearch.result.reagent_id,
    );
    if (reagent_idx == -1) {
      requiredIntermediates.unshift(toSearch.result);
    } else {
      requiredIntermediates[reagent_idx].amount += toSearch.result.amount;
    }
    searchQueue.push(...toSearch.reactants);
    searchQueue.push(...(toSearch.catalysts ?? []));
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
