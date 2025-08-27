use std::{borrow::Cow, collections::HashMap};

use eyre::{Context, Result, eyre};
use fluent_bundle::{FluentBundle, FluentResource};
use glob::glob;
use serde::{Deserialize, Serialize};
use unic_langid::langid;
use yaml_rust2::Yaml;

fn main() -> Result<()> {
    color_eyre::install()?;
    let langid_en = langid!("en-US");
    let mut bundle = FluentBundle::new(vec![langid_en]);
    println!("Reading translations");
    for entry in glob("space-station-14/Resources/Locale/en-US/**/*.ftl")? {
        let entry = entry?;
        println!("Reading translation file {}", entry.display());
        let res = match FluentResource::try_new(std::fs::read_to_string(&entry)?) {
            Ok(res) => res,
            Err((res, _)) => res,
        };
        bundle.add_resource(res).map_err(|errors| {
            eyre!(
                "Error parsing {}: {}",
                entry.display(),
                errors
                    .into_iter()
                    .map(|e| e.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })?;
    }
    let mut abstract_reagents: HashMap<String, AbstractReagent> = HashMap::new();
    let mut recipes = vec![];
    let mut reagents = vec![];
    println!("Reading prototypes");
    for entry in glob("space-station-14/Resources/Prototypes/**/*.yml")? {
        let entry = entry?;
        println!("Reading prototype file {}", entry.display());
        let proto = std::fs::read_to_string(&entry)
            .context(format!("Error reading {}", entry.display()))?;
        // fuck whoever thought BOM on UTF-8 was a good idea
        let proto = proto.strip_prefix("\u{FEFF}").unwrap_or(&proto);
        let proto = yaml_rust2::YamlLoader::load_from_str(proto)
            .context(format!("Error reading {}", entry.display()))?;
        if proto.is_empty() {
            continue;
        }
        assert_eq!(proto.len(), 1);
        let proto = proto.into_iter().next().unwrap();
        for prototype in proto.into_vec().ok_or(eyre!(
            "Prototype yml {} isn't a list of prototypes?",
            entry.display()
        ))? {
            let kind = prototype["type"].as_str().ok_or(eyre!(
                "Prototype yml {} isn't a list of prototypes?",
                entry.display()
            ))?;
            match kind {
                "entity" => {
                    let id = prototype["id"].as_str().ok_or(eyre!(
                        "Prototype yml {} has an entity without an id?",
                        entry.display()
                    ))?;
                    let components = prototype["components"]
                        .as_vec()
                        .map(Vec::as_slice)
                        .unwrap_or_default();
                    for component in components {
                        if component["type"].as_str() == Some("Extractable") {
                            let reagents = if let Some(solution) = component["grindableSolutionName"].as_str() {
                                let solutions = components.iter().find(|&e| e["type"].as_str() == Some("SolutionContainerManager")).unwrap_or(&Yaml::BadValue);
                                &solutions["solutions"][solution]["reagents"]
                            } else {
                                &component["juiceSolution"]["reagents"]
                            };
                            let reagents = reagents
                                .as_vec()
                                .map(Vec::as_slice)
                                .unwrap_or_default();
                            recipes.push(Recipe::Grind {
                                id: id.to_owned(),
                                name: prototype["name"].as_str().unwrap_or(id).to_owned(),
                                description: prototype["description"]
                                    .as_str()
                                    .unwrap_or(id)
                                    .to_owned(),
                                results: reagents
                                    .iter()
                                    .filter_map(|reagent| {
                                        Some(ReagentWithAmount {
                                            reagent_id: reagent["ReagentId"].as_str()?.to_owned(),
                                            amount: reagent["Quantity"].as_f64_alt()?,
                                        })
                                    })
                                    .collect(),
                            });
                        }
                    }
                }
                "reagent" => {
                    let id = prototype["id"].as_str().ok_or(eyre!(
                        "Prototype yml {} has a reagent without an id?",
                        entry.display()
                    ))?;
                    let parent = prototype["parent"].as_str();
                    let mut parent_data = parent.and_then(|parent| abstract_reagents.get(parent));
                    if parent_data
                        .and_then(|parent| parent.parent.as_deref())
                        .is_some()
                    {
                        parent_data = None;
                    }
                    let mut errors = vec![];
                    let name = prototype["name"].as_str().unwrap_or(id);
                    let name = bundle
                        .get_message(name)
                        .and_then(|msg| msg.value())
                        .map(|pattern| bundle.format_pattern(pattern, None, &mut errors))
                        .or(parent_data
                            .and_then(|parent| parent.name.as_deref().map(Cow::Borrowed)));
                    let group = prototype["group"]
                        .as_str()
                        .or(parent_data.and_then(|parent| parent.group.as_deref()));
                    let desc = prototype["desc"].as_str().unwrap_or(id);
                    let desc = bundle
                        .get_message(desc)
                        .and_then(|msg| msg.value())
                        .map(|pattern| bundle.format_pattern(pattern, None, &mut errors))
                        .or(parent_data
                            .and_then(|parent| parent.desc.as_deref().map(Cow::Borrowed)));
                    let physical_desc = prototype["physicalDesc"].as_str().unwrap_or(id);
                    let physical_desc = bundle
                        .get_message(physical_desc)
                        .and_then(|msg| msg.value())
                        .map(|pattern| bundle.format_pattern(pattern, None, &mut errors))
                        .or(parent_data
                            .and_then(|parent| parent.physical_desc.as_deref().map(Cow::Borrowed)));
                    let color = prototype["color"]
                        .as_str()
                        .or(parent_data.and_then(|parent| parent.color.as_deref()));
                    let is_abstract = prototype["abstract"].as_bool() == Some(true);
                    abstract_reagents.insert(
                        id.to_owned(),
                        AbstractReagent {
                            id: id.to_owned(),
                            is_abstract,
                            parent: if parent_data.is_some() {
                                None
                            } else {
                                parent.map(ToOwned::to_owned)
                            },
                            name: name.map(Cow::into_owned),
                            group: group.map(ToOwned::to_owned),
                            desc: desc.map(Cow::into_owned),
                            physical_desc: physical_desc.map(Cow::into_owned),
                            color: color.map(ToOwned::to_owned),
                        },
                    );
                }
                "reaction" => {
                    let id = prototype["id"].as_str().ok_or(eyre!(
                        "Prototype yml {} has a reaction without an id?",
                        entry.display()
                    ))?;
                    let mut reactants = vec![];
                    let mut products = vec![];
                    for (reactant, amount) in prototype["reactants"]
                        .as_hash()
                        .ok_or(eyre!("Reaction {id} has no reactants?"))?
                    {
                        let reactant = reactant
                            .as_str()
                            .ok_or(eyre!("Reaction {id} has an invalid reactant?"))?;
                        let amount = amount["amount"]
                            .as_f64_alt()
                            .ok_or(eyre!("Reaction {id} has an invalid reactant?"))?;
                        reactants.push(ReagentWithAmount {
                            reagent_id: reactant.to_owned(),
                            amount,
                        });
                    }
                    let Some(products_yaml) = prototype["products"].as_hash() else {
                        continue;
                    };
                    for (product, amount) in products_yaml {
                        let product = product
                            .as_str()
                            .ok_or(eyre!("Reaction {id} has an invalid product?"))?;
                        let amount = amount
                            .as_f64_alt()
                            .ok_or(eyre!("Reaction {id} has an invalid product?"))?;
                        products.push(ReagentWithAmount {
                            reagent_id: product.to_owned(),
                            amount,
                        });
                    }
                    let machines = prototype["requiredMixerCategories"]
                        .as_vec()
                        .map(Vec::as_slice)
                        .unwrap_or_default();
                    if machines.is_empty() {
                        recipes.push(Recipe::Reaction {
                            id: id.to_owned(),
                            machine: None,
                            min_temp: prototype["minTemp"].as_f64_alt(),
                            max_temp: prototype["maxTemp"].as_f64_alt(),
                            reactants,
                            results: products,
                        });
                    } else {
                        for machine in machines {
                            recipes.push(Recipe::Reaction {
                                id: id.to_owned(),
                                machine: Some(
                                    machine
                                        .as_str()
                                        .ok_or(eyre!("Reaction {id} has an invalid machine?"))?
                                        .to_owned(),
                                ),
                                min_temp: prototype["minTemp"].as_f64_alt(),
                                max_temp: prototype["maxTemp"].as_f64_alt(),
                                reactants: reactants.clone(),
                                results: products.clone(),
                            });
                        }
                    }
                }
                _ => {}
            }
        }
    }
    println!("Resolving reagent parents");
    loop {
        let mut changed = false;
        for key in abstract_reagents.keys().cloned().collect::<Vec<_>>() {
            let Some(value) = abstract_reagents.get(&key) else {
                continue;
            };
            if let AbstractReagent {
                id,
                is_abstract: false,
                parent: None,
                name: Some(name),
                group: Some(group),
                desc: Some(desc),
                physical_desc: Some(physical_desc),
                color: Some(color),
            } = value
            {
                reagents.push(Reagent {
                    id: id.clone(),
                    name: name.clone(),
                    group: group.clone(),
                    desc: desc.clone(),
                    physical_desc: physical_desc.clone(),
                    color: color.clone(),
                });
                abstract_reagents.get_mut(&key).unwrap().is_abstract = true;
                // abstract_reagents.remove(&key);
            } else {
                let Some(parent) = value.parent.clone() else {
                    continue;
                };
                if let [Some(value), Some(parent)] =
                    abstract_reagents.get_disjoint_mut([&key, &parent])
                {
                    if parent.parent.is_some() {
                        continue;
                    }
                    changed = true;
                    value.parent = None;
                    value.name = value.name.take().or(parent.name.clone());
                    value.group = value.group.take().or(parent.group.clone());
                    value.desc = value.desc.take().or(parent.desc.clone());
                    value.physical_desc =
                        value.physical_desc.take().or(parent.physical_desc.clone());
                    value.color = value.color.take().or(parent.color.clone());
                } else {
                    println!("Failed to resolve parent {parent}");
                }
            }
        }
        if !changed {
            break;
        }
    }
    for (_, value) in abstract_reagents {
        if !value.is_abstract {
            reagents.push(Reagent {
                id: value.id.clone(),
                name: value.name.unwrap_or(value.id.clone()),
                group: value.group.unwrap_or("Other".to_string()),
                desc: value.desc.unwrap_or("Unknown".to_string()),
                physical_desc: value.physical_desc.unwrap_or("unknown".to_string()),
                color: value.color.unwrap_or("#000000".to_string()),
            });
        }
    }
    println!("Writing data");
    serde_json::to_writer(
        std::fs::File::create("frontend/src/data.json")?,
        &CompleteData { reagents, recipes },
    )?;
    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct CompleteData {
    reagents: Vec<Reagent>,
    recipes: Vec<Recipe>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
enum Recipe {
    Grind {
        id: String,
        name: String,
        description: String,
        results: Vec<ReagentWithAmount>,
    },
    Reaction {
        id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        machine: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        min_temp: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        max_temp: Option<f64>,
        reactants: Vec<ReagentWithAmount>,
        results: Vec<ReagentWithAmount>,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ReagentWithAmount {
    reagent_id: String,
    amount: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct Reagent {
    id: String,
    name: String,
    group: String,
    desc: String,
    physical_desc: String,
    color: String,
}

#[derive(Debug, Clone)]
struct AbstractReagent {
    id: String,
    is_abstract: bool,
    parent: Option<String>,
    name: Option<String>,
    group: Option<String>,
    desc: Option<String>,
    physical_desc: Option<String>,
    color: Option<String>,
}

trait YamlExt {
    fn as_f64_alt(&self) -> Option<f64>;
}

impl YamlExt for Yaml {
    fn as_f64_alt(&self) -> Option<f64> {
        self.as_f64().or(self.as_i64().map(|v| v as f64))
    }
}
