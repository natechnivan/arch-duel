export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`shimmer rounded-md opacity-90 ${className}`}
    />
  );
}