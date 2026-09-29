import { useState } from 'react';
import { Sun, Moon, Clock, ChevronDown } from 'lucide-react';
import { useEcosystemStore } from '@/store/useEcosystemStore';
import {
  MAX_DAY_LENGTH_FRAMES,
  MIN_DAY_LENGTH_FRAMES,
  SECONDS_PER_FRAME,
  getDayPhaseLabel,
  phaseToClock,
} from '@/utils/dayNight';

/**
 * 顶部的昼夜切换与暂停入口（暂停按钮仍由 ControlButtons 统一渲染）。
 * - 太阳/月亮按钮：一键开关昼夜循环（关闭后维持恒昼，重新打开无缝继续）
 * - 时刻胶囊：显示当前模拟时钟，并展开周期长度等配置
 */
export function DayNightControls() {
  const dayNightEnabled = useEcosystemStore((s) => s.dayNightEnabled);
  const dayPhase = useEcosystemStore((s) => s.dayPhase);
  const dayLengthFrames = useEcosystemStore((s) => s.dayLengthFrames);
  const toggleDayNight = useEcosystemStore((s) => s.toggleDayNight);
  const setDayLength = useEcosystemStore((s) => s.setDayLength);

  const [open, setOpen] = useState(false);

  const clock = phaseToClock(dayPhase);
  const label = getDayPhaseLabel(dayPhase, dayNightEnabled);
  const cycleSeconds = Math.round(dayLengthFrames * SECONDS_PER_FRAME);

  // 相位轨道上游标的位置（百分比）
  const markerLeft = `${dayPhase * 100}%`;

  return (
    <div className="relative flex items-center gap-1">
      <div className="flex items-center gap-1 pr-1">
        <button
          onClick={toggleDayNight}
          className={`p-2 rounded-xl transition-colors ${
            dayNightEnabled
              ? 'bg-amber-400/20 text-amber-300 hover:bg-amber-400/30'
              : 'hover:bg-white/10 text-white/50'
          }`}
          title={dayNightEnabled ? '关闭昼夜循环（恒昼）' : '开启昼夜循环'}
        >
          {dayNightEnabled ? <Sun size={18} className="animate-pulse" /> : <Moon size={18} />}
        </button>

        <button
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono transition-colors ${
            dayNightEnabled
              ? 'text-amber-200 bg-white/5 hover:bg-white/10'
              : 'text-white/50 hover:bg-white/10'
          }`}
          title="昼夜配置"
        >
          <Clock size={14} />
          <span>{dayNightEnabled ? clock.text : '--:--'}</span>
          <span className="font-sans text-[10px] opacity-80">{label}</span>
          <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <>
          {/* 点击空白处收起 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-2 left-0 z-50 w-64 p-4 rounded-2xl backdrop-blur-xl bg-[#0d1f3d]/95 border border-white/20 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-white text-sm font-bold">昼夜循环</span>
              <button
                onClick={toggleDayNight}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  dayNightEnabled ? 'bg-amber-400/70' : 'bg-white/20'
                }`}
                title={dayNightEnabled ? '关闭' : '开启'}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                    dayNightEnabled ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* 一天的相位轨道：午夜 - 日出 - 正午 - 日落 - 午夜 */}
            <div className="mb-1">
              <div className="relative h-2 rounded-full bg-gradient-to-r from-[#0a1128] via-amber-300/80 to-[#0a1128]">
                <div
                  className="absolute -top-1 w-4 h-4 rounded-full border-2 border-white shadow-lg transition-[left] duration-100"
                  style={{
                    left: `calc(${markerLeft} - 8px)`,
                    backgroundColor: dayNightEnabled ? '#fbbf24' : '#94a3b8',
                  }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-white/40 mt-1">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>24:00</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-white/70 mb-2 mt-3">
              <Moon size={12} className="text-indigo-300" />
              <span>
                当前 {clock.text} · {label}
              </span>
            </div>

            <div>
              <div className="flex justify-between text-xs text-white/70 mb-1.5">
                <span>一昼夜时长（模拟帧）</span>
                <span className="font-mono text-amber-300">
                  {dayLengthFrames} 帧 ≈ {cycleSeconds}s
                </span>
              </div>
              <input
                type="range"
                min={MIN_DAY_LENGTH_FRAMES}
                max={MAX_DAY_LENGTH_FRAMES}
                step={100}
                value={dayLengthFrames}
                disabled={!dayNightEnabled}
                onChange={(e) => setDayLength(Number(e.target.value))}
                className="w-full accent-amber-400 disabled:opacity-40"
              />
              <div className="flex justify-between text-[10px] text-white/40 mt-0.5">
                <span>{Math.round(MIN_DAY_LENGTH_FRAMES * SECONDS_PER_FRAME)}s 快</span>
                <span>{Math.round(MAX_DAY_LENGTH_FRAMES * SECONDS_PER_FRAME)}s 慢</span>
              </div>
            </div>

            <p className="text-[10px] text-white/40 mt-3 leading-relaxed">
              相位只随模拟帧推进，暂停时静止；调整时长不会让昼夜跳变。
            </p>
          </div>
        </>
      )}
    </div>
  );
}
