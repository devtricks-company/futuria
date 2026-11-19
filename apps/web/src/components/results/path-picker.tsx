import { PathSwatch } from '@/components/results/path-color';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';

/** Picks the path that the drivers, Time Machine and action plan describe. */
export function PathPicker({
  paths,
  value,
  onValueChange,
  colorIndex,
}: {
  paths: { pathId: string; name: string }[];
  value: string;
  onValueChange: (pathId: string) => void;
  colorIndex: Record<string, number>;
}) {
  return (
    <Segmented
      value={value}
      onValueChange={onValueChange}
      aria-label="Path"
      className="flex-wrap gap-2 rounded-none border-0 bg-transparent p-0 sm:w-full"
    >
      {paths.map((p) => (
        <SegmentedItem
          key={p.pathId}
          value={p.pathId}
          className="h-9 flex-none gap-2 border border-border bg-surface px-3.5 shadow-card hover:border-border-strong data-[state=on]:border-accent data-[state=on]:bg-accent-soft data-[state=on]:shadow-none"
        >
          <PathSwatch index={colorIndex[p.pathId] ?? 0} />
          {p.name}
        </SegmentedItem>
      ))}
    </Segmented>
  );
}
