export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span className="brand-mark">
      <img src="/zaru.png" alt="" width={size} height={size} />
      ZARU
    </span>
  );
}
