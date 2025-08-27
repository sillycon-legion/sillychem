import "./style.css";
import "@tailwindplus/elements";
import reagentData from "./data.json";

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
function makeChemicalElement(chemical: {
  id: string;
  name: string;
  group: string;
  desc: string;
  physical_desc: string;
  color: string;
}): HTMLLIElement {
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
    if (selectedChemical != -1) {
      document
        .getElementById("chemicals")
        ?.children[selectedChemical]?.children[0].classList.add("group-active");
      document
        .getElementById("placeholder")
        ?.classList.replace("flex", "hidden");
      document.getElementById("chem")?.classList.replace("hidden", "flex");
    } else {
      document
        .getElementById("placeholder")
        ?.classList.replace("hidden", "flex");
      document.getElementById("chem")?.classList.replace("flex", "hidden");
    }
  }
}

function createRecipeIoElement(result: {
  reagent_id: string;
  amount: number;
}): HTMLLIElement {
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

function updateChemDetails(chemical: {
  id: string;
  name: string;
  group: string;
  desc: string;
  physical_desc: string;
  color: string;
}) {
  document.getElementById("chem")!.style.borderColor = chemical.color;
  document.getElementById("chemName")!.textContent = chemical.name;
  document.getElementById("chemDesc")!.textContent = chemical.desc;
  document.getElementById("chemPhysicalDesc")!.textContent =
    chemical.physical_desc;
  document.getElementById("recipes")!.replaceChildren();
  for (const recipe of reagentData.recipes.sort((a, b) => a.id.localeCompare(b.id))) {
    if (recipe.results.find((v) => v.reagent_id == chemical.id) == undefined) {
      continue;
    }
    const elem = document.createElement("li");
    elem.classList.add("recipe");
    switch (recipe.type) {
      case "Reaction":
        let intro = "Mix ";
        if (recipe.machine != undefined) {
          if (recipe.machine == "Holy") {
            intro = `Process with The Bible `;
          } else {
            intro = `Process in ${recipe.machine} `;
          }
        }
        if (recipe.min_temp != undefined) {
          intro += `above ${recipe.min_temp}K `;
        }
        if (recipe.max_temp != undefined) {
          intro += `below ${recipe.min_temp}K `;
        }
        for (const result of recipe.results) {
          if (result.reagent_id == chemical.id) {
            intro += `for ${result.amount}u:`;
          }
        }
        elem.textContent = intro;
        const inputList = document.createElement("ul");
        inputList.classList.add("recipe-io");
        for (const result of recipe.reactants!) {
          inputList.appendChild(createRecipeIoElement(result));
        }
        elem.appendChild(inputList);
        const sideProducts = recipe.results.filter(
          (e) => e.reagent_id != chemical.id,
        );
        if (sideProducts.length != 0) {
          elem.append("Side products:");
          const outputList = document.createElement("ul");
          outputList.classList.add("recipe-io");
          for (const result of sideProducts) {
            outputList.appendChild(createRecipeIoElement(result));
          }
          elem.appendChild(outputList);
        }
        break;
      case "Grind":
        elem.textContent = `Grind ${recipe.name} to get:`;
        const groundList = document.createElement("ul");
        groundList.classList.add("recipe-io");
        for (const result of recipe.results!) {
          groundList.appendChild(createRecipeIoElement(result));
        }
        elem.appendChild(groundList);
        break;
    }
    document.getElementById("recipes")!.appendChild(elem);
  }
}
updateSelectedGroup();
addEventListener("popstate", updateSelectedGroup);
