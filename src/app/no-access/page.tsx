export default function NoAccessPage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold">Nemáte přístup do aplikace</h1>
      <p className="mt-2 text-muted-foreground">
        Tento účet má povolený pouze podpisový režim. Pokud potřebujete přístup
        do dalších částí, kontaktujte administrátora.
      </p>
    </main>
  )
}
