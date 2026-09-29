import * as THREE from 'three';
import type { Organism } from '@/types/ecosystem';
import { getSpeciesById, SPECIES } from '@/data/species';
import { AQUARIUM_BOUNDS } from '@/store/useEcosystemStore';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 模拟单步所需的昼夜上下文。
 * daylight 为当前帧的日照强度 0..1（由调用方按模拟帧计算，保证与相位同步）。
 */
export interface SimulationContext {
  daylight: number;
}

/**
 * 生产者夜间只进行基础呼吸、白天光合增益随日照提升。
 * 返回的净能量变化 = 光合作用 - 呼吸消耗。
 */
function producerNetEnergyGain(daylight: number): number {
  const photosynthesis = clamp(daylight, 0, 1) * 0.18;
  const respiration = 0.02;
  return photosynthesis - respiration;
}

/**
 * 生物活跃度，用于缩放移动速度，体现昼夜行为差异：
 * - 发光生物（分解菌）夜间更活跃
 * - 其余生物夜间活动略微放缓
 */
function getActivityFactor(trophicLevel: string, bioluminescent: boolean | undefined, daylight: number): number {
  const darkness = 1 - clamp(daylight, 0, 1);
  if (bioluminescent) return 1 + darkness * 0.8;
  if (trophicLevel === 'decomposer') return 1;
  return 1 - darkness * 0.25;
}

/** 非生产者夜间降低代谢、节约能量 */
function consumerEnergyCost(baseCost: number, daylight: number): number {
  return baseCost * (0.4 + clamp(daylight, 0, 1) * 0.6);
}

function distance(a: THREE.Vector3, b: THREE.Vector3): number {
  return a.distanceTo(b);
}

function findNearestPrey(
  organism: Organism,
  allOrganisms: Organism[],
  excludedIds: Set<string>,
): Organism | null {
  const species = getSpeciesById(organism.speciesId);
  if (!species || species.diet.length === 0) return null;

  let nearest: Organism | null = null;
  let minDist = Infinity;

  for (const other of allOrganisms) {
    if (other.id === organism.id) continue;
    if (excludedIds.has(other.id)) continue;
    if (!species.diet.includes(other.speciesId)) continue;

    const dist = distance(organism.position, other.position);
    if (dist < minDist && dist < 3) {
      minDist = dist;
      nearest = other;
    }
  }

  return nearest;
}

function findNearestPredator(
  organism: Organism,
  allOrganisms: Organism[],
): Organism | null {
  const species = getSpeciesById(organism.speciesId);
  if (!species || species.predators.length === 0) return null;

  let nearest: Organism | null = null;
  let minDist = Infinity;

  for (const other of allOrganisms) {
    if (other.id === organism.id) continue;
    if (!species.predators.includes(other.speciesId)) continue;

    const dist = distance(organism.position, other.position);
    if (dist < minDist && dist < 2.5) {
      minDist = dist;
      nearest = other;
    }
  }

  return nearest;
}

function findNearestDead(
  organism: Organism,
  allOrganisms: Organism[],
  dyingIds: Set<string>,
): Organism | null {
  let nearest: Organism | null = null;
  let minDist = Infinity;

  for (const other of allOrganisms) {
    if (other.id === organism.id) continue;
    if (!dyingIds.has(other.id)) continue;

    const dist = distance(organism.position, other.position);
    if (dist < minDist && dist < 3) {
      minDist = dist;
      nearest = other;
    }
  }

  return nearest;
}

export function simulateStep(
  organisms: Organism[],
  context?: SimulationContext,
): {
  updates: { id: string; updates: Partial<Organism> }[];
  toRemove: string[];
  toAdd: { speciesId: string; position: THREE.Vector3 }[];
} {
  // 当前帧日照（0..1），由调用方依据昼夜相位计算；缺省视为白昼
  const daylight = clamp(context?.daylight ?? 1, 0, 1);
  const updates: Map<string, Partial<Organism>> = new Map();
  const toRemove: Set<string> = new Set();
  const toAdd: { speciesId: string; position: THREE.Vector3 }[] = [];
  const eatenPrey: Set<string> = new Set();

  for (const organism of organisms) {
    const species = getSpeciesById(organism.speciesId);
    if (!species) continue;

    let energy = organism.energy;
    const age = organism.age + 1;

    if (age >= species.lifespan || energy <= 0) {
      toRemove.add(organism.id);
      continue;
    }

    // 非生产者的基础代谢：夜间代谢放缓、能量消耗降低；生产者走光合作用分支
    if (species.trophicLevel !== 'producer') {
      energy -= consumerEnergyCost(0.05 + species.size * 0.02, daylight);
    }

    // 夜间活跃度影响实际移动速度（发光生物夜间更活跃）
    const activeSpeed =
      species.speed * getActivityFactor(species.trophicLevel, species.bioluminescent, daylight);

    const organismUpdate: Partial<Organism> = {};
    const newPosition = organism.position.clone();
    const newVelocity = organism.velocity.clone();

    if (species.trophicLevel === 'decomposer') {
      const deadOrganism = findNearestDead(organism, organisms, toRemove);

      if (deadOrganism && energy < species.energyValue * 0.8) {
        organismUpdate.state = 'hunting';
        organismUpdate.targetId = deadOrganism.id;
        const huntDir = new THREE.Vector3()
          .subVectors(deadOrganism.position, organism.position)
          .normalize();
        newVelocity.lerp(huntDir.multiplyScalar(activeSpeed), 0.1);

        if (distance(organism.position, deadOrganism.position) < species.size * 1.5) {
          energy += getSpeciesById(deadOrganism.speciesId)?.energyValue || 20;
          organismUpdate.state = 'eating';
        }
      } else {
        organismUpdate.state = 'wandering';
        if (Math.random() < 0.02) {
          newVelocity.set(
            (Math.random() - 0.5) * activeSpeed,
            (Math.random() - 0.5) * activeSpeed * 0.5,
            (Math.random() - 0.5) * activeSpeed,
          );
        }
      }

      newPosition.add(newVelocity);

      if (newPosition.x < AQUARIUM_BOUNDS.minX + 0.3) {
        newPosition.x = AQUARIUM_BOUNDS.minX + 0.3;
        newVelocity.x = Math.abs(newVelocity.x);
      }
      if (newPosition.x > AQUARIUM_BOUNDS.maxX - 0.3) {
        newPosition.x = AQUARIUM_BOUNDS.maxX - 0.3;
        newVelocity.x = -Math.abs(newVelocity.x);
      }
      if (newPosition.y < AQUARIUM_BOUNDS.minY + 0.2) {
        newPosition.y = AQUARIUM_BOUNDS.minY + 0.2;
        newVelocity.y = Math.abs(newVelocity.y);
      }
      if (newPosition.y > AQUARIUM_BOUNDS.maxY - 0.2) {
        newPosition.y = AQUARIUM_BOUNDS.maxY - 0.2;
        newVelocity.y = -Math.abs(newVelocity.y);
      }
      if (newPosition.z < AQUARIUM_BOUNDS.minZ + 0.3) {
        newPosition.z = AQUARIUM_BOUNDS.minZ + 0.3;
        newVelocity.z = Math.abs(newVelocity.z);
      }
      if (newPosition.z > AQUARIUM_BOUNDS.maxZ - 0.3) {
        newPosition.z = AQUARIUM_BOUNDS.maxZ - 0.3;
        newVelocity.z = -Math.abs(newVelocity.z);
      }

      organismUpdate.position = newPosition;
      organismUpdate.velocity = newVelocity;
      if (Math.abs(newVelocity.x) > 0.001 || Math.abs(newVelocity.z) > 0.001) {
        organismUpdate.rotation = Math.atan2(newVelocity.x, newVelocity.z);
      }
    } else if (species.trophicLevel !== 'producer' && species.speed > 0) {
      const prey = findNearestPrey(organism, organisms, eatenPrey);
      const predator = findNearestPredator(organism, organisms);

      if (predator) {
        organismUpdate.state = 'fleeing';
        const fleeDir = new THREE.Vector3()
          .subVectors(organism.position, predator.position)
          .normalize();
        newVelocity.lerp(fleeDir.multiplyScalar(activeSpeed), 0.1);
      } else if (prey && energy < species.energyValue * 0.7) {
        organismUpdate.state = 'hunting';
        organismUpdate.targetId = prey.id;
        const huntDir = new THREE.Vector3()
          .subVectors(prey.position, organism.position)
          .normalize();
        newVelocity.lerp(huntDir.multiplyScalar(activeSpeed), 0.1);

        if (distance(organism.position, prey.position) < species.size * 0.8) {
          energy += getSpeciesById(prey.speciesId)?.energyValue || 20;
          eatenPrey.add(prey.id);
          toRemove.add(prey.id);
          organismUpdate.state = 'eating';
        }
      } else {
        organismUpdate.state = 'wandering';
        if (Math.random() < 0.02) {
          newVelocity.set(
            (Math.random() - 0.5) * activeSpeed,
            (Math.random() - 0.5) * activeSpeed * 0.5,
            (Math.random() - 0.5) * activeSpeed,
          );
        }
      }

      newPosition.add(newVelocity);

      if (newPosition.x < AQUARIUM_BOUNDS.minX + 0.3) {
        newPosition.x = AQUARIUM_BOUNDS.minX + 0.3;
        newVelocity.x = Math.abs(newVelocity.x);
      }
      if (newPosition.x > AQUARIUM_BOUNDS.maxX - 0.3) {
        newPosition.x = AQUARIUM_BOUNDS.maxX - 0.3;
        newVelocity.x = -Math.abs(newVelocity.x);
      }
      if (newPosition.y < AQUARIUM_BOUNDS.minY + 0.2) {
        newPosition.y = AQUARIUM_BOUNDS.minY + 0.2;
        newVelocity.y = Math.abs(newVelocity.y);
      }
      if (newPosition.y > AQUARIUM_BOUNDS.maxY - 0.2) {
        newPosition.y = AQUARIUM_BOUNDS.maxY - 0.2;
        newVelocity.y = -Math.abs(newVelocity.y);
      }
      if (newPosition.z < AQUARIUM_BOUNDS.minZ + 0.3) {
        newPosition.z = AQUARIUM_BOUNDS.minZ + 0.3;
        newVelocity.z = Math.abs(newVelocity.z);
      }
      if (newPosition.z > AQUARIUM_BOUNDS.maxZ - 0.3) {
        newPosition.z = AQUARIUM_BOUNDS.maxZ - 0.3;
        newVelocity.z = -Math.abs(newVelocity.z);
      }

      organismUpdate.position = newPosition;
      organismUpdate.velocity = newVelocity;
      if (Math.abs(newVelocity.x) > 0.001 || Math.abs(newVelocity.z) > 0.001) {
        organismUpdate.rotation = Math.atan2(newVelocity.x, newVelocity.z);
      }
    } else if (species.trophicLevel === 'producer') {
      organismUpdate.state = 'idle';
      // 光合作用随日照平滑变化：白天积累能量，夜间只进行基础呼吸、净消耗
      energy += producerNetEnergyGain(daylight);
    }

    energy = clamp(energy, 0, species.energyValue * 1.5);
    organismUpdate.energy = energy;
    organismUpdate.age = age;

    if (
      energy > species.energyValue * 0.8 &&
      // 生产者繁殖依赖光照：夜间几乎不繁殖；消费者保持原有繁殖节奏
      Math.random() <
        species.reproductionRate *
          0.1 *
          (species.trophicLevel === 'producer' ? Math.max(daylight, 0.05) : 1)
    ) {
      const aliveCount = organisms.filter(
        (o) => o.speciesId === organism.speciesId && !toRemove.has(o.id),
      ).length;
      if (aliveCount < species.maxPopulation) {
        const offspringPos = organism.position
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 1.5,
              Math.random() * 0.5,
              (Math.random() - 0.5) * 1.5,
            ),
          );
        toAdd.push({ speciesId: organism.speciesId, position: offspringPos });
        organismUpdate.energy = energy * 0.5;
      }
    }

    updates.set(organism.id, organismUpdate);
  }

  const updatesArray: { id: string; updates: Partial<Organism> }[] = [];
  updates.forEach((u, id) => {
    if (!toRemove.has(id)) {
      updatesArray.push({ id, updates: u });
    }
  });

  return { updates: updatesArray, toRemove: Array.from(toRemove), toAdd };
}

export function computeFoodChainRelations(organisms: Organism[]): {
  predatorId: string;
  preyId: string;
}[] {
  const relations: { predatorId: string; preyId: string }[] = [];
  const seen = new Set<string>();

  for (const organism of organisms) {
    const species = getSpeciesById(organism.speciesId);
    if (!species) continue;

    for (const preyId of species.diet) {
      const hasPrey = organisms.some((o) => o.speciesId === preyId);
      if (hasPrey) {
        const key = `${organism.speciesId}-${preyId}`;
        if (!seen.has(key)) {
          seen.add(key);
          relations.push({ predatorId: organism.speciesId, preyId });
        }
      }
    }
  }

  return relations;
}

export function getPresentSpecies(organisms: Organism[]): string[] {
  return [...new Set(organisms.map((o) => o.speciesId))];
}

export { SPECIES };
