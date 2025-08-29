import "./style.css";
import reagentData, {
  type ConditionalEffect,
  type Reagent,
  type ReagentWithAmount,
  type Recipe,
} from "./data.ts";

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

function createRecipeIoElement(result: ReagentWithAmount): HTMLLIElement {
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

function createEffectElement(effect: ConditionalEffect, entry: HTMLElement) {
  if (effect.conditions != undefined) {
    if (effect.probability != 1.0) {
      entry.append(`With ${effect.probability * 100}% chance, `);
    }
    entry.append("When:");
    const conditionslist = document.createElement("ul");
    conditionslist.classList.add("conditions");
    for (const condition of effect.conditions) {
      const conditionelem = document.createElement("li");
      switch (condition.type) {
        case "ReagentThreshold":
          if (condition.min != undefined && condition.max != undefined) {
            conditionelem.textContent = `There's between ${condition.min}u and ${condition.max}u of `;
          } else if (condition.min != undefined) {
            conditionelem.textContent = `There's over ${condition.min}u of `;
          } else if (condition.max != undefined) {
            conditionelem.textContent = `There's under ${condition.max}u of `;
          }
          const reagent = reagentData.reagents.find(
            (e) => e.id == condition.reagent,
          )!;
          const reagentNameElem = document.createElement("a");
          reagentNameElem.href = `#${reagent.id}`;
          reagentNameElem.textContent = reagent.name;
          reagentNameElem.classList.add("reagent-link");
          conditionelem.appendChild(reagentNameElem);
          break;
        case "Temperature":
          if (condition.min != undefined && condition.max != undefined) {
            conditionelem.textContent = `Temperature is between ${condition.min}K and ${condition.max}K`;
          } else if (condition.min != undefined) {
            conditionelem.textContent = `Temperature is over ${condition.min}K`;
          } else if (condition.max != undefined) {
            conditionelem.textContent = `Temperature is under ${condition.max}K`;
          }
          break;
        case "TotalDamage":
          if (condition.min != undefined && condition.max != undefined) {
            conditionelem.textContent = `Total damage is between ${condition.min}K and ${condition.max}K`;
          } else if (condition.min != undefined) {
            conditionelem.textContent = `Total damage is over ${condition.min}K`;
          } else if (condition.max != undefined) {
            conditionelem.textContent = `Total damage is under ${condition.max}K`;
          }
          break;
        case "OrganType":
          if (condition.whitelist) {
            conditionelem.textContent = `Metabolized by ${condition.kind}`;
          } else {
            conditionelem.textContent = `Not metabolized by ${condition.kind}`;
          }
          break;
        case "HasTag":
          if (condition.whitelist) {
            conditionelem.textContent = `Target is ${condition.tag}`;
          } else {
            conditionelem.textContent = `Target is not ${condition.tag}`;
          }
          break;
        case "MobStateCondition":
          switch (condition.state) {
            case "Alive":
              conditionelem.textContent = "Target is alive";
              break;
            case "Critical":
              conditionelem.textContent = "Target is critical";
              break;
            case "Dead":
              conditionelem.textContent = "Target is dead";
              break;
          }
          break;
        case "Hunger":
          if (condition.min != undefined && condition.max != undefined) {
            conditionelem.textContent = `Hunger is between ${condition.min}K and ${condition.max}K`;
          } else if (condition.min != undefined) {
            conditionelem.textContent = `Hunger is over ${condition.min}K`;
          } else if (condition.max != undefined) {
            conditionelem.textContent = `Hunger is under ${condition.max}K`;
          }
          break;
      }
      conditionslist.appendChild(conditionelem);
    }
    entry.appendChild(conditionslist);
  }
  switch (effect.effect.type) {
    case "SatiateHunger":
      if (effect.effect.relative == 1)
        entry.append("Satiates hunger averagely.");
      else
        entry.append(
          `Satiates hunger at ${effect.effect.relative.toPrecision(2)}x the average rate.`,
        );
      break;
    case "SatiateThirst":
      if (effect.effect.relative == 1)
        entry.append("Satiates thirst averagely.");
      else
        entry.append(
          `Satiates thirst at ${effect.effect.relative.toPrecision(2)}x the average rate.`,
        );
      break;
    case "HealthChange":
      entry.append("Modifies health by:");
      const damagelist = document.createElement("ul");
      damagelist.classList.add("damage");
      const damagetypes = [];
      for (const damagetype in effect.effect.damages) {
        if (
          Object.prototype.hasOwnProperty.call(
            effect.effect.damages,
            damagetype,
          )
        ) {
          damagetypes.push(damagetype);
        }
      }
      for (const damagetype of damagetypes.sort()) {
        const damage = document.createElement("li");
        const amount = effect.effect.damages[damagetype] / 100;
        const numberelem = document.createElement("span");
        if (amount > 0) {
          damage.append("Deals ");
          numberelem.classList.add("damage-deals");
        } else {
          damage.append("Heals ");
          numberelem.classList.add("damage-heals");
        }
        numberelem.innerText = `${Math.abs(amount)}`;
        damage.appendChild(numberelem);
        damage.append(` ${damagetype}`);
        damagelist.appendChild(damage);
      }
      entry.appendChild(damagelist);
      break;
    case "EvenHealthChange":
      entry.append("Modifies health evenly by:");
      const damagegrouplist = document.createElement("ul");
      damagegrouplist.classList.add("damage");
      const damagegroups = [];
      for (const damagetype in effect.effect.damages) {
        if (
          Object.prototype.hasOwnProperty.call(
            effect.effect.damages,
            damagetype,
          )
        ) {
          damagegroups.push(damagetype);
        }
      }
      for (const damagetype of damagegroups.sort()) {
        const damage = document.createElement("li");
        const amount = effect.effect.damages[damagetype] / 100;
        const numberelem = document.createElement("span");
        if (amount > 0) {
          damage.append("Deals ");
          numberelem.classList.add("damage-deals");
        } else {
          damage.append("Heals ");
          numberelem.classList.add("damage-heals");
        }
        numberelem.innerText = `${Math.abs(amount)}`;
        damage.appendChild(numberelem);
        damage.append(` ${damagetype}`);
        damagegrouplist.appendChild(damage);
      }
      entry.appendChild(damagegrouplist);
      break;
    case "ChemVomit":
      entry.append("Induces vomiting.");
      break;
    case "AdjustReagent":
      if (effect.effect.by < 0) {
        entry.append(`Removes ${-effect.effect.by}u of `);
      } else {
        entry.append(`Adds ${effect.effect.by}u of `);
      }
      const reagentid = effect.effect.reagent;
      const reagent = reagentData.reagents.find((e) => e.id == reagentid)!;
      const reagentNameElem = document.createElement("a");
      reagentNameElem.href = `#${reagent.id}`;
      reagentNameElem.textContent = reagent.name;
      reagentNameElem.classList.add("reagent-link");
      entry.appendChild(reagentNameElem);
      entry.append(".");
      break;
    case "Jitter":
      entry.append("Induces jittering.");
      break;
    case "Electrocute":
      entry.append(`Electrocutes the metabolizer for ${effect.effect.time}s.`);
      break;
    case "ModifyStatusEffect":
      switch (effect.effect.action) {
        case "Add":
          entry.append(
            `Causes ${effect.effect.effect} for at least ${effect.effect.time}s with accumulation.`,
          );
          break;
        case "Remove":
          entry.append(
            `Removes ${effect.effect.time}s of ${effect.effect.effect}.`,
          );
          break;
        case "Set":
          entry.append(
            `Causes ${effect.effect.effect} for at least ${effect.effect.time}s without accumulation.`,
          );
          break;
      }
      break;
    case "MovespeedModifier":
      if (effect.effect.run != 1 && effect.effect.walk != 1) {
        entry.append(
          `Modifies walk speed by ${effect.effect.walk}x and run speed by ${effect.effect.run}x for ${effect.effect.time}s.`,
        );
      } else if (effect.effect.run != 1) {
        entry.append(
          `Modifies run speed by ${effect.effect.run}x for ${effect.effect.time}s.`,
        );
      } else if (effect.effect.walk != 1) {
        entry.append(
          `Modifies walk speed by ${effect.effect.walk}x for ${effect.effect.time}s.`,
        );
      }
      break;
    case "Drunk":
      entry.append("Causes drunkness.");
      break;
    case "CauseZombieInfection":
      entry.append("Gives the zombie infection.");
      break;
    case "CureZombieInfection":
      if (effect.effect.innoculate) {
        entry.append("Cures and immunizes against the zombie infection.");
      } else {
        entry.append("Cures the zombie infection.");
      }
      break;
    case "ModifyBloodLevel":
      if (effect.effect.amount > 0) {
        entry.append("Restores blood.");
      } else {
        entry.append("Drains blood.");
      }
      break;
    case "FlammableReaction":
      entry.append("Increases flammability.");
      break;
    case "ModifyBleedAmount":
      if (effect.effect.amount > 0) {
        entry.append("Reduces bleeding.");
      } else {
        entry.append("Induces bleeding.");
      }
      break;
    case "AdjustTemperature":
      if (effect.effect.amount > 0) {
        entry.append(`Adds ${effect.effect.amount}J of heat to the body.`);
      } else {
        entry.append(
          `Removes ${-effect.effect.amount}J of heat from the body.`,
        );
      }
      break;
    case "ChemCleanBloodstream":
      entry.append("Cleanses the bloodstream of other chemicals.");
      break;
    case "Polymorph":
      entry.append(`Polymorphs the metabolizer to ${effect.effect.target}.`);
      break;
    case "ResetNarcolepsy":
      entry.append("Temporarily staves off narcolepsy.");
      break;
    case "Ignite":
      entry.append("Ignites the metabolizer.");
      break;
    case "ReduceRotting":
      entry.append(`Regenerates ${effect.effect.amount}s of rotting.`);
      break;
    case "ChemHealEyeDamage":
      if (effect.effect.amount > 0) {
        entry.append("Deals eye damage.");
      } else {
        entry.append("Heals eye damage.");
      }
      break;
    case "MakeSentient":
      entry.append("Makes the metabolizer sentient.");
      break;
    case "PlantAdjustNutrition":
      entry.append(`Adjusts nutrition level by ${effect.effect.amount}.`);
      break;
    case "PlantAdjustWater":
      entry.append(`Adjusts water level by ${effect.effect.amount}.`);
      break;
    case "PlantAdjustToxins":
      entry.append(`Adjusts toxins level by ${effect.effect.amount}.`);
      break;
    case "PlantAdjustWeeds":
      entry.append(`Adjusts weeds level by ${effect.effect.amount}.`);
      break;
    case "PlantAdjustHealth":
      entry.append(`Adjusts health by ${effect.effect.amount}.`);
      break;
    case "PlantAdjustMutationLevel":
      entry.append(`Adjusts mutation level by ${effect.effect.amount}.`);
      break;
    case "PlantAdjustMutationMod":
      entry.append(`Adjusts mutation modifier by ${effect.effect.amount}.`);
      break;
    case "PlantAdjustPests":
      entry.append(`Adjusts pests level by ${effect.effect.amount}.`);
      break;
    case "PlantAdjustPotency":
      entry.append(`Adjusts potency by ${effect.effect.amount}.`);
      break;
    case "PlantAffectGrowth":
      entry.append(`Adjusts age by ${effect.effect.amount}.`);
      break;
    case "PlantRestoreSeeds":
      entry.append("Restores the seeds of the plant.");
      break;
    case "PlantPhalanximine":
      entry.append(
        "Restores viability to a plant rendered nonviable by a mutation.",
      );
      break;
    case "PlantCryoxadone":
      entry.append(
        "Ages back the plant, depending on the plant's age and time to grow.",
      );
      break;
    case "PlantDiethylamine":
      entry.append(
        "Increases the plant's lifespan and/or base health with 10% chance for each.",
      );
      break;
    case "PlantRobustHarvest":
      entry.append(
        `Increases the plant's potency by ${effect.effect.potency_increase} up to a maximum of ${effect.effect.potency_limit}.`,
        `Causes the plant to lose its seeds once the potency reaches ${effect.effect.potency_seedless_threshold}.`,
        `Trying to add potency over ${effect.effect.potency_limit} may cause decrease in yield at a 10% chance.`,
      );
      break;
    case "ReactionExplosion":
      entry.append("Causes an explosion.");
      break;
    case "ReactionFoamOrSmoke":
      entry.append(
        `Causes a smoke or foam reaction for ${effect.effect.duration}s.`,
      );
      break;
    case "ReactionEmp":
      entry.append("Causes an electromagnetic pulse.");
      break;
    case "ReactionFlash":
      entry.append("Causes a blinding flash.");
      break;
    case "ReactionCreateEntity":
      entry.append(`Creates ${effect.effect.amount} ${effect.effect.name}.`);
      break;
    case "ReactionCreateGas":
      entry.append(
        `Creates ${effect.effect.amount} moles of ${effect.effect.name}.`,
      );
      break;
  }
}

function updateChemDetails(chemical: Reagent) {
  document.getElementById("chem")!.style.borderColor = chemical.color;
  document.getElementById("chemName")!.textContent = chemical.name;
  document.getElementById("chemDesc")!.textContent = chemical.desc;
  document.getElementById("chemPhysicalDesc")!.textContent =
    chemical.physical_desc;
  document.getElementById("recipes")!.replaceChildren();
  document.getElementById("usages")!.replaceChildren();
  if (chemical.metabolisms != undefined) {
    document.getElementById("metabolism-section")?.classList.remove("hidden");
    document.getElementById("metabolism-groups")?.replaceChildren();
    const groups = [];
    for (const group in chemical.metabolisms) {
      if (Object.prototype.hasOwnProperty.call(chemical.metabolisms, group)) {
        groups.push(group);
      }
    }
    for (const group of groups.sort()) {
      const effects = chemical.metabolisms[group];
      const elem = document.createElement("div");
      const header = document.createElement("h3");
      header.classList.add("metabolism-group-head");
      header.textContent = group;
      elem.appendChild(header);
      const list = document.createElement("ul");
      list.classList.add("metabolism-group-list");
      for (const effect of effects) {
        const entry = document.createElement("li");
        entry.classList.add("metabolism");
        createEffectElement(effect, entry);
        list.appendChild(entry);
      }
      elem.appendChild(list);
      document.getElementById("metabolism-groups")?.appendChild(elem);
    }
  } else {
    document.getElementById("metabolism-section")?.classList.add("hidden");
  }
  if (chemical.plant_metabolisms != undefined) {
    document
      .getElementById("plant-metabolism-section")
      ?.classList.remove("hidden");
    document.getElementById("plant-metabolism")?.replaceChildren();
    for (const effect of chemical.plant_metabolisms) {
      const entry = document.createElement("li");
      entry.classList.add("metabolism");
      createEffectElement(effect, entry);
      document.getElementById("plant-metabolism")?.appendChild(entry);
    }
  } else {
    document
      .getElementById("plant-metabolism-section")
      ?.classList.add("hidden");
  }
  for (const recipe of reagentData.recipes.sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (
      (recipe.results ?? []).find((v) => v.reagent_id == chemical.id) !=
      undefined
    ) {
      const elem = createRecipeElement(recipe);
      document.getElementById("recipes")!.appendChild(elem);
    }
    if (recipe.type == "Reaction") {
      if (
        [...(recipe.catalysts ?? []), ...recipe.reactants].find(
          (v) => v.reagent_id == chemical.id,
        ) != undefined
      ) {
        const elem = createRecipeElement(recipe);
        document.getElementById("usages")!.appendChild(elem);
      }
    }
  }
  if (document.getElementById("recipes")!.children.length == 0) {
    document.getElementById("recipes-section")?.classList.add("hidden");
  } else {
    document.getElementById("recipes-section")?.classList.remove("hidden");
  }
  if (document.getElementById("usages")!.children.length == 0) {
    document.getElementById("usages-section")?.classList.add("hidden");
  } else {
    document.getElementById("usages-section")?.classList.remove("hidden");
  }
}
updateSelectedGroup();
addEventListener("popstate", updateSelectedGroup);
function createRecipeElement(recipe: Recipe) {
  const elem = document.createElement("li");
  elem.classList.add("recipe");
  switch (recipe.type) {
    case "Reaction":
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
        inputList.appendChild(createRecipeIoElement(result));
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
          outputList.appendChild(createRecipeIoElement(result));
        }
        elem.appendChild(outputList);
      }
      if (recipe.effects != undefined) {
        elem.append("Effects:");
        const outputList = document.createElement("ul");
        outputList.classList.add("recipe-io");
        for (const effect of recipe.effects) {
          const entry = document.createElement("li");
          entry.classList.add("effect");
          createEffectElement(effect, entry);
          outputList.appendChild(entry);
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
  return elem;
}
