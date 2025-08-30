use std::{
    borrow::Cow,
    collections::{BTreeMap, HashMap},
};

use eyre::{Context, Result, eyre};
use fluent_bundle::{FluentArgs, FluentBundle, FluentResource, FluentValue};
use glob::glob;
use saphyr::{LoadableYamlNode, Yaml, YamlOwned};
use serde::{Deserialize, Serialize};
use unic_langid::langid;

fn main() -> Result<()> {
    color_eyre::install()?;
    let langid_en = langid!("en-US");
    let mut bundle = FluentBundle::new(vec![langid_en]);
    bundle.add_builtins()?;
    bundle.add_function("NATURALPERCENT", |positional, _named| match positional {
        [FluentValue::Number(num)] => FluentValue::from(format!("{}%", num.value * 100.)),
        [FluentValue::Number(num), FluentValue::Number(prec)] => {
            let num = format!("{:.1$}", num.value * 100., prec.value as usize);
            let mut num = num.as_str();
            while let Some(new) = num.strip_suffix('0') {
                num = new;
            }
            FluentValue::from(format!("{}%", num.strip_suffix('.').unwrap_or(num)))
        }
        _ => FluentValue::Error,
    })?;
    bundle.add_function("NATURALFIXED", |positional, _named| match positional {
        [FluentValue::Number(num)] => FluentValue::from(format!("{}", num.value)),
        [FluentValue::Number(num), FluentValue::Number(prec)] => {
            let num = format!("{:.1$}", num.value, prec.value as usize);
            let mut num = num.as_str();
            while let Some(new) = num.strip_suffix('0') {
                num = new;
            }
            FluentValue::from(num.strip_suffix('.').unwrap_or(num).to_owned())
        }
        _ => FluentValue::Error,
    })?;
    bundle.add_function("MANY", |positional, _named| match positional {
        [FluentValue::String(noun), FluentValue::Number(count)] => {
            if (count.value - 1.0).abs() < 0.0001 {
                FluentValue::String(noun.clone())
            } else {
                let (first, rest) = noun
                    .split_once(' ')
                    .map_or_else(|| (noun as &str, None), |(a, b)| (a, Some(b)));
                FluentValue::from(
                    if first.ends_with('s')
                        || first.ends_with("sh")
                        || first.ends_with("ch")
                        || first.ends_with('x')
                        || first.ends_with('z')
                    {
                        if let Some(rest) = rest {
                            format!("{first}es {rest}")
                        } else {
                            format!("{first}es")
                        }
                    } else if let Some(rest) = rest {
                        format!("{first}s {rest}")
                    } else {
                        format!("{first}s")
                    },
                )
            }
        }
        _ => FluentValue::Error,
    })?;
    bundle.add_function("MAKEPLURAL", |positional, _named| match positional {
        [FluentValue::String(noun)] => {
            let (first, rest) = noun
                .split_once(' ')
                .map_or_else(|| (noun as &str, None), |(a, b)| (a, Some(b)));
            FluentValue::from(
                if first.ends_with('s')
                    || first.ends_with("sh")
                    || first.ends_with("ch")
                    || first.ends_with('x')
                    || first.ends_with('z')
                {
                    if let Some(rest) = rest {
                        format!("{first}es {rest}")
                    } else {
                        format!("{first}es")
                    }
                } else if let Some(rest) = rest {
                    format!("{first}s {rest}")
                } else {
                    format!("{first}s")
                },
            )
        }
        _ => FluentValue::Error,
    })?;
    // This is wrong, but the ftl is wrong so it cancels out to being close to right
    bundle.add_function("INDEFINITE", |positional, _named| match positional {
        [FluentValue::String(noun)] => FluentValue::String(noun.clone()),
        _ => FluentValue::Error,
    })?;
    println!("Reading translations");
    for entry in glob("space-station-14/Resources/Locale/en-US/**/*.ftl")? {
        let entry = entry?;
        let res = std::fs::read_to_string(&entry)
            .context(format!("Error reading {}", entry.display()))?;
        // fuck whoever thought BOM on UTF-8 was a good idea
        let res = res.strip_prefix("\u{FEFF}").unwrap_or(&res);
        let res = match FluentResource::try_new(res.to_owned()) {
            Ok(res) => res,
            Err((res, errors)) => {
                eprintln!(
                    "Error parsing {}: {}",
                    entry.display(),
                    errors
                        .into_iter()
                        .map(|e| e.to_string())
                        .collect::<Vec<_>>()
                        .join(", ")
                );
                res
            }
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
    let mut abstract_entities: HashMap<String, AbstractEntity> = HashMap::new();
    let mut damage_groups: HashMap<String, DamageGroup> = HashMap::new();
    let mut damage_types: HashMap<String, String> = HashMap::new();
    let mut metabolizer_types: HashMap<String, String> = HashMap::new();
    let mut polymorphs: HashMap<String, String> = HashMap::new();
    let mut recipes = vec![];
    let mut reagents = vec![];
    println!("Reading prototypes");
    for entry in glob("space-station-14/Resources/Prototypes/**/*.yml")? {
        let entry = entry?;
        let proto = std::fs::read_to_string(&entry)
            .context(format!("Error reading {}", entry.display()))?;
        // fuck whoever thought BOM on UTF-8 was a good idea
        let proto = proto.strip_prefix("\u{FEFF}").unwrap_or(&proto);
        let proto = saphyr::Yaml::load_from_str(proto)
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
            let kind = prototype.index("type").as_str().ok_or(eyre!(
                "Prototype yml {} isn't a list of prototypes?",
                entry.display()
            ))?;
            match kind {
                "entity" => {
                    let id = prototype.index("id").as_str().ok_or(eyre!(
                        "Prototype yml {} has an entity without an id?",
                        entry.display()
                    ))?;
                    abstract_entities.insert(
                        id.to_owned(),
                        AbstractEntity {
                            id: id.to_owned(),
                            is_abstract: prototype.index("abstract").as_bool() == Some(true),
                            parent: prototype.index("parent").as_str().map(ToOwned::to_owned),
                            name: prototype.index("name").as_str().map(ToOwned::to_owned),
                            desc: prototype.index("desc").as_str().map(ToOwned::to_owned),
                            components: prototype
                                .index("components")
                                .as_vec()
                                .map(|e| e.iter().map(|e| e.clone().owned()).collect())
                                .unwrap_or_default(),
                        },
                    );
                }
                "reagent" => {
                    let id = prototype.index("id").as_str().ok_or(eyre!(
                        "Prototype yml {} has a reagent without an id?",
                        entry.display()
                    ))?;
                    let parent = prototype.index("parent").as_str();
                    let mut parent_data = parent.and_then(|parent| abstract_reagents.get(parent));
                    if parent_data
                        .and_then(|parent| parent.parent.as_deref())
                        .is_some()
                    {
                        parent_data = None;
                    }
                    let name = prototype
                        .index("name")
                        .as_str()
                        .and_then(|name| bundle.loc(name, None).ok())
                        .or(parent_data
                            .and_then(|parent| parent.name.as_deref().map(Cow::Borrowed)));
                    let group = prototype
                        .index("group")
                        .as_str()
                        .or(parent_data.and_then(|parent| parent.group.as_deref()));
                    let desc = prototype
                        .index("desc")
                        .as_str()
                        .and_then(|name| bundle.loc(name, None).ok())
                        .or(parent_data
                            .and_then(|parent| parent.desc.as_deref().map(Cow::Borrowed)));
                    let physical_desc = prototype
                        .index("physicalDesc")
                        .as_str()
                        .and_then(|name| bundle.loc(name, None).ok())
                        .or(parent_data
                            .and_then(|parent| parent.physical_desc.as_deref().map(Cow::Borrowed)));
                    let color = prototype
                        .index("color")
                        .as_str()
                        .or(parent_data.and_then(|parent| parent.color.as_deref()));
                    let is_abstract = prototype.index("abstract").as_bool() == Some(true);
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
                            metabolisms: vec![prototype.index("metabolisms").clone().owned()],
                            plant_metabolisms: prototype
                                .index("plantMetabolism")
                                .as_vec()
                                .map(|e| e.iter().map(|e| e.clone().owned()).collect())
                                .unwrap_or_default(),
                        },
                    );
                }
                "damageGroup" => {
                    let id = prototype.index("id").as_str().ok_or(eyre!(
                        "Prototype yml {} has a damage group without an id?",
                        entry.display()
                    ))?;
                    damage_groups.insert(
                        id.to_owned(),
                        DamageGroup {
                            id: id.to_owned(),
                            name: bundle
                                .loc(
                                    prototype
                                        .index("name")
                                        .as_str()
                                        .ok_or(eyre!("Damage group {id} has no name?"))?,
                                    None,
                                )?
                                .to_string(),
                            types: prototype
                                .index("damageTypes")
                                .as_vec()
                                .map(|e| {
                                    e.iter()
                                        .filter_map(Yaml::as_str)
                                        .map(ToOwned::to_owned)
                                        .collect()
                                })
                                .unwrap_or_default(),
                        },
                    );
                }
                "damageType" => {
                    let id = prototype.index("id").as_str().ok_or(eyre!(
                        "Prototype yml {} has a damage type without an id?",
                        entry.display()
                    ))?;
                    damage_types.insert(
                        id.to_owned(),
                        bundle
                            .loc(
                                prototype
                                    .index("name")
                                    .as_str()
                                    .ok_or(eyre!("Damage type {id} has no name?"))?,
                                None,
                            )?
                            .to_string(),
                    );
                }
                "metabolizerType" => {
                    let id = prototype.index("id").as_str().ok_or(eyre!(
                        "Prototype yml {} has a metabolizer type without an id?",
                        entry.display()
                    ))?;
                    metabolizer_types.insert(
                        id.to_owned(),
                        bundle
                            .loc(
                                prototype
                                    .index("name")
                                    .as_str()
                                    .ok_or(eyre!("Metabolizer type {id} has no name?"))?,
                                None,
                            )?
                            .to_string(),
                    );
                }
                "polymorph" => {
                    let id = prototype.index("id").as_str().ok_or(eyre!(
                        "Prototype yml {} has a polymorph without an id?",
                        entry.display()
                    ))?;
                    polymorphs.insert(
                        id.to_owned(),
                        prototype
                            .index("configuration")
                            .index("entity")
                            .as_str()
                            .ok_or(eyre!("Polymorph {id} has no target?"))?
                            .to_string(),
                    );
                }
                _ => {}
            }
        }
    }
    println!("Resolving entity parents");
    loop {
        let mut changed = false;
        for key in abstract_entities.keys().cloned().collect::<Vec<_>>() {
            let Some(value) = abstract_entities.get(&key) else {
                continue;
            };
            let Some(parent) = value.parent.clone() else {
                continue;
            };
            if let [Some(value), Some(parent)] = abstract_entities.get_disjoint_mut([&key, &parent])
            {
                if parent.parent.is_some() {
                    continue;
                }
                changed = true;
                value.parent = None;
                value.name = value.name.take().or(parent.name.clone());
                value.desc = value.desc.take().or(parent.desc.clone());
                value.components.extend_from_slice(&parent.components);
            } else {
                println!("Failed to resolve parent {parent}");
            }
        }
        if !changed {
            break;
        }
    }
    for (_, value) in abstract_entities.iter() {
        if !value.is_abstract {
            for component in &value.components {
                if component.index("type").as_str() == Some("Extractable") {
                    let reagents = if let Some(solution) =
                        component.index("grindableSolutionName").as_str()
                    {
                        let solutions = value
                            .components
                            .iter()
                            .find(|&e| e.index("type").as_str() == Some("SolutionContainerManager"))
                            .unwrap_or(&YamlOwned::BadValue);
                        &solutions
                            .index("solutions")
                            .index(solution)
                            .index("reagents")
                    } else {
                        &component.index("juiceSolution").index("reagents")
                    };
                    let reagents = reagents.as_vec().map(Vec::as_slice).unwrap_or_default();
                    recipes.push(Recipe::Grind {
                        id: value.id.clone(),
                        name: value.name.clone().unwrap_or(value.id.clone()),
                        description: value.desc.clone().unwrap_or(value.id.clone()),
                        results: reagents
                            .iter()
                            .filter_map(|reagent| {
                                Some(ReagentWithAmount {
                                    reagent_id: reagent.index("ReagentId").as_str()?.to_owned(),
                                    amount: reagent.index("Quantity").as_f64_alt()?,
                                })
                            })
                            .collect(),
                    });
                    break;
                }
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
            let Some(parent) = value.parent.clone() else {
                continue;
            };
            if let [Some(value), Some(parent)] = abstract_reagents.get_disjoint_mut([&key, &parent])
            {
                if parent.parent.is_some() {
                    continue;
                }
                changed = true;
                value.parent = None;
                value.name = value.name.take().or(parent.name.clone());
                value.group = value.group.take().or(parent.group.clone());
                value.desc = value.desc.take().or(parent.desc.clone());
                value.physical_desc = value.physical_desc.take().or(parent.physical_desc.clone());
                value.color = value.color.take().or(parent.color.clone());
                value.metabolisms.extend_from_slice(&parent.metabolisms);
                value
                    .plant_metabolisms
                    .extend_from_slice(&parent.plant_metabolisms);
            } else {
                println!("Failed to resolve parent {parent}");
            }
        }
        if !changed {
            break;
        }
    }
    for (_, value) in abstract_reagents.iter() {
        if !value.is_abstract {
            let id = &value.id;
            let mut metabolisms = BTreeMap::new();
            let mut tombstones = vec![];
            for metabolism in &value.metabolisms {
                let Some(metabolism) = metabolism.as_mapping() else {
                    continue;
                };
                for (kind, effects) in metabolism {
                    let Some(kind) = kind.as_str() else {
                        continue;
                    };
                    if metabolisms.contains_key(kind) {
                        continue;
                    }
                    let mut parsed_effects = Vec::new();
                    for effect in effects
                        .index("effects")
                        .as_vec()
                        .map(Vec::as_slice)
                        .unwrap_or_default()
                    {
                        if let Some(parsed) = ConditionalEffect::parse_from_yaml(
                            id,
                            effect.into(),
                            &bundle,
                            &damage_groups,
                            &damage_types,
                            &abstract_reagents,
                            &abstract_entities,
                            &metabolizer_types,
                            &polymorphs,
                        )? {
                            parsed_effects.push(parsed);
                        }
                    }
                    if parsed_effects.is_empty() {
                        tombstones.push(kind.to_string());
                    }
                    metabolisms.insert(
                        kind.to_string(),
                        Metabolism {
                            rate: effects.index("metabolismRate").as_f64_alt().unwrap_or(0.5),
                            effects: parsed_effects,
                        },
                    );
                }
            }
            for tombstone in tombstones {
                metabolisms.remove(&tombstone);
            }
            let mut plant_metabolisms = vec![];
            for effect in &value.plant_metabolisms {
                if let Some(parsed) = ConditionalEffect::parse_from_yaml(
                    id,
                    effect.into(),
                    &bundle,
                    &damage_groups,
                    &damage_types,
                    &abstract_reagents,
                    &abstract_entities,
                    &metabolizer_types,
                    &polymorphs,
                )? {
                    plant_metabolisms.push(parsed);
                }
            }
            let value = value.clone();
            reagents.push(Reagent {
                id: value.id.clone(),
                name: value.name.unwrap_or(value.id.clone()),
                group: value.group.unwrap_or("Other".to_string()),
                desc: value.desc.unwrap_or("Unknown".to_string()),
                physical_desc: value.physical_desc.unwrap_or("unknown".to_string()),
                color: value.color.unwrap_or("#000000".to_string()),
                metabolisms,
                plant_metabolisms,
            });
        }
    }
    println!("Reading prototypes again");
    for entry in glob("space-station-14/Resources/Prototypes/**/*.yml")? {
        let entry = entry?;
        let proto = std::fs::read_to_string(&entry)
            .context(format!("Error reading {}", entry.display()))?;
        // fuck whoever thought BOM on UTF-8 was a good idea
        let proto = proto.strip_prefix("\u{FEFF}").unwrap_or(&proto);
        let proto = saphyr::Yaml::load_from_str(proto)
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
            let kind = prototype.index("type").as_str().ok_or(eyre!(
                "Prototype yml {} isn't a list of prototypes?",
                entry.display()
            ))?;
            if kind == "reaction" {
                let id = prototype.index("id").as_str().ok_or(eyre!(
                    "Prototype yml {} has a reaction without an id?",
                    entry.display()
                ))?;
                let mut catalysts = vec![];
                let mut reactants = vec![];
                let mut products = vec![];
                for (reactant, reactant_data) in prototype
                    .index("reactants")
                    .as_mapping()
                    .ok_or(eyre!("Reaction {id} has no reactants?"))?
                {
                    let reactant = reactant
                        .as_str()
                        .ok_or(eyre!("Reaction {id} has an invalid reactant?"))?;
                    let amount = reactant_data
                        .index("amount")
                        .as_f64_alt()
                        .ok_or(eyre!("Reaction {id} has an invalid reactant?"))?;
                    if reactant_data.index("catalyst").as_bool() == Some(true) {
                        catalysts.push(ReagentWithAmount {
                            reagent_id: reactant.to_owned(),
                            amount,
                        });
                    } else {
                        reactants.push(ReagentWithAmount {
                            reagent_id: reactant.to_owned(),
                            amount,
                        });
                    }
                }
                if let Some(products_yaml) = prototype.index("products").as_mapping() {
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
                };
                let mut effects = vec![];
                for effect in prototype
                    .index("effects")
                    .as_vec()
                    .map(Vec::as_slice)
                    .unwrap_or_default()
                {
                    if let Some(parsed) = ConditionalEffect::parse_from_yaml(
                        id,
                        effect.clone(),
                        &bundle,
                        &damage_groups,
                        &damage_types,
                        &abstract_reagents,
                        &abstract_entities,
                        &metabolizer_types,
                        &polymorphs,
                    )? {
                        effects.push(parsed);
                    }
                }
                let machines = prototype
                    .index("requiredMixerCategories")
                    .as_vec()
                    .map(Vec::as_slice)
                    .unwrap_or_default();
                if machines.is_empty() {
                    recipes.push(Recipe::Reaction {
                        id: id.to_owned(),
                        machine: None,
                        min_temp: prototype.index("minTemp").as_f64_alt(),
                        max_temp: prototype.index("maxTemp").as_f64_alt(),
                        reactants,
                        results: products,
                        catalysts,
                        effects,
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
                            min_temp: prototype.index("minTemp").as_f64_alt(),
                            max_temp: prototype.index("maxTemp").as_f64_alt(),
                            reactants: reactants.clone(),
                            results: products.clone(),
                            catalysts: catalysts.clone(),
                            effects: effects.clone(),
                        });
                    }
                }
            }
        }
    }
    println!("Writing data");

    reagents.sort_unstable_by_key(|a| a.id.clone());
    recipes.sort_unstable_by_key(|a| {
        match a {
            Recipe::Grind { id, .. } => format!("{id}Grind"),
            Recipe::Reaction { id, .. } => format!("{id}Reaction"),
        }
        .clone()
    });
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
        #[serde(skip_serializing_if = "Vec::is_empty")]
        results: Vec<ReagentWithAmount>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        catalysts: Vec<ReagentWithAmount>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        effects: Vec<ConditionalEffect>,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ConditionalEffect {
    #[serde(skip_serializing_if = "Vec::is_empty")]
    conditions: Vec<EffectCondition>,
    probability: f64,
    effect: Effect,
}

impl ConditionalEffect {
    #[allow(clippy::too_many_arguments)]
    fn parse_from_yaml(
        id: &str,
        effect: Yaml<'_>,
        bundle: &FluentBundle<FluentResource>,
        damage_groups: &HashMap<String, DamageGroup>,
        damage_types: &HashMap<String, String>,
        abstract_reagents: &HashMap<String, AbstractReagent>,
        abstract_entities: &HashMap<String, AbstractEntity>,
        metabolizer_types: &HashMap<String, String>,
        polymorphs: &HashMap<String, String>,
    ) -> eyre::Result<Option<Self>> {
        let Some(saphyr::Tag { handle: _, suffix }) = effect.get_tag() else {
            return Ok(None);
        };
        let effect_desc = match suffix.as_str() {
            "type:SatiateHunger" => Effect::SatiateHunger {
                relative: effect.index("factor").as_f64_alt().unwrap_or(3.0) / 3.0,
            },
            "type:SatiateThirst" => Effect::SatiateThirst {
                relative: effect.index("factor").as_f64_alt().unwrap_or(3.0) / 3.0,
            },
            "type:HealthChange" => {
                let mut changes = HashMap::new();
                if let Some(types) = effect.index("damage").index("types").as_mapping() {
                    for (kind, amount) in types {
                        let Some(kind) = kind.as_str() else {
                            continue;
                        };
                        let Some(amount) = amount.as_f64_alt() else {
                            continue;
                        };
                        let amount = (amount * 100.0).ceil() as i64;
                        changes.insert(kind, changes.get(kind).copied().unwrap_or(0) + amount);
                    }
                }
                if let Some(groups) = effect.index("damage").index("groups").as_mapping() {
                    for (kind, amount) in groups {
                        let Some(kind) = kind.as_str() else {
                            continue;
                        };
                        let Some(amount) = amount.as_f64_alt() else {
                            continue;
                        };
                        let mut amount = (amount * 100.0).ceil() as i64;
                        let Some(members) = damage_groups.get(kind) else {
                            continue;
                        };
                        for (i, kind) in members.types.iter().enumerate() {
                            let remaining = (members.types.len() - i) as i64;
                            let taken = amount / remaining;
                            changes.insert(
                                kind,
                                changes.get(kind.as_str()).copied().unwrap_or(0) + taken,
                            );
                            amount -= taken;
                        }
                    }
                }
                let mut damages = BTreeMap::new();
                for (kind, change) in changes {
                    if change == 0 {
                        continue;
                    }
                    let kind = damage_types
                        .get(kind)
                        .ok_or(eyre!("Unknown damage type {kind} for effect in {id}"))?;
                    damages.insert(kind.clone(), change);
                }
                Effect::HealthChange { damages }
            }
            "type:EvenHealthChange" => {
                let mut damages = BTreeMap::new();
                if let Some(groups) = effect.index("damage").as_mapping() {
                    for (kind, amount) in groups {
                        let Some(kind) = kind.as_str() else {
                            continue;
                        };
                        let Some(amount) = amount.as_f64_alt() else {
                            continue;
                        };
                        let amount = (amount * 100.0).ceil() as i64;
                        let Some(group) = damage_groups.get(kind) else {
                            continue;
                        };
                        damages.insert(group.name.clone(), amount);
                    }
                }
                Effect::EvenHealthChange { damages }
            }
            "type:ChemVomit" => Effect::ChemVomit,
            "type:AdjustReagent" => Effect::AdjustReagent {
                by: effect
                    .index("amount")
                    .as_f64_alt()
                    .ok_or(eyre!("Missing AdjustReagent.amount for effect in {id}"))?,
                reagent: effect
                    .index("reagent")
                    .as_str()
                    .ok_or(eyre!("Missing AdjustReagent.reagent for effect in {id}"))?
                    .to_string(),
            },
            "type:Jitter" => Effect::Jitter,
            "type:Electrocute" => Effect::Electrocute {
                time: effect.index("electrocuteTime").as_f64_alt().unwrap_or(2.0),
            },
            "type:ModifyStatusEffect" => Effect::ModifyStatusEffect {
                effect: abstract_entities
                    .get(effect.index("effectProto").as_str().ok_or(eyre!(
                        "Missing ModifyStatusEffect.effectProto for effect in {id}"
                    ))?)
                    .map(|e| e.name.as_deref().unwrap_or(&e.id))
                    .ok_or(eyre!(
                        "Unknown ModifyStatusEffect.effectProto for effect in {id}"
                    ))?
                    .to_string(),
                action: match effect.index("type").as_str().unwrap_or("Add") {
                    "Add" => ModifyStatusEffectAction::Add,
                    "Remove" => ModifyStatusEffectAction::Remove,
                    "Set" => ModifyStatusEffectAction::Set,
                    unk => {
                        return Err(eyre!(
                            "Unknown ModifyStatusEffect.type {unk} for effect in {id}"
                        ));
                    }
                },
                time: effect.index("time").as_f64_alt().unwrap_or(2.0),
            },
            // Obsolete my ass
            "type:GenericStatusEffect" => Effect::ModifyStatusEffect {
                effect: bundle
                    .loc(
                        &format!(
                            "reagent-effect-status-effect-{}",
                            effect.index("key").as_str().ok_or(eyre!(
                                "Missing GenericStatusEffect.key for effect in {id}"
                            ))?
                        ),
                        None,
                    )?
                    .to_string(),
                action: match effect.index("type").as_str().unwrap_or("Add") {
                    "Add" => ModifyStatusEffectAction::Add,
                    "Remove" => ModifyStatusEffectAction::Remove,
                    "Set" => ModifyStatusEffectAction::Set,
                    unk => {
                        return Err(eyre!(
                            "Unknown ModifyStatusEffect.type {unk} for effect in {id}"
                        ));
                    }
                },
                time: effect.index("time").as_f64_alt().unwrap_or(2.0),
            },
            "type:MovespeedModifier" => Effect::MovespeedModifier {
                walk: effect
                    .index("walkSpeedModifier")
                    .as_f64_alt()
                    .unwrap_or(1.0),
                run: effect
                    .index("sprintSpeedModifier")
                    .as_f64_alt()
                    .unwrap_or(1.0),
                time: effect.index("statusLifetime").as_f64_alt().unwrap_or(2.0),
            },
            "type:CauseZombieInfection" => Effect::CauseZombieInfection,
            "type:CureZombieInfection" => Effect::CureZombieInfection {
                innoculate: effect.index("innoculate").as_bool() == Some(true),
            },
            "type:ModifyBloodLevel" => Effect::ModifyBloodLevel {
                amount: effect.index("amount").as_f64_alt().unwrap_or(1.0),
            },
            "type:FlammableReaction" => Effect::FlammableReaction,
            "type:ModifyBleedAmount" => Effect::ModifyBleedAmount {
                amount: effect.index("amount").as_f64_alt().unwrap_or(-1.0),
            },
            "type:AdjustTemperature" => Effect::AdjustTemperature {
                amount: effect.index("amount").as_f64_alt().unwrap_or(0.0),
            },
            "type:ChemCleanBloodstream" => Effect::ChemCleanBloodstream,
            "type:Polymorph" => Effect::Polymorph {
                target: polymorphs
                    .get(
                        effect
                            .index("prototype")
                            .as_str()
                            .ok_or(eyre!("Missing Polymorph.prototype for effect in {id}"))?,
                    )
                    .and_then(|e| abstract_entities.get(e))
                    .map(|e| e.name.as_deref().unwrap_or(&e.id))
                    .ok_or(eyre!("Unknown Polymorph.prototype for effect in {id}"))?
                    .to_string(),
            },
            "type:Drunk" => Effect::Drunk,
            "type:ResetNarcolepsy" => Effect::ResetNarcolepsy,
            "type:Ignite" => Effect::Ignite,
            "type:ReduceRotting" => Effect::ReduceRotting {
                amount: effect.index("seconds").as_f64_alt().unwrap_or(10.0),
            },
            "type:ChemHealEyeDamage" => Effect::ChemHealEyeDamage {
                amount: effect.index("amount").as_f64_alt().unwrap_or(-1.0),
            },
            "type:MakeSentient" => Effect::MakeSentient,
            "type:PlantAdjustNutrition" => Effect::PlantAdjustNutrition {
                amount: effect.index("amount").as_f64_alt().unwrap_or(1.0),
            },
            "type:PlantAdjustWater" => Effect::PlantAdjustWater {
                amount: effect.index("amount").as_f64_alt().unwrap_or(1.0),
            },
            "type:PlantAdjustToxins" => Effect::PlantAdjustToxins {
                amount: effect.index("amount").as_f64_alt().unwrap_or(1.0),
            },
            "type:PlantAdjustWeeds" => Effect::PlantAdjustWeeds {
                amount: effect.index("amount").as_f64_alt().unwrap_or(1.0),
            },
            "type:PlantAdjustHealth" => Effect::PlantAdjustHealth {
                amount: effect.index("amount").as_f64_alt().unwrap_or(1.0),
            },
            "type:PlantAdjustMutationLevel" => Effect::PlantAdjustMutationLevel {
                amount: effect.index("amount").as_f64_alt().unwrap_or(1.0),
            },
            "type:PlantAdjustMutationMod" => Effect::PlantAdjustMutationMod {
                amount: effect.index("amount").as_f64_alt().unwrap_or(1.0),
            },
            "type:PlantAdjustPests" => Effect::PlantAdjustPests {
                amount: effect.index("amount").as_f64_alt().unwrap_or(1.0),
            },
            "type:PlantAdjustPotency" => Effect::PlantAdjustPotency {
                amount: effect.index("amount").as_f64_alt().unwrap_or(1.0),
            },
            "type:PlantAffectGrowth" => Effect::PlantAffectGrowth {
                amount: effect.index("amount").as_f64_alt().unwrap_or(1.0),
            },
            "type:PlantRestoreSeeds" => Effect::PlantRestoreSeeds,
            "type:PlantPhalanximine" => Effect::PlantPhalanximine,
            "type:PlantCryoxadone" => Effect::PlantCryoxadone,
            "type:PlantDiethylamine" => Effect::PlantDiethylamine,
            "type:RobustHarvest" => Effect::PlantRobustHarvest {
                potency_limit: effect.index("potencyLimit").as_f64_alt().unwrap_or(50.0) as i64,
                potency_increase: effect.index("potencyIncrease").as_f64_alt().unwrap_or(3.0)
                    as i64,
                potency_seedless_threshold: effect
                    .index("potencySeedlessThreshold")
                    .as_f64_alt()
                    .unwrap_or(30.0) as i64,
            },
            "type:ExplosionReactionEffect" => Effect::ReactionExplosion,
            "type:AreaReactionEffect" => Effect::ReactionFoamOrSmoke {
                duration: effect.index("duration").as_f64_alt().unwrap_or(10.0),
            },
            "type:EmpReactionEffect" => Effect::ReactionEmp,
            "type:FlashReactionEffect" => Effect::ReactionFlash,
            "type:CreateEntityReactionEffect" => Effect::ReactionCreateEntity {
                name: effect
                    .index("entity")
                    .as_str()
                    .and_then(|e| abstract_entities.get(e))
                    .and_then(|e| e.name.as_ref())
                    .ok_or(eyre!("Failed to describe effects for {id}: unknown entity"))?
                    .to_string(),
                amount: effect.index("number").as_f64_alt().unwrap_or(1.0) as i64,
            },
            "type:CreateGas" => Effect::ReactionCreateGas {
                name: bundle
                    .loc(
                        &"gases"
                            .chars()
                            .chain(
                                effect
                                    .index("gas")
                                    .as_str()
                                    .ok_or(eyre!("Missing CreateGas.gas for effect in {id}"))?
                                    .chars()
                                    .flat_map(|e| {
                                        if e.is_uppercase() {
                                            "-".chars().chain(e.to_lowercase())
                                        } else {
                                            "".chars().chain(e.to_lowercase())
                                        }
                                    }),
                            )
                            .collect::<String>(),
                        None,
                    )?
                    .to_string(),
                amount: effect.index("multiplier").as_f64_alt().unwrap_or(3.0),
            },
            "type:Emote" => return Ok(None),
            "type:PopupMessage" => return Ok(None),
            "type:Oxygenate" => return Ok(None),
            "type:ModifyLungGas" => return Ok(None),
            "type:AdjustAlert" => return Ok(None),
            other => {
                return Err(eyre!("Unknown effect type {other} in {id}"));
            }
        };
        let mut conditions = vec![];
        for condition in effect
            .index("conditions")
            .as_vec()
            .map(Vec::as_slice)
            .unwrap_or_default()
        {
            let Some(saphyr::Tag { handle: _, suffix }) = condition.get_tag() else {
                continue;
            };
            conditions.push(match suffix.as_str() {
                "type:ReagentThreshold" => EffectCondition::ReagentThreshold {
                    reagent: condition
                        .index("reagent")
                        .as_str()
                        .unwrap_or(id)
                        .to_string(),
                    min: condition.index("min").as_f64_alt(),
                    max: condition.index("max").as_f64_alt(),
                },
                "type:Temperature" => EffectCondition::Temperature {
                    min: condition.index("min").as_f64_alt(),
                    max: condition.index("max").as_f64_alt(),
                },
                "type:TotalDamage" => EffectCondition::TotalDamage {
                    min: condition.index("min").as_f64_alt(),
                    max: condition.index("max").as_f64_alt(),
                },
                "type:OrganType" => {
                    EffectCondition::OrganType {
                        kind: metabolizer_types
                            .get(condition.index("type").as_str().ok_or(eyre!(
                                "Missing OrganType.type for effect condition in {id}"
                            ))?)
                            .ok_or(eyre!("Invalid OrganType.type for effect condition in {id}"))?
                            .to_string(),
                        whitelist: condition.index("shouldHave").as_bool() != Some(false),
                    }
                }
                "type:HasTag" => EffectCondition::HasTag {
                    tag: condition
                        .index("tag")
                        .as_str()
                        .ok_or(eyre!("Missing HasTag.tag for effect condition in {id}"))?
                        .to_string(),
                    whitelist: condition.index("invert").as_bool() != Some(true),
                },
                "type:MobStateCondition" => EffectCondition::MobStateCondition {
                    state: condition
                        .index("mobstate")
                        .as_str()
                        .unwrap_or("Alive")
                        .to_string(),
                },
                "type:Hunger" => EffectCondition::Hunger {
                    min: condition.index("min").as_f64_alt(),
                    max: condition.index("max").as_f64_alt(),
                },
                other => {
                    return Err(eyre!("Unknown condition type {other} in reaction {id}"));
                }
            });
        }
        let effect = ConditionalEffect {
            conditions,
            probability: effect.index("probability").as_f64_alt().unwrap_or(1.0),
            effect: effect_desc,
        };
        Ok(Some(effect))
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
enum EffectCondition {
    ReagentThreshold {
        reagent: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        min: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        max: Option<f64>,
    },
    Temperature {
        #[serde(skip_serializing_if = "Option::is_none")]
        min: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        max: Option<f64>,
    },
    TotalDamage {
        #[serde(skip_serializing_if = "Option::is_none")]
        min: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        max: Option<f64>,
    },
    OrganType {
        kind: String,
        whitelist: bool,
    },
    HasTag {
        tag: String,
        whitelist: bool,
    },
    MobStateCondition {
        state: String,
    },
    Hunger {
        #[serde(skip_serializing_if = "Option::is_none")]
        min: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        max: Option<f64>,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
enum Effect {
    SatiateHunger {
        relative: f64,
    },
    SatiateThirst {
        relative: f64,
    },
    HealthChange {
        damages: BTreeMap<String, i64>,
    },
    EvenHealthChange {
        damages: BTreeMap<String, i64>,
    },
    ChemVomit,
    AdjustReagent {
        by: f64,
        reagent: String,
    },
    Jitter,
    Electrocute {
        time: f64,
    },
    #[allow(clippy::enum_variant_names)]
    ModifyStatusEffect {
        effect: String,
        action: ModifyStatusEffectAction,
        time: f64,
    },
    MovespeedModifier {
        walk: f64,
        run: f64,
        time: f64,
    },
    Drunk,
    CauseZombieInfection,
    CureZombieInfection {
        innoculate: bool,
    },
    ModifyBloodLevel {
        amount: f64,
    },
    FlammableReaction,
    ModifyBleedAmount {
        amount: f64,
    },
    AdjustTemperature {
        amount: f64,
    },
    ChemCleanBloodstream,
    Polymorph {
        target: String,
    },
    ResetNarcolepsy,
    Ignite,
    ReduceRotting {
        amount: f64,
    },
    ChemHealEyeDamage {
        amount: f64,
    },
    MakeSentient,
    PlantAdjustNutrition {
        amount: f64,
    },
    PlantAdjustWater {
        amount: f64,
    },
    PlantAdjustToxins {
        amount: f64,
    },
    PlantAdjustWeeds {
        amount: f64,
    },
    PlantAdjustHealth {
        amount: f64,
    },
    PlantAdjustMutationLevel {
        amount: f64,
    },
    PlantAdjustMutationMod {
        amount: f64,
    },
    PlantAdjustPests {
        amount: f64,
    },
    PlantAdjustPotency {
        amount: f64,
    },
    PlantAffectGrowth {
        amount: f64,
    },
    PlantRestoreSeeds,
    PlantPhalanximine,
    PlantCryoxadone,
    PlantDiethylamine,
    PlantRobustHarvest {
        potency_limit: i64,
        potency_increase: i64,
        potency_seedless_threshold: i64,
    },
    ReactionExplosion,
    ReactionFoamOrSmoke {
        duration: f64,
    },
    ReactionEmp,
    ReactionFlash,
    ReactionCreateEntity {
        name: String,
        amount: i64,
    },
    ReactionCreateGas {
        name: String,
        amount: f64,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
enum ModifyStatusEffectAction {
    Add,
    Remove,
    Set,
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
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    metabolisms: BTreeMap<String, Metabolism>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    plant_metabolisms: Vec<ConditionalEffect>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct Metabolism {
    rate: f64,
    effects: Vec<ConditionalEffect>,
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
    metabolisms: Vec<YamlOwned>,
    plant_metabolisms: Vec<YamlOwned>,
}

#[derive(Debug, Clone)]
struct DamageGroup {
    id: String,
    name: String,
    types: Vec<String>,
}

#[derive(Debug, Clone)]
struct AbstractEntity {
    id: String,
    is_abstract: bool,
    parent: Option<String>,
    name: Option<String>,
    desc: Option<String>,
    components: Vec<YamlOwned>,
}

trait FluentBundleExt {
    fn loc(&self, key: &str, args: Option<&FluentArgs>) -> Result<Cow<'_, str>>;
}

impl FluentBundleExt for FluentBundle<FluentResource> {
    fn loc(&self, key: &str, args: Option<&FluentArgs>) -> Result<Cow<'_, str>> {
        let message = self
            .get_message(key)
            .ok_or(eyre!("Invalid loc key {key}"))?;
        let value = message
            .value()
            .ok_or(eyre!("Could not get pattern for {key}"))?;
        let mut errors = vec![];
        let result = self.format_pattern(value, args, &mut errors);
        if !errors.is_empty() {
            return Err(eyre!(
                "Error localizing {key}: {}",
                errors
                    .into_iter()
                    .map(|e| e.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }
        Ok(result)
    }
}

trait YamlExt {
    fn index(&self, key: &str) -> &Self;
    fn as_f64_alt(&self) -> Option<f64>;
    fn owned(self) -> YamlOwned;
}

impl<'a> YamlExt for Yaml<'a> {
    fn as_f64_alt(&self) -> Option<f64> {
        self.as_floating_point()
            .or(self.as_integer().map(|v| v as f64))
    }

    fn index(&self, key: &str) -> &Yaml<'a> {
        self.get_tagged_node()
            .unwrap_or(self)
            .as_mapping_get(key)
            .unwrap_or(&Yaml::BadValue)
    }

    fn owned(self) -> YamlOwned {
        match self {
            Yaml::Representation(left, scalar_style, right) => YamlOwned::Representation(
                left.into_owned(),
                scalar_style,
                right.map(Cow::into_owned),
            ),
            Yaml::Value(scalar) => YamlOwned::Value(scalar.into_owned()),
            Yaml::Sequence(yamls) => {
                YamlOwned::Sequence(yamls.into_iter().map(|e| e.owned()).collect())
            }
            Yaml::Mapping(map) => YamlOwned::Mapping(
                map.into_iter()
                    .map(|(a, b)| (a.owned(), b.owned()))
                    .collect(),
            ),
            Yaml::Tagged(cow, yaml) => YamlOwned::Tagged(cow.into_owned(), Box::new(yaml.owned())),
            Yaml::Alias(v) => YamlOwned::Alias(v),
            Yaml::BadValue => YamlOwned::BadValue,
        }
    }
}

impl YamlExt for YamlOwned {
    fn as_f64_alt(&self) -> Option<f64> {
        self.as_floating_point()
            .or(self.as_integer().map(|v| v as f64))
    }

    fn index(&self, key: &str) -> &YamlOwned {
        self.get_tagged_node()
            .unwrap_or(self)
            .as_mapping_get(key)
            .unwrap_or(&YamlOwned::BadValue)
    }

    fn owned(self) -> YamlOwned {
        self
    }
}
