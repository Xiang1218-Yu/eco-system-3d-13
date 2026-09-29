import { create } from 'zustand';
import * as THREE from 'three';
import type { Organism, EcosystemStats, Species } from '@/types/ecosystem';
import { getSpeciesById, SPECIES } from '@/data/species';
import {
  DEFAULT_DAY_LENGTH_FRAMES,
  getDaylight,
  rescalePhase,
} from '@/utils/dayNight';

interface EcosystemStore {
  organisms: Organism[];
  selectedSpeciesId: string | null;
  selectedOrganismId: string | null;
  isRunning: boolean;
  simulationTime: number;
  showLabels: boolean;
  /** 昼夜循环开关 */
  dayNightEnabled: boolean;
  /** 一个完整昼夜周期的模拟 tick 数 */
  dayLengthFrames: number;
  /** 当前昼夜相位 [0, 1)，仅在模拟 tick 中推进 */
  dayPhase: number;

  addOrganism: (speciesId: string, position?: THREE.Vector3) => void;
  removeOrganism: (organismId: string) => void;
  updateOrganism: (organismId: string, updates: Partial<Organism>) => void;
  setSelectedSpecies: (speciesId: string | null) => void;
  setSelectedOrganism: (organismId: string | null) => void;
  toggleSimulation: () => void;
  /** 模拟帧推进：simulationTime 与 dayPhase 在同一次更新中完成，不使用并行计时器 */
  advanceTick: () => number;
  toggleDayNight: () => void;
  setDayLengthFrames: (frames: number) => void;
  resetEcosystem: () => void;
  toggleLabels: () => void;
  getStats: () => EcosystemStats;
  batchUpdateOrganisms: (updates: { id: string; updates: Partial<Organism> }[]) => void;
  batchRemoveOrganisms: (ids: string[]) => void;
}

const AQUARIUM_BOUNDS = {
  minX: -4,
  maxX: 4,
  minY: -2,
  maxY: 2,
  minZ: -2,
  maxZ: 2,
};

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function randomPosition(species: Species): THREE.Vector3 {
  const isProducer = species.trophicLevel === 'producer';
  const minY = isProducer ? AQUARIUM_BOUNDS.minY : AQUARIUM_BOUNDS.minY + 0.3;
  const maxY = isProducer ? AQUARIUM_BOUNDS.minY + 0.5 : AQUARIUM_BOUNDS.maxY - 0.3;

  return new THREE.Vector3(
    AQUARIUM_BOUNDS.minX + Math.random() * (AQUARIUM_BOUNDS.maxX - AQUARIUM_BOUNDS.minX),
    minY + Math.random() * (maxY - minY),
    AQUARIUM_BOUNDS.minZ + Math.random() * (AQUARIUM_BOUNDS.maxZ - AQUARIUM_BOUNDS.minZ),
  );
}

function createOrganism(speciesId: string, position?: THREE.Vector3): Organism | null {
  const species = getSpeciesById(speciesId);
  if (!species) return null;

  const pos = position || randomPosition(species);

  return {
    id: generateId(),
    speciesId,
    position: pos,
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * species.speed,
      (Math.random() - 0.5) * species.speed * 0.5,
      (Math.random() - 0.5) * species.speed,
    ),
    energy: species.energyValue * (0.7 + Math.random() * 0.3),
    age: Math.random() * species.lifespan * 0.3,
    state: 'idle',
    targetId: null,
    rotation: Math.random() * Math.PI * 2,
    scale: 0.8 + Math.random() * 0.4,
  };
}

export const useEcosystemStore = create<EcosystemStore>((set, get) => ({
  organisms: [],
  selectedSpeciesId: null,
  selectedOrganismId: null,
  isRunning: true,
  simulationTime: 0,
  showLabels: true,
  dayNightEnabled: true,
  dayLengthFrames: DEFAULT_DAY_LENGTH_FRAMES,
  dayPhase: 0,

  addOrganism: (speciesId, position) => {
    const state = get();
    const species = getSpeciesById(speciesId);
    if (!species) return;

    const currentCount = state.organisms.filter((o) => o.speciesId === speciesId).length;
    if (currentCount >= species.maxPopulation) return;

    const organism = createOrganism(speciesId, position);
    if (organism) {
      set((prev) => ({ organisms: [...prev.organisms, organism] }));
    }
  },

  removeOrganism: (organismId) => {
    set((prev) => ({
      organisms: prev.organisms.filter((o) => o.id !== organismId),
      selectedOrganismId: prev.selectedOrganismId === organismId ? null : prev.selectedOrganismId,
    }));
  },

  updateOrganism: (organismId, updates) => {
    set((prev) => ({
      organisms: prev.organisms.map((o) => (o.id === organismId ? { ...o, ...updates } : o)),
    }));
  },

  batchUpdateOrganisms: (updates) => {
    set((prev) => {
      const updateMap = new Map(updates.map((u) => [u.id, u.updates]));
      return {
        organisms: prev.organisms.map((o) => {
          const update = updateMap.get(o.id);
          return update ? { ...o, ...update } : o;
        }),
      };
    });
  },

  batchRemoveOrganisms: (ids) => {
    const idSet = new Set(ids);
    set((prev) => ({
      organisms: prev.organisms.filter((o) => !idSet.has(o.id)),
      selectedOrganismId:
        prev.selectedOrganismId && idSet.has(prev.selectedOrganismId) ? null : prev.selectedOrganismId,
    }));
  },

  setSelectedSpecies: (speciesId) => {
    set({ selectedSpeciesId: speciesId });
  },

  setSelectedOrganism: (organismId) => {
    set({ selectedOrganismId: organismId });
  },

  toggleSimulation: () => {
    set((prev) => ({ isRunning: !prev.isRunning }));
  },

  advanceTick: () => {
    let daylight = 1;
    set((prev) => {
      const simulationTime = prev.simulationTime + 1;
      let dayPhase = prev.dayPhase;
      if (prev.dayNightEnabled) {
        dayPhase = (dayPhase + 1 / prev.dayLengthFrames) % 1;
      }
      daylight = prev.dayNightEnabled ? getDaylight(dayPhase) : 1;
      return { simulationTime, dayPhase };
    });
    return daylight;
  },

  toggleDayNight: () => {
    set((prev) => ({ dayNightEnabled: !prev.dayNightEnabled }));
  },

  setDayLengthFrames: (frames) => {
    const safeFrames = Math.max(30, Math.round(frames));
    set((prev) => ({
      dayLengthFrames: safeFrames,
      // 按比例换算相位，保证切换周期长度时光照连续、不跳变
      dayPhase: rescalePhase(prev.dayPhase, prev.dayLengthFrames, safeFrames),
    }));
  },

  resetEcosystem: () => {
    // 重置只清空生物并回到白天起始，保留用户的昼夜偏好与周期配置
    set({
      organisms: [],
      selectedSpeciesId: null,
      selectedOrganismId: null,
      simulationTime: 0,
      dayPhase: 0,
      isRunning: true,
    });
  },

  toggleLabels: () => {
    set((prev) => ({ showLabels: !prev.showLabels }));
  },

  getStats: () => {
    const state = get();
    const populationBySpecies: Record<string, number> = {};
    SPECIES.forEach((s) => {
      populationBySpecies[s.id] = 0;
    });
    state.organisms.forEach((o) => {
      populationBySpecies[o.speciesId] = (populationBySpecies[o.speciesId] || 0) + 1;
    });

    let balanceIndex = 0;
    const levels = ['producer', 'herbivore', 'carnivore', 'decomposer'];
    const levelCounts: Record<string, number> = { producer: 0, herbivore: 0, carnivore: 0, decomposer: 0 };
    state.organisms.forEach((o) => {
      const sp = getSpeciesById(o.speciesId);
      if (sp) levelCounts[sp.trophicLevel]++;
    });

    const total = state.organisms.length;
    if (total > 0) {
      const idealRatios = { producer: 0.5, herbivore: 0.3, carnivore: 0.1, decomposer: 0.1 };
      let deviation = 0;
      levels.forEach((level) => {
        const actual = levelCounts[level] / total;
        deviation += Math.abs(actual - idealRatios[level]);
      });
      balanceIndex = Math.max(0, 100 - deviation * 100);
    }

    return {
      time: state.simulationTime,
      isRunning: state.isRunning,
      balanceIndex,
      populationBySpecies,
      totalOrganisms: total,
    };
  },
}));

export { AQUARIUM_BOUNDS };
