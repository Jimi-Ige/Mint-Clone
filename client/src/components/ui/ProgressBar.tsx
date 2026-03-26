interface ProgressBarProps {
  current: number;
  target: number;
  color?: string;
  showLabel?: boolean;
}

export default function ProgressBar({ current, target, color = '#10b981', showLabel = true }: ProgressBarProps) {
  const pct = Math.min(Math.round((current / target) * 100), 100);

  return (
    <div className="w-full">
      <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{pct}%</p>
      )}
    </div>
  );
}
