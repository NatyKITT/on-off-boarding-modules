export default function ProtectedLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="size-10 animate-spin rounded-full border-4 border-muted border-t-[#00847C]" />
      <p className="text-sm text-muted-foreground">Načítám...</p>
    </div>
  )
}
