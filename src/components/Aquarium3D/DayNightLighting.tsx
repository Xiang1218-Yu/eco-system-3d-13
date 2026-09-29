import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEcosystemStore } from '@/store/useEcosystemStore';
import {
  getDaylight,
  getEffectiveDaylight,
  getTwilight,
  lerp,
} from '@/utils/dayNight';

// 白天 / 子夜 / 晨昏三档环境配色
const DAY_BG = new THREE.Color('#0d2a4d');
const NIGHT_BG = new THREE.Color('#05070f');
const TWILIGHT_BG = new THREE.Color('#3a2342');

const DAY_SUN = new THREE.Color('#fff4d6');
const TWILIGHT_SUN = new THREE.Color('#ff9d5c');

const DAY_FILL = new THREE.Color('#a5f3fc');
const NIGHT_FILL = new THREE.Color('#3b4a8a');

/**
 * 昼夜光照系统：
 * - 唯一数据来源是 store 中按模拟帧推进的 dayPhase，因此暂停时光照冻结；
 * - 强度与颜色每帧向目标值 lerp，模拟相位本身也是平滑曲线，双重保证不跳变；
 * - 昼夜循环关闭时恒定正午光照。
 */
export function DayNightLighting() {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const moonRef = useRef<THREE.DirectionalLight>(null);
  const fillRef = useRef<THREE.PointLight>(null);
  const rimRef = useRef<THREE.PointLight>(null);

  const tmpColor = useRef(new THREE.Color());

  useFrame((state) => {
    const { dayNightEnabled, dayPhase } = useEcosystemStore.getState();
    const daylight = getEffectiveDaylight({ enabled: dayNightEnabled, phase: dayPhase });
    const phase = dayNightEnabled ? dayPhase : 0;
    const twilight = getTwilight(daylight);

    const scene = state.scene;

    // 背景与雾
    tmpColor.current.copy(NIGHT_BG).lerp(DAY_BG, daylight);
    tmpColor.current.lerp(TWILIGHT_BG, twilight * 0.5);
    (scene.background as THREE.Color | null)?.copy(tmpColor.current);
    (scene.fog as THREE.Fog | null)?.color.copy(tmpColor.current);

    if (ambientRef.current) {
      ambientRef.current.intensity += (lerp(0.12, 0.45, daylight) - ambientRef.current.intensity) * 0.08;
    }

    // 太阳沿弧线运动：白天在缸体上方，子夜落到下方
    const sunAngle = phase * Math.PI * 2;
    const sunHeight = Math.cos(sunAngle);
    const sunX = Math.sin(sunAngle) * 6;

    if (sunRef.current) {
      sunRef.current.position.set(sunX, sunHeight * 7, 3);
      sunRef.current.intensity += (lerp(0.04, 1.3, daylight) - sunRef.current.intensity) * 0.08;
      tmpColor.current.copy(TWILIGHT_SUN).lerp(DAY_SUN, daylight);
      sunRef.current.color.copy(tmpColor.current);
    }

    // 月亮与太阳相差半个周期
    if (moonRef.current) {
      moonRef.current.position.set(-sunX, -sunHeight * 6, -3);
      const moonLight = dayNightEnabled ? lerp(0.5, 0, daylight) : 0;
      moonRef.current.intensity += (moonLight - moonRef.current.intensity) * 0.08;
    }

    if (fillRef.current) {
      fillRef.current.intensity += (lerp(0.15, 0.6, daylight) - fillRef.current.intensity) * 0.08;
      tmpColor.current.copy(NIGHT_FILL).lerp(DAY_FILL, daylight);
      fillRef.current.color.copy(tmpColor.current);
    }

    if (rimRef.current) {
      rimRef.current.intensity += (lerp(0.35, 0.25, daylight) - rimRef.current.intensity) * 0.08;
    }
  });

  return (
    <group>
      <ambientLight ref={ambientRef} intensity={0.4} />
      <directionalLight
        ref={sunRef}
        position={[0, 7, 3]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight ref={moonRef} position={[0, -6, -3]} intensity={0} color="#9db8ff" />
      <pointLight ref={fillRef} position={[0, 3, 0]} intensity={0.6} color="#a5f3fc" distance={12} />
      <pointLight ref={rimRef} position={[-3, 1, -2]} intensity={0.3} color="#60a5fa" distance={8} />
      <Stars />
    </group>
  );
}

/** 夜空中的星点，仅在夜间可见，透明度随光照平滑淡入淡出 */
function Stars() {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);

  const positions = useMemo(() => {
    const pos: number[] = [];
    const count = 220;
    for (let i = 0; i < count; i++) {
      const radius = 14 + Math.random() * 6;
      const theta = Math.random() * Math.PI * 2;
      // 偏上方半球
      const phi = Math.random() * Math.PI * 0.45;
      pos.push(
        radius * Math.sin(phi) * Math.cos(theta),
        Math.abs(radius * Math.cos(phi)) * 0.7 + 2,
        radius * Math.sin(phi) * Math.sin(theta),
      );
    }
    return new Float32Array(pos);
  }, []);

  useFrame(() => {
    if (materialRef.current) {
      const { dayNightEnabled, dayPhase } = useEcosystemStore.getState();
      const daylight = getDaylight(dayPhase);
      const target = dayNightEnabled ? Math.max(0, 0.8 * (1 - daylight * 1.4)) : 0;
      materialRef.current.opacity += (target - materialRef.current.opacity) * 0.05;
    }
    if (pointsRef.current) {
      pointsRef.current.rotation.y += 0.0002;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        color="#dbeafe"
        size={0.08}
        transparent
        opacity={0}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}
