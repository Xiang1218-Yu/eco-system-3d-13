import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEcosystemStore } from '@/store/useEcosystemStore';
import {
  dayNightView,
  getDarkness,
  getDaylight,
  getSunAngle,
} from '@/utils/dayNight';

// 白昼与深夜的调色板（光照在此之间平滑插值，绝不瞬时切换）
const DAY_BG = new THREE.Color('#0a1628');
const NIGHT_BG = new THREE.Color('#03060f');
const DAY_SUN = new THREE.Color('#fff4d6');
const NIGHT_MOON = new THREE.Color('#9db8ff');
const DAY_TOP_FILL = new THREE.Color('#a5f3fc');
const DAY_BLUE_FILL = new THREE.Color('#60a5fa');
const NIGHT_FILL = new THREE.Color('#3b5a9e');

const tmpColor = new THREE.Color();

/**
 * 昼夜光照。
 *
 * 这里是昼夜视觉的唯一渲染入口：只在 R3F 的渲染帧里把「目标日照」平滑插值到
 * 当前值，并写入共享的 dayNightView 供其他 3D 组件读取。
 * 它不推进相位、不持有计时器 —— 暂停时目标值冻结，插值自然收敛，不会跳变。
 */
export function DayNightLighting() {
  const scene = useThree((state) => state.scene);

  const ambientRef = useRef<THREE.AmbientLight>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const topFillRef = useRef<THREE.PointLight>(null);
  const blueFillRef = useRef<THREE.PointLight>(null);

  // 当前（已平滑）的日照值，初值与 store 默认正午一致
  const currentDaylight = useRef(1);

  useFrame((_, delta) => {
    const { dayPhase, dayNightEnabled } = useEcosystemStore.getState();
    const targetDaylight = dayNightEnabled ? getDaylight(dayPhase) : 1;

    // 帧率无关的指数平滑，约 1.5s 内完成明暗过渡
    const smoothing = 1 - Math.exp(-delta / 1.5);
    currentDaylight.current = THREE.MathUtils.lerp(
      currentDaylight.current,
      targetDaylight,
      smoothing,
    );
    const daylight = currentDaylight.current;
    const darkness = getDarkness(daylight);

    // 共享给水体、光线、发光生物等组件（只读）
    dayNightView.daylight = daylight;
    dayNightView.darkness = darkness;

    if (ambientRef.current) {
      ambientRef.current.intensity = 0.08 + daylight * 0.32;
    }

    if (sunRef.current) {
      // 太阳沿白天弧线运动；月亮与太阳相差半周，午夜位于天顶。
      // 两者在日出 / 日落处交汇于地平线，按日照插值位置，过渡无缝。
      const angle = getSunAngle(dayPhase);
      const radius = 9;
      const dayX = Math.cos(angle) * radius;
      const dayY = Math.sin(angle) * radius;
      const nightX = -Math.cos(angle) * radius;
      const nightY = -Math.sin(angle) * radius;
      sunRef.current.position.set(
        THREE.MathUtils.lerp(nightX, dayX, daylight),
        THREE.MathUtils.lerp(nightY, dayY, daylight),
        3,
      );
      sunRef.current.intensity = 0.12 + daylight * 1.08;
      sunRef.current.color.copy(tmpColor.copy(NIGHT_MOON).lerp(DAY_SUN, daylight));
    }

    if (topFillRef.current) {
      topFillRef.current.intensity = 0.25 + daylight * 0.35;
      topFillRef.current.color
        .copy(NIGHT_FILL)
        .lerp(DAY_TOP_FILL, Math.max(daylight, 0.35));
    }

    if (blueFillRef.current) {
      blueFillRef.current.intensity = 0.12 + daylight * 0.18;
      blueFillRef.current.color
        .copy(NIGHT_FILL)
        .lerp(DAY_BLUE_FILL, Math.max(daylight, 0.35));
    }

    scene.background = tmpColor.copy(NIGHT_BG).lerp(DAY_BG, daylight);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(scene.background);
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.4} />
      <directionalLight
        ref={sunRef}
        position={[0, 9, 3]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight ref={topFillRef} position={[0, 3, 0]} intensity={0.6} color="#a5f3fc" distance={10} />
      <pointLight ref={blueFillRef} position={[-3, 1, -2]} intensity={0.3} color="#60a5fa" distance={8} />
    </>
  );
}

/** 夜空中的星星，仅在夜间通过共享的 darkness 值淡入（不订阅 store） */
export function DayNightStars() {
  const materialRef = useRef<THREE.PointsMaterial>(null);

  const positions = useMemo(() => {
    const count = 700;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // 半球穹顶上的均匀分布（只生成天空半球）
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(1 - v * 0.55);
      const r = 24;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 1.5;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return pos;
  }, []);

  useFrame((state) => {
    if (materialRef.current) {
      const twinkle = 0.75 + 0.25 * Math.sin(state.clock.elapsedTime * 1.5);
      materialRef.current.opacity = dayNightView.darkness * 0.9 * twinkle;
    }
  });

  return (
    <points>
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
        size={0.14}
        sizeAttenuation
        transparent
        opacity={0}
        depthWrite={false}
        fog={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
