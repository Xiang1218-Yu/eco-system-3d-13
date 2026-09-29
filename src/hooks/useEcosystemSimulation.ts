import { useEffect, useRef } from 'react';
import { useEcosystemStore } from '@/store/useEcosystemStore';
import { simulateStep } from '@/utils/ecosystemSimulator';

/**
 * 全局唯一的模拟计时器（requestAnimationFrame 循环）。
 * 生态逻辑、时间计数和昼夜相位推进都在这里的同一次 tick 中完成，
 * 暂停时跳过整个 tick，因此昼夜循环天然与暂停同步，也不存在并行计时器。
 */
export function useEcosystemSimulation() {
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const isRunningRef = useRef<boolean>(true);

  const batchUpdateOrganisms = useEcosystemStore((s) => s.batchUpdateOrganisms);
  const batchRemoveOrganisms = useEcosystemStore((s) => s.batchRemoveOrganisms);
  const addOrganism = useEcosystemStore((s) => s.addOrganism);
  const advanceTick = useEcosystemStore((s) => s.advanceTick);
  const isRunning = useEcosystemStore((s) => s.isRunning);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    const tick = (time: number) => {
      if (isRunningRef.current && time - lastTimeRef.current > 60) {
        lastTimeRef.current = time;

        // 先推进统一的模拟帧（时间 + 昼夜相位），再用当前帧光照驱动生态逻辑
        const daylight = advanceTick();

        const organisms = useEcosystemStore.getState().organisms;
        const { updates, toRemove, toAdd } = simulateStep(organisms, daylight);

        if (updates.length > 0) {
          batchUpdateOrganisms(updates);
        }
        if (toRemove.length > 0) {
          batchRemoveOrganisms(toRemove);
        }
        toAdd.forEach(({ speciesId, position }) => {
          addOrganism(speciesId, position);
        });
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [batchUpdateOrganisms, batchRemoveOrganisms, addOrganism, advanceTick]);
}
