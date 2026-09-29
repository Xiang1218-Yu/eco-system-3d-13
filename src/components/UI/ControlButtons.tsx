import { useEffect, useRef, useState } from 'react';
import { GlassCard } from '@/components/common/GlassCard';
import { useEcosystemStore } from '@/store/useEcosystemStore';
import {
  DAY_LENGTH_PRESETS,
  DAY_PERIOD_LABELS,
  getDayPeriod,
  getDaylight,
} from '@/utils/dayNight';
import {
  Play,
  Pause,
  RotateCcw,
  Eye,
  EyeOff,
  Sparkles,
  Sun,
  Moon,
  SunMoon,
  Clock3,
} from 'lucide-react';

function DayNightControl() {
  const dayNightEnabled = useEcosystemStore((s) => s.dayNightEnabled);
  const dayPhase = useEcosystemStore((s) => s.dayPhase);
  const dayLengthFrames = useEcosystemStore((s) => s.dayLengthFrames);
  const toggleDayNight = useEcosystemStore((s) => s.toggleDayNight);
  const setDayLengthFrames = useEcosystemStore((s) => s.setDayLengthFrames);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const daylight = getDaylight(dayPhase);
  const period = getDayPeriod({ enabled: dayNightEnabled, phase: dayPhase });
  const isNightish = dayNightEnabled && daylight < 0.5;
  const clockLabel = formatPhaseClock(dayNightEnabled ? dayPhase : null);
  const durationLabel =
    DAY_LENGTH_PRESETS.find((p) => p.frames === dayLengthFrames)?.label ??
    `${Math.round((dayLengthFrames * 60) / 1000)} 秒`;

  return (
    <div className="flex items-center gap-1 pl-2 border-l border-white/20 relative">
      <button
        onClick={toggleDayNight}
        className={`p-2 rounded-xl transition-colors text-white ${
          dayNightEnabled ? 'bg-amber-400/20 hover:bg-amber-400/30' : 'hover:bg-white/10'
        }`}
        title={dayNightEnabled ? '关闭昼夜循环（恒定白天）' : '开启昼夜循环'}
      >
        {dayNightEnabled ? (isNightish ? <Moon size={18} className="text-indigo-300" /> : <Sun size={18} className="text-amber-300" />) : (
          <SunMoon size={18} className="text-white/70" />
        )}
      </button>

      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-white/10 transition-colors"
        title="配置昼夜周期长度"
      >
        <Clock3 size={15} className="text-cyan-300" />
        <span className="text-white/90 text-xs font-mono w-11 text-left">{clockLabel}</span>
        <span className="text-white/50 text-[10px] whitespace-nowrap">{durationLabel}</span>
      </button>

      {/* 昼夜进度条：循环关闭时显示为满格白昼 */}
      <div className="relative w-16 h-1.5 rounded-full bg-white/10 overflow-hidden" title={`当前阶段：${DAY_PERIOD_LABELS[period]}`}>
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100"
          style={{
            width: `${(dayNightEnabled ? dayPhase : 1) * 100}%`,
            background:
              'linear-gradient(90deg, #fbbf24 0%, #f97316 25%, #6366f1 50%, #f97316 75%, #fbbf24 100%)',
          }}
        />
      </div>

      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute top-full mt-2 right-0 z-50 min-w-[140px] rounded-xl border border-white/20 bg-slate-900/95 backdrop-blur-xl shadow-2xl p-2"
        >
          <div className="text-white/60 text-[11px] px-2 py-1">昼夜周期长度</div>
          {DAY_LENGTH_PRESETS.map((preset) => (
            <button
              key={preset.frames}
              onClick={() => {
                setDayLengthFrames(preset.frames);
                setMenuOpen(false);
              }}
              className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${
                dayLengthFrames === preset.frames
                  ? 'bg-cyan-500/30 text-cyan-200'
                  : 'text-white/80 hover:bg-white/10'
              }`}
            >
              {preset.label} / 周期
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 把相位映射为 24 小时制时间：0=12:00，0.25=18:00，0.5=00:00，0.75=06:00 */
function formatPhaseClock(phase: number | null): string {
  if (phase === null) return '--:--';
  const totalMinutes = Math.floor((phase * 24 + 12) % 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function ControlButtons() {
  const isRunning = useEcosystemStore((s) => s.isRunning);
  const toggleSimulation = useEcosystemStore((s) => s.toggleSimulation);
  const resetEcosystem = useEcosystemStore((s) => s.resetEcosystem);
  const showLabels = useEcosystemStore((s) => s.showLabels);
  const toggleLabels = useEcosystemStore((s) => s.toggleLabels);
  const selectedSpeciesId = useEcosystemStore((s) => s.selectedSpeciesId);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40">
      <GlassCard className="px-4 py-2 flex items-center gap-2">
        <div className="flex items-center gap-2 pr-3 border-r border-white/20">
          <Sparkles size={18} className="text-cyan-400" />
          <span className="text-white font-bold text-lg tracking-wide">
            3D 虚拟生态缸
          </span>
        </div>

        {selectedSpeciesId && (
          <div className="px-3 py-1 rounded-full bg-cyan-500/30 text-cyan-300 text-sm animate-pulse">
            👆 点击缸内任意位置放置物种
          </div>
        )}

        <div className="flex items-center gap-1 pl-2 border-l border-white/20">
          <button
            onClick={toggleSimulation}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white"
            title={isRunning ? '暂停模拟' : '开始模拟'}
          >
            {isRunning ? <Pause size={18} /> : <Play size={18} />}
          </button>

          <DayNightControl />

          <button
            onClick={toggleLabels}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white"
            title={showLabels ? '隐藏标签' : '显示标签'}
          >
            {showLabels ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>

          <button
            onClick={resetEcosystem}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white"
            title="重置生态缸"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
