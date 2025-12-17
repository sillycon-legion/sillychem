import reagentData from "./data.json";
export interface Reagent {
  id: string;
  name: string;
  group: string;
  desc: string;
  physical_desc: string;
  color: string;
  metabolisms?: Record<string, Metabolism>;
  plant_metabolisms?: ConditionalEffect[];
}

interface Metabolism {
  rate: number;
  effects: ConditionalEffect[];
}

type EffectCondition =
  | ReagentThresholdEffectCondition
  | TemperatureEffectCondition
  | TotalDamageEffectCondition
  | MetabolizerTypeEffectCondition
  | HasTagEffectCondition
  | MobStateConditionEffectCondition
  | HungerEffectCondition;

interface ReagentThresholdEffectCondition {
  type: "ReagentThreshold";
  reagent: string;
  min?: number;
  max?: number;
}

interface TemperatureEffectCondition {
  type: "Temperature";
  min?: number;
  max?: number;
}

interface TotalDamageEffectCondition {
  type: "TotalDamage";
  min?: number;
  max?: number;
}

interface MetabolizerTypeEffectCondition {
  type: "MetabolizerType";
  kinds: string[];
  whitelist: boolean;
}

interface HasTagEffectCondition {
  type: "HasTag";
  tag: string;
  whitelist: boolean;
}

interface MobStateConditionEffectCondition {
  type: "MobStateCondition";
  state: "Alive" | "Critical" | "Dead";
}

interface HungerEffectCondition {
  type: "Hunger";
  min?: number;
  max?: number;
}

type Effect =
  | SatiateHungerEffect
  | SatiateThirstEffect
  | HealthChangeEffect
  | EvenHealthChangeEffect
  | ChemVomitEffect
  | AdjustReagentEffect
  | JitterEffect
  | ElectrocuteEffect
  | ModifyStatusEffectEffect
  | MovespeedModifierEffect
  | DrunkEffect
  | CauseZombieInfectionEffect
  | CureZombieInfectionEffect
  | ModifyBloodLevelEffect
  | FlammableReactionEffect
  | ModifyBleedAmountEffect
  | AdjustTemperatureEffect
  | ChemCleanBloodstreamEffect
  | PolymorphEffect
  | ResetNarcolepsyEffect
  | IgniteEffect
  | ReduceRottingEffect
  | ChemHealEyeDamageEffect
  | MakeSentientEffect
  | PlantAdjustNutritionEffect
  | PlantAdjustWaterEffect
  | PlantAdjustToxinsEffect
  | PlantAdjustWeedsEffect
  | PlantAdjustHealthEffect
  | PlantAdjustMutationLevelEffect
  | PlantAdjustMutationModEffect
  | PlantAdjustPestsEffect
  | PlantAdjustPotencyEffect
  | PlantAffectGrowthEffect
  | PlantRestoreSeedsEffect
  | PlantPhalanximineEffect
  | PlantCryoxadoneEffect
  | PlantDiethylamineEffect
  | PlantRobustHarvestEffect
  | PlantMutateChemicalsEffect
  | ReactionExplosionEffect
  | ReactionFoamOrSmokeEffect
  | ReactionEmpEffect
  | ReactionFlashEffect
  | ReactionCreateEntityEffect
  | ReactionCreateGasEffect;

interface SatiateHungerEffect {
  type: "SatiateHunger";
  relative: number;
}

interface SatiateThirstEffect {
  type: "SatiateThirst";
  relative: number;
}

interface HealthChangeEffect {
  type: "HealthChange";
  damages: Record<string, number>;
}

interface EvenHealthChangeEffect {
  type: "EvenHealthChange";
  damages: Record<string, number>;
}

interface ChemVomitEffect {
  type: "ChemVomit";
}

interface AdjustReagentEffect {
  type: "AdjustReagent";
  by: number;
  reagent: string;
}

interface JitterEffect {
  type: "Jitter";
}

interface ElectrocuteEffect {
  type: "Electrocute";
  time: number;
}

interface ModifyStatusEffectEffect {
  type: "ModifyStatusEffect";
  effect: string;
  action: "Add" | "Remove" | "Set" | "Update";
  time: number;
}

interface MovespeedModifierEffect {
  type: "MovespeedModifier";
  walk: number;
  run: number;
  time: number;
}

interface DrunkEffect {
  type: "Drunk";
}

interface CauseZombieInfectionEffect {
  type: "CauseZombieInfection";
}

interface CureZombieInfectionEffect {
  type: "CureZombieInfection";
  innoculate: boolean;
}

interface ModifyBloodLevelEffect {
  type: "ModifyBloodLevel";
  amount: number;
}

interface FlammableReactionEffect {
  type: "FlammableReaction";
}

interface ModifyBleedAmountEffect {
  type: "ModifyBleedAmount";
  amount: number;
}

interface AdjustTemperatureEffect {
  type: "AdjustTemperature";
  amount: number;
}

interface ChemCleanBloodstreamEffect {
  type: "ChemCleanBloodstream";
}

interface PolymorphEffect {
  type: "Polymorph";
  target: string;
}

interface ResetNarcolepsyEffect {
  type: "ResetNarcolepsy";
}

interface IgniteEffect {
  type: "Ignite";
}

interface ReduceRottingEffect {
  type: "ReduceRotting";
  amount: number;
}

interface ChemHealEyeDamageEffect {
  type: "ChemHealEyeDamage";
  amount: number;
}

interface MakeSentientEffect {
  type: "MakeSentient";
}

interface PlantAdjustNutritionEffect {
  type: "PlantAdjustNutrition";
  amount: number;
}

interface PlantAdjustWaterEffect {
  type: "PlantAdjustWater";
  amount: number;
}

interface PlantAdjustToxinsEffect {
  type: "PlantAdjustToxins";
  amount: number;
}

interface PlantAdjustWeedsEffect {
  type: "PlantAdjustWeeds";
  amount: number;
}

interface PlantAdjustHealthEffect {
  type: "PlantAdjustHealth";
  amount: number;
}

interface PlantAdjustMutationLevelEffect {
  type: "PlantAdjustMutationLevel";
  amount: number;
}

interface PlantAdjustMutationModEffect {
  type: "PlantAdjustMutationMod";
  amount: number;
}

interface PlantAdjustPestsEffect {
  type: "PlantAdjustPests";
  amount: number;
}

interface PlantAdjustPotencyEffect {
  type: "PlantAdjustPotency";
  amount: number;
}

interface PlantAffectGrowthEffect {
  type: "PlantAffectGrowth";
  amount: number;
}

interface PlantRestoreSeedsEffect {
  type: "PlantRestoreSeeds";
}

interface PlantPhalanximineEffect {
  type: "PlantPhalanximine";
}

interface PlantCryoxadoneEffect {
  type: "PlantCryoxadone";
}

interface PlantDiethylamineEffect {
  type: "PlantDiethylamine";
}

interface PlantRobustHarvestEffect {
  type: "PlantRobustHarvest";
  potency_limit: number;
  potency_increase: number;
  potency_seedless_threshold: number;
}

interface PlantMutateChemicalsEffect {
  type: "PlantMutateChemicals";
  fills: {
    quantity: number;
    weight: number;
    reagents: string[];
  }[];
}

interface ReactionExplosionEffect {
  type: "ReactionExplosion";
}

interface ReactionFoamOrSmokeEffect {
  type: "ReactionFoamOrSmoke";
  duration: number;
}

interface ReactionEmpEffect {
  type: "ReactionEmp";
}

interface ReactionFlashEffect {
  type: "ReactionFlash";
}

interface ReactionCreateEntityEffect {
  type: "ReactionCreateEntity";
  name: string;
  amount: number;
}

interface ReactionCreateGasEffect {
  type: "ReactionCreateGas";
  name: string;
  amount: number;
}

export interface ConditionalEffect {
  conditions?: EffectCondition[];
  probability: number;
  effect: Effect;
}

export type Recipe = GrindRecipe | ReactionRecipe;

interface GrindRecipe {
  type: "Grind";
  id: string;
  name: string;
  description: string;
  results: ReagentWithAmount[];
}

export interface ReactionRecipe {
  type: "Reaction";
  id: string;
  machine?: string;
  min_temp?: number;
  max_temp?: number;
  reactants: ReagentWithAmount[];
  results?: ReagentWithAmount[];
  catalysts?: ReagentWithAmount[];
  effects?: ConditionalEffect[];
}

export interface ReagentWithAmount {
  reagent_id: string;
  amount: number;
}

interface CompleteData {
  reagents: Reagent[];
  recipes: Recipe[];
}

export default reagentData as CompleteData;
