/**
 * 昼夜循环工具。
 *
 * 相位 dayPhase 以 [0, 1) 表示一个完整周期，且只按「模拟帧」推进：
 *   0    午夜（最暗）
 *   0.25 日出
 *   0.5  正午（最亮）
 *   0.75 日落
 * 渲染层不持有时间、不启动计时器，只读取平滑后的光照值做插值。
 */

export const DAY_PHASE = {
  MIDNIGHT: 0,
  SUNRISE: 0.25,
  NOON: 0.5,
  SUNSET: 0.75,
} as const;

/** 一个昼夜周期默认占用的模拟帧数 */
export const DEFAULT_DAY_LENGTH_FRAMES = 1200;
export const MIN_DAY_LENGTH_FRAMES = 300;
export const MAX_DAY_LENGTH_FRAMES = 3600;

/** 每个模拟步长约 60ms，仅用于在 UI 上把帧数换算成真实秒数 */
export const SECONDS_PER_FRAME = 0.06;

/** 低于该日照值视为夜晚（用于生物行为） */
export const NIGHT_DAYLIGHT_THRESHOLD = 0.12;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 相位推进。用减法取模（而不是 %）保证跨零点时连续、无周期跳变。
 */
export function advancePhase(phase: number, frames: number, cycleLength: number): number {
  if (!cycleLength || cycleLength <= 0) return phase;
  const next = phase + frames / cycleLength;
  return next - Math.floor(next);
}

/** 太阳仰角：日出为 0，正午为 π/2，午夜为 -π/2 */
export function getSunAngle(phase: number): number {
  return (phase - DAY_PHASE.SUNRISE) * Math.PI * 2;
}

/** 日照强度 0..1（夜间为 0），正弦曲线保证明暗平滑过渡 */
export function getDaylight(phase: number): number {
  return clamp(Math.sin(getSunAngle(phase)), 0, 1);
}

export function getDarkness(daylight: number): number {
  return 1 - clamp(daylight, 0, 1);
}

export function isNightTime(daylight: number): boolean {
  return clamp(daylight, 0, 1) <= NIGHT_DAYLIGHT_THRESHOLD;
}

/**
 * 发光生物在黑暗中的发光系数（带轻微脉动）。
 * 白天为 0，夜间在 0.56~1 之间脉动。
 */
export function getBioluminescenceGlow(darkness: number, time: number, seed = 0): number {
  const pulse = 0.78 + 0.22 * Math.sin(time * 2.4 + seed);
  return clamp(darkness, 0, 1) * pulse;
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

/** 相位换算为 24 小时制时刻：0.25 -> 06:00，0.5 -> 12:00 */
export function phaseToClock(phase: number): { hours: number; minutes: number; text: string } {
  const normalized = ((phase % 1) + 1) % 1;
  const totalMinutes = Math.floor(normalized * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { hours, minutes, text: `${pad2(hours)}:${pad2(minutes)}` };
}

export type DayPhaseLabel = '恒昼' | '夜晚' | '日出' | '黄昏' | '白天';

/** 顶部入口 / 数据面板使用的时段文案 */
export function getDayPhaseLabel(phase: number, enabled: boolean): DayPhaseLabel {
  if (!enabled) return '恒昼';
  if (getDaylight(phase) <= NIGHT_DAYLIGHT_THRESHOLD) return '夜晚';
  if (phase > 0.21 && phase < 0.32) return '日出';
  if (phase > 0.68 && phase < 0.79) return '黄昏';
  return '白天';
}

export function clampDayLength(frames: number): number {
  return clamp(Math.round(frames), MIN_DAY_LENGTH_FRAMES, MAX_DAY_LENGTH_FRAMES);
}

/**
 * 渲染层共享的平滑光照。
 * 由 DayNightLighting 在每一帧写入，其余 3D 组件（水体、光线、发光生物等）只读，
 * 避免任何组件为光照单独订阅 store 或启动并行计时器。
 */
export const dayNightView = {
  daylight: 1,
  darkness: 0,
};
