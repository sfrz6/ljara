export default function Loading() {
  return (
    <div className="flex min-h-[40dvh] items-center justify-center" role="status" aria-busy="true">
      <span className="size-7 animate-spin rounded-full border-2 border-line-strong border-t-brand-600" />
    </div>
  );
}
