import type { Vector3 } from 'three';

export type TrophicLevel = 'producer' | 'herbivore' | 'carnivore' | 'decomposer';

export type OrganismState = 'idle' | 'wandering' | 'hunting' | 'fleeing' | 'eating' | 'reproducing';

export interface Species {
  id: string;
  name: string;
  emoji: string;
  trophicLevel: TrophicLevel;
  color: string;
  description: string;
  habitat: 'water' | 'land' | 'both';
  diet: string[];
  predators: string[];
  reproductionRate: number;
  lifespan: number;
  speed: number;
  size: number;
  energyValue: number;
  maxPopulation: number;
  /** 夜间发光生物（如分解菌），黑暗中会增强发光、夜间更活跃 */
  bioluminescent?: boolean;
}

export interface Organism {
  id: string;
  speciesId: string;
  position: Vector3;
  velocity: Vector3;
  energy: number;
  age: number;
  state: OrganismState;
  targetId: string | null;
  rotation: number;
  scale: number;
}

export interface EcosystemStats {
  time: number;
  isRunning: boolean;
  balanceIndex: number;
  populationBySpecies: Record<string, number>;
  totalOrganisms: number;
  dayPhase: number;
  daylight: number;
  dayNightEnabled: boolean;
  isNight: boolean;
}

export interface FoodChainRelation {
  predatorId: string;
  preyId: string;
}
