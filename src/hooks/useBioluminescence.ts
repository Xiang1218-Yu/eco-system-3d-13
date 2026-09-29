import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEcosystemStore } from '@/store/useEcosystemStore';
import { getEffectiveDaylight, getGlowFactor } from '@/utils/dayNight';

const BASE_EMISSIVE = 'baseEmissiveIntensity';
const BASE_LIGHT = 'baseLightIntensity';

/**
 * 根据昼夜光照平滑调节生物模型的自发光与点光源：
 * 发光生物（大鱼、分解菌）夜间增强，其它生物随环境压暗。
 *
 * 光照数据每帧从 store 读取（不订阅，避免 16Hz 触发 React 重渲染），
 * 数值用 lerp 平滑，配合模拟相位不会出现跳变。
 */
export function useBioluminescence(
  groupRef: React.RefObject<THREE.Group>,
  bioluminescent: boolean,
  options?: { scaleLights?: boolean },
) {
  const scaleLights = options?.scaleLights ?? true;
  const smoothGlow = useRef(1);

  // 组件挂载后记录材质 / 灯光的初始强度作为白天基准
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const material = obj.material as THREE.MeshStandardMaterial;
        if (material && material.emissiveIntensity !== undefined) {
          material.userData[BASE_EMISSIVE] = material.emissiveIntensity;
        }
      }
      if (scaleLights && obj instanceof THREE.PointLight) {
        obj.userData[BASE_LIGHT] = obj.intensity;
      }
    });
  }, [groupRef, scaleLights]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    const { dayNightEnabled, dayPhase } = useEcosystemStore.getState();
    const daylight = getEffectiveDaylight({ enabled: dayNightEnabled, phase: dayPhase });
    const targetGlow = getGlowFactor(daylight, bioluminescent);
    smoothGlow.current += (targetGlow - smoothGlow.current) * 0.1;
    const glow = smoothGlow.current;

    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const material = obj.material as THREE.MeshStandardMaterial;
        const base = material.userData[BASE_EMISSIVE] as number | undefined;
        if (base !== undefined) {
          material.emissiveIntensity = base * glow;
        }
      }
      if (scaleLights && obj instanceof THREE.PointLight) {
        const baseLight = obj.userData[BASE_LIGHT] as number | undefined;
        if (baseLight !== undefined) {
          obj.intensity = baseLight * glow;
        }
      }
    });
  });
}

/** 每帧读取当前光照系数（供需要自行控制点光源强度的模型使用） */
export function useDaylightRef() {
  const daylightRef = useRef(1);
  useFrame(() => {
    const { dayNightEnabled, dayPhase } = useEcosystemStore.getState();
    daylightRef.current = getEffectiveDaylight({
      enabled: dayNightEnabled,
      phase: dayPhase,
    });
  });
  return daylightRef;
}

export { BASE_LIGHT };
