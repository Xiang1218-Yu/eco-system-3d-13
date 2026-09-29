/**
 * 昼夜循环的纯函数工具集。
 *
 * 周期由唯一的模拟帧驱动（useEcosystemSimulation 中的 requestAnimationFrame），
 * dayPhase ∈ [0, 1) 永远只在模拟 tick 时推进，因此暂停 / 重置 / 调周期长度
 * 都不会产生并行计时器或相位跳变。
 */

/** 默认一个完整昼夜周期占用的模拟 tick 数（约 36 秒，tick ≈ 60ms） */
export const DEFAULT_DAY_LENGTH_FRAMES = 600;

/** 顶部入口可切换的周期长度预设 */
export const DAY_LENGTH_PRESETS = [
  { frames: 300, label: '18 秒' },
  { frames: 600, label: '36 秒' },
  { frames: 1200, label: '72 秒' },
] as const;

/** 夜间光照保留的最低强度，避免场景全黑 */
export const MIN_DAYLIGHT = 0.08;

export interface DayNightState {
  /** 是否启用自动昼夜循环；关闭后恒定为白天 */
  enabled: boolean;
  /** 一个完整周期的模拟 tick 数 */
  dayLengthFrames: number;
  /** 当前周期进度 [0, 1)，0 为正午，0.25 日落，0.5 子夜，0.75 日出 */
  phase: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * 根据相位计算光照系数：1 为正午，MIN_DAYLIGHT 为子夜，
 * 晨昏带做 smoothstep 过渡，保证光照平滑变化、不出现周期跳变。
 */
export function getDaylight(phase: number): number {
  // 太阳高度：-1（子夜）~ 1（正午）
  const sunHeight = Math.cos(phase * Math.PI * 2);
  // 晨昏带：太阳接近地平线时快速但平滑地过渡
  const day = smoothstep(-0.25, 0.45, sunHeight);
  return lerp(MIN_DAYLIGHT, 1, day);
}

/** 昼夜循环关闭时恒为白天 */
export function getEffectiveDaylight(state: Pick<DayNightState, 'enabled' | 'phase'>): number {
  return state.enabled ? getDaylight(state.phase) : 1;
}

/** 晨昏混合权重：日出/日落附近为 1，正午与子夜为 0（用于暖色暮光） */
export function getTwilight(daylight: number): number {
  return 1 - clamp(Math.abs(daylight - 0.55) / 0.4, 0, 1) ** 2;
}

export type DayPeriod = 'day' | 'night' | 'sunrise' | 'sunset';

export function getDayPeriod(state: Pick<DayNightState, 'enabled' | 'phase'>): DayPeriod {
  if (!state.enabled) return 'day';
  const { phase } = state;
  if (phase >= 0.18 && phase < 0.32) return 'sunset';
  if (phase >= 0.68 && phase < 0.82) return 'sunrise';
  return getDaylight(phase) >= 0.5 ? 'day' : 'night';
}

export const DAY_PERIOD_LABELS: Record<DayPeriod, string> = {
  day: '白昼',
  night: '夜晚',
  sunrise: '日出',
  sunset: '日落',
};

/** 已度过的完整天数（以子夜为界） */
export function getDayCount(dayLengthFrames: number, elapsedFrames: number): number {
  return Math.floor(elapsedFrames / dayLengthFrames);
}

/**
 * 生物发光系数：夜间亮、白天暗。
 * @param daylight 当前光照系数
 * @param bioluminescent 是否为发光生物
 */
export function getGlowFactor(daylight: number, bioluminescent: boolean): number {
  if (bioluminescent) {
    return 0.25 + (1 - daylight) * 1.1;
  }
  // 非发光生物：夜晚随环境压暗，但保留微弱发光
  return 0.35 + daylight * 0.65;
}

/**
 * 调整周期长度时按比例换算相位，避免周期配置突变造成光照跳变。
 */
export function rescalePhase(
  phase: number,
  oldLength: number,
  newLength: number,
): number {
  if (oldLength <= 0) return phase;
  const absoluteFrame = phase * oldLength;
  return clamp(absoluteFrame / newLength, 0, 0.999999);
}
