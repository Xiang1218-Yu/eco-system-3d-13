import { useEffect, useRef } from 'react';
import { useEcosystemStore } from '@/store/useEcosystemStore';
import { simulateStep } from '@/utils/ecosystemSimulator';
import { getDaylight } from '@/utils/dayNight';

/**
 * 整个生态缸唯一的模拟计时器（requestAnimationFrame）。
 * 暂停时不执行任何模拟步骤，昼夜相位也随之冻结；
 * 昼夜循环不另设计时器，相位与 simulationTime 在同一次 store 更新中推进。
 */
export function useEcosystemSimulation() {
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const isRunningRef = useRef<boolean>(true);

  const batchUpdateOrganisms = useEcosystemStore((s) => s.batchUpdateOrganisms);
  const batchRemoveOrganisms = useEcosystemStore((s) => s.batchRemoveOrganisms);
  const addOrganism = useEcosystemStore((s) => s.addOrganism);
  const advanceSimulationFrame = useEcosystemStore((s) => s.advanceSimulationFrame);
  const isRunning = useEcosystemStore((s) => s.isRunning);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    const tick = (time: number) => {
      if (isRunningRef.current && time - lastTimeRef.current > 60) {
        lastTimeRef.current = time;

        const state = useEcosystemStore.getState();
        const organisms = state.organisms;

        // 先依据「推进前」的相位计算本帧日照，保证生物行为与光照严格同步
        const daylight = state.dayNightEnabled ? getDaylight(state.dayPhase) : 1;

        const { updates, toRemove, toAdd } = simulateStep(organisms, { daylight });

        if (updates.length > 0) {
          batchUpdateOrganisms(updates);
        }
        if (toRemove.length > 0) {
          batchRemoveOrganisms(toRemove);
        }
        toAdd.forEach(({ speciesId, position }) => {
          addOrganism(speciesId, position);
        });

        // 时间与昼夜相位一起推进（同一次更新，无并行计时器）
        advanceSimulationFrame();
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [batchUpdateOrganisms, batchRemoveOrganisms, addOrganism, advanceSimulationFrame]);
}
